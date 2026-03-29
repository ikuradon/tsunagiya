import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { waitFor } from "../src/testing/wait.ts";
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

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

async function closeWs(ws: WebSocket): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve(), { once: true });
  });
  ws.close();
  await closed;
}

async function waitForMessageCount(
  messages: unknown[][],
  count: number,
): Promise<void> {
  await waitFor(() => messages.length >= count, {
    timeout: 1000,
    interval: 5,
  });
}

Deno.test("Integration - basic REQ/EVENT flow", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1", kind: 1, content: "first" }));
  relay.store(makeEvent({ id: "e2", kind: 1, content: "second" }));
  relay.store(makeEvent({ id: "e3", kind: 0, content: "metadata" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const received: unknown[][] = [];
    ws.onmessage = (ev: MessageEvent) => {
      received.push(JSON.parse(ev.data as string));
    };

    // kind:1のイベントだけ取得
    ws.send(JSON.stringify(["REQ", "timeline", { kinds: [1] }]));

    await waitForMessageCount(received, 3);

    // EVENT 2件 + EOSE
    assertEquals(received.length, 3);
    assertEquals(received[0][0], "EVENT");
    assertEquals(received[1][0], "EVENT");
    assertEquals(received[2][0], "EOSE");
    assertEquals(received[2][1], "timeline");

    // 取得したイベントはkind:1のみ
    const eventKinds = received
      .filter((m) => m[0] === "EVENT")
      .map((m) => (m[2] as NostrEvent).kind);
    assertEquals(eventKinds, [1, 1]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - publish and retrieve event", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const received: unknown[][] = [];
    ws.onmessage = (ev: MessageEvent) => {
      received.push(JSON.parse(ev.data as string));
    };

    // イベントを投稿
    const event = makeEvent({ id: "published1", content: "new post" });
    ws.send(JSON.stringify(["EVENT", event]));

    await waitForMessageCount(received, 1);

    // OK応答を受信
    assertEquals(received.length, 1);
    assertEquals(received[0], ["OK", "published1", true, ""]);

    // 投稿したイベントをREQで取得
    ws.send(
      JSON.stringify(["REQ", "verify", { ids: ["published1"] }]),
    );

    await waitForMessageCount(received, 3);

    // EVENT + EOSE
    assertEquals(received.length, 3);
    assertEquals(received[1][0], "EVENT");
    assertEquals((received[1][2] as NostrEvent).id, "published1");
    assertEquals(received[2][0], "EOSE");

    // 検証ヘルパーで確認
    assertEquals(relay.hasEvent("published1"), true);
    assertEquals(relay.countEvents(), 1);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - multiple relays", async () => {
  const pool = new MockPool();
  const relay1 = pool.relay("wss://relay1.example.com");
  const relay2 = pool.relay("wss://relay2.example.com");

  relay1.store(makeEvent({ id: "from-r1", content: "relay1" }));
  relay2.store(makeEvent({ id: "from-r2", content: "relay2" }));

  pool.install();
  try {
    const ws1 = await openWs("wss://relay1.example.com");
    const ws2 = await openWs("wss://relay2.example.com");

    assertEquals(pool.connections.size, 2);

    const messages1: unknown[][] = [];
    const messages2: unknown[][] = [];

    ws1.onmessage = (ev: MessageEvent) => {
      messages1.push(JSON.parse(ev.data as string));
    };
    ws2.onmessage = (ev: MessageEvent) => {
      messages2.push(JSON.parse(ev.data as string));
    };

    ws1.send(JSON.stringify(["REQ", "s1", { kinds: [1] }]));
    ws2.send(JSON.stringify(["REQ", "s2", { kinds: [1] }]));

    await Promise.all([
      waitForMessageCount(messages1, 2),
      waitForMessageCount(messages2, 2),
    ]);

    // relay1のイベントはws1で受信
    assertEquals(messages1.length, 2); // EVENT + EOSE
    assertEquals((messages1[0][2] as NostrEvent).id, "from-r1");

    // relay2のイベントはws2で受信
    assertEquals(messages2.length, 2); // EVENT + EOSE
    assertEquals((messages2[0][2] as NostrEvent).id, "from-r2");

    await Promise.all([closeWs(ws1), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - custom REQ handler override", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "stored", kind: 1 }));

  // カスタムハンドラーで別のイベントを返す
  relay.onREQ((subId, _filters) => {
    return [makeEvent({ id: `custom-${subId}`, kind: 1 })];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const received: unknown[][] = [];
    ws.onmessage = (ev: MessageEvent) => {
      received.push(JSON.parse(ev.data as string));
    };

    ws.send(JSON.stringify(["REQ", "mysub", { kinds: [1] }]));

    await waitForMessageCount(received, 2);

    // ストアのイベントではなくカスタムハンドラーの結果
    assertEquals(received.length, 2); // EVENT + EOSE
    assertEquals((received[0][2] as NostrEvent).id, "custom-mysub");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("Integration - CLOSE unsubscribes", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const received: unknown[][] = [];
    ws.onmessage = (ev: MessageEvent) => {
      received.push(JSON.parse(ev.data as string));
    };

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await waitForMessageCount(received, 1);

    // EOSE受信
    assertEquals(received.length, 1); // EOSE only (no stored events)
    assertEquals(received[0][0], "EOSE");

    // CLOSE送信
    ws.send(JSON.stringify(["CLOSE", "sub1"]));

    await waitFor(() => relay.findCLOSE("sub1") !== undefined, {
      timeout: 1000,
      interval: 5,
    });

    // 検証
    assertEquals(relay.hasREQ("sub1"), true);
    assertEquals(relay.findCLOSE("sub1"), ["CLOSE", "sub1"]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
