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

async function waitForCondition(condition: () => boolean): Promise<void> {
  await waitFor(condition, {
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

// ===== NIP間の組み合わせテスト =====

Deno.test("NIP combined - replaceable event deletion", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  // Replaceable イベントを登録
  const replEvent = EventBuilder.kind(10000).pubkey(pubkey)
    .content("replaceable").createdAt(100).build();
  relay.store(replEvent);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    // 削除リクエスト送信
    const deletion = EventBuilder.deletion([replEvent.id])
      .pubkey(pubkey).build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitForCondition(() => relay.deletedIds.has(replEvent.id));

    assertEquals(relay.deletedIds.has(replEvent.id), true);

    // REQ で取得できない
    const ws2 = await openWs("wss://relay.example.com");
    const msgs = collectMessages(ws2);
    ws2.send(JSON.stringify(["REQ", "sub1", { kinds: [10000] }]));

    await waitForMessageCount(msgs, 1);

    assertEquals(msgs.length, 1); // EOSE only

    await Promise.all([closeWs(ws), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP combined - ephemeral event COUNT returns 0", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // Ephemeral はストアに追加されない
  relay.store(EventBuilder.kind(20000).content("ephemeral").build());

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["COUNT", "c1", { kinds: [20000] }]));

    await waitForMessageCount(messages, 1);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 0);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP combined - search + kind filter combination", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("Hello Nostr world").build());
  relay.store(EventBuilder.kind7().content("Nostr reaction").build());
  relay.store(EventBuilder.kind1().content("Bitcoin rocks").build());

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // kind:1 AND search "nostr"
    ws.send(
      JSON.stringify(["REQ", "sub1", { kinds: [1], search: "nostr" }]),
    );

    await waitForMessageCount(messages, 2);

    // 1 EVENT (kind:1 + nostr) + EOSE = 2
    assertEquals(messages.length, 2);
    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].content, "Hello Nostr world");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP combined - parameterized replaceable deletion by a-tag", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const paramEvent = EventBuilder.kind(30000).pubkey(pubkey)
    .tag("d", "my-list").content("my list").build();
  relay.store(paramEvent);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const deletion = EventBuilder.deletionByAddress(
      [`30000:${pubkey}:my-list`],
    )
      .pubkey(pubkey).build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitForCondition(() => relay.deletedIds.has(paramEvent.id));

    assertEquals(relay.deletedIds.has(paramEvent.id), true);

    // COUNT should return 0 for kind:30000
    const ws2 = await openWs("wss://relay.example.com");
    const msgs = collectMessages(ws2);
    ws2.send(JSON.stringify(["COUNT", "c1", { kinds: [30000] }]));

    await waitForMessageCount(msgs, 1);

    const count = JSON.parse(msgs[0]);
    // kind:5 deletion event is in store, not kind:30000
    assertEquals(count[2].count, 0);

    await Promise.all([closeWs(ws), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP combined - COUNT with search filter", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("Hello Nostr").build());
  relay.store(EventBuilder.kind1().content("Hello Bitcoin").build());
  relay.store(EventBuilder.kind1().content("Goodbye Nostr").build());

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(
      JSON.stringify(["COUNT", "c1", { kinds: [1], search: "nostr" }]),
    );

    await waitForMessageCount(messages, 1);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 2);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
