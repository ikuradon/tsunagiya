import type { NostrEvent } from "./nostr.ts";
import type { RandomSource } from "./runtime.ts";

/** ストリームオプション */
export interface StreamOptions {
  /** 送信間隔 (ms) */
  interval?: number;
  /** ランダムなジッター幅 (±ms) */
  jitter?: number;
  /** ジッター用乱数ソース */
  random?: RandomSource;
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
