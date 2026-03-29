import { assertEquals } from "@std/assert";
import { EventStore } from "../src/relay/event_store.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

Deno.test("EventStore - query preserves sort order for indexed kind lookups", () => {
  const store = new EventStore();

  store.store(
    EventBuilder.kind1()
      .id("kind-1-old")
      .pubkey("pub-a")
      .createdAt(100)
      .build(),
  );
  store.store(
    EventBuilder.kind(7)
      .id("kind-7-new")
      .pubkey("pub-b")
      .createdAt(300)
      .build(),
  );
  store.store(
    EventBuilder.kind1()
      .id("kind-1-mid")
      .pubkey("pub-c")
      .createdAt(200)
      .build(),
  );

  const result = store.query({ kinds: [1, 7] });

  assertEquals(result.map((event) => event.id), [
    "kind-7-new",
    "kind-1-mid",
    "kind-1-old",
  ]);
});

Deno.test("EventStore - query preserves sort order for indexed tag lookups", () => {
  const store = new EventStore();

  store.store(
    EventBuilder.kind1()
      .id("tag-old")
      .pubkey("pub-a")
      .createdAt(100)
      .tag("p", "target-pubkey")
      .build(),
  );
  store.store(
    EventBuilder.kind(7)
      .id("other-tag")
      .pubkey("pub-b")
      .createdAt(150)
      .tag("p", "other-pubkey")
      .build(),
  );
  store.store(
    EventBuilder.kind1()
      .id("tag-new")
      .pubkey("pub-c")
      .createdAt(300)
      .tag("p", "target-pubkey")
      .build(),
  );
  store.store(
    EventBuilder.kind1()
      .id("tag-mid")
      .pubkey("pub-d")
      .createdAt(200)
      .tag("p", "target-pubkey")
      .build(),
  );

  const result = store.query({ "#p": ["target-pubkey"] });

  assertEquals(result.map((event) => event.id), [
    "tag-new",
    "tag-mid",
    "tag-old",
  ]);
});

Deno.test("EventStore - restore rebuilds fast-path indexes for query and count", () => {
  const source = new EventStore();

  source.store(
    EventBuilder.kind1()
      .id("alpha-1")
      .pubkey("alice-1")
      .createdAt(100)
      .build(),
  );
  source.store(
    EventBuilder.kind(7)
      .id("beta-1")
      .pubkey("alice-2")
      .createdAt(200)
      .build(),
  );
  source.store(
    EventBuilder.kind1()
      .id("gamma-1")
      .pubkey("bob-1")
      .createdAt(300)
      .build(),
  );

  const restored = new EventStore();
  restored.restore(source.snapshot());

  const result = restored.query({ authors: ["alice"], kinds: [1, 7] });

  assertEquals(result.map((event) => event.id), ["beta-1", "alpha-1"]);
  assertEquals(
    restored.count([{ ids: ["gamma-"] }, { authors: ["alice"] }]),
    3,
  );
});

Deno.test("EventStore - restore rebuilds tag indexes for query and count", () => {
  const source = new EventStore();

  source.store(
    EventBuilder.kind1()
      .id("thread-a")
      .pubkey("alice-1")
      .createdAt(100)
      .tag("e", "thread-1")
      .tag("p", "mention-1")
      .build(),
  );
  source.store(
    EventBuilder.kind(7)
      .id("thread-b")
      .pubkey("alice-2")
      .createdAt(200)
      .tag("e", "thread-1")
      .build(),
  );
  source.store(
    EventBuilder.kind(30000)
      .id("param-alpha")
      .pubkey("carol-1")
      .createdAt(300)
      .tag("d", "alpha")
      .build(),
  );

  const restored = new EventStore();
  restored.restore(source.snapshot());

  const result = restored.query({ kinds: [30000], "#d": ["alpha"] });

  assertEquals(result.map((event) => event.id), ["param-alpha"]);
  assertEquals(
    restored.count([{ "#e": ["thread-1"] }, { "#p": ["mention-1"] }]),
    2,
  );
});

Deno.test("EventStore - restore rebuilds search index for query and count", () => {
  const source = new EventStore();

  source.store(
    EventBuilder.kind1()
      .id("search-a")
      .pubkey("alice-1")
      .createdAt(100)
      .content("Nostr-tools / relay_mock guide")
      .build(),
  );
  source.store(
    EventBuilder.kind1()
      .id("search-b")
      .pubkey("alice-2")
      .createdAt(200)
      .content("Bitcoin market update")
      .build(),
  );

  const restored = new EventStore();
  restored.restore(source.snapshot());

  const result = restored.query({
    kinds: [1],
    search: "nostr tools relay mock",
  });

  assertEquals(result.map((event) => event.id), ["search-a"]);
  assertEquals(
    restored.count([{ kinds: [1], search: "nostr tools relay mock" }]),
    1,
  );
});

