```typescript
import {
  assertReceivedREQ,
  EventBuilder,
  FilterBuilder,
  restore,
  snapshot,
  streamEvents,
} from "@ikuradon/tsunagiya/testing";
```

EventBuilder の使用例:

```typescript
// ビルダーパターンでイベント生成
const event = EventBuilder.kind1()
  .content("hello world")
  .tag("p", pubkey)
  .build();

// ランダム生成
const random = EventBuilder.random({ kind: 1 });

// 壊れたイベント
const broken = EventBuilder.kind1()
  .corrupt({ id: true, sig: true })
  .build();

// バルク生成
const events = EventBuilder.bulk(100, { kind: 1 });

// 時系列データ
const timeline = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});

// リプライチェーン
const thread = EventBuilder.thread(5);

// リアクション付き
const [post, reactions] = EventBuilder.withReactions(3);

// NIP別テンプレート
EventBuilder.metadata({ name: "Alice", about: "Nostr user" });
EventBuilder.contacts(["pub1", "pub2"]);
EventBuilder.dm("recipient", "secret message");
EventBuilder.groupMessage("group-id").content("hello");
EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://r.com"],
  lnurl: "...",
});
```

FilterBuilder の使用例:

```typescript
FilterBuilder.timeline({ limit: 20 });
// => { kinds: [1], limit: 20 }

FilterBuilder.profile("pubkey");
// => { kinds: [0], authors: ["pubkey"] }

FilterBuilder.mentions("pubkey");
// => { kinds: [1], "#p": ["pubkey"] }

FilterBuilder.reactions("eventId");
// => { kinds: [7], "#e": ["eventId"] }

FilterBuilder.search("nostr");
// => { search: "nostr" }
```

アサーションヘルパー:

```typescript
import {
  assertAuthCompleted,
  assertClosed,
  assertEventPublished,
  assertNoErrors,
  assertReceived,
  assertReceivedREQ,
} from "@ikuradon/tsunagiya/testing";

assertReceivedREQ(relay, { kinds: [1] });
assertEventPublished(relay, "event-id");
assertNoErrors(relay);
assertAuthCompleted(relay);
assertClosed(relay, "sub1");
assertReceived(relay, (messages) => messages.some((m) => m[0] === "REQ"));
```

リアルタイムストリーム:

```typescript
import { startStream, streamEvents } from "@ikuradon/tsunagiya/testing";

// 時間差でイベント配信
const handle = streamEvents(relay, events, {
  interval: 100,
  jitter: 50,
});
handle.stop();

// 継続的ストリーム
const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
});
stream.stop();
```

スナップショット:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

const snap = snapshot(relay);
// ... 操作 ...
restore(relay, snap);
```
