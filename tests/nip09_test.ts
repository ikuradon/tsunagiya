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

Deno.test("NIP-09 deletion - deletes event by e-tag", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).content("to delete")
    .build();
  relay.store(target);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(
      () => messages.length >= 1 && relay.deletedIds.has(target.id),
      {
        timeout: 1000,
        interval: 5,
      },
    );

    const ok = JSON.parse(messages[0]);
    assertEquals(ok[0], "OK");
    assertEquals(ok[2], true);
    assertEquals(relay.deletedIds.has(target.id), true);

    // Verify target is removed from store
    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(JSON.stringify(["REQ", "sub1", { ids: [target.id] }]));

    await waitForMessageCount(msgs2, 1);

    assertEquals(msgs2.length, 1); // EOSE only
    assertEquals(JSON.parse(msgs2[0])[0], "EOSE");

    await Promise.all([closeWs(ws), closeWs(ws2)]);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target.id])
      .pubkey("different_pubkey")
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitForMessageCount(messages, 1);

    assertEquals(relay.deletedIds.has(target.id), false);

    // Target should still be in store
    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(JSON.stringify(["REQ", "sub1", { ids: [target.id] }]));

    await waitForMessageCount(msgs2, 2);

    assertEquals(msgs2.length, 2); // EVENT + EOSE

    await Promise.all([closeWs(ws), closeWs(ws2)]);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));
    await waitFor(
      () => messages.length >= 1 && relay.deletedIds.has(target.id),
      {
        timeout: 1000,
        interval: 5,
      },
    );

    ws.send(JSON.stringify(["EVENT", target]));
    await waitForMessageCount(messages, 2);

    assertEquals(messages.length, 2);
    const rejectOk = JSON.parse(messages[1]);
    assertEquals(rejectOk[0], "OK");
    assertEquals(rejectOk[2], false);
    assertEquals(rejectOk[3], "blocked: event was deleted");

    await closeWs(ws);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target1.id, target2.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(() => {
      return messages.length >= 1 &&
        relay.deletedIds.has(target1.id) &&
        relay.deletedIds.has(target2.id);
    }, {
      timeout: 1000,
      interval: 5,
    });

    assertEquals(relay.deletedIds.has(target1.id), true);
    assertEquals(relay.deletedIds.has(target2.id), true);

    await closeWs(ws);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletionByAddress(
      [`30000:${pubkey}:my-list`],
    )
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(
      () => messages.length >= 1 && relay.deletedIds.has(target.id),
      {
        timeout: 1000,
        interval: 5,
      },
    );

    assertEquals(relay.deletedIds.has(target.id), true);

    await closeWs(ws);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));
    await waitForMessageCount(messages, 1);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [5] }]));
    await waitForMessageCount(messages, 3);

    // OK + EVENT(kind:5) + EOSE = 3
    assertEquals(messages.length, 3);
    const eventMsg = JSON.parse(messages[1]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].kind, 5);

    await closeWs(ws);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(() => messages.length >= 1 && relay.deletedIds.size === 1, {
      timeout: 1000,
      interval: 5,
    });

    assertEquals(relay.deletedIds.size, 1);
    relay.reset();
    assertEquals(relay.deletedIds.size, 0);

    await closeWs(ws);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(
      () => messages.length >= 1 && relay.deletedIds.has(target.id),
      {
        timeout: 1000,
        interval: 5,
      },
    );

    assertEquals(relay.deletedIds.has(target.id), true);
    const snap = relay.snapshot();
    relay.reset();
    assertEquals(relay.deletedIds.size, 0);
    relay.restore(snap);
    assertEquals(relay.deletedIds.has(target.id), true);

    await closeWs(ws);
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
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(
      () => messages.length >= 1 && relay.deletedIds.has(target.id),
      {
        timeout: 1000,
        interval: 5,
      },
    );

    const result = relay.store(target);
    assertEquals(result, false);

    await closeWs(ws);
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
    const ws1 = await openWs("wss://relay.example.com");
    const received = collectMessages(ws1);

    // kinds:[5] で購読
    ws1.send(JSON.stringify(["REQ", "del-sub", { kinds: [5] }]));
    await waitForMessageCount(received, 1);

    // EOSE をクリア
    received.length = 0;

    // 送信側: 削除イベントを送信
    const ws2 = await openWs("wss://relay.example.com");

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .build();
    ws2.send(JSON.stringify(["EVENT", deletion]));
    await waitFor(() => {
      return received
        .map((d) => JSON.parse(d))
        .some((m: unknown[]) =>
          m[0] === "EVENT" && m[1] === "del-sub" &&
          (m[2] as { kind: number }).kind === 5
        );
    }, {
      timeout: 1000,
      interval: 5,
    });

    // 購読側に kind:5 イベントが配信されていることを確認
    const deletionEvents = received
      .map((d) => JSON.parse(d))
      .filter((m: unknown[]) =>
        m[0] === "EVENT" && m[1] === "del-sub" &&
        (m[2] as { kind: number }).kind === 5
      );
    assertEquals(deletionEvents.length, 1);

    await Promise.all([closeWs(ws1), closeWs(ws2)]);
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

