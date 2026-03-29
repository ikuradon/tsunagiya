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

/** 時刻ソース */
export interface Clock {
  /** 現在時刻 (ms) を返す */
  now(): number;
}

/** 乱数ソース */
export interface RandomSource {
  /** 0.0 以上 1.0 未満の乱数を返す */
  next(): number;
  /** バイト列をランダム値で埋める */
  fill(bytes: Uint8Array): void;
}

/** WebSocket readyState 定数 */
export const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/** ログレベル */
export type LogLevel = "silent" | "error" | "info" | "debug" | "trace";
