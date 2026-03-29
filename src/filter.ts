/**
 * NIP-01 フィルターマッチング
 *
 * イベントがフィルター条件に合致するかを判定する純粋関数群。
 *
 * @module
 */

import type { NostrEvent, NostrFilter } from "./types.ts";
import {
  collectMatchingEvents,
  compileFilter,
} from "./relay/filter_compiler.ts";

/**
 * イベントが単一フィルターにマッチするか判定する
 *
 * NIP-01 のフィルター仕様に準拠。全条件がANDで評価される。
 * `limit` はマッチング自体には影響しない（呼び出し側で制御）。
 *
 * @param event 判定対象のイベント
 * @param filter フィルター条件
 * @returns マッチすれば true
 */
export function matchFilter(event: NostrEvent, filter: NostrFilter): boolean {
  return compileFilter(filter).matches(event);
}

/**
 * イベントが複数フィルターのいずれかにマッチするか判定する
 *
 * フィルター間はOR条件。いずれか1つにマッチすれば true。
 *
 * @param event 判定対象のイベント
 * @param filters フィルター配列
 * @returns マッチすれば true
 */
export function matchFilters(
  event: NostrEvent,
  filters: NostrFilter[],
): boolean {
  return filters.some((filter) => matchFilter(event, filter));
}

/**
 * イベント配列からフィルター条件にマッチするものを抽出する
 *
 * created_at 降順でソートし、limit が指定されていれば制限する。
 *
 * @param events イベント配列
 * @param filter フィルター条件
 * @returns マッチしたイベント配列
 */
export function filterEvents(
  events: NostrEvent[],
  filter: NostrFilter,
): NostrEvent[] {
  return collectMatchingEvents(events, compileFilter(filter));
}
