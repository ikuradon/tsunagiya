NIP-01 フィルタリングの使用例:

```typescript
// 全フィルター条件に対応
const filter: NostrFilter = {
  ids: ["prefix..."], // IDプレフィックスマッチ
  authors: ["prefix..."], // 公開鍵プレフィックスマッチ
  kinds: [1], // kind完全一致
  since: 1700000000, // created_at下限
  until: 1700100000, // created_at上限
  limit: 20, // 返却数上限
  "#e": ["eventId"], // タグフィルター
  "#p": ["pubkey"], // タグフィルター
};
```

NIP-01 使用例:

```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

relay.store(EventBuilder.kind1().content("hello").build());

pool.install();
try {
  const ws = new WebSocket("wss://relay.example.com");
  ws.onopen = () => ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
  // → EVENT, EOSE が返る
} finally {
  pool.uninstall();
}
```

NIP-04 DM テンプレート (⚠️ deprecated — NIP-17 への移行推奨):

```typescript
const dm = EventBuilder.dm("recipient-pubkey", "hello").build();
// → kind: 4, content: "mock-encrypted:hello", tags: [["p", "recipient-pubkey"]]
```

NIP-09 削除リクエスト:

```typescript
const deletion = EventBuilder.deletion(["target-event-id1", "target-event-id2"])
  .pubkey(authorPubkey)
  .build();
relay.store(deletion);

const addrDeletion = EventBuilder.deletionByAddress([
  "30023:pubkey:article-slug",
])
  .pubkey(authorPubkey)
  .build();
relay.store(addrDeletion);

console.log(relay.deletedIds); // Set { "target-event-id1", "target-event-id2" }
```

NIP-10 リプライスレッド:

```typescript
const thread = EventBuilder.thread(5);
// thread[0]: root（タグなし）
// thread[1]: reply（["e", root.id, "", "root"], ["p", root.pubkey]）
// thread[2]: reply（["e", root.id, "", "root"], ["e", thread[1].id, "", "reply"], ["p", thread[1].pubkey]）
```

NIP-01 イベント種別（旧 NIP-16 — 現在は NIP-01 に統合）:

```typescript
import { classifyEvent, isEphemeral, isReplaceable } from "@ikuradon/tsunagiya";

classifyEvent(1); // "regular"
classifyEvent(10002); // "replaceable"
classifyEvent(20001); // "ephemeral"
classifyEvent(30023); // "parameterized_replaceable"

isReplaceable(10002); // true
isEphemeral(20001); // true
```

NIP-01 Addressable Events（旧 NIP-33 — 現在は NIP-01 に統合）:

```typescript
import {
  getParameterizedId,
  isParameterizedReplaceable,
} from "@ikuradon/tsunagiya";

isParameterizedReplaceable(30023); // true

const article = EventBuilder.kind(30023)
  .tag("d", "my-article")
  .pubkey("author-pubkey")
  .content("article content")
  .build();

getParameterizedId(article); // "30023:author-pubkey:my-article"

relay.store(article);
const updated = EventBuilder.kind(30023)
  .tag("d", "my-article")
  .pubkey("author-pubkey")
  .createdAt(article.created_at + 60)
  .content("updated content")
  .build();
relay.store(updated); // true（古いバージョンが削除される）
```

NIP-17 Private Direct Messages:

```typescript
import { EventBuilder, FilterBuilder } from "@ikuradon/tsunagiya/testing";

// Chat Message (kind:14)
const chatMsg = EventBuilder.chatMessage({
  recipientPubkey: "recipient-pubkey",
  content: "hello!",
  subject: "greeting",
}).build();

// Seal (kind:13) — chat message をラップ
const seal = EventBuilder.seal(chatMsg).build();

// Gift Wrap (kind:1059) — seal をランダムpubkeyでラップ
const wrapped = EventBuilder.giftWrap({
  recipientPubkey: "recipient-pubkey",
  innerEvent: seal,
}).build();

// DM Relay List (kind:10050)
const dmList = EventBuilder.dmRelayList([
  "wss://dm.relay1.com",
  "wss://dm.relay2.com",
]).build();

// フィルター
FilterBuilder.giftWraps("recipient-pubkey"); // { kinds: [1059], "#p": [...] }
FilterBuilder.dmRelayList("pubkey"); // { kinds: [10050], authors: [...] }
```

NIP-18 Reposts:

