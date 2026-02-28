```typescript
import {
  assertAuthCompleted,
  assertClosed,
  assertEventPublished,
  assertNoErrors,
  assertReceived,
  assertReceivedREQ,
  EventBuilder,
  FilterBuilder,
  restore,
  snapshot,
  startStream,
  streamEvents,
} from "@ikuradon/tsunagiya/testing";
```

EventBuilder スタティックヘルパー:

```typescript
const events = EventBuilder.bulk(100, { kind: 1 });

const events = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});

const thread = EventBuilder.thread(5);
// thread[0]: root, thread[1]: reply1, ...

const [post, reactions] = EventBuilder.withReactions(5);
```

EventBuilder 拡張ヘルパー:

```ts
// 既存イベントの複製・修正
const original = EventBuilder.kind1().content("hello").build();
const modified = EventBuilder.from(original).content("world").build();

// フィルターにマッチするイベントを自動生成
const filter = { kinds: [1], authors: ["abc123"] };
const event = EventBuilder.matchFilter(filter);

// NIP-17 プライベートDM一括生成
const dm = EventBuilder.privateDM({
  recipientPubkey: "recipient-pubkey",
  content: "secret message",
});

// NIP-40 有効期限付きイベント
const expiring = EventBuilder.kind1()
  .content("temporary")
  .withExpiration(Math.floor(Date.now() / 1000) + 3600)
  .build();

// シード指定で決定論的バルク生成
const events = EventBuilder.bulk(5, { seed: "test-seed" });
```

NIP-09 削除リクエスト:

```typescript
const deletion = EventBuilder.deletion(["event-id-1", "event-id-2"])
  .pubkey(authorPubkey)
  .build();
// → kind: 5, tags: [["e", "event-id-1"], ["e", "event-id-2"]]

const deletion = EventBuilder.deletionByAddress([
  "30023:pubkey:article-slug",
])
  .pubkey(authorPubkey)
  .build();
// → kind: 5, tags: [["a", "30023:pubkey:article-slug"]]
```

NIP 別テンプレート:

```typescript
EventBuilder.metadata({ name: "Alice", about: "Nostr user", picture: "..." });
EventBuilder.contacts(["pubkey1", "pubkey2"]);
EventBuilder.dm("recipient-pubkey", "メッセージ").build();
EventBuilder.groupMessage("group-id").content("hello group").build();

const zap = EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://relay.example.com"],
  lnurl: "lnurl1...",
  eventId: "target-event",
  recipientPubkey: "recipient-pub",
});
// → kind: 9734

const event = EventBuilder.nip07Request();
// → kind: 24133, content: "mock-nip07-request"
```

CorruptOptions:

```typescript
const broken = EventBuilder.kind1()
  .corrupt({
    id: true, // IDを不正な値にする
    pubkey: true, // pubkeyを不正な値にする
    sig: true, // 署名を不正な値にする
    created_at: true, // created_atを-1にする
  })
  .build();
```

FilterBuilder:

```typescript
// 汎用フィルター
const authorFilter = FilterBuilder.author("pubkey123");
const kindFilter = FilterBuilder.kind(7);
const sinceFilter = FilterBuilder.since(1700000000);
const tagFilter = FilterBuilder.tagged("e", ["event1"]);

// フィルターの結合
const combined = FilterBuilder.combine(
  { kinds: [1], since: 100 },
  { kinds: [7], since: 200 },
);
// → { kinds: [1, 7], since: 200 }

FilterBuilder.timeline({ limit: 20 });
// → { kinds: [1], limit: 20 }

FilterBuilder.profile("pubkey1");
// → { kinds: [0], authors: ["pubkey1"] }

FilterBuilder.mentions("pubkey1");
// → { kinds: [1], "#p": ["pubkey1"] }

FilterBuilder.reactions("event1");
// → { kinds: [7], "#e": ["event1"] }

FilterBuilder.search("nostr");
// → { search: "nostr" }

// NIP-17: Private Direct Messages
FilterBuilder.giftWraps("recipient-pubkey");
// → { kinds: [1059], "#p": ["recipient-pubkey"] }

FilterBuilder.dmRelayList("pubkey1");
// → { kinds: [10050], authors: ["pubkey1"] }

// NIP-18: Reposts
FilterBuilder.reposts("event-id");
// → { kinds: [6], "#e": ["event-id"] }

FilterBuilder.allReposts("event-id");
// → { kinds: [6, 16], "#e": ["event-id"] }

// NIP-23: Long-form Content
FilterBuilder.longFormContent("pubkey1");
// → { kinds: [30023], authors: ["pubkey1"] }

FilterBuilder.longFormByTag("nostr");
// → { kinds: [30023], "#t": ["nostr"] }

// NIP-25: Reactions (アドレス指定)
FilterBuilder.reactionsTo("30023:pubkey1:article-slug");
// → { kinds: [7], "#a": ["30023:pubkey1:article-slug"] }

// NIP-51: Lists
FilterBuilder.muteList("pubkey1");
// → { kinds: [10000], authors: ["pubkey1"] }

FilterBuilder.pinList("pubkey1");
// → { kinds: [10001], authors: ["pubkey1"] }

FilterBuilder.bookmarks("pubkey1");
// → { kinds: [10003], authors: ["pubkey1"] }

FilterBuilder.followSets("pubkey1");
// → { kinds: [30000], authors: ["pubkey1"] }

// NIP-52: Calendar Events
FilterBuilder.calendarDateEvents();
// → { kinds: [31922] }

FilterBuilder.calendarTimeEvents();
// → { kinds: [31923] }

FilterBuilder.calendarEvents();
// → { kinds: [31922, 31923] }

FilterBuilder.calendarCollections();
// → { kinds: [31924] }

FilterBuilder.rsvps("31922:pubkey1:event-slug");
// → { kinds: [31925], "#a": ["31922:pubkey1:event-slug"] }

// NIP-65: Relay List Metadata
FilterBuilder.relayList("pubkey1");
// → { kinds: [10002], authors: ["pubkey1"] }
```

アサーション関数:

```typescript
assertReceivedREQ(relay, { kinds: [1] });
assertEventPublished(relay, "event-id");
assertNoErrors(relay);
assertAuthCompleted(relay);
assertClosed(relay, "sub1");
assertReceived(relay, (messages) => messages.some((m) => m[0] === "REQ"));
```

ストリーム関数:

```typescript
const handle = streamEvents(relay, events, {
  interval: 100, // 送信間隔 (ms)
  jitter: 50, // ジッター幅 (±ms)
});
handle.stop();

const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
});
stream.stop();
```

スナップショット関数:

```typescript
const snap = snapshot(relay);
// ... 操作 ...
restore(relay, snap);
```
