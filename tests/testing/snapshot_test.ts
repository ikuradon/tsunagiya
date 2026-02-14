import { assertEquals } from "@std/assert";
import { MockPool } from "../../src/pool.ts";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { restore, snapshot } from "../../src/testing/snapshot.ts";

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
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const snap = snapshot(relay);

    ws.send(JSON.stringify(["REQ", "sub2", { kinds: [0] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.received.length, 2);

    restore(relay, snap);

    assertEquals(relay.received.length, 1);
    assertEquals(relay.received[0][0], "REQ");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
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

Deno.test("snapshot - empty relay produces empty snapshot", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const snap = snapshot(relay);
  assertEquals(snap.store.length, 0);
  assertEquals(snap.received.length, 0);
});
