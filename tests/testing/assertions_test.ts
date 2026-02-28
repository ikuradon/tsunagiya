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
  pool.relay("wss://auth.relay.test", { requiresAuth: true });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 認証せずにREQを送信
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const relay = pool.relay("wss://auth.relay.test");
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

Deno.test("assertAuthCompleted - throws when AUTH sent but validation fails", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // バリデーターは常に false を返す
  relay.requireAuth(() => false);

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

    // AUTH応答を送信（バリデーターは失敗する）
    const authEvent = EventBuilder.kind(22242)
      .tag("challenge", challenge)
      .tag("relay", "wss://relay.example.com")
      .build();
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // AUTH は送信されたが認証失敗 → assertAuthCompleted はスローする
    assertThrows(
      () => assertAuthCompleted(relay),
      Error,
      "no successful authentication found",
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
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

// ===== assertReceivedREQ filter matching (since/until/limit/search) =====

Deno.test("assertReceivedREQ - matches since filter", async () => {
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

Deno.test("assertReceivedREQ - throws on until mismatch", async () => {
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

Deno.test("assertReceivedREQ - matches limit filter", async () => {
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

Deno.test("assertReceivedREQ - throws on search mismatch", async () => {
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

// ===== assertReceivedREQ with various filter fields =====

Deno.test("assertReceivedREQ - matches authors filter", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay2.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay2.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { authors: ["pk1"] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceivedREQ(relay, { authors: ["pk1"] });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertReceivedREQ - matches ids filter", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay3.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay3.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { ids: ["eventid1"] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceivedREQ(relay, { ids: ["eventid1"] });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertReceivedREQ - matches since filter field", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay4.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay4.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { since: 1700000000 }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceivedREQ(relay, { since: 1700000000 });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertReceivedREQ - matches limit filter field", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay5.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay5.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { limit: 10 }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceivedREQ(relay, { limit: 10 });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== failure path: no REQs at all =====

Deno.test("assertReceivedREQ - throws when no REQs received at all", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  assertThrows(
    () => assertReceivedREQ(relay, { kinds: [1] }),
    Error,
    "Received 0 REQ(s)",
  );
});

// ===== failure path: assertEventPublished with other events present =====

Deno.test("assertEventPublished - throws when other events exist but not the target", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const event = EventBuilder.kind1().id("other-event").build();
    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertThrows(
      () => assertEventPublished(relay, "missing-event"),
      Error,
      "Expected EVENT",
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== failure path: assertClosed with wrong subscription ID =====

Deno.test("assertClosed - throws when different subscription closed", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["CLOSE", "sub1"]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertThrows(
      () => assertClosed(relay, "sub2"),
      Error,
      'Expected CLOSE for subscription "sub2"',
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== failure path: assertReceived with messages present but predicate fails =====

Deno.test("assertReceived - throws when predicate fails with messages present", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertThrows(
      () =>
        assertReceived(relay, (messages) => {
          return messages.some((m) => m[0] === "EVENT");
        }),
      Error,
      "Custom assertion failed",
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("assertReceivedREQ - matches #e tag filter", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay6.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay6.example.com");
    ws.send(JSON.stringify(["REQ", "sub1", { "#e": ["eventref1"] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertReceivedREQ(relay, { "#e": ["eventref1"] });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});
