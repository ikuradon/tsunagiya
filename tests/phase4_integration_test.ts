import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import { startStream, streamEvents } from "../src/testing/stream.ts";
import { restore, snapshot } from "../src/testing/snapshot.ts";
import type { LogEntry } from "../src/types.ts";

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
    messages.push(JSON.parse(ev.data as string));
  };
  return messages;
}

Deno.test("Integration - stream + filter matching", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    // kind:1のみサブスクライブ
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const messages = collectMessages(ws);

    // kind:1とkind:0が混在するイベントをストリーム
    const kind1Events = EventBuilder.bulk(2, { kind: 1 });
    const kind0Event = EventBuilder.random({ kind: 0 });
    const allEvents = [kind1Events[0], kind0Event, kind1Events[1]];

    streamEvents(relay, allEvents, { interval: 20 });
    await new Promise<void>((resolve) => setTimeout(resolve, 120));

    // kind:1のみ受信
    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 2);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - snapshot restore + query", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // イベント登録
  const event1 = EventBuilder.kind1().id("ev1").content("first").build();
  relay.store(event1);

  // スナップショット取得
  const snap = snapshot(relay);

  // さらにイベント追加
  relay.store(EventBuilder.kind1().id("ev2").content("second").build());
  relay.store(EventBuilder.kind1().id("ev3").content("third").build());

  // 復元
  restore(relay, snap);

  // REQで確認
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const eventMsgs = messages.filter((m) => m[0] === "EVENT");
    assertEquals(eventMsgs.length, 1);
    assertEquals((eventMsgs[0][2] as { id: string }).id, "ev1");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - logging captures send/receive", async () => {
  const logs: LogEntry[] = [];
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    logging: (entry) => logs.push(entry),
  });

  relay.store(
    EventBuilder.kind1().id("ev1").content("hello").build(),
  );

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // receive (REQ) と send (EVENT, EOSE) がログされている
    const receives = logs.filter((l) => l.direction === "receive");
    const sends = logs.filter((l) => l.direction === "send");

    assertEquals(receives.length >= 1, true);
    assertEquals(sends.length >= 2, true); // EVENT + EOSE

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - stream + snapshot combined", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // 初期イベント
  relay.store(EventBuilder.kind1().id("initial").build());

  // スナップショット
  const snap = snapshot(relay);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // ストリームで3件追加
    const events = EventBuilder.bulk(3, { kind: 1 });
    const handle = streamEvents(relay, events, { interval: 20 });
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    handle.stop();

    // ストアに4件(initial + 3)
    const snapAfterStream = snapshot(relay);
    assertEquals(snapAfterStream.store.length, 4);

    // 復元すると1件に戻る
    restore(relay, snap);
    const snapAfterRestore = snapshot(relay);
    assertEquals(snapAfterRestore.store.length, 1);
    assertEquals(snapAfterRestore.store[0].id, "initial");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - startStream with snapshot save/restore", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // ストリーム開始前にスナップショット
    const snap = snapshot(relay);

    const handle = startStream(relay, {
      eventGenerator: () => EventBuilder.random({ kind: 1 }),
      interval: 20,
      count: 5,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    assertEquals(handle.stopped, true);

    // ストリーム後のストア
    const afterStream = snapshot(relay);
    assertEquals(afterStream.store.length, 5);

    // 復元
    restore(relay, snap);
    const afterRestore = snapshot(relay);
    assertEquals(afterRestore.store.length, 0);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});
