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
