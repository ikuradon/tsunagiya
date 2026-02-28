/**
 * ログ機能
 *
 * MockRelayのメッセージ送受信をログ出力する。
 * console出力モードとカスタムハンドラーモードに対応。
 *
 * @module
 */

import type { LogEntry, LogHandler, LogLevel } from "./types.ts";

/** ログレベルの優先度マップ */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * ロガー
 *
 * MockRelayのメッセージ送受信をログ出力する。
 * ログレベルとカスタムハンドラーに対応。
 */
export class Logger {
  #level: LogLevel;
  #handler: LogHandler | null;
  #entries: LogEntry[] = [];

  constructor(level: LogLevel = "info", handler?: LogHandler) {
    this.#level = level;
    this.#handler = handler ?? null;
  }

  /** 現在のログレベル */
  get level(): LogLevel {
    return this.#level;
  }

  /** ログレベルを変更する */
  setLevel(level: LogLevel): void {
    this.#level = level;
  }

  /** カスタムハンドラーを設定する */
  setHandler(handler: LogHandler): void {
    this.#handler = handler;
  }

  /** 蓄積されたログエントリ */
  get entries(): ReadonlyArray<LogEntry> {
    return this.#entries;
  }

  /** ログエントリをクリアする */
  clear(): void {
    this.#entries = [];
  }

  /**
   * ログを記録する
   *
   * @param entry ログエントリ
   * @param entryLevel このエントリのログレベル
   */
  log(entry: LogEntry, entryLevel: LogLevel = "debug"): void {
    // silentなら何もしない
    if (this.#level === "silent") return;

    // レベルチェック
    if (LOG_LEVEL_PRIORITY[entryLevel] > LOG_LEVEL_PRIORITY[this.#level]) {
      return;
    }

    this.#entries.push(entry);

    if (this.#handler) {
      this.#handler(entry);
    } else {
      this.#consoleLog(entry);
    }
  }

  #consoleLog(entry: LogEntry): void {
    const arrow = entry.direction === "send" ? "→" : "←";
    const label = entry.direction === "send" ? "SEND" : "RECV";
    const time = new Date(entry.timestamp).toISOString();
    const data = typeof entry.data === "string"
      ? entry.data
      : JSON.stringify(entry.data);

    console.log(`[${time}] ${arrow} ${label} ${entry.relay}: ${data}`);
  }
}

/**
 * LogHandlerまたはbooleanからLoggerインスタンスを生成する
 *
 * MockRelayOptionsのloggingフィールドに対応。
 */
export function createLogger(
  logging: boolean | LogHandler | undefined,
  level: LogLevel = "info",
): Logger | null {
  if (logging === undefined || logging === false) return null;

  if (logging === true) {
    return new Logger(level);
  }

  return new Logger(level, logging);
}
