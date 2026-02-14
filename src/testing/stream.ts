/**
 * リアルタイムストリーム
 *
 * MockRelayに対して時間差でイベントを配信する機能を提供する。
 *
 * @module
 */

import type { MockRelay } from "../relay.ts";
import type {
  NostrEvent,
  StartStreamOptions,
  StreamHandle,
  StreamOptions,
} from "../types.ts";

/**
 * イベントを時間差で送信する
 *
 * 指定されたイベント配列を、指定間隔でリレーのアクティブなサブスクリプションに
 * ブロードキャストする。各イベントはストアにも追加される。
 *
 * @param relay 送信先のMockRelay
 * @param events 送信するイベント配列
 * @param options 送信オプション
 * @returns ストリームを停止できるハンドル
 */
export function streamEvents(
  relay: MockRelay,
  events: NostrEvent[],
  options: StreamOptions = {},
): StreamHandle {
  const interval = options.interval ?? 100;
  const jitter = options.jitter ?? 0;
  let index = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext(): void {
    if (stopped || index >= events.length) return;

    const delay = interval +
      (jitter > 0 ? Math.round((Math.random() * 2 - 1) * jitter) : 0);
    const effectiveDelay = Math.max(0, delay);

    timer = setTimeout(() => {
      if (stopped || index >= events.length) return;
      const event = events[index++];
      relay.store(event);
      relay._broadcastEvent(event);
      scheduleNext();
    }, effectiveDelay);
  }

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    get stopped() {
      return stopped;
    },
  };
}

/**
 * 継続的なストリームを開始する
 *
 * イベント生成関数を使って、指定間隔でイベントを生成・配信する。
 * countが指定されている場合、その件数に達したら自動停止する。
 *
 * @param relay 送信先のMockRelay
 * @param options ストリームオプション（eventGenerator必須）
 * @returns ストリームを停止できるハンドル
 */
export function startStream(
  relay: MockRelay,
  options: StartStreamOptions,
): StreamHandle {
  const interval = options.interval ?? 1000;
  const jitter = options.jitter ?? 0;
  const maxCount = options.count;
  let count = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext(): void {
    if (stopped) return;
    if (maxCount !== undefined && count >= maxCount) {
      stopped = true;
      return;
    }

    const delay = interval +
      (jitter > 0 ? Math.round((Math.random() * 2 - 1) * jitter) : 0);
    const effectiveDelay = Math.max(0, delay);

    timer = setTimeout(() => {
      if (stopped) return;
      if (maxCount !== undefined && count >= maxCount) {
        stopped = true;
        return;
      }

      const event = options.eventGenerator();
      relay.store(event);
      relay._broadcastEvent(event);
      count++;

      scheduleNext();
    }, effectiveDelay);
  }

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    get stopped() {
      return stopped;
    },
  };
}
