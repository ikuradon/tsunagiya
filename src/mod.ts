/**
 * 繋ぎ屋 (tsunagiya) - Nostrリレーモックライブラリ
 *
 * `globalThis.WebSocket`を差し替えることで、既存のNostrクライアントコードを
 * 一切変更せずにテストできる。
 *
 * @example
 * ```ts
 * import { MockPool } from "@ikuradon/tsunagiya";
 *
 * const pool = new MockPool();
 * const relay = pool.relay("wss://relay.example.com");
 * relay.store(event);
 *
 * pool.install();
 * try {
 *   // テスト対象コード
 * } finally {
 *   pool.uninstall();
 * }
 * ```
 *
 * @module
 */

export { MockPool } from "./pool.ts";
export { MockRelay } from "./relay.ts";
export { filterEvents, matchFilter, matchFilters } from "./filter.ts";
export {
  classifyEvent,
  getParameterizedId,
  isEphemeral,
  isParameterizedReplaceable,
  isReplaceable,
} from "./event_kind.ts";
export type { EventKind } from "./event_kind.ts";
export { AuthState, generateChallenge } from "./auth.ts";
export { createLogger, Logger } from "./logger.ts";
export { WebSocketReadyState } from "./types.ts";
export type {
  AuthContext,
  AuthValidator,
  ClientMessage,
  COUNTHandler,
  EVENTHandler,
  EventSigner,
  EventVerifier,
  LogEntry,
  LogHandler,
  LogLevel,
  MockRelayOptions,
  NostrEvent,
  NostrFilter,
  RelayInformation,
  RelayLimitation,
  RelayMessage,
  RelaySnapshot,
  REQHandler,
  StartStreamOptions,
  StreamHandle,
  StreamOptions,
  UnsignedEvent,
} from "./types.ts";
