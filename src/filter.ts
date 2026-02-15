/**
 * NIP-01 フィルターマッチング
 *
 * イベントがフィルター条件に合致するかを判定する純粋関数群。
 *
 * @module
 */

import type { NostrEvent, NostrFilter } from "./types.ts";

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
  // ids: プレフィックスマッチ
  if (filter.ids !== undefined) {
    if (!filter.ids.some((prefix) => event.id.startsWith(prefix))) {
      return false;
    }
  }

  // authors: プレフィックスマッチ
  if (filter.authors !== undefined) {
    if (!filter.authors.some((prefix) => event.pubkey.startsWith(prefix))) {
      return false;
    }
  }

  // kinds: 完全一致
  if (filter.kinds !== undefined) {
    if (!filter.kinds.includes(event.kind)) {
      return false;
    }
  }

  // since: created_at >= since
  if (filter.since !== undefined) {
    if (event.created_at < filter.since) {
      return false;
    }
  }

  // until: created_at <= until
  if (filter.until !== undefined) {
    if (event.created_at > filter.until) {
      return false;
    }
  }

  // NIP-50: search (content の部分一致、大文字小文字非区別)
  if (filter.search !== undefined) {
    if (
      !event.content.toLowerCase().includes(filter.search.toLowerCase())
    ) {
      return false;
    }
  }

  // タグフィルター (#e, #p 等)
  for (const key of Object.keys(filter)) {
    if (key.startsWith("#") && key.length >= 2) {
      const tagName = key.slice(1);
      const values = filter[key as `#${string}`];
      if (values !== undefined && values.length > 0) {
        const eventTagValues = event.tags
          .filter((tag) => tag[0] === tagName)
          .map((tag) => tag[1]);
        if (!values.some((v) => eventTagValues.includes(v))) {
          return false;
        }
      }
    }
  }

  return true;
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
  const matched = events
    .filter((event) => matchFilter(event, filter))
    .sort((a, b) => b.created_at - a.created_at);

  if (filter.limit !== undefined && filter.limit >= 0) {
    return matched.slice(0, filter.limit);
  }
  return matched;
}
