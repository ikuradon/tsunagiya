import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

Deno.test("NIP-09 deletion - deletes event by e-tag", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).content("to delete")
    .build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const ok = JSON.parse(messages[0]);
    assertEquals(ok[0], "OK");
    assertEquals(ok[2], true);
    assertEquals(relay.deletedIds.has(target.id), true);

    // Verify target is removed from store
    const ws2 = new WebSocket("wss://relay.example.com");
    const msgs2: string[] = [];
    ws2.addEventListener("open", () => {
      ws2.send(JSON.stringify(["REQ", "sub1", { ids: [target.id] }]));
    });
    ws2.addEventListener("message", (e) => {
      msgs2.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(msgs2.length, 1); // EOSE only
    assertEquals(JSON.parse(msgs2[0])[0], "EOSE");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - prevents deletion on pubkey mismatch", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const target = EventBuilder.kind1().pubkey("aabb").content("safe").build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey("different_pubkey")
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(relay.deletedIds.has(target.id), false);

    // Target should still be in store
    const ws2 = new WebSocket("wss://relay.example.com");
    const msgs2: string[] = [];
    ws2.addEventListener("open", () => {
      ws2.send(JSON.stringify(["REQ", "sub1", { ids: [target.id] }]));
    });
    ws2.addEventListener("message", (e) => {
      msgs2.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(msgs2.length, 2); // EVENT + EOSE
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - rejects re-publish of deleted event", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).content("deleted").build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));

      setTimeout(() => {
        ws.send(JSON.stringify(["EVENT", target]));
      }, 10);
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(messages.length, 2);
    const rejectOk = JSON.parse(messages[1]);
    assertEquals(rejectOk[0], "OK");
    assertEquals(rejectOk[2], false);
    assertEquals(rejectOk[3], "blocked: event was deleted");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - deletes multiple events with single kind:5", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target1 = EventBuilder.kind1().pubkey(pubkey).build();
  const target2 = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target1);
  relay.store(target2);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target1.id, target2.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(relay.deletedIds.has(target1.id), true);
    assertEquals(relay.deletedIds.has(target2.id), true);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - deletes parameterized replaceable event by a-tag", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind(30000).pubkey(pubkey)
    .tag("d", "my-list")
    .content("list content").build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletionByAddress(
        [`30000:${pubkey}:my-list`],
      )
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(relay.deletedIds.has(target.id), true);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - stores kind:5 event itself", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));

      setTimeout(() => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [5] }]));
      }, 10);
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // OK + EVENT(kind:5) + EOSE = 3
    assertEquals(messages.length, 3);
    const eventMsg = JSON.parse(messages[1]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].kind, 5);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - returns empty deletedIds set initially", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  assertEquals(relay.deletedIds.size, 0);
});

Deno.test("NIP-09 deletion - clears deletedIds on reset", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(relay.deletedIds.size, 1);
    relay.reset();
    assertEquals(relay.deletedIds.size, 0);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - preserves deletedIds across snapshot/restore", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assertEquals(relay.deletedIds.has(target.id), true);
    const snap = relay.snapshot();
    relay.reset();
    assertEquals(relay.deletedIds.size, 0);
    relay.restore(snap);
    assertEquals(relay.deletedIds.has(target.id), true);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - rejects store of deleted event IDs", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const result = relay.store(target);
    assertEquals(result, false);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - broadcasts kind:5 to subscribers in real-time", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).content("to delete")
    .build();
  relay.store(target);

  pool.install();
  try {
    // 購読側: kinds:[5] で削除イベントを待つ
    const ws1 = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws1.onopen = () => resolve();
    });

    const received: string[] = [];
    ws1.addEventListener("message", (e) => {
      received.push(e.data as string);
    });

    // kinds:[5] で購読
    ws1.send(JSON.stringify(["REQ", "del-sub", { kinds: [5] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    // EOSE をクリア
    received.length = 0;

    // 送信側: 削除イベントを送信
    const ws2 = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws2.onopen = () => resolve();
    });

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws2.send(JSON.stringify(["EVENT", deletion]));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // 購読側に kind:5 イベントが配信されていることを確認
    const deletionEvents = received
      .map((d) => JSON.parse(d))
      .filter((m: unknown[]) =>
        m[0] === "EVENT" && m[1] === "del-sub" &&
        (m[2] as { kind: number }).kind === 5
      );
    assertEquals(deletionEvents.length, 1);

    ws1.close();
    ws2.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  } finally {
    pool.uninstall();
  }
});

// ===== EventBuilder テスト =====

Deno.test("NIP-09 EventBuilder.deletion() - creates kind:5 with e-tags", () => {
  const builder = EventBuilder.deletion(["id1", "id2"]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 2);
  assertEquals(event.tags[0], ["e", "id1"]);
  assertEquals(event.tags[1], ["e", "id2"]);
});

Deno.test("NIP-09 EventBuilder.deletionByAddress() - creates kind:5 with a-tags", () => {
  const builder = EventBuilder.deletionByAddress(["30000:pubkey:d-tag"]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 1);
  assertEquals(event.tags[0], ["a", "30000:pubkey:d-tag"]);
});
