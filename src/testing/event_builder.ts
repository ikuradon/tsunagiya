/**
 * EventBuilder - テスト用イベント生成ヘルパー
 *
 * Nostrイベントをビルダーパターンで簡単に生成する。
 * 正常・壊れた・署名エラーのイベント、バルク生成、リレーションシップ生成、
 * NIP別テンプレート等を提供する。
 *
 * @module
 */

import type { NostrEvent } from "../types.ts";

/** ランダムhex文字列を生成する */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** corrupt オプション */
export interface CorruptOptions {
  /** IDを不正な値にする */
  id?: boolean;
  /** pubkeyを不正な値にする */
  pubkey?: boolean;
  /** 署名を不正な値にする */
  sig?: boolean;
  /** created_atを不正な値にする */
  created_at?: boolean;
}

/** bulk/timeline 生成オプション */
export interface BulkOptions {
  /** イベントkind */
  kind?: number;
  /** 公開鍵 */
  pubkey?: string;
}

/** timeline 生成オプション */
export interface TimelineOptions extends BulkOptions {
  /** 秒間隔 */
  interval?: number;
  /** 開始時刻 (UNIX秒) */
  startTime?: number;
}

/** ZapRequest オプション */
export interface ZapRequestOptions {
  /** 金額 (millisats) */
  amount: number;
  /** リレーURL一覧 */
  relays: string[];
  /** LNURL */
  lnurl: string;
  /** 対象イベントID */
  eventId?: string;
  /** 対象公開鍵 */
  recipientPubkey?: string;
}

/** NIP-52 Date-based Calendar Event オプション */
export interface CalendarDateEventOptions {
  title: string;
  startDate: string; // ISO 8601 (e.g. "2026-03-01")
  endDate?: string;
  location?: string;
  geohash?: string;
  participants?: string[]; // pubkeys
  hashtags?: string[];
}

/** NIP-52 Time-based Calendar Event オプション */
export interface CalendarTimeEventOptions {
  title: string;
  start: number; // UNIX timestamp
  end?: number;
  startTzid?: string; // IANA timezone
  endTzid?: string;
  location?: string;
  geohash?: string;
  participants?: string[];
  hashtags?: string[];
}

/** NIP-52 Calendar Collection オプション */
export interface CalendarCollectionOptions {
  title: string;
  events: string[]; // "a" tag coordinates (e.g. "31922:pubkey:d-tag")
}

/** NIP-52 Calendar Event RSVP オプション */
export interface CalendarRsvpOptions {
  eventAddress: string; // "a" tag coordinate
  status: "accepted" | "declined" | "tentative";
  freebusy?: "free" | "busy";
  content?: string;
}

/** NIP-23 Long-form Content オプション */
export interface LongFormOptions {
  identifier: string;
  title: string;
  content: string;
  summary?: string;
  image?: string;
  publishedAt?: number;
  hashtags?: string[];
}

/** NIP-51 List オプション */
export interface ListOptions {
  /** 公開鍵一覧 (p タグ) */
  pubkeys?: string[];
  /** イベントID一覧 (e タグ) */
  eventIds?: string[];
  /** アドレス一覧 (a タグ) */
  addresses?: string[];
  /** ハッシュタグ一覧 (t タグ) */
  hashtags?: string[];
  /** ワード一覧 (word タグ) */
  words?: string[];
}

/** NIP-17 Chat Message オプション */
export interface ChatMessageOptions {
  /** 宛先公開鍵 */
  recipientPubkey: string;
  /** メッセージ内容 */
  content: string;
  /** 返信対象のイベントID */
  replyTo?: string;
  /** 件名 */
  subject?: string;
}

/** NIP-17 Gift Wrap オプション */
export interface GiftWrapOptions {
  /** 宛先公開鍵 */
  recipientPubkey: string;
  /** ラップするイベント */
  innerEvent: NostrEvent;
}

/**
 * テスト用Nostrイベントのビルダー
 *
 * メソッドチェーンでイベントを構築する。`.build()` で `NostrEvent` を取得する。
 *
 * @example
 * ```ts
 * const event = EventBuilder.kind1()
 *   .content("hello world")
 *   .tag("p", pubkey)
 *   .build();
 * ```
 */
