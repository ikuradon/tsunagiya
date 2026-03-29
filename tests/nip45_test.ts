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

async function waitForMessageCount(
  messages: string[],
  count: number,
): Promise<void> {
  await waitFor(() => messages.length >= count, {
    timeout: 1000,
    interval: 5,
  });
}

async function waitForCountMessage(
  relay: { hasCOUNT(subId: string): boolean },
  subId: string,
  messages: string[],
  count = 1,
): Promise<void> {
  await Promise.all([
    waitForMessageCount(messages, count),
    waitFor(() => relay.hasCOUNT(subId), {
      timeout: 1000,
      interval: 5,
    }),
  ]);
}

Deno.test("NIP-45 COUNT - returns correct count for matching events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // Store 3 kind:1 events
  for (let i = 0; i < 3; i++) {
    relay.store(EventBuilder.kind1().content(`msg ${i}`).build());
  }

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));

    await waitForCountMessage(relay, "count1", messages);

    assertEquals(messages.length, 1);
    const count = JSON.parse(messages[0]);
    assertEquals(count[0], "COUNT");
    assertEquals(count[1], "count1");
    assertEquals(count[2].count, 3);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - returns 0 for no matches", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));

    await waitForCountMessage(relay, "count1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 0);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - applies OR logic across multiple filters", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("text").build());
  relay.store(EventBuilder.kind7().content("+").build());

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(
      JSON.stringify(["COUNT", "count1", { kinds: [1] }, { kinds: [7] }]),
    );

    await waitForCountMessage(relay, "count1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - uses custom onCOUNT handler", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT((_subId, _filters) => {
    return { count: 42 };
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));

    await waitForCountMessage(relay, "count1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 42);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - supports async onCOUNT handler", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT(async (_subId, _filters) => {
    await new Promise((r) => setTimeout(r, 5));
    return { count: 99 };
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));

    await waitForCountMessage(relay, "count1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 99);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - filters count by author", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  relay.store(EventBuilder.kind1().pubkey(pubkey).build());
  relay.store(EventBuilder.kind1().pubkey(pubkey).build());
  relay.store(EventBuilder.kind1().pubkey("ccdd").build());

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(
      JSON.stringify(["COUNT", "count1", { kinds: [1], authors: [pubkey] }]),
    );

    await waitForCountMessage(relay, "count1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - applies limit before counting", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().createdAt(1000).build());
  relay.store(EventBuilder.kind1().createdAt(2000).build());
  relay.store(EventBuilder.kind1().createdAt(3000).build());

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(JSON.stringify(["COUNT", "count-limit", {
      kinds: [1],
      limit: 2,
    }]));

    await waitForCountMessage(relay, "count-limit", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 2);
  } finally {
    pool.uninstall();
  }
});

// ===== 検証ヘルパー =====

Deno.test("NIP-45 verification - countCOUNTs() counts COUNT messages", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));
    ws.send(JSON.stringify(["COUNT", "c2", { kinds: [7] }]));

    await waitFor(() => relay.countCOUNTs() === 2, {
      timeout: 1000,
      interval: 5,
    });

    assertEquals(relay.countCOUNTs(), 2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 verification - findCOUNT() finds by subId", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["COUNT", "my-count", { kinds: [1] }]));

    await waitFor(() => relay.hasCOUNT("my-count"), {
      timeout: 1000,
      interval: 5,
    });

    const found = relay.findCOUNT("my-count");
    assertEquals(found?.[0], "COUNT");
    assertEquals(found?.[1], "my-count");
    assertEquals(relay.findCOUNT("nonexistent"), undefined);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 verification - hasCOUNT() checks existence", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));

    await waitFor(() => relay.hasCOUNT("c1"), {
      timeout: 1000,
      interval: 5,
    });

    assertEquals(relay.hasCOUNT("c1"), true);
    assertEquals(relay.hasCOUNT("c2"), false);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - deduplicates events across filters", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event = EventBuilder.kind1().content("unique").build();
  relay.store(event);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(
      JSON.stringify([
        "COUNT",
        "count1",
        { kinds: [1] },
        { ids: [event.id] },
      ]),
    );

    await waitForCountMessage(relay, "count1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 1); // Not 2
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - clears onCOUNT handler on reset", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT(() => ({ count: 999 }));
  relay.reset();

  // After reset, default counting should be used
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });
    ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));

    await waitForCountMessage(relay, "c1", messages);

    const count = JSON.parse(messages[0]);
    assertEquals(count[2].count, 0); // Not 999
  } finally {
    pool.uninstall();
  }
});
