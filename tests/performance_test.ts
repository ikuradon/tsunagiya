import { assertEquals } from "@std/assert";
import { filterEvents, matchFilter } from "../src/filter.ts";
import { EventStore } from "../src/relay/event_store.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import type { NostrEvent, NostrFilter } from "../src/types.ts";

// Coarse smoke tests. Detailed baseline scenarios live in
// tests/performance_baseline_test.ts.

function makeLargeEventStore(count: number): EventStore {
  const store = new EventStore();

  for (let i = 0; i < count; i++) {
    store.store(
      EventBuilder.kind(i % 5)
        .pubkey((i % 100).toString(16).padStart(64, "0"))
        .createdAt(1700000000 + i)
        .content(`event ${i}`)
        .build(),
    );
  }

  return store;
}

function makeTaggedEventStore(count: number): EventStore {
  const store = new EventStore();

  for (let i = 0; i < count; i++) {
    store.store(
      EventBuilder.kind(10 + (i % 5))
        .pubkey((i % 100).toString(16).padStart(64, "0"))
        .createdAt(1700000000 + i)
        .content(`tagged event ${i}`)
        .tag("p", (i % 100).toString(16).padStart(64, "0"))
        .tag("e", `thread-${i % 200}`)
        .tag("d", `slot-${i % 50}`)
        .build(),
    );
  }

  return store;
}

Deno.test("Performance - filter 1000 events in < 100ms", () => {
  // 1000件のイベントを生成
  const events: NostrEvent[] = [];
  for (let i = 0; i < 1000; i++) {
    events.push(
      EventBuilder.kind(i % 3 === 0 ? 0 : 1)
        .createdAt(1700000000 + i)
        .content(`event ${i}`)
        .build(),
    );
  }

  const filter: NostrFilter = { kinds: [1], limit: 50 };

  const start = performance.now();
  const result = filterEvents(events, filter);
  const elapsed = performance.now() - start;

  assertEquals(result.length, 50);
  assertEquals(
    elapsed < 100,
    true,
    `Filter took ${elapsed.toFixed(2)}ms, expected < 100ms`,
  );
});

Deno.test("Performance - matchFilter 10000 calls in < 500ms", () => {
  const event = EventBuilder.kind1()
    .content("test")
    .tag("p", "pubkey123")
    .createdAt(1700000500)
    .build();

  const filter: NostrFilter = {
    kinds: [1],
    since: 1700000000,
    until: 1700001000,
    "#p": ["pubkey123"],
  };

  const start = performance.now();
  for (let i = 0; i < 10000; i++) {
    matchFilter(event, filter);
  }
  const elapsed = performance.now() - start;

  assertEquals(
    elapsed < 500,
    true,
    `10000 matchFilter calls took ${elapsed.toFixed(2)}ms, expected < 500ms`,
  );
});

Deno.test("Performance - EventBuilder.bulk(1000) in < 500ms", () => {
  const start = performance.now();
  const events = EventBuilder.bulk(1000, { kind: 1 });
  const elapsed = performance.now() - start;

  assertEquals(events.length, 1000);
  assertEquals(
    elapsed < 500,
    true,
    `Bulk generation took ${elapsed.toFixed(2)}ms, expected < 500ms`,
  );
});

Deno.test("Performance - EventStore indexed REQ over 10000 events in < 500ms", () => {
  const store = makeLargeEventStore(10000);

  const start = performance.now();
  const result = store.query({ kinds: [1], limit: 100 });
  const elapsed = performance.now() - start;

  assertEquals(result.length, 100);
  assertEquals(
    elapsed < 500,
    true,
    `Indexed REQ took ${elapsed.toFixed(2)}ms, expected < 500ms`,
  );
});

Deno.test("Performance - EventStore indexed COUNT over 10000 events in < 500ms", () => {
  const store = makeLargeEventStore(10000);

  const start = performance.now();
  const count = store.count([{
    authors: [
      "000000000000000000000000000000000000000000000000000000000000002a",
    ],
  }]);
  const elapsed = performance.now() - start;

  assertEquals(count, 100);
  assertEquals(
    elapsed < 500,
    true,
    `Indexed COUNT took ${elapsed.toFixed(2)}ms, expected < 500ms`,
  );
});

Deno.test("Performance - EventStore indexed tag REQ over 10000 events in < 500ms", () => {
  const store = makeTaggedEventStore(10000);
  const targetPubkey =
    "000000000000000000000000000000000000000000000000000000000000002a";

  const start = performance.now();
  const result = store.query({ "#p": [targetPubkey], limit: 100 });
  const elapsed = performance.now() - start;

  assertEquals(result.length, 100);
  assertEquals(
    elapsed < 500,
    true,
    `Indexed tag REQ took ${elapsed.toFixed(2)}ms, expected < 500ms`,
  );
});

Deno.test("Performance - EventStore indexed tag COUNT over 10000 events in < 500ms", () => {
  const store = makeTaggedEventStore(10000);

  const start = performance.now();
  const count = store.count([{ "#e": ["thread-10"] }]);
  const elapsed = performance.now() - start;

  assertEquals(count, 50);
  assertEquals(
    elapsed < 500,
    true,
    `Indexed tag COUNT took ${elapsed.toFixed(2)}ms, expected < 500ms`,
  );
});