export class EventBuilder {
  #id: string;
  #pubkey: string;
  #kind: number;
  #content: string;
  #created_at: number;
  #tags: string[][];
  #sig: string;

  private constructor(kind: number) {
    this.#id = randomHex(32);
    this.#pubkey = randomHex(32);
    this.#kind = kind;
    this.#content = "";
    this.#created_at = Math.floor(Date.now() / 1000);
    this.#tags = [];
    this.#sig = randomHex(64);
  }

  // ===== スタティック ファクトリ =====

  /** kind:0 (Metadata) ビルダーを作成する */
  static kind0(): EventBuilder {
    return new EventBuilder(0);
  }

  /** kind:1 (Short Text Note) ビルダーを作成する */
  static kind1(): EventBuilder {
    return new EventBuilder(1);
  }

  /** kind:3 (Contacts) ビルダーを作成する */
  static kind3(): EventBuilder {
    return new EventBuilder(3);
  }

  /** kind:4 (Encrypted DM) ビルダーを作成する */
  static kind4(): EventBuilder {
    return new EventBuilder(4);
  }

  /** kind:7 (Reaction) ビルダーを作成する */
  static kind7(): EventBuilder {
    return new EventBuilder(7);
  }

  /** 任意のkindでビルダーを作成する */
  static kind(k: number): EventBuilder {
    return new EventBuilder(k);
  }

  // ===== ビルダーメソッド =====

  /** コンテンツを設定する */
  content(text: string): EventBuilder {
    this.#content = text;
    return this;
  }

  /** タグを追加する */
  tag(key: string, ...values: string[]): EventBuilder {
    this.#tags.push([key, ...values]);
    return this;
  }

  /** 公開鍵を設定する */
  pubkey(pubkey: string): EventBuilder {
    this.#pubkey = pubkey;
    return this;
  }

  /** IDを設定する */
  id(id: string): EventBuilder {
    this.#id = id;
    return this;
  }

  /** created_at を設定する */
  createdAt(timestamp: number): EventBuilder {
    this.#created_at = timestamp;
    return this;
  }

  /**
   * モック署名を生成する
   *
   * 実際の暗号署名ではなく、ランダムなhex文字列を署名として設定する。
   * 引数の秘密鍵は署名の一部として使用するが、暗号的に正しい署名ではない。
   */
  sign(_privateKey?: string): EventBuilder {
    this.#sig = randomHex(64);
    return this;
  }

  /**
   * イベントを壊す
   *
   * 指定したフィールドを不正な値に置き換える。
   */
  corrupt(options: CorruptOptions): EventBuilder {
    if (options.id) this.#id = "corrupted_" + randomHex(8);
    if (options.pubkey) this.#pubkey = "corrupted_" + randomHex(8);
    if (options.sig) this.#sig = "corrupted_" + randomHex(8);
    if (options.created_at) this.#created_at = -1;
    return this;
  }

  // ===== Common Tags =====

  /**
   * Geohash タグを追加する (NIP-52)
   */
  geohash(hash: string): EventBuilder {
    this.#tags.push(["g", hash]);
    return this;
  }

  /**
   * Emoji タグを追加する (NIP-30)
   */
  emoji(name: string, url: string): EventBuilder {
    this.#tags.push(["emoji", name, url]);
    return this;
  }

  // ===== ビルド =====

