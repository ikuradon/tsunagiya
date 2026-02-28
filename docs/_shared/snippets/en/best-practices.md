Test file organization example:

```
tests/
├── relay/
│   ├── connection_test.ts    # connection/disconnection
│   ├── req_test.ts           # REQ/EOSE
│   ├── event_test.ts         # EVENT/OK
│   └── auth_test.ts          # NIP-42 AUTH
├── pool/
│   ├── multi_relay_test.ts   # multiple relays
│   └── failover_test.ts      # failover
├── client/
│   ├── timeline_test.ts      # timeline fetching
│   ├── publish_test.ts       # publishing
│   └── stream_test.ts        # real-time
└── helpers/
    └── setup.ts              # common setup
```

Extracting common setup:

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

Grouping tests:

```typescript
Deno.test("MockRelay", async (t) => {
  await t.step("can register events with store()", () => {/* ... */});
  await t.step("can set custom handler with onREQ()", () => {/* ... */});
  await t.step("can refuse connections with refuse()", () => {/* ... */});
});
```

DRY principle — eliminate duplication with helper functions:

```typescript
async function fetchEvents(
  url: string,
  filter: NostrFilter,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const ws = new WebSocket(url);

  await new Promise<void>((resolve) => {
    ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", filter]));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg[0] === "EVENT") events.push(msg[2]);
      if (msg[0] === "EOSE") ws.close();
    };
    ws.onclose = () => resolve();
  });

  return events;
}
```

Clear state with pool.reset():

```typescript
Deno.test("test suite", async (t) => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    await t.step("test 1", async () => {
      relay.store(EventBuilder.kind1().build());
      // ... test ...
      pool.reset();
    });

    await t.step("test 2", async () => {
      // starts from clean state
    });
  } finally {
    pool.uninstall();
  }
});
```

Leveraging concurrent tests:

```typescript
Deno.test("concurrent tests", async () => {
  const pool = new MockPool();
  const relay1 = pool.relay("wss://test1.relay.test");
  const relay2 = pool.relay("wss://test2.relay.test");

  pool.install();
  try {
    await Promise.all([
      testScenario1("wss://test1.relay.test"),
      testScenario2("wss://test2.relay.test"),
    ]);
  } finally {
    pool.uninstall();
  }
});
```

try/finally pattern (required):

```typescript
// ✅ Required pattern
pool.install();
try {
  // tests
} finally {
  pool.uninstall();
}
```
