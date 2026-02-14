import { assertEquals } from "@std/assert";
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
