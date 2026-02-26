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

NIP-04 DM テンプレート:

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

NIP-16 イベント種別:

```typescript
import { classifyEvent, isEphemeral, isReplaceable } from "@ikuradon/tsunagiya";

classifyEvent(1); // "regular"
classifyEvent(10002); // "replaceable"
classifyEvent(20001); // "ephemeral"
classifyEvent(30023); // "parameterized_replaceable"

isReplaceable(10002); // true
isEphemeral(20001); // true
```

NIP-33 Parameterized Replaceable:

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

NIP-25 リアクション:

```typescript
const [post, reactions] = EventBuilder.withReactions(5);
// reactions[n]: kind: 7, content: "+", tags: [["e", post.id], ["p", post.pubkey]]
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

relay.requireAuth((authEvent) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
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

NIP-52 Geohash:

```typescript
const event = EventBuilder.kind1()
  .geohash("u4pruydqqvj")
  .build();
// → tags: [["g", "u4pruydqqvj"]]
```

NIP-57 Zap Request:

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
