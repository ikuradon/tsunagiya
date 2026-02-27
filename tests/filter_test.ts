import { assertEquals } from "@std/assert";
import { filterEvents, matchFilter, matchFilters } from "../src/filter.ts";
import type { NostrEvent } from "../src/types.ts";

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "abc123def456",
    pubkey: "pub123",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "hello",
    sig: "sig123",
    ...overrides,
  };
}

Deno.test("matchFilter - matches by ids prefix", () => {
  const event = makeEvent({ id: "abcdef1234567890" });

  assertEquals(matchFilter(event, { ids: ["abcdef"] }), true);
  assertEquals(matchFilter(event, { ids: ["abcdef1234567890"] }), true);
  assertEquals(matchFilter(event, { ids: ["xyz"] }), false);
  assertEquals(matchFilter(event, { ids: ["abc", "xyz"] }), true);
});

Deno.test("matchFilter - matches by authors prefix", () => {
  const event = makeEvent({ pubkey: "pubkey1234" });

  assertEquals(matchFilter(event, { authors: ["pubkey"] }), true);
  assertEquals(matchFilter(event, { authors: ["pubkey1234"] }), true);
  assertEquals(matchFilter(event, { authors: ["other"] }), false);
  assertEquals(matchFilter(event, { authors: ["pub", "other"] }), true);
});

Deno.test("matchFilter - matches by exact kinds", () => {
  const event = makeEvent({ kind: 1 });

  assertEquals(matchFilter(event, { kinds: [1] }), true);
  assertEquals(matchFilter(event, { kinds: [0, 1, 3] }), true);
  assertEquals(matchFilter(event, { kinds: [0] }), false);
});

Deno.test("matchFilter - filters by since/until time range", () => {
  const event = makeEvent({ created_at: 1700000000 });

  assertEquals(matchFilter(event, { since: 1699999999 }), true);
  assertEquals(matchFilter(event, { since: 1700000000 }), true);
  assertEquals(matchFilter(event, { since: 1700000001 }), false);

  assertEquals(matchFilter(event, { until: 1700000001 }), true);
  assertEquals(matchFilter(event, { until: 1700000000 }), true);
  assertEquals(matchFilter(event, { until: 1699999999 }), false);

  assertEquals(
    matchFilter(event, { since: 1699999999, until: 1700000001 }),
    true,
  );
  assertEquals(
    matchFilter(event, { since: 1700000001, until: 1700000002 }),
    false,
  );
});

Deno.test("matchFilter - matches by tag filters", () => {
  const event = makeEvent({
    tags: [
      ["e", "event123", "wss://relay.example.com"],
      ["p", "pubkey456"],
    ],
  });

  assertEquals(matchFilter(event, { "#e": ["event123"] }), true);
  assertEquals(matchFilter(event, { "#p": ["pubkey456"] }), true);
  assertEquals(matchFilter(event, { "#e": ["other"] }), false);
  assertEquals(matchFilter(event, { "#t": ["nostr"] }), false);

  // 複数値のOR
  assertEquals(matchFilter(event, { "#e": ["event123", "other"] }), true);
});

Deno.test("matchFilter - applies combined conditions as AND", () => {
  const event = makeEvent({
    id: "abc123",
    pubkey: "pub456",
    kind: 1,
    created_at: 1700000000,
    tags: [["p", "mentioned"]],
  });

  assertEquals(
    matchFilter(event, {
      ids: ["abc"],
      authors: ["pub"],
      kinds: [1],
      since: 1699999999,
      "#p": ["mentioned"],
    }),
    true,
  );

  // 1つでもマッチしなければfalse
  assertEquals(
    matchFilter(event, {
      ids: ["abc"],
      kinds: [0],
    }),
    false,
  );
});

Deno.test("matchFilter - matches everything with empty filter", () => {
  const event = makeEvent();
  assertEquals(matchFilter(event, {}), true);
});

Deno.test("matchFilters - applies OR logic across multiple filters", () => {
  const event = makeEvent({ kind: 1 });

  assertEquals(matchFilters(event, [{ kinds: [0] }, { kinds: [1] }]), true);
  assertEquals(matchFilters(event, [{ kinds: [0] }, { kinds: [3] }]), false);
});

Deno.test("filterEvents - sorts results by created_at descending", () => {
  const events = [
    makeEvent({ id: "old", created_at: 1000 }),
    makeEvent({ id: "new", created_at: 3000 }),
    makeEvent({ id: "mid", created_at: 2000 }),
  ];

  const result = filterEvents(events, { kinds: [1] });
  assertEquals(result.map((e) => e.id), ["new", "mid", "old"]);
});

Deno.test("filterEvents - limits result count", () => {
  const events = [
    makeEvent({ id: "a", created_at: 1000 }),
    makeEvent({ id: "b", created_at: 2000 }),
    makeEvent({ id: "c", created_at: 3000 }),
  ];

  const result = filterEvents(events, { kinds: [1], limit: 2 });
  assertEquals(result.length, 2);
  assertEquals(result.map((e) => e.id), ["c", "b"]);
});

Deno.test("filterEvents - excludes non-matching events", () => {
  const events = [
    makeEvent({ id: "a", kind: 1 }),
    makeEvent({ id: "b", kind: 0 }),
    makeEvent({ id: "c", kind: 1 }),
  ];

  const result = filterEvents(events, { kinds: [1] });
  assertEquals(result.map((e) => e.id), ["a", "c"]);
});
