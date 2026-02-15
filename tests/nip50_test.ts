import { assertEquals } from "@std/assert";
import { filterEvents, matchFilter, matchFilters } from "../src/filter.ts";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import { FilterBuilder } from "../src/testing/filter_builder.ts";

// ===== matchFilter with search =====

Deno.test("NIP-50 matchFilter - search partial match", () => {
  const event = EventBuilder.kind1().content("Hello World").build();
  assertEquals(matchFilter(event, { search: "hello" }), true);
});

Deno.test("NIP-50 matchFilter - search case insensitive", () => {
  const event = EventBuilder.kind1().content("Hello World").build();
  assertEquals(matchFilter(event, { search: "HELLO" }), true);
  assertEquals(matchFilter(event, { search: "hello world" }), true);
});

Deno.test("NIP-50 matchFilter - search no match", () => {
  const event = EventBuilder.kind1().content("Hello World").build();
  assertEquals(matchFilter(event, { search: "goodbye" }), false);
});

Deno.test("NIP-50 matchFilter - search with other filter conditions (AND)", () => {
  const event = EventBuilder.kind1().pubkey("aabb").content("Nostr rocks")
    .build();

  // Both match
  assertEquals(
    matchFilter(event, { kinds: [1], authors: ["aabb"], search: "nostr" }),
    true,
  );

  // search doesn't match
  assertEquals(
    matchFilter(event, { kinds: [1], authors: ["aabb"], search: "bitcoin" }),
    false,
  );

  // kind doesn't match
  assertEquals(
    matchFilter(event, { kinds: [7], search: "nostr" }),
    false,
  );
});

Deno.test("NIP-50 matchFilter - no search field matches everything", () => {
  const event = EventBuilder.kind1().content("anything").build();
  assertEquals(matchFilter(event, { kinds: [1] }), true);
});

Deno.test("NIP-50 matchFilter - empty search matches everything", () => {
  const event = EventBuilder.kind1().content("anything").build();
  assertEquals(matchFilter(event, { search: "" }), true);
});

// ===== matchFilters with search =====

Deno.test("NIP-50 matchFilters - OR across filters with search", () => {
  const event = EventBuilder.kind1().content("test message").build();
  assertEquals(
    matchFilters(event, [
      { search: "nonexistent" },
      { search: "test" },
    ]),
    true,
  );
});

// ===== filterEvents with search =====

Deno.test("NIP-50 filterEvents - search filters events", () => {
  const events = [
    EventBuilder.kind1().content("hello world").createdAt(100).build(),
    EventBuilder.kind1().content("goodbye world").createdAt(200).build(),
    EventBuilder.kind1().content("hello nostr").createdAt(300).build(),
  ];

  const result = filterEvents(events, { search: "hello" });
  assertEquals(result.length, 2);
  assertEquals(result[0].content, "hello nostr"); // newer first
  assertEquals(result[1].content, "hello world");
});

Deno.test("NIP-50 filterEvents - search with limit", () => {
  const events = [
    EventBuilder.kind1().content("hello 1").createdAt(100).build(),
    EventBuilder.kind1().content("hello 2").createdAt(200).build(),
    EventBuilder.kind1().content("hello 3").createdAt(300).build(),
  ];

  const result = filterEvents(events, { search: "hello", limit: 2 });
  assertEquals(result.length, 2);
});

// ===== Integration with MockRelay =====

Deno.test("NIP-50 - search via REQ returns matching events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("Nostr is great").build());
  relay.store(EventBuilder.kind1().content("Bitcoin is great").build());
  relay.store(EventBuilder.kind1().content("Nostr rocks").build());

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify(["REQ", "sub1", { kinds: [1], search: "nostr" }]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // 2 EVENT + EOSE = 3
    assertEquals(messages.length, 3);
    const contents = messages
      .filter((m) => JSON.parse(m)[0] === "EVENT")
      .map((m) => JSON.parse(m)[2].content);
    assertEquals(
      contents.every((c: string) => c.toLowerCase().includes("nostr")),
      true,
    );
  } finally {
    pool.uninstall();
  }
});

// ===== FilterBuilder.search =====

Deno.test("NIP-50 FilterBuilder - search() creates filter with search", () => {
  const filter = FilterBuilder.search("hello");
  assertEquals(filter, { search: "hello" });
});

Deno.test("NIP-50 FilterBuilder - search filter works with matchFilter", () => {
  const filter = FilterBuilder.search("nostr");
  const event = EventBuilder.kind1().content("I love Nostr").build();
  assertEquals(matchFilter(event, filter), true);
});

// ===== COUNT with search =====

Deno.test("NIP-50 COUNT - search filter works with COUNT", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("Nostr is great").build());
  relay.store(EventBuilder.kind1().content("Bitcoin is great").build());

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify(["COUNT", "count1", { kinds: [1], search: "nostr" }]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 1);
  } finally {
    pool.uninstall();
  }
});