Deno.test("NIP-09 EventBuilder.deletionByAddress() - creates kind:5 with a-tags and k-tags", () => {
  const builder = EventBuilder.deletionByAddress(["30000:pubkey:d-tag"]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 2);
  assertEquals(event.tags[0], ["a", "30000:pubkey:d-tag"]);
  assertEquals(event.tags[1], ["k", "30000"]);
});

Deno.test("NIP-09 EventBuilder.deletionByAddress() - deduplicates k-tags", () => {
  const builder = EventBuilder.deletionByAddress([
    "30000:pubkey:list1",
    "30000:pubkey:list2",
  ]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 3); // 2 a-tags + 1 k-tag
  assertEquals(event.tags[0], ["a", "30000:pubkey:list1"]);
  assertEquals(event.tags[1], ["a", "30000:pubkey:list2"]);
  assertEquals(event.tags[2], ["k", "30000"]);
});

Deno.test("NIP-09 EventBuilder.deletion() - adds k-tags when kinds specified", () => {
  const builder = EventBuilder.deletion(["id1"], [1, 30023]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 3);
  assertEquals(event.tags[0], ["e", "id1"]);
  assertEquals(event.tags[1], ["k", "1"]);
  assertEquals(event.tags[2], ["k", "30023"]);
});

Deno.test("NIP-09 deletion - a-tag does not delete event newer than deletion request", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const now = Math.floor(Date.now() / 1000);

  // ターゲットイベントの created_at が削除リクエストより後
  const target = EventBuilder.kind(30000).pubkey(pubkey)
    .tag("d", "my-list")
    .createdAt(now + 100)
    .content("newer content").build();
  relay.store(target);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletionByAddress(
      [`30000:${pubkey}:my-list`],
    )
      .pubkey(pubkey)
      .createdAt(now) // 削除リクエストはターゲットより古い
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitForMessageCount(messages, 1);

    // 削除リクエストは受理されるが、ターゲットは削除されない
    assertEquals(relay.deletedIds.has(target.id), false);

    // ターゲットがまだストアに存在することを確認
    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(
      JSON.stringify(["REQ", "sub1", { kinds: [30000], authors: [pubkey] }]),
    );

    await waitForMessageCount(msgs2, 2);

    assertEquals(msgs2.length, 2); // EVENT + EOSE
    assertEquals(JSON.parse(msgs2[0])[0], "EVENT");

    await Promise.all([closeWs(ws), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - e-tag does not delete event newer than deletion request", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const now = Math.floor(Date.now() / 1000);

  // ターゲットイベントの created_at が削除リクエストより後
  const target = EventBuilder.kind1().pubkey(pubkey)
    .createdAt(now + 100)
    .content("newer content").build();
  relay.store(target);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .createdAt(now) // 削除リクエストはターゲットより古い
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitForMessageCount(messages, 1);

    // 削除リクエストは受理されるが、ターゲットは削除されない
    assertEquals(relay.deletedIds.has(target.id), false);

    // ターゲットがまだストアに存在することを確認
    const ws2 = await openWs("wss://relay.example.com");
    const msgs2 = collectMessages(ws2);
    ws2.send(
      JSON.stringify(["REQ", "sub1", { ids: [target.id] }]),
    );

    await waitForMessageCount(msgs2, 2);

    assertEquals(msgs2.length, 2); // EVENT + EOSE
    assertEquals(JSON.parse(msgs2[0])[0], "EVENT");

    await Promise.all([closeWs(ws), closeWs(ws2)]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-09 deletion - e-tag deletes event with same created_at", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const now = Math.floor(Date.now() / 1000);

  // ターゲットと削除リクエストの created_at が同じ
  const target = EventBuilder.kind1().pubkey(pubkey)
    .createdAt(now)
    .content("same timestamp").build();
  relay.store(target);

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const deletion = EventBuilder.deletion([target.id])
      .pubkey(pubkey)
      .createdAt(now) // 同じタイムスタンプ
      .build();
    ws.send(JSON.stringify(["EVENT", deletion]));

    await waitFor(
      () => messages.length >= 1 && relay.deletedIds.has(target.id),
      {
        timeout: 1000,
        interval: 5,
      },
    );

    // created_at が等しい場合は削除される（<= 条件）
    assertEquals(relay.deletedIds.has(target.id), true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
