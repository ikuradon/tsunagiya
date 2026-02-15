import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

// ===== NIP間の組み合わせテスト =====

Deno.test("Integration v0.2.0 - replaceable event deletion", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  // Replaceable イベントを登録
  const replEvent = EventBuilder.kind(10000).pubkey(pubkey)
    .content("replaceable").createdAt(100).build();
  relay.store(replEvent);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      // 削除リクエスト送信
      const deletion = EventBuilder.deletion([replEvent.id])
        .pubkey(pubkey).build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      assertEquals(relay.deletedIds.has(replEvent.id), true);

      // REQ で取得できない
      const ws2 = new WebSocket("wss://relay.example.com");
      const msgs: string[] = [];
      ws2.addEventListener("open", () => {
        ws2.send(JSON.stringify(["REQ", "sub1", { kinds: [10000] }]));
      });
      ws2.addEventListener("message", (e) => {
        msgs.push(e.data as string);
      });
      setTimeout(() => {
        assertEquals(msgs.length, 1); // EOSE only
        pool.uninstall();
        resolve();
      }, 50);
    }, 50);
  });
});

Deno.test("Integration v0.2.0 - ephemeral event COUNT returns 0", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // Ephemeral はストアに追加されない
  relay.store(EventBuilder.kind(20000).content("ephemeral").build());

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "c1", { kinds: [20000] }]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    setTimeout(() => {
      const count = JSON.parse(messages[0]);
      assertEquals(count[2].count, 0);
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("Integration v0.2.0 - search + kind filter combination", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("Hello Nostr world").build());
  relay.store(EventBuilder.kind7().content("Nostr reaction").build());
  relay.store(EventBuilder.kind1().content("Bitcoin rocks").build());

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      // kind:1 AND search "nostr"
      ws.send(
        JSON.stringify(["REQ", "sub1", { kinds: [1], search: "nostr" }]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    setTimeout(() => {
      // 1 EVENT (kind:1 + nostr) + EOSE = 2
      assertEquals(messages.length, 2);
      const eventMsg = JSON.parse(messages[0]);
      assertEquals(eventMsg[0], "EVENT");
      assertEquals(eventMsg[2].content, "Hello Nostr world");
      pool.uninstall();
      resolve();
    }, 50);
  });
});

Deno.test("Integration v0.2.0 - parameterized replaceable deletion by a-tag", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  const paramEvent = EventBuilder.kind(30000).pubkey(pubkey)
    .tag("d", "my-list").content("my list").build();
  relay.store(paramEvent);

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");

    ws.addEventListener("open", () => {
      const deletion = EventBuilder.deletionByAddress(
        [`30000:${pubkey}:my-list`],
      )
        .pubkey(pubkey).build();
      ws.send(JSON.stringify(["EVENT", deletion]));
    });

    setTimeout(() => {
      assertEquals(relay.deletedIds.has(paramEvent.id), true);

      // COUNT should return 0 for kind:30000
      const ws2 = new WebSocket("wss://relay.example.com");
      const msgs: string[] = [];
      ws2.addEventListener("open", () => {
        ws2.send(JSON.stringify(["COUNT", "c1", { kinds: [30000] }]));
      });
      ws2.addEventListener("message", (e) => {
        msgs.push(e.data as string);
      });
      setTimeout(() => {
        const count = JSON.parse(msgs[0]);
        // kind:5 deletion event is in store, not kind:30000
        assertEquals(count[2].count, 0);
        pool.uninstall();
        resolve();
      }, 50);
    }, 50);
  });
});

Deno.test("Integration v0.2.0 - COUNT with search filter", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("Hello Nostr").build());
  relay.store(EventBuilder.kind1().content("Hello Bitcoin").build());
  relay.store(EventBuilder.kind1().content("Goodbye Nostr").build());

  pool.install();
  return new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify(["COUNT", "c1", { kinds: [1], search: "nostr" }]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    setTimeout(() => {
      const count = JSON.parse(messages[0]);
      assertEquals(count[2].count, 2);
      pool.uninstall();
      resolve();
    }, 50);
  });
});
