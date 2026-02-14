/**
 * スナップショット
 *
 * MockRelayの状態を保存・復元するラッパー関数を提供する。
 *
 * @module
 */

import type { MockRelay } from "../relay.ts";
import type { RelaySnapshot } from "../types.ts";

/**
 * リレーの現在の状態を保存する
 *
 * ストアと受信メッセージのスナップショットを作成する。
 *
 * @param relay スナップショットを取得するMockRelay
 * @returns スナップショット
 */
export function snapshot(relay: MockRelay): RelaySnapshot {
  return relay.snapshot();
}

/**
 * スナップショットからリレーの状態を復元する
 *
 * @param relay 復元先のMockRelay
 * @param snap 復元するスナップショット
 */
export function restore(relay: MockRelay, snap: RelaySnapshot): void {
  relay.restore(snap);
}
