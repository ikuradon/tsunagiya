import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

Deno.test("NIP-09 - kind:5 deletes event by e-tag", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).content("to delete")
    .build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
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

    setTimeout(() => {
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
      setTimeout(() => {
        assertEquals(msgs2.length, 1); // EOSE only
        assertEquals(JSON.parse(msgs2[0])[0], "EOSE");
        pool.uninstall();
        resolve();
      }, 50);
    }, 50);
  });
});

Deno.test("NIP-09 - pubkey mismatch prevents deletion", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const target = EventBuilder.kind1().pubkey("aabb").content("safe").build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey("different_pubkey")
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
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
      setTimeout(() => {
        assertEquals(msgs2.length, 2); // EVENT + EOSE
        pool.uninstall();
        resolve();
      }, 50);
    }, 50);
  });
});

Deno.test("NIP-09 - deleted event cannot be re-published", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).content("deleted").build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
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

    setTimeout(() => {
      assertEquals(messages.length, 2);
      const rejectOk = JSON.parse(messages[1]);
      assertEquals(rejectOk[0], "OK");
      assertEquals(rejectOk[2], false);
      assertEquals(rejectOk[3], "blocked: event was deleted");
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("NIP-09 - multiple events deleted with single kind:5", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target1 = EventBuilder.kind1().pubkey(pubkey).build();
  const target2 = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target1);
  relay.store(target2);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target1.id, target2.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      assertEquals(relay.deletedIds.has(target1.id), true);
      assertEquals(relay.deletedIds.has(target2.id), true);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("NIP-09 - a-tag deletes parameterized replaceable event", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind(30000).pubkey(pubkey)
    .tag("d", "my-list")
    .content("list content").build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletionByAddress(
        [`30000:${pubkey}:my-list`],
      )
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      assertEquals(relay.deletedIds.has(target.id), true);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("NIP-09 - kind:5 event itself is stored", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
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

    setTimeout(() => {
      // OK + EVENT(kind:5) + EOSE = 3
      assertEquals(messages.length, 3);
      const eventMsg = JSON.parse(messages[1]);
      assertEquals(eventMsg[0], "EVENT");
      assertEquals(eventMsg[2].kind, 5);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("NIP-09 - deletedIds getter returns correct set", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  assertEquals(relay.deletedIds.size, 0);
});

Deno.test("NIP-09 - reset clears deletedIds", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      assertEquals(relay.deletedIds.size, 1);
      relay.reset();
      assertEquals(relay.deletedIds.size, 0);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("NIP-09 - snapshot/restore preserves deletedIds", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      assertEquals(relay.deletedIds.has(target.id), true);
      const snap = relay.snapshot();
      relay.reset();
      assertEquals(relay.deletedIds.size, 0);
      relay.restore(snap);
      assertEquals(relay.deletedIds.has(target.id), true);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("NIP-09 - store() rejects deleted event IDs", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const target = EventBuilder.kind1().pubkey(pubkey).build();
  relay.store(target);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletion([target.id])
        .pubkey(pubkey)
        .build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      const result = relay.store(target);
      assertEquals(result, false);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

// ===== EventBuilder テスト =====

Deno.test("NIP-09 EventBuilder - deletion() creates kind:5 with e-tags", () => {
  const builder = EventBuilder.deletion(["id1", "id2"]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 2);
  assertEquals(event.tags[0], ["e", "id1"]);
  assertEquals(event.tags[1], ["e", "id2"]);
});

Deno.test("NIP-09 EventBuilder - deletionByAddress() creates kind:5 with a-tags", () => {
  const builder = EventBuilder.deletionByAddress(["30000:pubkey:d-tag"]);
  const event = builder.build();
  assertEquals(event.kind, 5);
  assertEquals(event.tags.length, 1);
  assertEquals(event.tags[0], ["a", "30000:pubkey:d-tag"]);
});
