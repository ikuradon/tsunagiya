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

  // ===== NIP-52 Calendar Events =====

  /**
   * Date-based Calendar Event フィルター (kind:31922, NIP-52)
   */
  static calendarDateEvents(): NostrFilter {
    return { kinds: [31922] };
  }

  /**
   * Time-based Calendar Event フィルター (kind:31923, NIP-52)
   */
  static calendarTimeEvents(): NostrFilter {
    return { kinds: [31923] };
  }

  /**
   * 全 Calendar Event フィルター (kind:31922 + 31923, NIP-52)
   */
  static calendarEvents(): NostrFilter {
    return { kinds: [31922, 31923] };
  }

  /**
   * Calendar Collection フィルター (kind:31924, NIP-52)
   */
  static calendarCollections(): NostrFilter {
    return { kinds: [31924] };
  }

  /**
   * Calendar Event RSVP フィルター (kind:31925, NIP-52)
   */
  static rsvps(eventAddress: string): NostrFilter {
    return { kinds: [31925], "#a": [eventAddress] };
  }

  // ===== NIP-65 Relay List Metadata =====

  /**
   * Relay List Metadata フィルター (kind:10002, NIP-65)
   *
   * @param pubkey 対象の公開鍵
   */
  static relayList(pubkey: string): NostrFilter {
    return { kinds: [10002], authors: [pubkey] };
  }

  // ===== NIP-18 Reposts =====

  /**
   * Repost フィルター (kind:6, NIP-18)
   *
   * @param eventId リポスト対象のイベントID
   */
  static reposts(eventId: string): NostrFilter {
    return { kinds: [6], "#e": [eventId] };
  }

  /**
   * 全リポストフィルター (kind:6 + 16, NIP-18)
   *
   * @param eventId リポスト対象のイベントID
   */
  static allReposts(eventId: string): NostrFilter {
    return { kinds: [6, 16], "#e": [eventId] };
  }

  // ===== NIP-23 Long-form Content =====

  /**
   * Long-form Content フィルター (kind:30023, NIP-23)
   *
   * @param pubkey 特定の著者で絞り込む場合に指定
   */
  static longFormContent(pubkey?: string): NostrFilter {
    const filter: NostrFilter = { kinds: [30023] };
    if (pubkey) filter.authors = [pubkey];
    return filter;
  }

  /**
   * ハッシュタグによる Long-form Content フィルター (kind:30023, NIP-23)
   *
   * @param hashtag ハッシュタグ（#なし）
   */
  static longFormByTag(hashtag: string): NostrFilter {
    return { kinds: [30023], "#t": [hashtag] };
  }

  // ===== NIP-25 Reactions =====

  /**
   * アドレス指定リアクションフィルター (kind:7, NIP-25)
   *
   * @param address アドレス (kind:pubkey:d-tag 形式)
   */
  static reactionsTo(address: string): NostrFilter {
    return { kinds: [7], "#a": [address] };
  }

  // ===== NIP-51 Lists =====

  /**
   * Mute List フィルター (kind:10000, NIP-51)
   *
   * @param pubkey 対象の公開鍵
   */
  static muteList(pubkey: string): NostrFilter {
    return { kinds: [10000], authors: [pubkey] };
  }

  /**
   * Pin List フィルター (kind:10001, NIP-51)
   *
   * @param pubkey 対象の公開鍵
   */
  static pinList(pubkey: string): NostrFilter {
    return { kinds: [10001], authors: [pubkey] };
  }

  /**
   * Bookmarks フィルター (kind:10003, NIP-51)
   *
   * @param pubkey 対象の公開鍵
   */
  static bookmarks(pubkey: string): NostrFilter {
    return { kinds: [10003], authors: [pubkey] };
  }

  /**
   * Follow Sets フィルター (kind:30000, NIP-51)
   *
   * @param pubkey 対象の公開鍵
   */
  static followSets(pubkey: string): NostrFilter {
    return { kinds: [30000], authors: [pubkey] };
  }

  // ===== NIP-17 Private Direct Messages =====

  /**
   * Gift Wraps フィルター (kind:1059, NIP-17)
   *
   * @param pubkey 受信者の公開鍵
   */
  static giftWraps(pubkey: string): NostrFilter {
    return { kinds: [1059], "#p": [pubkey] };
  }

  /**
   * DM Relay List フィルター (kind:10050, NIP-17)
   *
   * @param pubkey 対象の公開鍵
   */
  static dmRelayList(pubkey: string): NostrFilter {
    return { kinds: [10050], authors: [pubkey] };
  }
}
