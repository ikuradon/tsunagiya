import { assertEquals } from "@std/assert";
import { MockPool } from "../../src/pool.ts";
import type { NostrEvent, RandomSource } from "../../src/types.ts";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { startStream, streamEvents } from "../../src/testing/stream.ts";
import { waitFor } from "../../src/testing/wait.ts";

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

function collectMessages(ws: WebSocket): unknown[][] {
  const messages: unknown[][] = [];
  ws.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(ev.data as string);
    messages.push(msg);
  };
  return messages;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  await waitFor(condition, {
    timeout: 1000,
    interval: 5,
  });
}

async function waitForEventCount(
  messages: unknown[][],
  count: number,
): Promise<void> {
  await waitForCondition(() => {
    return messages.filter((m) => m[0] === "EVENT").length >= count;
  });
}

async function waitForRawEventCount(
  messages: string[],
  count: number,
): Promise<void> {
  await waitForCondition(() => {
    return messages.filter((m) => JSON.parse(m)[0] === "EVENT").length >= count;
  });
}

async function closeWs(ws: WebSocket): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve(), { once: true });
  });
  ws.close();
  await closed;
}

function hasStoredEvent(
  relay: { snapshot(): { store: NostrEvent[] } },
  eventId: string,
): boolean {
  return relay.snapshot().store.some((event) => event.id === eventId);
}

function makeCountingRandom(value: number): {
  random: RandomSource;
  getCalls(): number;
} {
  let calls = 0;
  return {
    random: {
      next(): number {
        calls++;
        return value;
      },
      fill(bytes: Uint8Array): void {
        bytes.fill(0);
      },
    },
    getCalls(): number {
      return calls;
    },
  };
}

Deno.test("streamEvents - delivers events with interval", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 30 });

    await waitForEventCount(messages, 3);

    assertEquals(handle.stopped, false);
    handle.stop();
    assertEquals(handle.stopped, true);

    // 3件のEVENTが受信されているはず
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);
    assertEquals(eventMsgs[0][1], "sub1");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("streamEvents - stop() halts delivery", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const events = EventBuilder.bulk(10, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 50 });

    await waitForEventCount(messages, 1);
    handle.stop();

    const countAtStop = messages.filter((m) => m[0] === "EVENT").length;

    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    const countAfter = messages.filter((m) => m[0] === "EVENT").length;

    assertEquals(countAtStop, countAfter);
    assertEquals(countAtStop < 10, true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("streamEvents - adds events to store", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 20 });

    await waitForCondition(() =>
      events.every((event) => hasStoredEvent(relay, event.id))
    );
    handle.stop();

    // ストリームしたイベントでREQに応答できるか確認
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));
    await waitForEventCount(messages, 3);

    assertEquals(relay.hasREQ("sub1"), true);
    assertEquals(messages.filter((m) => m[0] === "EVENT").length, 3);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("streamEvents - only sends to matching subscriptions", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    // kind:0のみサブスクライブ
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [0] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    // kind:1のイベントをストリーム
    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 20 });
    await waitForCondition(() =>
      events.every((event) => hasStoredEvent(relay, event.id))
    );
    handle.stop();

    // kind:0のサブスクリプションにはkind:1はマッチしない
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 0);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("startStream - generates events with eventGenerator", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 30,
      count: 3,
    });

    await waitForCondition(() => handle.stopped);
    await waitForEventCount(messages, 3);

    assertEquals(handle.stopped, true);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("startStream - stop() halts generation", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 30,
    });

    await waitForEventCount(messages, 1);
    handle.stop();
    assertEquals(handle.stopped, true);

    const countAtStop = messages.filter((m) => m[0] === "EVENT").length;

    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    const countAfter = messages.filter((m) => m[0] === "EVENT").length;

    assertEquals(countAtStop, countAfter);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("startStream - no count means unlimited until stop", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
    });

    await waitForEventCount(messages, 2);
    handle.stop();

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    // 少なくとも2件以上は配信されているはず
    assertEquals(eventMsgs.length >= 2, true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== streamEvents + kind:5 二重配信防止 =====

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "event1",
    pubkey: "pub1",
    kind: 1,
    content: "hello",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
    ...overrides,
  };
}

function collectRawMessages(ws: WebSocket): string[] {
  const messages: string[] = [];
  ws.addEventListener("message", (ev: MessageEvent) => {
    messages.push(ev.data as string);
  });
  return messages;
}

// ===== streamEvents with jitter =====

