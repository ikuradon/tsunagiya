import { assertEquals } from "@std/assert";
import { EventStore } from "../src/relay/event_store.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

const BASELINE_THRESHOLDS_MS = {
  reqKindLimitOn10k: 750,
  reqTagLimitOn10k: 750,
  reqAddressTagLimitOn10k: 750,
  reqMixedFilterOn10k: 150,
  reqMixedFilterLimitOn10k: 100,
  reqSearchOn10k: 100,
  reqSearchOn100k: 300,
  countMultiFilterOn10k: 750,
  countMixedFilterOn10k: 100,
  countSearchOn10k: 100,
  countSearchOn100k: 400,
  countTopicTagOn10k: 750,
  countDeletionHeavyOn10k: 900,
  replaceableUpdateBurstOn2k: 400,
  deletionSweepOn500Targets: 400,
} as const;

function measure<T>(run: () => T): [T, number] {
  const start = performance.now();
  const result = run();
  return [result, performance.now() - start];
}

function makePubkey(index: number): string {
  return index.toString(16).padStart(64, "0");
}

function makeAddress(pubkeyIndex: number, articleIndex: number): string {
  return `30023:${makePubkey(pubkeyIndex)}:article-${articleIndex}`;
}

function makeLargeEventStore(count: number): EventStore {
  const store = new EventStore();

  for (let i = 0; i < count; i++) {
    store.store(
      EventBuilder.kind(i % 5)
        .pubkey(makePubkey(i % 100))
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
    const pubkey = makePubkey(i % 100);
    store.store(
      EventBuilder.kind(10 + (i % 5))
        .pubkey(pubkey)
        .createdAt(1700000000 + i)
        .content(`event ${i}`)
        .tag("p", pubkey)
        .tag("e", `thread-${i % 200}`)
        .tag("d", `slot-${i % 50}`)
        .tag("a", makeAddress(i % 25, i % 40))
        .tag("t", `topic-${i % 30}`)
        .build(),
    );
  }

  return store;
}

function makeMixedFilterEventStore(count: number): EventStore {
  const store = new EventStore();
  const targetAuthor = makePubkey(42);

  for (let i = 0; i < count; i++) {
    store.store(
      EventBuilder.kind(i % 2 === 0 ? 7 : 1)
        .pubkey(i % 13 === 0 ? targetAuthor : makePubkey((i % 200) + 100))
        .createdAt(1700000000 + i)
        .content(`mixed ${i}`)
        .tag("p", i % 5 === 0 ? "mention-target" : `mention-${i % 150}`)
        .tag("e", i % 7 === 0 ? "thread-target" : `thread-${i % 400}`)
        .tag("d", i % 11 === 0 ? "slot-target" : `slot-${i % 80}`)
        .build(),
    );
  }

  return store;
}
function makeSearchEventStore(count: number): EventStore {
  const store = new EventStore();

  for (let i = 0; i < count; i++) {
    store.store(
      EventBuilder.kind(i % 2 === 0 ? 1 : 7)
        .pubkey(makePubkey(i % 100))
        .createdAt(1700000000 + i)
        .content(
          i % 10 === 0
            ? `Nostr-tools / relay_mock guide ${i}`
            : `Bitcoin market update ${i}`,
        )
        .build(),
    );
  }

  return store;
}

Deno.test("Performance baseline - REQ kind+limit over 10000 events stays under baseline", () => {
  const store = makeLargeEventStore(10000);
  const filter = { kinds: [2], limit: 100 };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 100);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqKindLimitOn10k,
    true,
    `REQ baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqKindLimitOn10k}ms`,
  );
});

Deno.test("Performance baseline - COUNT with multiple filters over 10000 events stays under baseline", () => {
  const store = makeLargeEventStore(10000);
  const filters = [
    { kinds: [2], authors: [makePubkey(42)] },
    { kinds: [1], authors: [makePubkey(41)] },
  ];

  store.count(filters);
  const [count, elapsed] = measure(() => store.count(filters));

  assertEquals(count, 200);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.countMultiFilterOn10k,
    true,
    `COUNT baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.countMultiFilterOn10k}ms`,
  );
});