Deno.test("EventStore - query and count honor mixed indexed filters", () => {
  const store = new EventStore();
  const targetAuthor = "author-target";
  const targetMention = "mention-target";
  const targetThread = "thread-target";
  const targetSlot = "slot-target";

  for (let i = 0; i < 5000; i++) {
    store.store(
      EventBuilder.kind(i % 2 === 0 ? 7 : 1)
        .id(`event-${i}`)
        .pubkey(i % 13 === 0 ? targetAuthor : `author-${i % 50}`)
        .createdAt(1000 + i)
        .tag("p", i % 5 === 0 ? targetMention : `mention-${i % 30}`)
        .tag("e", i % 7 === 0 ? targetThread : `thread-${i % 40}`)
        .tag("d", i % 11 === 0 ? targetSlot : `slot-${i % 20}`)
        .build(),
    );
  }

  const filter = {
    authors: [targetAuthor],
    kinds: [7],
    "#p": [targetMention],
    "#e": [targetThread],
    "#d": [targetSlot],
  };

  const result = store.query(filter);

  assertEquals(result.map((event) => event.id), ["event-0"]);
  assertEquals(store.count([filter]), 1);
});

Deno.test("EventStore - profile reports narrowed candidate stats for mixed filters", () => {
  const store = new EventStore();
  const targetAuthor = "author-target";
  const targetMention = "mention-target";
  const targetThread = "thread-target";
  const targetSlot = "slot-target";

  for (let i = 0; i < 5000; i++) {
    store.store(
      EventBuilder.kind(i % 2 === 0 ? 7 : 1)
        .id(`profile-${i}`)
        .pubkey(i % 13 === 0 ? targetAuthor : `author-${i % 50}`)
        .createdAt(1000 + i)
        .tag("p", i % 5 === 0 ? targetMention : `mention-${i % 30}`)
        .tag("e", i % 7 === 0 ? targetThread : `thread-${i % 40}`)
        .tag("d", i % 11 === 0 ? targetSlot : `slot-${i % 20}`)
        .build(),
    );
  }

  const profile = store.profile({
    authors: [targetAuthor],
    kinds: [7],
    "#p": [targetMention],
    "#e": [targetThread],
    "#d": [targetSlot],
    limit: 20,
  });

  assertEquals(profile.totalEvents, 5000);
  assertEquals(profile.candidateSourceCount, 5);
  assertEquals(profile.selectionSizes, [385, 455, 715, 1000, 2500]);
  assertEquals(profile.narrowedCandidateSize, 35);
  assertEquals(profile.usedFastPath, true);
  assertEquals(profile.usedIntersection, true);
  assertEquals(profile.appliedIntersectionCount, 1);
  assertEquals(profile.intersectionStopSize, 80);
  assertEquals(profile.limit, 20);
});

Deno.test("EventStore - profile reports search token candidates and index stats", () => {
  const store = new EventStore();

  store.store(
    EventBuilder.kind1()
      .id("search-profile-a")
      .createdAt(100)
      .content("Nostr-tools / relay_mock guide")
      .build(),
  );
  store.store(
    EventBuilder.kind1()
      .id("search-profile-b")
      .createdAt(200)
      .content("Relay mock overview")
      .build(),
  );
  store.store(
    EventBuilder.kind1()
      .id("search-profile-c")
      .createdAt(300)
      .content("Nostr tools only")
      .build(),
  );
  store.store(
    EventBuilder.kind1()
      .id("search-profile-d")
      .createdAt(400)
      .content("Bitcoin market")
      .build(),
  );

  const profile = store.profile({ search: "nostr tools relay mock" });

  assertEquals(profile.totalEvents, 4);
  assertEquals(profile.candidateSourceCount, 1);
  assertEquals(profile.searchTokenCount, 4);
  assertEquals(profile.searchTokenSelectionSizes, [2, 2, 2, 2]);
  assertEquals(profile.selectionSizes, [1]);
  assertEquals(profile.narrowedCandidateSize, 1);
  assertEquals(profile.usedFastPath, true);
  assertEquals(profile.usedIntersection, false);
  assertEquals(profile.appliedIntersectionCount, 0);
  assertEquals(profile.searchIndexTokenCount, 9);
  assertEquals(profile.searchIndexPostingCount, 13);
  assertEquals(profile.limit, null);
});
