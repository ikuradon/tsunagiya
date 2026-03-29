import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import { waitFor } from "../src/testing/wait.ts";
import { getParameterizedId } from "../src/event_kind.ts";

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

Deno.test("NIP-33 store - parameterized replaceable replaces by kind+pubkey+d-tag", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const old = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "profile")
    .createdAt(100).content("old").build();
  const newer = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "profile")
    .createdAt(200).content("new").build();

  relay.store(old);
  relay.store(newer);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [30000] }]));

    await waitForMessageCount(messages, 2);

    assertEquals(messages.length, 2); // EVENT + EOSE
    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[2].content, "new");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-33 store - different d-tags are separate events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const event1 = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "alpha")
    .createdAt(100).build();
  const event2 = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "beta")
    .createdAt(100).build();

  relay.store(event1);
  relay.store(event2);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [30000] }]));

    await waitForMessageCount(messages, 3);

    assertEquals(messages.length, 3); // 2 EVENT + EOSE

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-33 store - no d-tag treated as empty string", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const noTag = EventBuilder.kind(30000).pubkey(pubkey).createdAt(100).build();
  const emptyTag = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "")
    .createdAt(200).build();

  relay.store(noTag);
  const result = relay.store(emptyTag);
  assertEquals(result, true);

  assertEquals(getParameterizedId(noTag), `30000:${pubkey}:`);
  assertEquals(getParameterizedId(emptyTag), `30000:${pubkey}:`);
});

Deno.test("NIP-33 store - older parameterized event is ignored", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const newer = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "test")
    .createdAt(200).build();
  const old = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "test")
    .createdAt(100).build();

  relay.store(newer);
  const result = relay.store(old);
  assertEquals(result, false);
});

Deno.test("NIP-33 handleEvent - parameterized replaceable via client EVENT", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const pubkey = "aabb";

    const old = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "list")
      .createdAt(100).content("old").build();
    ws.send(JSON.stringify(["EVENT", old]));
    await waitForMessageCount(messages, 1);

    const newer = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "list")
      .createdAt(200).content("new").build();
    ws.send(JSON.stringify(["EVENT", newer]));
    await waitForMessageCount(messages, 2);

    assertEquals(messages.length, 2); // 2 OK

    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(
      JSON.stringify(["REQ", "sub1", {
        kinds: [30000],
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

Deno.test("NIP-33 - #d tag filter works with parameterized replaceable", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const event1 = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "alpha")
    .build();
  const event2 = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "beta")
    .build();

  relay.store(event1);
  relay.store(event2);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(
      JSON.stringify(["REQ", "sub1", { kinds: [30000], "#d": ["alpha"] }]),
    );

    await waitForMessageCount(messages, 2);

    assertEquals(messages.length, 2); // EVENT + EOSE
    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[2].id, event1.id);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-33 - different pubkey with same d-tag are separate", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event1 = EventBuilder.kind(30000).pubkey("aabb").tag("d", "same")
    .createdAt(100).build();
  const event2 = EventBuilder.kind(30000).pubkey("ccdd").tag("d", "same")
    .createdAt(100).build();

  relay.store(event1);
  relay.store(event2);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [30000] }]));

    await waitForMessageCount(messages, 3);

    assertEquals(messages.length, 3); // 2 EVENT + EOSE

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
