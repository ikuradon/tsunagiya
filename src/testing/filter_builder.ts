/**
 * FilterBuilder - よくあるフィルターパターン生成ヘルパー
 *
 * Nostrクライアントで頻出するフィルターをワンライナーで生成する。
 *
 * @module
 */

import type { NostrFilter } from "../types.ts";

/** タイムラインフィルターオプション */
export interface TimelineFilterOptions {
  /** 返却数上限 */
  limit?: number;
  /** created_at 下限 */
  since?: number;
  /** created_at 上限 */
  until?: number;
}

/**
 * よくあるNostrフィルターパターンを生成するヘルパー
 *
 * @example
 * ```ts
 * const filter = FilterBuilder.timeline({ limit: 20 });
 * // → { kinds: [1], limit: 20 }
 * ```
 */
export class FilterBuilder {
  /**
   * タイムラインフィルター (kind:1)
   */
  static timeline(options: TimelineFilterOptions = {}): NostrFilter {
    const filter: NostrFilter = { kinds: [1] };
    if (options.limit !== undefined) filter.limit = options.limit;
    if (options.since !== undefined) filter.since = options.since;
    if (options.until !== undefined) filter.until = options.until;
    return filter;
  }

  /**
   * プロフィールフィルター (kind:0)
   */
  static profile(pubkey: string): NostrFilter {
    return { kinds: [0], authors: [pubkey] };
  }

  /**
   * メンションフィルター (kind:1, #p タグ)
   */
  static mentions(pubkey: string): NostrFilter {
    return { kinds: [1], "#p": [pubkey] };
  }

  /**
   * リアクションフィルター (kind:7, #e タグ)
   */
  static reactions(eventId: string): NostrFilter {
    return { kinds: [7], "#e": [eventId] };
  }

  /**
   * 検索フィルター (NIP-50)
   *
   * @param keyword 検索キーワード
   */
  static search(keyword: string): NostrFilter {
    return { search: keyword };
  }
}
