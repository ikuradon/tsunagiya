import { assertEquals } from "@std/assert";
import { filterEvents, matchFilter } from "../src/filter.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import type { NostrEvent, NostrFilter } from "../src/types.ts";

Deno.test("Performance - filter 1000 events in < 10ms", () => {
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
    elapsed < 10,
    true,
    `Filter took ${elapsed.toFixed(2)}ms, expected < 10ms`,
  );
});

Deno.test("Performance - matchFilter 10000 calls in < 50ms", () => {
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
    elapsed < 50,
    true,
    `10000 matchFilter calls took ${elapsed.toFixed(2)}ms, expected < 50ms`,
  );
});

Deno.test("Performance - EventBuilder.bulk(1000) in < 50ms", () => {
  const start = performance.now();
  const events = EventBuilder.bulk(1000, { kind: 1 });
  const elapsed = performance.now() - start;

  assertEquals(events.length, 1000);
  assertEquals(
    elapsed < 50,
    true,
    `Bulk generation took ${elapsed.toFixed(2)}ms, expected < 50ms`,
  );
});
