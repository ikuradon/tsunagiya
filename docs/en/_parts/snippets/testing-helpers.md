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

EventBuilder examples:

```typescript
// Generate event with builder pattern
const event = EventBuilder.kind1()
  .content("hello world")
  .tag("p", pubkey)
  .build();

// Random generation
const random = EventBuilder.random({ kind: 1 });

// Corrupted event
const broken = EventBuilder.kind1()
  .corrupt({ id: true, sig: true })
  .build();

// Bulk generation
const events = EventBuilder.bulk(100, { kind: 1 });

// Timeline data
const timeline = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});

// Reply chain
const thread = EventBuilder.thread(5);

// With reactions
const [post, reactions] = EventBuilder.withReactions(3);

// NIP-specific templates
EventBuilder.metadata({ name: "Alice", about: "Nostr user" }).build();
EventBuilder.contacts(["pub1", "pub2"]).build();
EventBuilder.dm("recipient", "secret message").build();
EventBuilder.groupMessage("group-id").content("hello").build();
EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://r.com"],
  lnurl: "...",
}).build();
```

FilterBuilder examples:

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

// Deliver events with time interval
const handle = streamEvents(relay, events, {
  interval: 100,
  jitter: 50,
});
handle.stop();

// Continuous stream
const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
});
stream.stop();
```

Snapshot:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

const snap = snapshot(relay);
// ... operations ...
restore(relay, snap);
```
