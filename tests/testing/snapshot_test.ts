import { assertEquals, assertExists } from "@std/assert";
import { MockPool } from "../../src/pool.ts";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { restore, snapshot } from "../../src/testing/snapshot.ts";
import { waitFor } from "../../src/testing/wait.ts";

async function waitForCondition(condition: () => boolean): Promise<void> {
  await waitFor(condition, {
    timeout: 1000,
    interval: 5,
  });
}

async function waitForMessageCount(
  messages: string[],
  count: number,
): Promise<void> {
  await waitForCondition(() => messages.length >= count);
}

async function closeWs(ws: WebSocket): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve(), { once: true });
  });
  ws.close();
  await closed;
}

Deno.test("snapshot - saves and restores store", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event1 = EventBuilder.kind1().id("event1").content("hello").build();
  relay.store(event1);

  const snap = snapshot(relay);

  const event2 = EventBuilder.kind1().id("event2").content("world").build();
  relay.store(event2);

  // event2追加後
  assertEquals(snap.store.length, 1);

  restore(relay, snap);

  // event1のみの状態に戻る — REQで確認
  // 新しいスナップショットを取って確認
  const restored = snapshot(relay);
  assertEquals(restored.store.length, 1);
  assertEquals(restored.store[0].id, "event1");
});

Deno.test("snapshot - saves and restores received messages", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForCondition(() => relay.received.length === 1);

    const snap = snapshot(relay);

    ws.send(JSON.stringify(["REQ", "sub2", { kinds: [0] }]));
    await waitForCondition(() => relay.received.length === 2);

    assertEquals(relay.received.length, 2);

    restore(relay, snap);

    assertEquals(relay.received.length, 1);
    assertEquals(relay.received[0][0], "REQ");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("snapshot - is a deep copy (independent of relay)", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event = EventBuilder.kind1()
    .id("event1")
    .tag("e", "ref1")
    .build();
  relay.store(event);

  const snap = snapshot(relay);

  // スナップショットのタグを変更してもリレーに影響しない
  snap.store[0].tags[0][1] = "modified";
  const currentSnap = snapshot(relay);
  assertEquals(currentSnap.store[0].tags[0][1], "ref1");
});

Deno.test("snapshot - relay.snapshot() and relay.restore() work directly", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event1 = EventBuilder.kind1().id("ev1").build();
  relay.store(event1);

  const snap = relay.snapshot();

  relay.store(EventBuilder.kind1().id("ev2").build());
  relay.store(EventBuilder.kind1().id("ev3").build());

  relay.restore(snap);

  const after = relay.snapshot();
  assertEquals(after.store.length, 1);
  assertEquals(after.store[0].id, "ev1");
});

Deno.test("snapshot - timestamp is recorded", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const before = Date.now();
  const snap = snapshot(relay);
  const after = Date.now();

  assertEquals(snap.timestamp >= before, true);
  assertEquals(snap.timestamp <= after, true);
});

Deno.test("snapshot - uses injected clock for timestamp", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    clock: {
      now(): number {
        return 424242;
      },
    },
  });

  const snap = snapshot(relay);
  assertEquals(snap.timestamp, 424242);
});

Deno.test("snapshot - received REQ filters are deep copied", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], authors: ["abc"] }]));
    await waitForCondition(() => relay.received.length === 1);

    const snap = snapshot(relay);

    // スナップショットのフィルターを変更
    const reqMsg = snap.received[0] as ["REQ", string, ...unknown[]];
    const filter = reqMsg[2] as { kinds: number[]; authors: string[] };
    filter.kinds[0] = 999;
    filter.authors[0] = "modified";

    // リレーの received は変更されていないことを確認
    const currentReq = relay.received[0] as ["REQ", string, ...unknown[]];
    const currentFilter = currentReq[2] as {
      kinds: number[];
      authors: string[];
    };
    assertEquals(currentFilter.kinds[0], 1);
    assertEquals(currentFilter.authors[0], "abc");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("snapshot - empty relay produces empty snapshot", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const snap = snapshot(relay);
  assertEquals(snap.store.length, 0);
  assertEquals(snap.received.length, 0);
});

/** WebSocketを開いて待機するヘルパー */
async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

Deno.test("snapshot - restores state after disconnectAfter()", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // イベントをストアに追加
  const event1 = EventBuilder.kind1().id("ev-before").content(
    "before disconnect",
  ).build();
  relay.store(event1);

  // スナップショット取得
  const snap = snapshot(relay);

  pool.install();
  try {
    // 接続して正常動作を確認
    const ws1 = await openWs("wss://relay.example.com");
    const messages1: string[] = [];
    ws1.addEventListener("message", (ev: MessageEvent) => {
      messages1.push(ev.data as string);
    });

    ws1.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForMessageCount(messages1, 2);

    assertEquals(messages1.length, 2); // EVENT + EOSE

    // disconnectAfter で切断
    relay.disconnectAfter(50);

    await waitForCondition(() => ws1.readyState === WebSocket.CLOSED);

    // 切断されたことを確認
    assertEquals(ws1.readyState, WebSocket.CLOSED);

    // スナップショット復元
    restore(relay, snap);

    // 復元後に新しい接続でストアが正しいことを確認
    const ws2 = await openWs("wss://relay.example.com");
    const messages2: string[] = [];
    ws2.addEventListener("message", (ev: MessageEvent) => {
      messages2.push(ev.data as string);
    });

    ws2.send(JSON.stringify(["REQ", "sub2", { kinds: [1] }]));
    await waitForMessageCount(messages2, 2);

    // スナップショット時点のイベントが取得できる
    const eventMsgs = messages2
      .map((m) => JSON.parse(m))
      .filter((m: unknown[]) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 1);
    assertEquals((eventMsgs[0] as unknown[])[2], snap.store[0]);

    const eose = JSON.parse(messages2[messages2.length - 1]);
    assertEquals(eose[0], "EOSE");

    await closeWs(ws2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("snapshot - メタデータが含まれる", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  // イベントをストアに追加
  relay.store(EventBuilder.kind1().build());
  relay.store(EventBuilder.kind1().build());

  const snap = relay.snapshot();
  assertExists(snap.metadata);
  assertEquals(snap.metadata!.eventCount, 2);
  assertEquals(snap.metadata!.subscriptionCount, 0);
  assertEquals(snap.metadata!.connectionCount, 0);
});