Deno.test("Performance baseline - REQ tag+limit over 10000 events stays under baseline", () => {
  const store = makeTaggedEventStore(10000);
  const filter = { "#p": [makePubkey(42)], limit: 100 };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 100);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqTagLimitOn10k,
    true,
    `REQ tag baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqTagLimitOn10k}ms`,
  );
});

Deno.test("Performance baseline - REQ #a tag+limit over 10000 events stays under baseline", () => {
  const store = makeTaggedEventStore(10000);
  const filter = { "#a": [makeAddress(7, 7)], limit: 100 };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 50);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqAddressTagLimitOn10k,
    true,
    `REQ #a baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqAddressTagLimitOn10k}ms`,
  );
});

Deno.test("Performance baseline - REQ mixed indexed filters over 10000 events stays under baseline", () => {
  const store = makeMixedFilterEventStore(10000);
  const filter = {
    authors: [makePubkey(42)],
    kinds: [7],
    "#p": ["mention-target"],
    "#e": ["thread-target"],
    "#d": ["slot-target"],
  };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 1);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqMixedFilterOn10k,
    true,
    `REQ mixed-filter baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqMixedFilterOn10k}ms`,
  );
});

Deno.test("Performance baseline - REQ mixed indexed filters + limit over 10000 events stays under baseline", () => {
  const store = makeMixedFilterEventStore(10000);
  const filter = {
    authors: [makePubkey(42)],
    kinds: [7],
    "#p": ["mention-target"],
    limit: 20,
  };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 20);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqMixedFilterLimitOn10k,
    true,
    `REQ mixed-filter+limit baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqMixedFilterLimitOn10k}ms`,
  );
});

Deno.test("Performance baseline - COUNT mixed indexed filters over 10000 events stays under baseline", () => {
  const store = makeMixedFilterEventStore(10000);
  const filters = [{
    authors: [makePubkey(42)],
    kinds: [7],
    "#p": ["mention-target"],
    "#e": ["thread-target"],
    "#d": ["slot-target"],
  }];

  store.count(filters);
  const [count, elapsed] = measure(() => store.count(filters));

  assertEquals(count, 1);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.countMixedFilterOn10k,
    true,
    `COUNT mixed-filter baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.countMixedFilterOn10k}ms`,
  );
});
Deno.test("Performance baseline - search REQ over 10000 events stays under baseline", () => {
  const store = makeSearchEventStore(10000);
  const filter = { kinds: [1], search: "nostr tools relay mock", limit: 100 };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 100);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqSearchOn10k,
    true,
    `REQ search baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqSearchOn10k}ms`,
  );
});

Deno.test("Performance baseline - COUNT search over 10000 events stays under baseline", () => {
  const store = makeSearchEventStore(10000);
  const filters = [{ kinds: [1], search: "nostr tools relay mock" }];

  store.count(filters);
  const [count, elapsed] = measure(() => store.count(filters));

  assertEquals(count, 1000);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.countSearchOn10k,
    true,
    `COUNT search baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.countSearchOn10k}ms`,
  );
});

Deno.test("Performance baseline - search REQ over 100000 events stays under baseline", () => {
  const store = makeSearchEventStore(100000);
  const filter = { kinds: [1], search: "nostr tools relay mock", limit: 100 };

  store.query(filter);
  const [result, elapsed] = measure(() => store.query(filter));

  assertEquals(result.length, 100);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.reqSearchOn100k,
    true,
    `REQ search 100k baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.reqSearchOn100k}ms`,
  );
});

Deno.test("Performance baseline - COUNT search over 100000 events stays under baseline", () => {
  const store = makeSearchEventStore(100000);
  const filters = [{ kinds: [1], search: "nostr tools relay mock" }];

  store.count(filters);
  const [count, elapsed] = measure(() => store.count(filters));

  assertEquals(count, 10000);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.countSearchOn100k,
    true,
    `COUNT search 100k baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.countSearchOn100k}ms`,
  );
});

