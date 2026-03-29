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
  waitFor,
} from "@ikuradon/tsunagiya/testing";
```

EventBuilder static helpers:

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

EventBuilder extended helpers:

```ts
// clone and modify existing event
const original = EventBuilder.kind1().content("hello").build();
const modified = EventBuilder.from(original).content("world").build();

// inject runtime dependencies for deterministic output
const fixedClock = { now: () => 1700000000000 };
const fixedRandom = {
  next: () => 0.25,
  fill(bytes: Uint8Array) {
    bytes.fill(0x11);
  },
};
const deterministic = EventBuilder.kind1({
  clock: fixedClock,
  random: fixedRandom,
})
  .content("stable")
  .build();

// auto-generate event matching a filter
const filter = { kinds: [1], authors: ["abc123"] };
const event = EventBuilder.matchFilter(filter);

// NIP-17 private DM in one call
const dm = EventBuilder.privateDM({
  recipientPubkey: "recipient-pubkey",
  content: "secret message",
});

// NIP-40 expiring event
const expiring = EventBuilder.kind1()
  .content("temporary")
  .withExpiration(Math.floor(Date.now() / 1000) + 3600)
  .build();

// deterministic bulk generation with seed
const events = EventBuilder.bulk(5, { seed: "test-seed" });
```

NIP-09 deletion request:

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

NIP-specific templates:

```typescript
EventBuilder.metadata({ name: "Alice", about: "Nostr user", picture: "..." });
EventBuilder.contacts(["pubkey1", "pubkey2"]);
EventBuilder.dm("recipient-pubkey", "message").build();
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
    id: true, // set id to invalid value
    pubkey: true, // set pubkey to invalid value
    sig: true, // set signature to invalid value
    created_at: true, // set created_at to -1
  })
  .build();
```

FilterBuilder:

```typescript
// generic filters
const authorFilter = FilterBuilder.author("pubkey123");
const kindFilter = FilterBuilder.kind(7);
const sinceFilter = FilterBuilder.since(1700000000);
const tagFilter = FilterBuilder.tagged("e", ["event1"]);

// combine filters
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

// NIP-25: Reactions (address-based)
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

Assertion functions:

```typescript
assertReceivedREQ(relay, { kinds: [1] });
assertEventPublished(relay, "event-id");
assertNoErrors(relay);
assertAuthCompleted(relay);
assertClosed(relay, "sub1");
assertReceived(relay, (messages) => messages.some((m) => m[0] === "REQ"));
```

Condition waiting helper:

```typescript
await waitFor(() => relay.connectionCount === 0);
await waitFor(() => received.length >= 3, { timeout: 3000, interval: 20 });
```

Stream functions:

```typescript
const fixedRandom = {
  next: () => 0.5,
  fill(bytes: Uint8Array) {
    bytes.fill(0x22);
  },
};

const handle = streamEvents(relay, events, {
  interval: 100, // send interval (ms)
  jitter: 50, // jitter range (±ms)
  random: fixedRandom,
});
handle.stop();

const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
  random: fixedRandom,
});
stream.stop();
```

Snapshot functions:

```typescript
const snap = snapshot(relay);
// ... operations ...
restore(relay, snap);
```