  /** NostrEvent を構築して返す */
  build(): NostrEvent {
    return {
      id: this.#id,
      pubkey: this.#pubkey,
      created_at: this.#created_at,
      kind: this.#kind,
      tags: [...this.#tags.map((t) => [...t])],
      content: this.#content,
      sig: this.#sig,
    };
  }

  // ===== スタティック ヘルパー =====

  /**
   * ランダムなイベントを生成する
   */
  static random(
    options: { kind?: number; pubkey?: string } = {},
  ): NostrEvent {
    const builder = new EventBuilder(options.kind ?? 1);
    if (options.pubkey) builder.pubkey(options.pubkey);
    builder.content("random: " + randomHex(8));
    return builder.build();
  }

  /**
   * 複数のイベントを一括生成する
   */
  static bulk(count: number, options: BulkOptions = {}): NostrEvent[] {
    const events: NostrEvent[] = [];
    for (let i = 0; i < count; i++) {
      const builder = new EventBuilder(options.kind ?? 1);
      if (options.pubkey) builder.pubkey(options.pubkey);
      builder.content(`bulk event ${i}`);
      events.push(builder.build());
    }
    return events;
  }

  /**
   * 時系列のイベントを生成する
   *
   * created_at が interval 秒ずつ増加するイベント列を生成する。
   */
  static timeline(count: number, options: TimelineOptions = {}): NostrEvent[] {
    const interval = options.interval ?? 60;
    const startTime = options.startTime ?? Math.floor(Date.now() / 1000);
    const events: NostrEvent[] = [];
    for (let i = 0; i < count; i++) {
      const builder = new EventBuilder(options.kind ?? 1);
      if (options.pubkey) builder.pubkey(options.pubkey);
      builder.createdAt(startTime + i * interval);
      builder.content(`timeline event ${i}`);
      events.push(builder.build());
    }
    return events;
  }

  /**
   * リプライチェーン（スレッド）を生成する
   *
   * @param depth チェーンの深さ
   * @returns [root, reply1, reply2, ...] のイベント配列
   */
  static thread(depth: number): NostrEvent[] {
    const events: NostrEvent[] = [];
    const rootPubkey = randomHex(32);

    for (let i = 0; i < depth; i++) {
      const builder = new EventBuilder(1);
      const pubkey = i === 0 ? rootPubkey : randomHex(32);
      builder.pubkey(pubkey);
      builder.createdAt(Math.floor(Date.now() / 1000) + i);
      builder.content(`thread message ${i}`);

      if (i > 0) {
        // root タグ
        builder.tag("e", events[0].id, "", "root");
        // reply タグ（直前のイベント）
        if (i > 1) {
          builder.tag("e", events[i - 1].id, "", "reply");
        }
        // 元投稿者のpタグ
        builder.tag("p", events[i - 1].pubkey);
      }

      events.push(builder.build());
    }
    return events;
  }

  /**
   * リアクション付き投稿を生成する
   *
   * @param reactionCount リアクション数
   * @param options オプション (content, targetKind)
   * @returns [post, reactions[]] のタプル
   */
  static withReactions(
    reactionCount: number,
    options?: { content?: string; targetKind?: number },
  ): [NostrEvent, NostrEvent[]] {
    const post = EventBuilder.kind1().content("post with reactions").build();

    const reactions: NostrEvent[] = [];
    for (let i = 0; i < reactionCount; i++) {
      const reaction = EventBuilder.kind7()
        .content(options?.content ?? "+")
        .tag("e", post.id)
        .tag("p", post.pubkey);
      if (options?.targetKind !== undefined) {
        reaction.tag("k", String(options.targetKind));
      }
      reactions.push(reaction.build());
    }
    return [post, reactions];
  }

  // ===== NIP-09 削除リクエスト =====

  /**
   * 削除リクエスト (kind:5) ビルダーを作成する (NIP-09)
   *
   * @param eventIds 削除対象のイベントID配列
   */
  static deletion(eventIds: string[]): EventBuilder {
    const builder = new EventBuilder(5);
    for (const id of eventIds) {
      builder.tag("e", id);
    }
    return builder;
  }

  /**
   * アドレス指定の削除リクエスト (kind:5) ビルダーを作成する (NIP-09)
   *
   * @param addresses 削除対象のアドレス配列 (kind:pubkey:d-tag 形式)
   */
  static deletionByAddress(addresses: string[]): EventBuilder {
    const builder = new EventBuilder(5);
    for (const addr of addresses) {
      builder.tag("a", addr);
    }
    return builder;
  }

  // ===== NIP別テンプレート =====

  /**
   * Metadata イベント (kind:0) を生成する
   */
  static metadata(
    profile: { name?: string; about?: string; picture?: string },
  ): NostrEvent {
    return EventBuilder.kind0()
      .content(JSON.stringify(profile))
      .build();
  }

  /**
   * Contacts イベント (kind:3) を生成する
   */
  static contacts(pubkeys: string[]): NostrEvent {
    const builder = EventBuilder.kind3();
    for (const pk of pubkeys) {
      builder.tag("p", pk);
    }
    return builder.build();
  }

  /**
   * DM イベント (kind:4) を生成する
   *
   * content はモック暗号文（実際の暗号化は行わない）。
   */
  static dm(recipientPubkey: string, content: string): EventBuilder {
    return EventBuilder.kind4()
      .content("mock-encrypted:" + content)
      .tag("p", recipientPubkey);
  }

  /**
   * グループメッセージ (NIP-29, kind:9) ビルダーを作成する
   */
  static groupMessage(groupId: string): EventBuilder {
    return EventBuilder.kind(9)
      .tag("h", groupId);
  }

  /**
   * Zap Request (kind:9734, NIP-57) を生成する
   */
  static zapRequest(options: ZapRequestOptions): NostrEvent {
    const builder = EventBuilder.kind(9734)
      .content("")
      .tag("amount", String(options.amount))
      .tag("lnurl", options.lnurl)
      .tag("relays", ...options.relays);
    if (options.eventId) {
      builder.tag("e", options.eventId);
    }
    if (options.recipientPubkey) {
      builder.tag("p", options.recipientPubkey);
    }
    return builder.build();
  }

  /**
   * NIP-07 Request (kind:24133) を生成する
   */
  static nip07Request(): NostrEvent {
    return EventBuilder.kind(24133)
      .content("mock-nip07-request")
      .build();
  }

  // ===== NIP-52 Calendar Events =====

  /**
   * Date-based Calendar Event (kind:31922, NIP-52) ビルダーを作成する
   */
  static calendarDateEvent(options: CalendarDateEventOptions): EventBuilder {
    const builder = new EventBuilder(31922)
      .tag("d", options.title.toLowerCase().replace(/\s+/g, "-"))
      .tag("title", options.title)
      .tag("start", options.startDate);
    if (options.endDate) builder.tag("end", options.endDate);
    if (options.location) builder.tag("location", options.location);
    if (options.geohash) builder.tag("g", options.geohash);
    if (options.participants) {
      for (const p of options.participants) {
        builder.tag("p", p);
      }
    }
    if (options.hashtags) {
      for (const t of options.hashtags) {
        builder.tag("t", t);
      }
    }
    return builder;
  }

  /**
   * Time-based Calendar Event (kind:31923, NIP-52) ビルダーを作成する
   */
  static calendarTimeEvent(options: CalendarTimeEventOptions): EventBuilder {
    const builder = new EventBuilder(31923)
      .tag("d", options.title.toLowerCase().replace(/\s+/g, "-"))
      .tag("title", options.title)
      .tag("start", String(options.start));
    if (options.end) {
      builder.tag("end", String(options.end));
    }
    if (options.startTzid) builder.tag("start_tzid", options.startTzid);
    if (options.endTzid) builder.tag("end_tzid", options.endTzid);
    if (options.location) builder.tag("location", options.location);
    if (options.geohash) builder.tag("g", options.geohash);
    if (options.participants) {
      for (const p of options.participants) {
        builder.tag("p", p);
      }
    }
    if (options.hashtags) {
      for (const t of options.hashtags) {
        builder.tag("t", t);
      }
    }
    return builder;
  }

  /**
   * Calendar Collection (kind:31924, NIP-52) ビルダーを作成する
   */
  static calendarCollection(options: CalendarCollectionOptions): EventBuilder {
    const builder = new EventBuilder(31924)
      .tag("d", options.title.toLowerCase().replace(/\s+/g, "-"))
      .tag("title", options.title);
    for (const eventRef of options.events) {
      builder.tag("a", eventRef);
    }
    return builder;
  }

  /**
   * Calendar Event RSVP (kind:31925, NIP-52) ビルダーを作成する
   */
  static calendarRsvp(options: CalendarRsvpOptions): EventBuilder {
    const builder = new EventBuilder(31925)
      .tag("a", options.eventAddress)
      .tag("d", options.eventAddress)
      .tag("status", options.status);
    if (options.freebusy) builder.tag("freebusy", options.freebusy);
    if (options.content) builder.content(options.content);
    return builder;
  }

  // ===== NIP-65 Relay List Metadata =====

  /**
   * Relay List Metadata (kind:10002, NIP-65) ビルダーを作成する
   *
   * @param relays リレーURL一覧（marker省略時は読み書き両用）
   */
  static relayList(
    relays: Array<{ url: string; marker?: "read" | "write" }>,
  ): EventBuilder {
    const builder = new EventBuilder(10002);
    for (const relay of relays) {
      if (relay.marker) {
        builder.tag("r", relay.url, relay.marker);
      } else {
        builder.tag("r", relay.url);
      }
    }
    return builder;
  }

  // ===== NIP-18 Reposts =====

  /**
   * Repost (kind:6, NIP-18) ビルダーを作成する
   *
   * @param targetEvent リポスト対象イベント
   * @param relayUrl 対象イベントが存在するリレーURL
   */
  static repost(targetEvent: NostrEvent, relayUrl?: string): EventBuilder {
    const builder = new EventBuilder(6)
      .content(JSON.stringify(targetEvent))
      .tag("e", targetEvent.id, relayUrl ?? "")
      .tag("p", targetEvent.pubkey);
    return builder;
  }

  /**
   * Generic Repost (kind:16, NIP-18) ビルダーを作成する
   *
   * kind:1 以外のイベントをリポストする場合に使用する。
   *
   * @param targetEvent リポスト対象イベント
   * @param relayUrl 対象イベントが存在するリレーURL
   */
  static genericRepost(
    targetEvent: NostrEvent,
    relayUrl?: string,
  ): EventBuilder {
    const builder = new EventBuilder(16)
      .content(JSON.stringify(targetEvent))
      .tag("e", targetEvent.id, relayUrl ?? "")
      .tag("p", targetEvent.pubkey)
      .tag("k", String(targetEvent.kind));
    return builder;
  }

  // ===== NIP-23 Long-form Content =====

  /**
   * Long-form Content (kind:30023, NIP-23) ビルダーを作成する
   *
   * @param options Long-form Content オプション
   */
  static longFormContent(options: LongFormOptions): EventBuilder {
    const builder = new EventBuilder(30023)
      .content(options.content)
      .tag("d", options.identifier)
      .tag("title", options.title);
    if (options.summary) builder.tag("summary", options.summary);
    if (options.image) builder.tag("image", options.image);
    if (options.publishedAt !== undefined) {
      builder.tag("published_at", String(options.publishedAt));
    }
    if (options.hashtags) {
      for (const t of options.hashtags) {
        builder.tag("t", t);
      }
    }
    return builder;
  }

  /**
   * Long-form Content Draft (kind:30024, NIP-23) ビルダーを作成する
   *
   * @param options Long-form Content オプション
   */
  static longFormDraft(options: LongFormOptions): EventBuilder {
    const builder = new EventBuilder(30024)
      .content(options.content)
      .tag("d", options.identifier)
      .tag("title", options.title);
    if (options.summary) builder.tag("summary", options.summary);
    if (options.image) builder.tag("image", options.image);
    if (options.publishedAt !== undefined) {
      builder.tag("published_at", String(options.publishedAt));
    }
    if (options.hashtags) {
      for (const t of options.hashtags) {
        builder.tag("t", t);
      }
    }
    return builder;
  }

  // ===== NIP-25 External Reactions =====

  /**
   * 外部コンテンツへのリアクション (kind:17, NIP-25) ビルダーを作成する
   *
   * @param url 対象コンテンツのURL
   * @param contentType コンテンツタイプ (e.g. "text/html")
   */
  static externalReaction(url: string, contentType: string): EventBuilder {
    return new EventBuilder(17)
      .content("+")
      .tag("i", url)
      .tag("k", contentType);
  }

  // ===== NIP-51 Lists =====

  /**
   * Mute List (kind:10000, NIP-51) ビルダーを作成する
   *
   * @param options ミュートリストオプション
   */
  static muteList(options: ListOptions): EventBuilder {
    const builder = new EventBuilder(10000);
    if (options.pubkeys) {
      for (const pk of options.pubkeys) builder.tag("p", pk);
    }
    if (options.eventIds) {
      for (const id of options.eventIds) builder.tag("e", id);
    }
    if (options.addresses) {
      for (const addr of options.addresses) builder.tag("a", addr);
    }
    if (options.hashtags) {
      for (const t of options.hashtags) builder.tag("t", t);
    }
    if (options.words) {
      for (const w of options.words) builder.tag("word", w);
    }
    return builder;
  }

  /**
   * Pin List (kind:10001, NIP-51) ビルダーを作成する
   *
   * @param eventIds ピン留めするイベントID一覧
   */
  static pinList(eventIds: string[]): EventBuilder {
    const builder = new EventBuilder(10001);
    for (const id of eventIds) builder.tag("e", id);
    return builder;
  }

  /**
   * Bookmarks (kind:10003, NIP-51) ビルダーを作成する
   *
   * @param options ブックマークオプション
   */
  static bookmarks(options: ListOptions): EventBuilder {
    const builder = new EventBuilder(10003);
    if (options.pubkeys) {
      for (const pk of options.pubkeys) builder.tag("p", pk);
    }
    if (options.eventIds) {
      for (const id of options.eventIds) builder.tag("e", id);
    }
    if (options.addresses) {
      for (const addr of options.addresses) builder.tag("a", addr);
    }
    if (options.hashtags) {
      for (const t of options.hashtags) builder.tag("t", t);
    }
    if (options.words) {
      for (const w of options.words) builder.tag("word", w);
    }
    return builder;
  }

  /**
   * Follow Set (kind:30000, NIP-51) ビルダーを作成する
   *
   * @param dTag リストの識別子
   * @param pubkeys フォローする公開鍵一覧
   */
  static followSet(dTag: string, pubkeys: string[]): EventBuilder {
    const builder = new EventBuilder(30000).tag("d", dTag);
    for (const pk of pubkeys) builder.tag("p", pk);
    return builder;
  }

  /**
   * Relay Set (kind:30002, NIP-51) ビルダーを作成する
   *
   * @param dTag リストの識別子
   * @param relayUrls リレーURL一覧
   */
  static relaySet(dTag: string, relayUrls: string[]): EventBuilder {
    const builder = new EventBuilder(30002).tag("d", dTag);
    for (const url of relayUrls) builder.tag("relay", url);
    return builder;
  }

  /**
   * Emoji Set (kind:30030, NIP-51) ビルダーを作成する
   *
   * @param dTag リストの識別子
   * @param emojis 絵文字一覧 ([name, url] のタプル)
   */
  static emojiSet(dTag: string, emojis: Array<[string, string]>): EventBuilder {
    const builder = new EventBuilder(30030).tag("d", dTag);
    for (const [name, url] of emojis) builder.tag("emoji", name, url);
    return builder;
  }

  // ===== NIP-17 Private Direct Messages =====

  /**
   * Chat Message (kind:14, NIP-17) ビルダーを作成する
   *
   * @param options チャットメッセージオプション
   */
  static chatMessage(options: ChatMessageOptions): EventBuilder {
    const builder = new EventBuilder(14)
      .content(options.content)
      .tag("p", options.recipientPubkey);
    if (options.replyTo) builder.tag("e", options.replyTo, "", "reply");
    if (options.subject) builder.tag("subject", options.subject);
    return builder;
  }

  /**
   * Seal (kind:13, NIP-17) ビルダーを作成する
   *
   * 内部イベントをモック暗号文でラップする。
   *
   * @param innerEvent ラップするイベント
   */
  static seal(innerEvent: NostrEvent): EventBuilder {
    return new EventBuilder(13)
      .content("mock-sealed:" + JSON.stringify(innerEvent));
  }

  /**
   * Gift Wrap (kind:1059, NIP-17) ビルダーを作成する
   *
   * ランダムな pubkey と created_at を使用する。
   *
   * @param options ギフトラップオプション
   */
  static giftWrap(options: GiftWrapOptions): EventBuilder {
    // ランダム pubkey と過去のランダムな created_at を使用
    const randomCreatedAt = Math.floor(Date.now() / 1000) -
      Math.floor(Math.random() * 172800); // 最大2日前
    return new EventBuilder(1059)
      .pubkey(randomHex(32))
      .createdAt(randomCreatedAt)
      .content("mock-giftwrapped:" + JSON.stringify(options.innerEvent))
      .tag("p", options.recipientPubkey);
  }

  /**
   * DM Relay List (kind:10050, NIP-17) ビルダーを作成する
   *
   * @param relayUrls DM受信用リレーURL一覧
   */
  static dmRelayList(relayUrls: string[]): EventBuilder {
    const builder = new EventBuilder(10050);
    for (const url of relayUrls) builder.tag("relay", url);
    return builder;
  }
}
