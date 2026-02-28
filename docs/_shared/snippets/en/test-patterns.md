Relay disconnection retry testing:

```typescript
Deno.test("reconnect after disconnect", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    let connectionCount = 0;

    function connect(): Promise<void> {
      return new Promise((resolve) => {
        const ws = new WebSocket("wss://relay.example.com");
        ws.onopen = () => {
          connectionCount++;
          if (connectionCount === 1) {
            relay.disconnect(1006);
          } else {
            ws.close();
            resolve();
          }
        };
        ws.onclose = (e) => {
          if (e.code !== 1000 && connectionCount < 3) {
            setTimeout(() => connect().then(resolve), 100);
          }
        };
      });
    }

    await connect();
    assertEquals(connectionCount, 2);
  } finally {
    pool.uninstall();
  }
});
```

Multi-relay failover testing:

```typescript
Deno.test("works even when some relays are down", async () => {
  const pool = new MockPool();

  const goodRelay = pool.relay("wss://good.relay.test");
  goodRelay.store(EventBuilder.kind1().content("available").build());

  const badRelay = pool.relay("wss://bad.relay.test");
  badRelay.refuse();

  pool.install();
  try {
    const events: string[] = [];
    const errors: string[] = [];
    let done = 0;

    await new Promise<void>((resolve) => {
      for (const url of ["wss://good.relay.test", "wss://bad.relay.test"]) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") events.push(msg[2].content);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onerror = () => errors.push(url);
        ws.onclose = () => {
          if (++done === 2) resolve();
        };
      }
    });

    assertEquals(events, ["available"]);
    assertEquals(errors, ["wss://bad.relay.test"]);
  } finally {
    pool.uninstall();
  }
});
```

Timeout handling testing:

```typescript
Deno.test("connection timeout", async () => {
  const pool = new MockPool();
  pool.relay("wss://slow.relay.test", {
    connectionTimeout: 100,
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://slow.relay.test");
    let errorFired = false;

    const code = await new Promise<number>((resolve) => {
      ws.onerror = () => {
        errorFired = true;
      };
      ws.onclose = (e) => resolve(e.code);
    });

    assertEquals(errorFired, true);
    assertEquals(code, 1006);
  } finally {
    pool.uninstall();
  }
});
```

Concurrent connection testing:

```typescript
Deno.test("multiple connections to same relay", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.store(EventBuilder.kind1().content("shared").build());

  pool.install();
  try {
    const results: number[] = [];

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        new Promise<void>((resolve) => {
          const ws = new WebSocket("wss://relay.example.com");
          let count = 0;
          ws.onopen = () =>
            ws.send(JSON.stringify(["REQ", `s${i}`, { kinds: [1] }]));
          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg[0] === "EVENT") count++;
            if (msg[0] === "EOSE") ws.close();
          };
          ws.onclose = () => {
            results.push(count);
            resolve();
          };
        })),
    );

    assertEquals(results, [1, 1, 1, 1, 1]);
  } finally {
    pool.uninstall();
  }
});
```

Event deduplication testing:

```typescript
Deno.test("event deduplication", async () => {
  const pool = new MockPool();

  const sharedEvent = EventBuilder.kind1().id("shared-id").content("shared")
    .build();

  pool.relay("wss://relay1.example.com").store(sharedEvent);
  pool.relay("wss://relay2.example.com").store(sharedEvent);

  pool.install();
  try {
    const eventIds = new Set<string>();
    let done = 0;

    await new Promise<void>((resolve) => {
      for (
        const url of ["wss://relay1.example.com", "wss://relay2.example.com"]
      ) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") eventIds.add(msg[2].id);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => {
          if (++done === 2) resolve();
        };
      }
    });

    assertEquals(eventIds.size, 1);
  } finally {
    pool.uninstall();
  }
});
```

Common setup helper:

```typescript
// tests/helpers/setup.ts
import { MockPool } from "@ikuradon/tsunagiya";

export function createTestPool(urls: string[] = ["wss://relay.example.com"]) {
  const pool = new MockPool();
  const relays = urls.map((url) => pool.relay(url));
  return { pool, relays, relay: relays[0] };
}

export async function withPool(
  fn: (pool: MockPool) => Promise<void>,
  urls?: string[],
) {
  const { pool } = createTestPool(urls);
  pool.install();
  try {
    await fn(pool);
  } finally {
    pool.uninstall();
  }
}
```
