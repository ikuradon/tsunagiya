/**
 * 繋ぎ屋 型定義
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
  /** NIP-50: 検索キーワード */
  search?: string;
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
  | ["AUTH", NostrEvent]
  | ["COUNT", string, ...NostrFilter[]];

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
  | ["AUTH", string]
  | ["COUNT", string, { count: number }];

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

/** 署名前のイベント（id / sig を含まない） */
export interface UnsignedEvent {
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
}

/** イベント署名インターフェース */
export interface EventSigner {
  /** 公開鍵を返す */
  getPublicKey(): string | Promise<string>;
  /** イベントに署名し、id と sig を返す */
  signEvent(
    event: UnsignedEvent,
  ): { id: string; sig: string } | Promise<{ id: string; sig: string }>;
}

/** イベント検証インターフェース */
export interface EventVerifier {
  /** イベントの署名を検証する */
  verifyEvent(event: NostrEvent): boolean | Promise<boolean>;
}

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
  /** 接続遅延 (ms) */
  connectionDelay?: number;
  /** 接続時にAUTH要求するか */
  requiresAuth?: boolean;
  /** ログ出力 */
  logging?: boolean | LogHandler;
  /** イベント署名検証 */
  verifier?: EventVerifier;
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

/** AUTH検証コンテキスト */
export interface AuthContext {
  /** リレーURL */
  relayUrl: string;
  /** チャレンジ文字列 */
  challenge: string;
}

/**
 * AUTHバリデーター型
 *
 * カスタム設定時は標準のリレーURLチェックを置き換える。
 * context から relayUrl や challenge を参照して独自の検証ロジックを実装できる。
 */
export type AuthValidator = (
  authEvent: NostrEvent,
  context: AuthContext,
) => boolean | Promise<boolean>;

/** COUNTハンドラー型 */
export type COUNTHandler = (
  subId: string,
  filters: NostrFilter[],
) => { count: number } | Promise<{ count: number }>;

/** ログレベル */
export type LogLevel = "silent" | "error" | "info" | "debug" | "trace";

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

/** NIP-11 リレー制限事項 */
export interface RelayLimitation {
  max_message_length?: number;
  max_subscriptions?: number;
  max_limit?: number;
  max_subid_length?: number;
  max_event_tags?: number;
  max_content_length?: number;
  min_pow_difficulty?: number;
  auth_required?: boolean;
  payment_required?: boolean;
  restricted_writes?: boolean;
  created_at_lower_limit?: number;
  created_at_upper_limit?: number;
}

/** NIP-11 リレー情報ドキュメント */
export interface RelayInformation {
  name?: string;
  description?: string;
  banner?: string;
  icon?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: RelayLimitation;
  fees?: Record<string, unknown>;
}

/** リレーのスナップショット */
export interface RelaySnapshot {
  /** 保存時刻 (ms) */
  timestamp: number;
  /** ストア内のイベント */
  store: NostrEvent[];
  /** 受信メッセージログ */
  received: ClientMessage[];
  /** 削除済みイベントID */
  deletedIds?: string[];
  /** NIP-11 リレー情報 */
  info?: RelayInformation;
  /** スナップショットメタデータ */
  metadata?: {
    /** アクティブなサブスクリプション数 */
    subscriptionCount: number;
    /** アクティブな接続数 */
    connectionCount: number;
    /** ストア内のイベント数 */
    eventCount: number;
  };
}
