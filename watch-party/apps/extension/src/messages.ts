/** Messages between the extension's popup, background worker and content scripts. */
import type { CommonCatalogResponse, CommonTitle, PlayerCommand, PlayerEvent, ProtocolError, RoomState } from '@watch-party/shared/client';

export interface Profile {
  displayName: string;
  country: string;
  services: string[];
}

// content script <-> background (long-lived port named "player")
export type ContentToBackground = { type: 'event'; event: PlayerEvent };
export type BackgroundToContent =
  | { type: 'activate'; adapter: 'generic' | 'netflix' }
  | { type: 'deactivate' }
  | { type: 'command'; command: PlayerCommand };

export interface TabInfo {
  id: number;
  url: string | null;
  serviceId: string | null;
  serviceName: string | null;
}

export interface RoomInfo {
  roomId: string;
  state: RoomState | null;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'failed';
  drift: number | null;
  isHost: boolean;
  userId: string;
  playerAttached: boolean;
  error: ProtocolError | null;
}

export interface PopupStatus {
  profile: Profile | null;
  serverUrl: string;
  tab: TabInfo | null;
  room: RoomInfo | null;
  attribution: string | null;
}

// popup -> background (one-shot sendMessage)
export type PopupRequest =
  | { type: 'status'; tabId: number | null }
  | { type: 'saveProfile'; profile: Profile }
  | { type: 'saveServer'; url: string }
  | { type: 'createRoom'; tabId: number }
  | { type: 'joinRoom'; tabId: number; roomId: string }
  | { type: 'leaveRoom'; tabId: number }
  | { type: 'setHostOnly'; tabId: number; value: boolean }
  | { type: 'transferHost'; tabId: number; userId: string }
  | { type: 'countdown'; tabId: number }
  | { type: 'catalog'; tabId: number; page: number; query: string }
  | { type: 'selectTitle'; tabId: number; tmdbId: number }
  | { type: 'openOption'; tabId: number; url: string };

export type PopupResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
export type CatalogPage = CommonCatalogResponse<CommonTitle>;