Deno.test("streamEvents - with jitter option completes successfully", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay2.example.com");
  const random = makeCountingRandom(0.75);

  pool.install();
  try {
    const ws = await openWs("wss://relay2.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, {
      interval: 20,
      jitter: 10,
      random: random.random,
    });

    await waitForEventCount(messages, 3);

    handle.stop();
    assertEquals(handle.stopped, true);
    assertEquals(random.getCalls(), 3);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== startStream with count auto-stop =====

Deno.test("startStream - count: 3 auto-stops after 3 events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay3.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay3.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
      count: 3,
    });

    await waitForCondition(() => handle.stopped);
    await waitForEventCount(messages, 3);

    assertEquals(handle.stopped, true);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== startStream with jitter =====

Deno.test("startStream - with jitter option operates normally", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay4.example.com");
  const random = makeCountingRandom(0.75);

  pool.install();
  try {
    const ws = await openWs("wss://relay4.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
      jitter: 5,
      count: 3,
      random: random.random,
    });

    await waitForCondition(() => handle.stopped);
    handle.stop();
    assertEquals(random.getCalls(), 3);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length >= 1, true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("streamEvents - ephemeral events are broadcast but not stored", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    // ephemeral event (kind 20000-29999) にマッチするサブスクリプション
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [20000] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    // ephemeral event をストリーム
    const ephemeralEvents: NostrEvent[] = [
      {
        id: "eph1",
        pubkey: "pub1",
        kind: 20000,
        content: "ephemeral 1",
        created_at: 1700000000,
        tags: [],
        sig: "sig1",
      },
      {
        id: "eph2",
        pubkey: "pub1",
        kind: 20000,
        content: "ephemeral 2",
        created_at: 1700000001,
        tags: [],
        sig: "sig2",
      },
    ];
    const handle = streamEvents(relay, ephemeralEvents, { interval: 30 });

    await waitForEventCount(messages, 2);
    handle.stop();

    // ブロードキャストされている（EVENT メッセージを受信）
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 2);

    // ストアには保存されていない（ephemeral はストアに残らない）
    assertEquals(hasStoredEvent(relay, "eph1"), false);
    assertEquals(hasStoredEvent(relay, "eph2"), false);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== ブランチカバレッジ補完テスト =====

Deno.test("streamEvents - empty events array delivers nothing", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    // 空配列を渡すと scheduleNext は index >= events.length で即時 return する
    const handle = streamEvents(relay, [], { interval: 10 });

    // 少し待って何も配信されないことを確認
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(handle.stopped, false);
    handle.stop();
    assertEquals(handle.stopped, true);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 0);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("startStream - stop before first event fires", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    let generatorCalled = false;

    // interval: 100ms で開始し、即座に stop() する
    const handle = startStream(relay, {
      eventGenerator: () => {
        generatorCalled = true;
        return EventBuilder.random({ kind: 1 });
      },
      interval: 100,
    });

    // 即座に stop() — タイマー発火前に stopped=true になるはず
    handle.stop();
    assertEquals(handle.stopped, true);

    // タイマーが発火しないよう十分待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    // ジェネレーターが呼ばれていないことを確認
    assertEquals(generatorCalled, false);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 0);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("startStream - count: 0 generates no events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    let generatorCalled = false;

    // count: 0 を渡すと scheduleNext は count >= maxCount で即時 stopped=true になる
    const handle = startStream(relay, {
      eventGenerator: () => {
        generatorCalled = true;
        return EventBuilder.random({ kind: 1 });
      },
      interval: 20,
      count: 0,
    });

    // stopped になるまで待つ
    await waitForCondition(() => handle.stopped);

    assertEquals(handle.stopped, true);
    assertEquals(generatorCalled, false);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 0);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("streamEvents - delivers kind:5 EVENT only once", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // 削除対象イベントをストアに追加
  relay.store(makeEvent({ id: "target1", kind: 1, pubkey: "pub1" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectRawMessages(ws);

    // kind:5 にマッチするサブスクリプション
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [5] }]));
    await waitForCondition(() => relay.hasREQ("sub1"));

    // EOSE 以降のメッセージをリセット
    messages.length = 0;

    // kind:5 deletion イベントをストリーミング
    const deletionEvent = makeEvent({
      id: "del1",
      kind: 5,
      pubkey: "pub1",
      tags: [["e", "target1"]],
    });

    const handle = streamEvents(relay, [deletionEvent], { interval: 10 });
    await waitForRawEventCount(messages, 1);
    handle.stop();

    // EVENT が1回のみ配信されたことを確認
    const eventMessages = messages.filter((m) => JSON.parse(m)[0] === "EVENT");
    assertEquals(
      eventMessages.length,
      1,
      `Expected 1 EVENT but got ${eventMessages.length}`,
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
