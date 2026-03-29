```typescript
import {
  AuthState,
  classifyEvent,
  createLogger,
  filterEvents,
  generateChallenge,
  getParameterizedId,
  isEphemeral,
  isParameterizedReplaceable,
  isReplaceable,
  Logger,
  matchFilter,
  matchFilters,
  MockPool,
  MockRelay,
} from "@ikuradon/tsunagiya";
```

MockPool コンストラクタ:

```typescript
new MockPool();
```

`relay(url, options)` メソッド:

```typescript
const relay = pool.relay("wss://relay.example.com");

const fixedClock = { now: () => 1700000000000 };
const fixedRandom = {
  next: () => 0.25,
  fill(bytes: Uint8Array) {
    bytes.fill(0x11);
  },
};

// オプション付き
const relayWithOptions = pool.relay("wss://relay.example.com", {
  latency: { min: 50, max: 150 },
  errorRate: 0.1,
  verifier,
  authVerifier,
  clock: fixedClock,
  random: fixedRandom,
});
```

`install()` / `uninstall()`:

```typescript
pool.install();
// ...
pool.uninstall();
```

`reset()`:

```typescript
pool.reset();
```

`connections`:

```typescript
console.log(pool.connections); // Map { "wss://relay.example.com" => 2 }
```

`store(event)`:

```typescript
relay.store({
  id: "abc123",
  pubkey: "pubkey1",
  kind: 1,
  content: "hello",
  created_at: 1700000000,
  tags: [],
  sig: "sig1",
}); // → true

// Ephemeral イベントはストアに追加されない
relay.store(EventBuilder.kind(20001).build()); // → false
```

`onREQ(handler)`:

```typescript
relay.onREQ((subId, filters) => {
  return [customEvent];
});

// 非同期も可能
relay.onREQ(async (subId, filters) => {
  return await fetchEvents(filters);
});
```

`onEVENT(handler)`:

```typescript
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});

// 拒否する場合
relay.onEVENT((event) => {
  return ["OK", event.id, false, "blocked: spam"];
});
```

`onCOUNT(handler)`:

```typescript
relay.onCOUNT((subId, filters) => {
  return { count: 42 };
});
```

エラーケース:

```typescript
relay.refuse();
relay.disconnect(); // code: 1000
relay.disconnect(1006); // 異常切断
relay.disconnectAfter(3000); // 3秒後に切断
relay.close(1006);
relay.sendRaw("not json");
relay.sendNotice("rate-limited");
```

NIP-42 AUTH:

```typescript
// 標準検証（バリデーター未設定）: kind:22242 + challenge + relay URL 一致
// カスタムバリデーター: relay URL チェックを置き換える
relay.requireAuth((authEvent, context) => {
  // context.relayUrl, context.challenge が参照可能
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === context.relayUrl,
  );
});
```

検証ヘルパー:

```typescript
const req = relay.findREQ("sub1");
const count = relay.findCOUNT("count1");
const snap = relay.snapshot();
relay.restore(snap);
```

フィルター関数:

```typescript
const matches = matchFilter(event, { kinds: [1], authors: ["pubkey1"] });

const matches = matchFilters(event, [
  { kinds: [1] },
  { kinds: [0], authors: ["pubkey1"] },
]);

const results = filterEvents(allEvents, { kinds: [1], limit: 10 });
```

イベント種別関数:

```typescript
classifyEvent(1); // "regular"
classifyEvent(10002); // "replaceable"
classifyEvent(20001); // "ephemeral"
classifyEvent(30023); // "parameterized_replaceable"

const event = EventBuilder.kind(30023)
  .tag("d", "my-article")
  .pubkey("author-pubkey")
  .build();

getParameterizedId(event); // "30023:author-pubkey:my-article"
getParameterizedId(EventBuilder.kind1().build()); // null
```
