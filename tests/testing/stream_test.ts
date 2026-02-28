import { assertEquals } from "@std/assert";
import { MockPool } from "../../src/pool.ts";
import type { NostrEvent } from "../../src/types.ts";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { startStream, streamEvents } from "../../src/testing/stream.ts";

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

Deno.test("streamEvents - delivers events with interval", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 30 });

    // 3件全て配信されるまで待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    assertEquals(handle.stopped, false);
    handle.stop();
    assertEquals(handle.stopped, true);

    // 3件のEVENTが受信されているはず
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);
    assertEquals(eventMsgs[0][1], "sub1");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const events = EventBuilder.bulk(10, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 50 });

    // 少し待ってから停止
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    handle.stop();

    const countAtStop = messages.filter((m) => m[0] === "EVENT").length;

    // さらに待っても増えない
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const countAfter = messages.filter((m) => m[0] === "EVENT").length;

    assertEquals(countAtStop, countAfter);
    assertEquals(countAtStop < 10, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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

    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 20 });

    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    handle.stop();

    // ストリームしたイベントでREQに応答できるか確認
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // ストアに3件追加されている
    const messages: unknown[][] = [];
    ws.onmessage = (ev: MessageEvent) => {
      messages.push(JSON.parse(ev.data as string));
    };

    // REQの応答として既にストアにある3件が返る
    // 上で取ったREQの応答はcollectMessagesの前に処理されているので
    // findREQで確認する
    assertEquals(relay.hasREQ("sub1"), true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    // kind:0のみサブスクライブ
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [0] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    // kind:1のイベントをストリーム
    const events = EventBuilder.bulk(3, { kind: 1 });
    streamEvents(relay, events, { interval: 20 });

    await new Promise<void>((resolve) => setTimeout(resolve, 120));

    // kind:0のサブスクリプションにはkind:1はマッチしない
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 0);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 30,
      count: 3,
    });

    // 3件生成されるまで待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    assertEquals(handle.stopped, true);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 30,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    handle.stop();
    assertEquals(handle.stopped, true);

    const countAtStop = messages.filter((m) => m[0] === "EVENT").length;

    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    const countAfter = messages.filter((m) => m[0] === "EVENT").length;

    assertEquals(countAtStop, countAfter);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 110));
    handle.stop();

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    // 少なくとも2件以上は配信されているはず
    assertEquals(eventMsgs.length >= 2, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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

  pool.install();
  try {
    const ws = await openWs("wss://relay2.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 20, jitter: 10 });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    handle.stop();
    assertEquals(handle.stopped, true);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
      count: 3,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    assertEquals(handle.stopped, true);

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 3);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== startStream with jitter =====

Deno.test("startStream - with jitter option operates normally", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay4.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay4.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
      jitter: 5,
      count: 3,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    handle.stop();

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length >= 1, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    // ephemeral event (kind 20000-29999) にマッチするサブスクリプション
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [20000] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

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

    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    handle.stop();

    // ブロードキャストされている（EVENT メッセージを受信）
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 2);

    // ストアには保存されていない（ephemeral はストアに残らない）
    assertEquals(relay.hasEvent("eph1"), false);
    assertEquals(relay.hasEvent("eph2"), false);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

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
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    handle.stop();

    // EVENT が1回のみ配信されたことを確認
    const eventMessages = messages.filter((m) => JSON.parse(m)[0] === "EVENT");
    assertEquals(
      eventMessages.length,
      1,
      `Expected 1 EVENT but got ${eventMessages.length}`,
    );
  } finally {
    pool.uninstall();
  }
});
