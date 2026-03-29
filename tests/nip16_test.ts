import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import { waitFor } from "../src/testing/wait.ts";

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

function collectMessages(ws: WebSocket): string[] {
  const messages: string[] = [];
  ws.addEventListener("message", (e) => {
    messages.push(e.data as string);
  });
  return messages;
}

async function waitForMessageCount(
  messages: string[],
  count: number,
): Promise<void> {
  await waitFor(() => messages.length >= count, {
    timeout: 1000,
    interval: 5,
  });
}

async function closeWs(ws: WebSocket): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve(), { once: true });
  });
  ws.close();
  await closed;
}

// ===== NIP-16: store() の種別対応 =====

Deno.test("NIP-16 store - regular event is stored normally", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  const event = EventBuilder.kind1().content("hello").build();
  const result = relay.store(event);
  assertEquals(result, true);
});

Deno.test("NIP-16 store - replaceable event replaces same kind+pubkey", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const old = EventBuilder.kind(10000).pubkey(pubkey).createdAt(100).build();
  const newer = EventBuilder.kind(10000).pubkey(pubkey).createdAt(200).build();

  relay.store(old);
  relay.store(newer);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [10000] }]));

    await waitForMessageCount(messages, 2);

    assertEquals(messages.length, 2); // EVENT + EOSE
    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].id, newer.id);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-16 store - replaceable event ignores older event", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const newer = EventBuilder.kind(10000).pubkey(pubkey).createdAt(200).build();
  const old = EventBuilder.kind(10000).pubkey(pubkey).createdAt(100).build();

  relay.store(newer);
  const result = relay.store(old);
  assertEquals(result, false);
});

Deno.test("NIP-16 store - ephemeral event is not stored", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event = EventBuilder.kind(20000).content("ephemeral").build();
  const result = relay.store(event);
  assertEquals(result, false);
});

Deno.test("NIP-16 store - ephemeral event broadcasts to subscriptions", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [20000] }]));

    await waitForMessageCount(messages, 1);

    // EOSE のみ（ストアにないので）
    assertEquals(messages.length, 1);
    const eose = JSON.parse(messages[0]);
    assertEquals(eose[0], "EOSE");

    // サブスクリプション登録後に ephemeral イベントをブロードキャスト
    const ephEvent = EventBuilder.kind(20000).content("live").build();
    relay.store(ephEvent);
    relay.broadcast(ephEvent);

    await waitForMessageCount(messages, 2);

    // EOSE + EVENT の2つ
    assertEquals(messages.length, 2);
    const eventMsg = JSON.parse(messages[1]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].content, "live");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-16 store - different pubkey replaceable events coexist", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event1 = EventBuilder.kind(10000).pubkey("aabb").createdAt(100).build();
  const event2 = EventBuilder.kind(10000).pubkey("ccdd").createdAt(100).build();

  relay.store(event1);
  relay.store(event2);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [10000] }]));

    await waitForMessageCount(messages, 3);

    // 2 EVENT + EOSE = 3
    assertEquals(messages.length, 3);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== NIP-16: #handleEvent の種別対応 =====

Deno.test("NIP-16 handleEvent - ephemeral returns OK but not stored", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const event = EventBuilder.kind(20000).content("ephemeral").build();
    ws.send(JSON.stringify(["EVENT", event]));

    await waitForMessageCount(messages, 1);

    assertEquals(messages.length, 1);
    const ok = JSON.parse(messages[0]);
    assertEquals(ok[0], "OK");
    assertEquals(ok[2], true);

    // ストアには追加されていない → REQ で取得できない
    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(JSON.stringify(["REQ", "sub1", { kinds: [20000] }]));

    await waitForMessageCount(msgs2, 1);

    // EOSE のみ
    assertEquals(msgs2.length, 1);
    assertEquals(JSON.parse(msgs2[0])[0], "EOSE");

    await Promise.all([closeWs(ws), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-16 handleEvent - replaceable replaces via client EVENT", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const pubkey = "aabb";

    const old = EventBuilder.kind(10000).pubkey(pubkey).createdAt(100)
      .content("old").build();
    ws.send(JSON.stringify(["EVENT", old]));
    await waitForMessageCount(messages, 1);

    const newer = EventBuilder.kind(10000).pubkey(pubkey).createdAt(200)
      .content("new").build();
    ws.send(JSON.stringify(["EVENT", newer]));
    await waitForMessageCount(messages, 2);

    // 2 OK messages
    assertEquals(messages.length, 2);

    // Verify store only has the newer
    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(
      JSON.stringify(["REQ", "sub1", {
        kinds: [10000],
        authors: [pubkey],
      }]),
    );

    await waitForMessageCount(msgs2, 2);

    assertEquals(msgs2.length, 2); // EVENT + EOSE
    const eventMsg = JSON.parse(msgs2[0]);
    assertEquals(eventMsg[2].content, "new");

    await Promise.all([closeWs(ws), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-16 handleEvent - onEVENT handler skips auto-processing", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((event) => {
    return ["OK", event.id, true, "custom"];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const event = EventBuilder.kind(10000).content("test").build();
    ws.send(JSON.stringify(["EVENT", event]));

    await waitForMessageCount(messages, 1);

    const ok = JSON.parse(messages[0]);
    assertEquals(ok[3], "custom");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
