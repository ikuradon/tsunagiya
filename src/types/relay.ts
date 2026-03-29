import type {
  ClientMessage,
  EventVerifier,
  NostrEvent,
  NostrFilter,
} from "./nostr.ts";
import type { Clock, LogHandler, RandomSource } from "./runtime.ts";

/** ネットワーク条件シミュレーション設定 */
export interface NetworkConditions {
  /** 接続確立までの遅延 (ms) */
  connectDelay?: number;
  /** メッセージ配信の基本遅延 (ms) */
  messageDelay?: number;
  /** 遅延のジッター幅 (ms)。実際の遅延は delay ± random(jitter) */
  jitter?: number;
  /** メッセージ順序のシャッフル確率 (0.0–1.0) */
  outOfOrderRate?: number;
  /** 一時的な接続断のシミュレーション設定 */
  transientDisconnect?: {
    /** 切断が発生する確率 (0.0–1.0)。メッセージ配信ごとに判定 */
    probability: number;
    /** 切断から再接続可能になるまでの時間 (ms) */
    duration: number;
  };
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
  /** AUTHイベント署名検証 */
  authVerifier?: EventVerifier;
  /** 時刻ソース */
  clock?: Clock;
  /** 乱数ソース */
  random?: RandomSource;
  /** ネットワーク条件シミュレーション */
  network?: NetworkConditions;
}

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