Deno.test("Performance baseline - COUNT #t over 10000 events stays under baseline", () => {
  const store = makeTaggedEventStore(10000);
  const filters = [{ "#t": ["topic-10"] }];

  store.count(filters);
  const [count, elapsed] = measure(() => store.count(filters));

  assertEquals(count, 333);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.countTopicTagOn10k,
    true,
    `COUNT #t baseline took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.countTopicTagOn10k}ms`,
  );
});

Deno.test("Performance baseline - deletion-heavy mixed COUNT stays under baseline", () => {
  const store = new EventStore();
  const author = makePubkey(42);
  const address = makeAddress(42, 7);
  const topic = "topic-7";
  const targets = Array.from({ length: 1000 }, (_, i) =>
    EventBuilder.kind7()
      .pubkey(author)
      .createdAt(1700000000 + i)
      .content(`target ${i}`)
      .tag("t", topic)
      .tag("a", address)
      .tag("p", author)
      .build());
  const noise = Array.from(
    { length: 9000 },
    (_, i) =>
      EventBuilder.kind((i % 5) + 1)
        .pubkey(makePubkey((i % 99) + 1))
        .createdAt(1700010000 + i)
        .content(`noise ${i}`)
        .tag("t", `topic-${i % 30}`)
        .tag("a", makeAddress(i % 25, i % 40))
        .tag("p", makePubkey(i % 100))
        .build(),
  );

  for (const event of [...targets, ...noise]) {
    store.store(event);
  }

  const deletion = EventBuilder.deletion(
    targets.slice(0, 500).map((event) => event.id),
  )
    .pubkey(author)
    .createdAt(1700020000)
    .build();
  store.store(deletion);

  const filters = [
    { kinds: [7], authors: [author], "#t": [topic] },
    { "#a": [address], "#p": [author] },
  ];

  store.count(filters);
  const [count, elapsed] = measure(() => store.count(filters));

  assertEquals(count, 500);
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.countDeletionHeavyOn10k,
    true,
    `Deletion-heavy COUNT took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.countDeletionHeavyOn10k}ms`,
  );
});

Deno.test("Performance baseline - replaceable update burst stays under baseline", () => {
  const store = new EventStore();
  const pubkey = makePubkey(7);
  const events = Array.from({ length: 2000 }, (_, i) =>
    EventBuilder.kind(10000)
      .pubkey(pubkey)
      .createdAt(1700000000 + i)
      .content(`version ${i}`)
      .build());

  const [, elapsed] = measure(() => {
    for (const event of events) {
      store.store(event);
    }
  });

  const snapshot = store.snapshot();
  assertEquals(snapshot.store.length, 1);
  assertEquals(snapshot.store[0].content, "version 1999");
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.replaceableUpdateBurstOn2k,
    true,
    `Replaceable update burst took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.replaceableUpdateBurstOn2k}ms`,
  );
});

Deno.test("Performance baseline - deletion request sweep stays under baseline", () => {
  const store = new EventStore();
  const pubkey = makePubkey(9);
  const targets = Array.from({ length: 500 }, (_, i) =>
    EventBuilder.kind1()
      .pubkey(pubkey)
      .createdAt(1700000000 + i)
      .content(`delete target ${i}`)
      .build());
  const untouched = Array.from({ length: 500 }, (_, i) =>
    EventBuilder.kind1()
      .pubkey(pubkey)
      .createdAt(1700001000 + i)
      .content(`keep ${i}`)
      .build());

  for (const event of [...targets, ...untouched]) {
    store.store(event);
  }

  const deletion = EventBuilder.deletion(targets.map((event) => event.id))
    .pubkey(pubkey)
    .createdAt(1700005000)
    .build();

  const [, elapsed] = measure(() => store.store(deletion));

  const snapshot = store.snapshot();
  assertEquals(snapshot.deletedIds.length, 500);
  assertEquals(snapshot.store.length, 501);
  assertEquals(
    snapshot.deletedIds.every((id) => targets.some((event) => event.id === id)),
    true,
  );
  assertEquals(
    elapsed < BASELINE_THRESHOLDS_MS.deletionSweepOn500Targets,
    true,
    `Deletion sweep took ${
      elapsed.toFixed(2)
    }ms, expected < ${BASELINE_THRESHOLDS_MS.deletionSweepOn500Targets}ms`,
  );
});
