/**
 * HTTP API: sessions, reference data, catalog intersection and room
 * management. Real-time traffic goes over Socket.io (see realtime/).
 */
import {
  COUNTRIES,
  ErrorCode,
  MAX_ROOM_MEMBERS,
  PROTOCOL_VERSION,
  SERVICES,
  normalizeCountryCode,
  servicesForCountry,
  InvalidSubscriptionError,
  type CreateRoomResponse,
  type SessionResponse,
} from '@watch-party/shared';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import { bearerToken, type SessionSigner } from '../auth/session.js';
import { CatalogUnavailableError, type CatalogService } from '../catalog/catalog-service.js';
import type { Logger } from '../logger.js';
import { RoomError, type RoomService } from '../rooms/room-service.js';
import { RateLimiter } from '../realtime/rate-limit.js';
import type { Store } from '../store/types.js';

export interface RouteDeps {
  sessions: SessionSigner;
  catalog: CatalogService;
  rooms: RoomService;
  store: Store;
  logger: Logger;
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

const commonQuerySchema = z.object({
  users: z
    .array(
      z.object({
        userId: z.string().min(1).max(64),
        countryCode: z.string().min(2).max(3),
        services: z.array(z.string().min(1).max(32)).min(1).max(20),
      }),
    )
    .min(1)
    .max(MAX_ROOM_MEMBERS),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  genre: z.string().max(40).optional(),
  query: z.string().max(100).optional(),
});

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  genre: z.string().max(40).optional(),
  query: z.string().max(100).optional(),
});

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = express.Router();
  const ipLimiter = new RateLimiter();

  const limitByIp = (ratePerSec: number, burst: number) => (req: Request, _res: Response, next: NextFunction) => {
    if (!ipLimiter.take(`${req.ip}:${req.path}`, { ratePerSec, burst })) {
      return next(new HttpError(429, ErrorCode.RATE_LIMITED, 'Too many requests'));
    }
    next();
  };

  const requireSession = (req: Request, _res: Response, next: NextFunction) => {
    const session = deps.sessions.verify(bearerToken(req.header('authorization')));
    if (!session) return next(new HttpError(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid session token'));
    req.userId = session.userId;
    next();
  };

  // Generous enough for many devices behind one NAT, tight enough to stop token farming.
  router.post('/session', limitByIp(1, 20), (_req, res) => {
    const { userId, token, expiresAt } = deps.sessions.issue();
    const body: SessionResponse = { userId, token, expiresAt };
    res.status(201).json(body);
  });

  router.get('/meta', (req, res) => {
    const country = typeof req.query.country === 'string' ? normalizeCountryCode(req.query.country) : null;
    res.set('cache-control', 'public, max-age=3600').json({
      protocolVersion: PROTOCOL_VERSION,
      provider: deps.catalog.providerId,
      attribution: deps.catalog.attribution,
      countries: COUNTRIES,
      services: (country ? servicesForCountry(country) : SERVICES).map((s) => ({
        id: s.id,
        name: s.name,
        regions: s.regions ?? null,
        mobileWeb: s.mobileWeb,
        domains: s.domains,
      })),
      maxRoomMembers: MAX_ROOM_MEMBERS,
    });
  });

  router.post('/catalog/common', requireSession, limitByIp(2, 10), async (req, res, next) => {
    try {
      const body = commonQuerySchema.parse(req.body);
      const result = await deps.catalog.getCommonTitles(body.users, body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/rooms', requireSession, limitByIp(0.5, 10), async (req, res, next) => {
    try {
      const roomId = await deps.rooms.create(req.userId!);
      const body: CreateRoomResponse = { roomId };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get('/rooms/:roomId', requireSession, async (req, res, next) => {
    try {
      const state = await deps.rooms.get(String(req.params.roomId).toUpperCase());
      if (!state) throw new HttpError(404, ErrorCode.ROOM_NOT_FOUND, 'Room not found');
      const isMember = state.members.some((m) => m.userId === req.userId);
      // Non-members (e.g. someone checking a code before joining) only learn it exists.
      res.json(isMember ? state : { roomId: state.roomId, memberCount: state.members.length, maxMembers: MAX_ROOM_MEMBERS });
    } catch (err) {
      next(err);
    }
  });

  router.get('/rooms/:roomId/catalog', requireSession, limitByIp(2, 10), async (req, res, next) => {
    try {
      const paging = pagingSchema.parse(req.query);
      const state = await deps.rooms.get(String(req.params.roomId).toUpperCase());
      if (!state) throw new HttpError(404, ErrorCode.ROOM_NOT_FOUND, 'Room not found');
      if (!state.members.some((m) => m.userId === req.userId)) {
        throw new HttpError(403, ErrorCode.NOT_IN_ROOM, 'Join the room first');
      }
      const users = state.members.map((m) => ({ userId: m.userId, countryCode: m.countryCode, services: m.services }));
      res.json(await deps.catalog.getCommonTitles(users, paging));
    } catch (err) {
      next(err);
    }
  });

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { code: ErrorCode.BAD_REQUEST, message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      });
    }
    if (err instanceof InvalidSubscriptionError) {
      return res.status(400).json({ error: { code: ErrorCode.BAD_REQUEST, message: err.message } });
    }
    if (err instanceof CatalogUnavailableError) {
      return res.status(503).json({ error: { code: ErrorCode.CATALOG_UNAVAILABLE, message: err.message } });
    }
    if (err instanceof RoomError) {
      const status = err.code === ErrorCode.ROOM_NOT_FOUND ? 404 : err.code === ErrorCode.FORBIDDEN ? 403 : 400;
      return res.status(status).json({ error: err.toProtocol() });
    }
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: { code: ErrorCode.BAD_REQUEST, message: 'Malformed JSON' } });
    }
    deps.logger.error({ err }, 'unhandled HTTP error');
    res.status(500).json({ error: { code: ErrorCode.INTERNAL, message: 'Something went wrong' } });
  });

  return router;
}
