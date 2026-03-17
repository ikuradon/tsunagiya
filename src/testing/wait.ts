/**
 * 条件待ちユーティリティ
 *
 * ポーリングベースで条件が満たされるまで待機する。
 * 固定時間の setTimeout 待ちの代替として、CI 環境でのフレーキーテストを防止する。
 *
 * @module
 */

/** waitFor のオプション */
export interface WaitForOptions {
  /** タイムアウト（ミリ秒）。デフォルト: 5000 */
  timeout?: number;
  /** ポーリング間隔（ミリ秒）。デフォルト: 10 */
  interval?: number;
}

/**
 * 条件が満たされるまでポーリングで待機する
 *
 * 条件関数が `true` を返すまで、指定間隔でポーリングする。
 * タイムアウト時間内に条件が満たされなければ reject する。
 *
 * @param condition 条件関数。`true` を返すと resolve
 * @param options タイムアウトとポーリング間隔
 * @example
 * ```ts
 * const received: NostrEvent[] = [];
 * ws.onmessage = (ev) => received.push(JSON.parse(ev.data));
 *
 * // 3件届くまで待つ
 * await waitFor(() => received.length >= 3);
 *
 * // カスタムタイムアウト・間隔
 * await waitFor(() => relay.connectionCount === 0, {
 *   timeout: 3000,
 *   interval: 20,
 * });
 * ```
 */
export function waitFor(
  condition: () => boolean,
  options: WaitForOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 10;

  if (condition()) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poller);
      reject(new Error(`waitFor timed out after ${timeout}ms`));
    }, timeout);

    const poller = setInterval(() => {
      if (condition()) {
        clearInterval(poller);
        clearTimeout(deadline);
        resolve();
      }
    }, interval);
  });
}
