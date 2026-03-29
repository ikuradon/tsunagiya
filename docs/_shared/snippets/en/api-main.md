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

MockPool constructor:

```typescript
new MockPool();
```

`relay(url, options)` method:

```typescript
const relay = pool.relay("wss://relay.example.com");

const fixedClock = { now: () => 1700000000000 };
const fixedRandom = {
  next: () => 0.25,
  fill(bytes: Uint8Array) {
    bytes.fill(0x11);
  },
};

// with options
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

// Ephemeral events are not added to the store
relay.store(EventBuilder.kind(20001).build()); // → false
```

`onREQ(handler)`:

```typescript
relay.onREQ((subId, filters) => {
  return [customEvent];
});

// async is also supported
relay.onREQ(async (subId, filters) => {
  return await fetchEvents(filters);
});
```

`onEVENT(handler)`:

```typescript
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});

// to reject
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

Error cases:

```typescript
relay.refuse();
relay.disconnect(); // code: 1000
relay.disconnect(1006); // abnormal disconnect
relay.disconnectAfter(3000); // disconnect after 3 seconds
relay.close(1006);
relay.sendRaw("not json");
relay.sendNotice("rate-limited");
```

NIP-42 AUTH:

```typescript
// Default validation (no validator set): kind:22242 + challenge + relay URL match
// Custom validator: replaces relay URL check
relay.requireAuth((authEvent, context) => {
  // context.relayUrl, context.challenge are available
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === context.relayUrl,
  );
});
```

Verification helpers:

```typescript
const req = relay.findREQ("sub1");
const count = relay.findCOUNT("count1");
const snap = relay.snapshot();
relay.restore(snap);
```

Filter functions:

```typescript
const matches = matchFilter(event, { kinds: [1], authors: ["pubkey1"] });

const matches = matchFilters(event, [
  { kinds: [1] },
  { kinds: [0], authors: ["pubkey1"] },
]);

const results = filterEvents(allEvents, { kinds: [1], limit: 10 });
```

Event type functions:

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
