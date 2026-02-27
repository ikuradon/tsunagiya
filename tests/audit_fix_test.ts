import { assert, assertEquals, assertThrows } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import type { NostrEvent } from "../src/types.ts";
import { assertReceivedREQ } from "../src/testing/assertions.ts";
import { streamEvents } from "../src/testing/stream.ts";

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

function collectMessages(ws: WebSocket): string[] {
  const messages: string[] = [];
  ws.addEventListener("message", (ev: MessageEvent) => {
    messages.push(ev.data as string);
  });
  return messages;
}

// ===== F-01: カスタムハンドラー例外処理 =====

Deno.test("F-01 onEVENT throw → OK false + errors", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((_event) => {
    return Promise.reject(new Error("handler crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["EVENT", makeEvent()]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "OK");
    assertEquals(parsed[2], false);
    assert(
      parsed[3].includes("error: internal error processing EVENT"),
      `OK message should contain error detail, got: ${parsed[3]}`,
    );

    assert(relay.errors.length > 0);
    assert(
      relay.errors.some((e) => e.includes("internal error processing EVENT")),
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("F-01 onREQ throw → CLOSED + errors", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onREQ((_subId, _filters) => {
    return Promise.reject(new Error("handler crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "CLOSED");
    assertEquals(parsed[1], "sub1");
    assert(
      parsed[2].includes("error: internal error processing REQ"),
      `CLOSED message should contain error detail, got: ${parsed[2]}`,
    );

    assert(
      relay.errors.some((e) => e.includes("internal error processing REQ")),
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("F-01 onCOUNT throw → NOTICE + errors", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT((_subId, _filters) => {
    return Promise.reject(new Error("handler crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("internal error processing COUNT"));

    assert(
      relay.errors.some((e) => e.includes("internal error processing COUNT")),
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("F-01 requireAuth validator throw → OK false + errors", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.requireAuth((_event: NostrEvent) => {
    return Promise.reject(new Error("validator crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // AUTH チャレンジを受信するのを待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // チャレンジを取得
    assert(messages.length >= 1, "should receive AUTH challenge");
    const challengeMsg = JSON.parse(messages[0]);
    assertEquals(challengeMsg[0], "AUTH");
    const challenge = challengeMsg[1] as string;
    messages.length = 0;

    // 正しいチャレンジタグ付き AUTH レスポンスを送信
    const authEvent = makeEvent({
      kind: 22242,
      id: "auth1",
      tags: [["challenge", challenge], ["relay", "wss://relay.example.com"]],
    });
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "OK");
    assertEquals(parsed[2], false);
    assert(
      parsed[3].includes("error: internal error processing AUTH"),
      `OK message should contain error detail, got: ${parsed[3]}`,
    );

    assert(
      relay.errors.some((e) => e.includes("internal error processing AUTH")),
    );
  } finally {
    pool.uninstall();
  }
});

// ===== F-02: streamEvents + kind:5 二重配信防止 =====

Deno.test("F-02 streamEvents + kind:5 → EVENT delivered once", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // 削除対象イベントをストアに追加
  relay.store(makeEvent({ id: "target1", kind: 1, pubkey: "pub1" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

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

// ===== F-03: assertReceivedREQ フィルター拡張 =====

Deno.test("F-03 assertReceivedREQ - since match", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], since: 1000 }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertReceivedREQ(relay, { kinds: [1], since: 1000 });
  } finally {
    pool.uninstall();
  }
});

Deno.test("F-03 assertReceivedREQ - until mismatch throws", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], until: 100 }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertThrows(
      () => assertReceivedREQ(relay, { until: 999 }),
      Error,
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("F-03 assertReceivedREQ - limit match", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], limit: 50 }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertReceivedREQ(relay, { limit: 50 });
  } finally {
    pool.uninstall();
  }
});

Deno.test("F-03 assertReceivedREQ - search mismatch throws", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(
      JSON.stringify(["REQ", "sub1", { kinds: [1], search: "hello" }]),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertThrows(
      () => assertReceivedREQ(relay, { search: "goodbye" }),
      Error,
    );
  } finally {
    pool.uninstall();
  }
});

// ===== F-04: 未知メッセージタイプ =====

Deno.test("F-04 unknown message type → NOTICE + errors", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["UNKNOWN", "data"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("unsupported message type"));
    assert(parsed[1].includes("UNKNOWN"));

    assert(
      relay.errors.some((e) => e.includes("unsupported message type")),
    );
  } finally {
    pool.uninstall();
  }
});