```typescript
import { EventBuilder, FilterBuilder } from "@ikuradon/tsunagiya/testing";

const original = EventBuilder.kind1().content("original post").build();

// Repost (kind:6)
const repost = EventBuilder.repost(original, "wss://relay.example.com").build();
// → kind: 6, content: JSON.stringify(original), tags: [["e", ...], ["p", ...]]

// Generic Repost (kind:16) — kind:1 以外のイベント用
const article = EventBuilder.kind(30023).tag("d", "my-article").build();
const genericRepost = EventBuilder.genericRepost(article).build();
// → kind: 16, tags: [["e", ...], ["p", ...], ["k", "30023"]]

// フィルター
FilterBuilder.reposts(original.id); // { kinds: [6], "#e": [...] }
FilterBuilder.allReposts(original.id); // { kinds: [6, 16], "#e": [...] }
```

NIP-23 Long-form Content:

```typescript
import { EventBuilder, FilterBuilder } from "@ikuradon/tsunagiya/testing";

// Long-form Content (kind:30023)
const article = EventBuilder.longFormContent({
  identifier: "my-article-2026",
  title: "Nostr の使い方",
  content: "## はじめに\nNostr とは...",
  summary: "Nostr の基礎をわかりやすく解説",
  publishedAt: 1740000000,
  hashtags: ["nostr", "tutorial"],
}).build();

// Long-form Draft (kind:30024)
const draft = EventBuilder.longFormDraft({
  identifier: "draft-article",
  title: "下書き記事",
  content: "作業中の内容...",
}).build();

// フィルター
FilterBuilder.longFormContent(); // { kinds: [30023] }
FilterBuilder.longFormContent("author-pk"); // { kinds: [30023], authors: [...] }
FilterBuilder.longFormByTag("nostr"); // { kinds: [30023], "#t": ["nostr"] }
```

NIP-25 リアクション:

```typescript
const [post, reactions] = EventBuilder.withReactions(5);
// reactions[n]: kind: 7, content: "+", tags: [["e", post.id], ["p", post.pubkey]]

// オプション指定（content, targetKind）
const [post2, reactions2] = EventBuilder.withReactions(3, {
  content: "🤙",
  targetKind: 1,
});
// reactions2[n]: kind: 7, content: "🤙", tags: [..., ["k", "1"]]

// 外部コンテンツへのリアクション (kind:17, NIP-25)
const externalReaction = EventBuilder.externalReaction(
  "https://example.com/article",
  "text/html",
).build();
// → kind: 17, content: "+", tags: [["i", url], ["k", contentType]]

// フィルター（アドレス指定）
FilterBuilder.reactionsTo("30023:pubkey:my-article"); // { kinds: [7], "#a": [...] }
```

NIP-29 グループチャット:

```typescript
const msg = EventBuilder.groupMessage("group-id").content("hello group")
  .build();
// → kind: 9, tags: [["h", "group-id"]]
```

NIP-30 カスタム絵文字:

```typescript
const event = EventBuilder.kind1()
  .emoji("sushi", "https://example.com/sushi.png")
  .build();
// → tags: [["emoji", "sushi", "https://example.com/sushi.png"]]
```

NIP-42 AUTH:

```typescript
const relay = pool.relay("wss://auth.relay.com", { requiresAuth: true });

// 標準検証（バリデーター未設定）: kind:22242 + challenge + relay URL 一致
// カスタムバリデーター: context から relayUrl / challenge を参照可能
relay.requireAuth((authEvent, context) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === context.relayUrl,
  );
});
```

NIP-45 COUNT:

```typescript
const relay = pool.relay("wss://relay.example.com");

for (const event of EventBuilder.bulk(50, { kind: 1 })) {
  relay.store(event);
}

pool.install();
try {
  const ws = new WebSocket("wss://relay.example.com");
  ws.onopen = () => {
    ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // → ["COUNT", "count1", { count: 50 }]
  };
} finally {
  pool.uninstall();
}

relay.onCOUNT((subId, filters) => {
  return { count: 42 };
});
```

NIP-50 検索:

```typescript
import { FilterBuilder } from "@ikuradon/tsunagiya/testing";

relay.store(EventBuilder.kind1().content("Hello Nostr World").build());
relay.store(EventBuilder.kind1().content("goodbye").build());

pool.install();
try {
  const ws = new WebSocket("wss://relay.example.com");
  ws.onopen = () => {
    ws.send(JSON.stringify(["REQ", "search1", { search: "nostr" }]));
    // → "Hello Nostr World" のみマッチ
  };
} finally {
  pool.uninstall();
}

const filter = FilterBuilder.search("nostr");
// → { search: "nostr" }
```

