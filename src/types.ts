/**
 * tsunagiya 型定義
 *
 * Nostrプロトコルおよびモックリレーに必要な型を集約。
 *
 * @module
 */

/** Nostrイベント (NIP-01) */
export interface NostrEvent {
  /** イベントID (64文字hex) */
  id: string;
  /** 公開鍵 (64文字hex) */
  pubkey: string;
  /** UNIX タイムスタンプ (秒) */
  created_at: number;
  /** イベント種別 */
  kind: number;
  /** タグ配列 */
  tags: string[][];
  /** コンテンツ文字列 */
  content: string;
  /** 署名 (128文字hex) */
  sig: string;
}

/** Nostrフィルター (NIP-01) */
export interface NostrFilter {
  /** イベントIDプレフィックスマッチ */
  ids?: string[];
  /** 公開鍵プレフィックスマッチ */
  authors?: string[];
  /** kind 完全一致 */
  kinds?: number[];
  /** created_at 下限 (inclusive) */
  since?: number;
  /** created_at 上限 (inclusive) */
  until?: number;
  /** 返却数上限 */
  limit?: number;
  /** タグフィルター (#e, #p 等) */
  [key: `#${string}`]: string[] | undefined;
}

/**
 * Nostrメッセージ型 (クライアント → リレー)
 *
 * NIP-01 で定義されるメッセージ。
 */
export type ClientMessage =
  | ["EVENT", NostrEvent]
  | ["REQ", string, ...NostrFilter[]]
  | ["CLOSE", string]
  | ["AUTH", NostrEvent];

/**
 * Nostrメッセージ型 (リレー → クライアント)
 *
 * NIP-01 で定義されるメッセージ。
 */
export type RelayMessage =
  | ["EVENT", string, NostrEvent]
  | ["OK", string, boolean, string]
  | ["EOSE", string]
  | ["CLOSED", string, string]
  | ["NOTICE", string]
  | ["AUTH", string];

/** ログエントリ */
export interface LogEntry {
  /** タイムスタンプ (ms) */
  timestamp: number;
  /** リレーURL */
  relay: string;
  /** メッセージ方向 */
  direction: "send" | "receive";
  /** メッセージデータ */
  data: unknown;
}

/** ログハンドラー関数 */
export type LogHandler = (entry: LogEntry) => void;

/** MockRelayオプション */
export interface MockRelayOptions {
  /** レイテンシ (ms) */
  latency?: { min: number; max: number } | number;
  /** エラー率 (0.0 - 1.0) */
  errorRate?: number;
  /** ランダム切断確率 (0.0 - 1.0) */
  disconnectRate?: number;
  /** 接続タイムアウト (ms) */
  connectionTimeout?: number;
  /** 接続時にAUTH要求するか */
  requiresAuth?: boolean;
  /** ログ出力 */
  logging?: boolean | LogHandler;
}

/** WebSocket readyState 定数 */
export const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/** REQハンドラー型 */
export type REQHandler = (
  subId: string,
  filters: NostrFilter[],
) => NostrEvent[] | Promise<NostrEvent[]>;

/** EVENTハンドラー型 */
export type EVENTHandler = (
  event: NostrEvent,
) =>
  | ["OK", string, boolean, string]
  | Promise<["OK", string, boolean, string]>;

/** AUTHバリデーター型 */
export type AuthValidator = (
  authEvent: NostrEvent,
) => boolean | Promise<boolean>;

/** ログレベル */
export type LogLevel = "silent" | "error" | "info" | "debug";

/** ストリームオプション */
export interface StreamOptions {
  /** 送信間隔 (ms) */
  interval?: number;
  /** ランダムなジッター幅 (±ms) */
  jitter?: number;
}

/** 継続的ストリームオプション */
export interface StartStreamOptions extends StreamOptions {
  /** イベント生成関数 */
  eventGenerator: () => NostrEvent;
  /** 送信件数上限（省略時は無制限） */
  count?: number;
}

/** ストリームハンドル */
export interface StreamHandle {
  /** ストリームを停止する */
  stop(): void;
  /** 停止済みかどうか */
  readonly stopped: boolean;
}

/** リレーのスナップショット */
export interface RelaySnapshot {
  /** 保存時刻 (ms) */
  timestamp: number;
  /** ストア内のイベント */
  store: NostrEvent[];
  /** 受信メッセージログ */
  received: ClientMessage[];
}
