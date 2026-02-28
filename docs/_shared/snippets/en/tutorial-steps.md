Minimal test:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { assertEquals } from "@std/assert";

Deno.test("fetch events from relay", async () => {
  // 1. Setup
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // Register test data
  relay.store({
    id: "event1",
    pubkey: "pubkey1",
    kind: 1,
    content: "Hello, Nostr!",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  // 2. Replace WebSocket
  pool.install();
  try {
    // 3. Code under test
    const ws = new WebSocket("wss://relay.example.com");
    const events: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") {
          events.push(msg[2]);
        }
        if (msg[0] === "EOSE") {
          ws.close();
        }
      };

      ws.onclose = () => resolve();
    });

    assertEquals(events.length, 1);
    assertEquals((events[0] as { content: string }).content, "Hello, Nostr!");
  } finally {
    pool.uninstall();
  }
});
```

Multiple relay testing:

```typescript
Deno.test("aggregate events from multiple relays", async () => {
  const pool = new MockPool();

  const relay1 = pool.relay("wss://relay1.example.com");
  const relay2 = pool.relay("wss://relay2.example.com");

  relay1.store({
    id: "event-from-relay1",
    pubkey: "alice",
    kind: 1,
    content: "from relay1",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  relay2.store({
    id: "event-from-relay2",
    pubkey: "bob",
    kind: 1,
    content: "from relay2",
    created_at: 1700000001,
    tags: [],
    sig: "sig2",
  });

  pool.install();
  try {
    const allEvents: unknown[] = [];
    let closedCount = 0;

    await new Promise<void>((resolve) => {
      for (
        const url of ["wss://relay1.example.com", "wss://relay2.example.com"]
      ) {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") allEvents.push(msg[2]);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => {
          closedCount++;
          if (closedCount === 2) resolve();
        };
      }
    });

    assertEquals(allEvents.length, 2);
  } finally {
    pool.uninstall();
  }
});
```

Simulating unstable relays:

```typescript
Deno.test("relay with latency", async () => {
  const pool = new MockPool();

  // random latency between 100ms and 500ms
  pool.relay("wss://slow.relay.test", {
    latency: { min: 100, max: 500 },
  });

  pool.install();
  try {
    const start = Date.now();
    const ws = new WebSocket("wss://slow.relay.test");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") {
          const elapsed = Date.now() - start;
          console.log(`Response time: ${elapsed}ms`);
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("relay that disconnects after a delay", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://unstable.relay.test");

  // disconnect after 1 second
  relay.disconnectAfter(1000);

  pool.install();
  try {
    const ws = new WebSocket("wss://unstable.relay.test");

    const closeCode = await new Promise<number>((resolve) => {
      ws.onclose = (e) => resolve(e.code);
    });

    assertEquals(closeCode, 1006);
  } finally {
    pool.uninstall();
  }
});

Deno.test("relay that refuses connections", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://down.relay.test");
  relay.refuse();

  pool.install();
  try {
    const ws = new WebSocket("wss://down.relay.test");

    const closeCode = await new Promise<number>((resolve) => {
      ws.onerror = () => {}; // ignore error
      ws.onclose = (e) => resolve(e.code);
    });

    assertEquals(closeCode, 1006);
  } finally {
    pool.uninstall();
  }
});
```

Using EventBuilder:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { EventBuilder } from "@ikuradon/tsunagiya/testing";

Deno.test("generate test data with EventBuilder", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // builder pattern
  const event = EventBuilder.kind1()
    .content("hello world")
    .tag("t", "nostr")
    .build();

  relay.store(event);

  // bulk generation
  const events = EventBuilder.bulk(10, { kind: 1 });
  for (const e of events) {
    relay.store(e);
  }

  // time series data
  const timeline = EventBuilder.timeline(5, {
    interval: 60,
    startTime: 1700000000,
  });
  for (const e of timeline) {
    relay.store(e);
  }

  // thread generation
  const thread = EventBuilder.thread(3);
  // thread[0] = root, thread[1] = reply1, thread[2] = reply2
  for (const e of thread) {
    relay.store(e);
  }

  pool.install();
  try {
    // ... tests
  } finally {
    pool.uninstall();
  }
});
```

Common templates:

```typescript
// Profile
const profile = EventBuilder.metadata({ name: "Alice", about: "Nostr user" });

// Contact list
const contacts = EventBuilder.contacts(["pubkey1", "pubkey2"]);

// DM
const dm = EventBuilder.dm("recipient-pubkey", "secret message").build();

// Broken event (for validation testing)
const broken = EventBuilder.kind1()
  .corrupt({ id: true, sig: true })
  .build();
```

Using verification helpers:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import {
  assertClosed,
  assertEventPublished,
  assertReceivedREQ,
} from "@ikuradon/tsunagiya/testing";

Deno.test("verify client sends correct messages", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], limit: 20 }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") {
          ws.send(JSON.stringify(["CLOSE", "sub1"]));
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    // verify
    assertReceivedREQ(relay, { kinds: [1] });
    assertClosed(relay, "sub1");
  } finally {
    pool.uninstall();
  }
});
```

State management with snapshot:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

Deno.test("restore state with snapshot", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("original").build());

  // save state
  const snap = snapshot(relay);

  // additional operations
  relay.store(EventBuilder.kind1().content("added").build());

  // restore
  restore(relay, snap);
  // → "added" is gone, back to "original" only
});
```