NIP-52 Calendar Events（全4種対応）:

```typescript
import { EventBuilder, FilterBuilder } from "@ikuradon/tsunagiya/testing";

// Date-based Calendar Event (kind:31922)
const dateEvent = EventBuilder.calendarDateEvent({
  title: "Nostr Meetup",
  startDate: "2026-03-01",
  endDate: "2026-03-01",
  location: "Tokyo",
  geohash: "xn76g",
}).build();

// Time-based Calendar Event (kind:31923)
const timeEvent = EventBuilder.calendarTimeEvent({
  title: "Online Seminar",
  start: 1740000000,
  end: 1740003600,
  startTzid: "Asia/Tokyo",
}).build();

// Calendar Collection (kind:31924)
const collection = EventBuilder.calendarCollection({
  title: "Tech Events 2026",
  events: ["31922:pubkey:meetup", "31923:pubkey:seminar"],
}).build();

// RSVP (kind:31925)
const rsvp = EventBuilder.calendarRsvp({
  eventAddress: "31922:pubkey:meetup",
  status: "accepted",
}).build();

// Geohash タグ（引き続き利用可能）
const event = EventBuilder.kind1().geohash("u4pruydqqvj").build();

// フィルター
FilterBuilder.calendarDateEvents(); // { kinds: [31922] }
FilterBuilder.calendarTimeEvents(); // { kinds: [31923] }
FilterBuilder.calendarEvents(); // { kinds: [31922, 31923] }
FilterBuilder.calendarCollections(); // { kinds: [31924] }
FilterBuilder.rsvps("31922:pubkey:meetup"); // { kinds: [31925], "#a": [...] }
```

NIP-51 Lists:

```typescript
import { EventBuilder, FilterBuilder } from "@ikuradon/tsunagiya/testing";

// Mute List (kind:10000)
const mute = EventBuilder.muteList({
  pubkeys: ["muted-pubkey-1", "muted-pubkey-2"],
  hashtags: ["spam"],
  words: ["badword"],
}).build();

// Pin List (kind:10001)
const pins = EventBuilder.pinList(["event-id-1", "event-id-2"]).build();

// Bookmarks (kind:10003)
const bookmarks = EventBuilder.bookmarks({
  eventIds: ["event-id-1"],
  addresses: ["30023:pubkey:article-slug"],
}).build();

// Follow Set (kind:30000)
const followSet = EventBuilder.followSet("my-friends", [
  "pubkey-alice",
  "pubkey-bob",
]).build();

// Relay Set (kind:30002)
const relaySet = EventBuilder.relaySet("my-relays", [
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]).build();

// Emoji Set (kind:30030)
const emojiSet = EventBuilder.emojiSet("my-emojis", [
  ["sushi", "https://example.com/sushi.png"],
  ["nostr", "https://example.com/nostr.png"],
]).build();

// フィルター
FilterBuilder.muteList("pubkey"); // { kinds: [10000], authors: [...] }
FilterBuilder.pinList("pubkey"); // { kinds: [10001], authors: [...] }
FilterBuilder.bookmarks("pubkey"); // { kinds: [10003], authors: [...] }
FilterBuilder.followSets("pubkey"); // { kinds: [30000], authors: [...] }
```

NIP-65 Relay List Metadata:

```typescript
import { EventBuilder, FilterBuilder } from "@ikuradon/tsunagiya/testing";

// Relay List Metadata (kind:10002)
const relayList = EventBuilder.relayList([
  { url: "wss://relay1.example.com" }, // 読み書き両用
  { url: "wss://relay2.example.com", marker: "read" }, // 読み取り専用
  { url: "wss://relay3.example.com", marker: "write" }, // 書き込み専用
]).build();
// → kind: 10002, tags: [["r", url], ["r", url, "read"], ["r", url, "write"]]

// フィルター
FilterBuilder.relayList("pubkey"); // { kinds: [10002], authors: ["pubkey"] }
```

NIP-57 Lightning Zaps:

```typescript
const zap = EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://relay.example.com"],
  lnurl: "lnurl1...",
  eventId: "target-event",
  recipientPubkey: "recipient-pub",
});
// → kind: 9734
```
