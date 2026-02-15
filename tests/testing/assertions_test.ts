import { assertThrows } from "@std/assert";
import { MockPool } from "../../src/pool.ts";
import {
  assertAuthCompleted,
  assertClosed,
  assertEventPublished,
  assertNoErrors,
  assertReceived,
  assertReceivedREQ,
} from "../../src/testing/assertions.ts";
import { EventBuilder } from "../../src/testing/event_builder.ts";

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

Deno.test("assertReceivedREQ - passes when matching REQ found", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // should not throw
    assertReceivedREQ(relay, { kinds: [1] });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertReceivedREQ - throws when no matching REQ", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertThrows(
      () => assertReceivedREQ(relay, { kinds: [0] }),
      Error,
      "Expected REQ",
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertEventPublished - passes when event found", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const event = EventBuilder.kind1().id("pub-event").build();
    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEventPublished(relay, "pub-event");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertEventPublished - throws when not found", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  assertThrows(
    () => assertEventPublished(relay, "nonexistent"),
    Error,
    "Expected EVENT",
  );
});

Deno.test("assertNoErrors - passes on empty relay", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // should not throw
  assertNoErrors(relay);
});

Deno.test("assertNoErrors - passes when no errors", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const event = EventBuilder.kind1().id("ok-event").build();
    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // should not throw
    assertNoErrors(relay);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertNoErrors - throws when EVENT rejected", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // EVENTを拒否するハンドラー
  relay.onEVENT((event) => {
    return ["OK", event.id, false, "blocked: spam"];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const event = EventBuilder.kind1().id("spam-event").build();
    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertThrows(
      () => assertNoErrors(relay),
      Error,
      "Expected no errors",
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertNoErrors - throws on auth-required rejection", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.com", { requiresAuth: true });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.com");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 認証せずにREQを送信
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const relay = pool.relay("wss://auth.relay.com");
    assertThrows(
      () => assertNoErrors(relay),
      Error,
      "Expected no errors",
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertAuthCompleted - passes when AUTH received", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.requireAuth(() => true);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    // AUTHチャレンジを受信
    const challenge = await new Promise<string>((resolve) => {
      ws.onmessage = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data as string);
        if (msg[0] === "AUTH") resolve(msg[1]);
      };
    });

    // AUTH応答を送信
    const authEvent = EventBuilder.kind(22242)
      .tag("challenge", challenge)
      .tag("relay", "wss://relay.example.com")
      .build();
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertAuthCompleted(relay);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertAuthCompleted - throws when no AUTH", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  assertThrows(
    () => assertAuthCompleted(relay),
    Error,
    "Expected AUTH",
  );
});

Deno.test("assertClosed - passes when CLOSE found", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["CLOSE", "sub1"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertClosed(relay, "sub1");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertClosed - throws when not found", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  assertThrows(
    () => assertClosed(relay, "sub1"),
    Error,
    'Expected CLOSE for subscription "sub1"',
  );
});

Deno.test("assertReceived - custom predicate passes", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceived(relay, (messages) => {
      return messages.some((m) => m[0] === "REQ" && m[1] === "sub1");
    });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertReceived - custom predicate throws on false", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  assertThrows(
    () => assertReceived(relay, () => false),
    Error,
    "Custom assertion failed",
  );
});

// ===== assertReceivedREQ with tag filters =====

Deno.test("assertReceivedREQ - matches tag filters", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(
      JSON.stringify(["REQ", "sub1", { kinds: [1], "#p": ["pubkey123"] }]),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceivedREQ(relay, { "#p": ["pubkey123"] });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});
