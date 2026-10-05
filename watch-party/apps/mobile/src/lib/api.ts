import type {
  CommonCatalogResponse,
  CommonTitle,
  Country,
  CreateRoomResponse,
  MobileWebSupport,
  RoomState,
  SessionResponse,
} from '@watch-party/shared/client';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface MetaResponse {
  protocolVersion: number;
  provider: string;
  attribution: string;
  countries: Country[];
  services: Array<{ id: string; name: string; regions: string[] | null; mobileWeb: MobileWebSupport }>;
  maxRoomMembers: number;
}

/** A room as seen by someone who hasn't joined yet. */
export interface RoomPreview {
  roomId: string;
  memberCount: number;
  maxMembers: number;
}

async function request<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Can't reach the watch party server at ${API_URL}`);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface CatalogQuery {
  page?: number;
  pageSize?: number;
  genre?: string;
  query?: string;
}

export const api = {
  createSession: () => request<SessionResponse>('/api/session', { method: 'POST' }),
  meta: (country?: string) => request<MetaResponse>(`/api/meta${country ? `?country=${encodeURIComponent(country)}` : ''}`),
  createRoom: (token: string) => request<CreateRoomResponse>('/api/rooms', { method: 'POST', token }),
  getRoom: (token: string, roomId: string) =>
    request<RoomState | RoomPreview>(`/api/rooms/${encodeURIComponent(roomId)}`, { token }),
  roomCatalog: (token: string, roomId: string, q: CatalogQuery = {}) => {
    const params = new URLSearchParams();
    if (q.page) params.set('page', String(q.page));
    if (q.pageSize) params.set('pageSize', String(q.pageSize));
    if (q.genre) params.set('genre', q.genre);
    if (q.query) params.set('query', q.query);
    return request<CommonCatalogResponse<CommonTitle>>(`/api/rooms/${encodeURIComponent(roomId)}/catalog?${params}`, { token });
  },
};
