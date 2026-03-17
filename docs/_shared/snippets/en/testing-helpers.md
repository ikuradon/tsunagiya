```typescript
import {
  assertReceivedREQ,
  EventBuilder,
  FilterBuilder,
  restore,
  snapshot,
  streamEvents,
  waitFor,
} from "@ikuradon/tsunagiya/testing";
```

EventBuilder usage:

```typescript
// builder pattern
const event = EventBuilder.kind1()
  .content("hello world")
  .tag("p", pubkey)
  .build();

// random generation
const random = EventBuilder.random({ kind: 1 });

// broken event
const broken = EventBuilder.kind1()
  .corrupt({ id: true, sig: true })
  .build();

// bulk generation
const events = EventBuilder.bulk(100, { kind: 1 });

// time series data
const timeline = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});

// reply chain
const thread = EventBuilder.thread(5);

// with reactions
const [post, reactions] = EventBuilder.withReactions(3);

// NIP-specific templates
EventBuilder.metadata({ name: "Alice", about: "Nostr user" });
EventBuilder.contacts(["pub1", "pub2"]);
EventBuilder.dm("recipient", "secret message");
EventBuilder.groupMessage("group-id").content("hello");
EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://r.test"],
  lnurl: "...",
});
```

FilterBuilder usage:

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

Assertion helpers:

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

Real-time stream:

```typescript
import { startStream, streamEvents } from "@ikuradon/tsunagiya/testing";

// deliver events with time delay
const handle = streamEvents(relay, events, {
  interval: 100,
  jitter: 50,
});
handle.stop();

// continuous stream
const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
});
stream.stop();
```

Condition waiting helper:

```typescript
import { waitFor } from "@ikuradon/tsunagiya/testing";

// Poll until a condition is met (alternative to fixed setTimeout)
await waitFor(() => received.length >= 3);

// Custom timeout and polling interval
await waitFor(() => relay.connectionCount === 0, {
  timeout: 3000,
  interval: 20,
});
```

Snapshot:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

const snap = snapshot(relay);
// ... operations ...
restore(relay, snap);
```
