import { assert, assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import type { NostrEvent } from "../src/types.ts";

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

/** WebSocketを開いて待機するヘルパー */
async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

/** メッセージを収集するヘルパー */
function collectMessages(ws: WebSocket): string[] {
  const messages: string[] = [];
  ws.addEventListener("message", (ev: MessageEvent) => {
    messages.push(ev.data as string);
  });
  return messages;
}

Deno.test("MockRelay - store and REQ returns matched events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1", kind: 1 }));
  relay.store(makeEvent({ id: "e2", kind: 0 }));
  relay.store(makeEvent({ id: "e3", kind: 1 }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // kind:1が2件 + EOSE
    assertEquals(messages.length, 3);

    const eventIds = messages.slice(0, 2).map((m) => JSON.parse(m)[2].id);
    assertEquals(eventIds.includes("e1"), true);
    assertEquals(eventIds.includes("e3"), true);

    const eose = JSON.parse(messages[2]);
    assertEquals(eose[0], "EOSE");
    assertEquals(eose[1], "sub1");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - onREQ handler overrides default", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "stored", kind: 1 }));

  const customEvent = makeEvent({ id: "custom", kind: 1 });
  relay.onREQ((_subId, _filters) => {
    return [customEvent];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 2); // EVENT + EOSE
    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[2].id, "custom");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - onEVENT handler", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((event) => {
    return ["OK", event.id, true, "custom: accepted"];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "sent1" });
    ws.send(JSON.stringify(["EVENT", event]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    const okMsg = JSON.parse(messages[0]);
    assertEquals(okMsg, ["OK", "sent1", true, "custom: accepted"]);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - default EVENT handler stores and returns OK", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "published" });
    ws.send(JSON.stringify(["EVENT", event]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    const okMsg = JSON.parse(messages[0]);
    assertEquals(okMsg, ["OK", "published", true, ""]);

    // ストアに追加されているか確認（REQで取得）
    ws.send(JSON.stringify(["REQ", "check", { ids: ["published"] }]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // EVENT + EOSE
    assertEquals(messages.length, 3);
    const eventMsg = JSON.parse(messages[1]);
    assertEquals(eventMsg[2].id, "published");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - verification helpers", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    collectMessages(ws);

    // REQ送信
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    ws.send(JSON.stringify(["REQ", "sub2", { kinds: [0] }]));

    // EVENT送信
    const event = makeEvent({ id: "evt1" });
    ws.send(JSON.stringify(["EVENT", event]));

    // CLOSE送信
    ws.send(JSON.stringify(["CLOSE", "sub1"]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // REQ検証
    assertEquals(relay.countREQs(), 2);
    assertEquals(relay.hasREQ("sub1"), true);
    assertEquals(relay.hasREQ("sub2"), true);
    assertEquals(relay.hasREQ("sub3"), false);

    const req = relay.findREQ("sub1");
    assertEquals(req?.[0], "REQ");
    assertEquals(req?.[1], "sub1");

    // EVENT検証
    assertEquals(relay.countEvents(), 1);
    assertEquals(relay.hasEvent("evt1"), true);
    assertEquals(relay.hasEvent("unknown"), false);

    const found = relay.findEvent("evt1");
    assertEquals(found?.id, "evt1");

    // CLOSE検証
    const close = relay.findCLOSE("sub1");
    assertEquals(close, ["CLOSE", "sub1"]);
    assertEquals(relay.findCLOSE("sub2"), undefined);

    // received
    assertEquals(relay.received.length, 4);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - reset clears state", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1" }));
  relay.onREQ(() => []);
  relay.onEVENT((e) => ["OK", e.id, true, ""]);

  relay.reset();

  // ストアが空であることを間接的に確認
  // (received もクリアされている)
  assertEquals(relay.received.length, 0);
  assertEquals(relay.countREQs(), 0);
  assertEquals(relay.countEvents(), 0);
});

// ===== 回帰テスト: Issue 1 - subId 接続間衝突 =====

Deno.test("Regression: subId does not collide across connections", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1", kind: 1, content: "hello" }));

  pool.install();
  try {
    // 2つの接続を開く
    const ws1 = await openWs("wss://relay.example.com");
    const ws2 = await openWs("wss://relay.example.com");
    const messages1 = collectMessages(ws1);
    const messages2 = collectMessages(ws2);

    // 同じ subId で購読
    ws1.send(JSON.stringify(["REQ", "same-sub", { kinds: [1] }]));
    ws2.send(JSON.stringify(["REQ", "same-sub", { kinds: [1] }]));

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    // 両方が EVENT + EOSE を受信
    assertEquals(messages1.length, 2, "ws1 should receive EVENT + EOSE");
    assertEquals(messages2.length, 2, "ws2 should receive EVENT + EOSE");

    assertEquals(JSON.parse(messages1[0])[0], "EVENT");
    assertEquals(JSON.parse(messages2[0])[0], "EVENT");

    // ws1 の購読を閉じても ws2 はブロードキャストを受信する
    ws1.send(JSON.stringify(["CLOSE", "same-sub"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 新しいイベントを publish
    relay.store(makeEvent({ id: "e2", kind: 1, content: "new" }));
    const ws3 = await openWs("wss://relay.example.com");
    ws3.send(JSON.stringify(["EVENT", makeEvent({ id: "e2", kind: 1 })]));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    // ws2 はまだ購読が残っているので新イベントのブロードキャストを受信
    const ws2Events = messages2.filter((m) => JSON.parse(m)[0] === "EVENT");
    assert(ws2Events.length >= 2, "ws2 should still receive broadcast events");

    ws1.close();
    ws2.close();
    ws3.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  } finally {
    pool.uninstall();
  }
});

// ===== 回帰テスト: Issue 2 - 不正メッセージでクラッシュしない =====

Deno.test("Regression: malformed EVENT message does not crash", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // EVENT without event object
    ws.send(JSON.stringify(["EVENT"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 接続がまだ有効で NOTICE が返る
    assertEquals(ws.readyState, WebSocket.OPEN);
    assert(messages.length >= 1, "should receive NOTICE for malformed EVENT");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("Regression: malformed REQ message does not crash", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // REQ without subId
    ws.send(JSON.stringify(["REQ"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(ws.readyState, WebSocket.OPEN);
    assert(messages.length >= 1, "should receive NOTICE for malformed REQ");
    assertEquals(JSON.parse(messages[0])[0], "NOTICE");

    // CLOSE without subId
    ws.send(JSON.stringify(["CLOSE"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assertEquals(ws.readyState, WebSocket.OPEN);

    // empty array
    ws.send(JSON.stringify([]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assertEquals(ws.readyState, WebSocket.OPEN);

    // non-array JSON
    ws.send(JSON.stringify("not-array"));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assertEquals(ws.readyState, WebSocket.OPEN);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== 回帰テスト: Issue 3 - store(kind:5) で削除処理が走る =====

Deno.test("Regression: store(kind:5) processes deletion", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const author = "author-pub";
  const target = makeEvent({ id: "target-event", pubkey: author, kind: 1 });
  const other = makeEvent({ id: "other-event", pubkey: "other-pub", kind: 1 });

  relay.store(target);
  relay.store(other);

  // kind:5 削除イベントを store() で追加
  const deletion = makeEvent({
    id: "deletion-event",
    pubkey: author,
    kind: 5,
    tags: [["e", "target-event"]],
  });
  const stored = relay.store(deletion);
  assertEquals(stored, true);

  // deletedIds に target-event が含まれる
  assert(
    relay.deletedIds.has("target-event"),
    "target should be in deletedIds",
  );
  // 他人のイベントは削除されていない
  assertEquals(relay.deletedIds.has("other-event"), false);

  // REQ で確認: target-event は返されない
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "check", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const eventMsgs = messages
      .map((m) => JSON.parse(m))
      .filter((m: unknown[]) => m[0] === "EVENT");
    const eventIds = eventMsgs.map((m: unknown[]) => (m[2] as NostrEvent).id);

    assertEquals(eventIds.includes("target-event"), false);
    assertEquals(eventIds.includes("other-event"), true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});
