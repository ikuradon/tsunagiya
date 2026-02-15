import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

Deno.test("NIP-45 COUNT - basic count returns correct number", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // Store 3 kind:1 events
  for (let i = 0; i < 3; i++) {
    relay.store(EventBuilder.kind1().content(`msg ${i}`).build());
  }

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assertEquals(messages.length, 1);
        const count = JSON.parse(messages[0]);
        assertEquals(count[0], "COUNT");
        assertEquals(count[1], "count1");
        assertEquals(count[2].count, 3);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - returns 0 for no matches", () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 0);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - multiple filters (OR)", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("text").build());
  relay.store(EventBuilder.kind7().content("+").build());

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify(["COUNT", "count1", { kinds: [1] }, { kinds: [7] }]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 2);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - custom onCOUNT handler", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT((_subId, _filters) => {
    return { count: 42 };
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 42);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - async onCOUNT handler", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT(async (_subId, _filters) => {
    await new Promise((r) => setTimeout(r, 5));
    return { count: 99 };
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 99);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - with author filter", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const pubkey = "aabb";
  relay.store(EventBuilder.kind1().pubkey(pubkey).build());
  relay.store(EventBuilder.kind1().pubkey(pubkey).build());
  relay.store(EventBuilder.kind1().pubkey("ccdd").build());

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify(["COUNT", "count1", { kinds: [1], authors: [pubkey] }]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 2);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

// ===== 検証ヘルパー =====

Deno.test("NIP-45 - countCOUNTs() counts COUNT messages", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));
      ws.send(JSON.stringify(["COUNT", "c2", { kinds: [7] }]));
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assertEquals(relay.countCOUNTs(), 2);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 - findCOUNT() finds by subId", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "my-count", { kinds: [1] }]));
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const found = relay.findCOUNT("my-count");
        assertEquals(found?.[0], "COUNT");
        assertEquals(found?.[1], "my-count");
        assertEquals(relay.findCOUNT("nonexistent"), undefined);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 - hasCOUNT() checks existence", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assertEquals(relay.hasCOUNT("c1"), true);
        assertEquals(relay.hasCOUNT("c2"), false);
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - deduplicates events across filters", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const event = EventBuilder.kind1().content("unique").build();
  relay.store(event);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      // Both filters match the same event
      ws.send(
        JSON.stringify([
          "COUNT",
          "count1",
          { kinds: [1] },
          { ids: [event.id] },
        ]),
      );
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 1); // Not 2
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-45 COUNT - reset clears countHandler", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT(() => ({ count: 999 }));
  relay.reset();

  // After reset, default counting should be used
  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));
    });
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const count = JSON.parse(messages[0]);
        assertEquals(count[2].count, 0); // Not 999
        resolve();
      }, 50);
    });
  } finally {
    pool.uninstall();
  }
});
