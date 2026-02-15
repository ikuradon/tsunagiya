import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import { getParameterizedId } from "../src/event_kind.ts";

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
    await new Promise<void>((resolve) => {
      const ws = new WebSocket("wss://relay.example.com");
      const messages: string[] = [];
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [30000] }]));
      });
      ws.addEventListener("message", (e) => {
        messages.push(e.data as string);
      });
      setTimeout(() => {
        assertEquals(messages.length, 2); // EVENT + EOSE
        const eventMsg = JSON.parse(messages[0]);
        assertEquals(eventMsg[2].content, "new");
        resolve();
      }, 50);
    });
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
    await new Promise<void>((resolve) => {
      const ws = new WebSocket("wss://relay.example.com");
      const messages: string[] = [];
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [30000] }]));
      });
      ws.addEventListener("message", (e) => {
        messages.push(e.data as string);
      });
      setTimeout(() => {
        assertEquals(messages.length, 3); // 2 EVENT + EOSE
        resolve();
      }, 50);
    });
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
    await new Promise<void>((resolve) => {
      const ws = new WebSocket("wss://relay.example.com");
      const messages: string[] = [];
      const pubkey = "aabb";

      ws.addEventListener("open", () => {
        const old = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "list")
          .createdAt(100).content("old").build();
        ws.send(JSON.stringify(["EVENT", old]));
        setTimeout(() => {
          const newer = EventBuilder.kind(30000).pubkey(pubkey).tag("d", "list")
            .createdAt(200).content("new").build();
          ws.send(JSON.stringify(["EVENT", newer]));
        }, 10);
      });
      ws.addEventListener("message", (e) => {
        messages.push(e.data as string);
      });

      setTimeout(() => {
        assertEquals(messages.length, 2); // 2 OK

        const ws2 = new WebSocket("wss://relay.example.com");
        const msgs2: string[] = [];
        ws2.addEventListener("open", () => {
          ws2.send(
            JSON.stringify(["REQ", "sub1", {
              kinds: [30000],
              authors: [pubkey],
            }]),
          );
        });
        ws2.addEventListener("message", (e) => {
          msgs2.push(e.data as string);
        });
        setTimeout(() => {
          assertEquals(msgs2.length, 2); // EVENT + EOSE
          const eventMsg = JSON.parse(msgs2[0]);
          assertEquals(eventMsg[2].content, "new");
          resolve();
        }, 50);
      }, 50);
    });
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
    await new Promise<void>((resolve) => {
      const ws = new WebSocket("wss://relay.example.com");
      const messages: string[] = [];
      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify(["REQ", "sub1", { kinds: [30000], "#d": ["alpha"] }]),
        );
      });
      ws.addEventListener("message", (e) => {
        messages.push(e.data as string);
      });
      setTimeout(() => {
        assertEquals(messages.length, 2); // EVENT + EOSE
        const eventMsg = JSON.parse(messages[0]);
        assertEquals(eventMsg[2].id, event1.id);
        resolve();
      }, 50);
    });
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
    await new Promise<void>((resolve) => {
      const ws = new WebSocket("wss://relay.example.com");
      const messages: string[] = [];
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [30000] }]));
      });
      ws.addEventListener("message", (e) => {
        messages.push(e.data as string);
      });
      setTimeout(() => {
        assertEquals(messages.length, 3); // 2 EVENT + EOSE
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});
