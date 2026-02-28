Efficient generation with EventBuilder.bulk():

```typescript
// ✅ Efficient: bulk generation
const events = EventBuilder.bulk(1000, { kind: 1 });
for (const e of events) relay.store(e);

// ❌ Inefficient: use builder individually
for (let i = 0; i < 1000; i++) {
  relay.store(EventBuilder.kind1().content(`event ${i}`).build());
}
```

Time series data generation with timeline():

```typescript
const events = EventBuilder.timeline(1000, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});
```

Efficient filtering with limit:

```typescript
// ✅ fetch only what you need
ws.send(JSON.stringify(["REQ", "s", { kinds: [1], limit: 50 }]));
```

Free memory with pool.reset():

```typescript
Deno.test("test suite", async (t) => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();

  try {
    await t.step("test 1", () => {
      const events = EventBuilder.bulk(10000);
      for (const e of events) relay.store(e);
      // ...
      pool.reset(); // ← release 10000 events
    });

    await t.step("test 2", () => {
      // clean state
    });
  } finally {
    pool.uninstall();
  }
});
```

Fetching 1000 events at once:

```typescript
Deno.test("fetch 1000 events at once", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const events = EventBuilder.bulk(1000, { kind: 1 });
  for (const e of events) relay.store(e);

  pool.install();
  try {
    const received: NostrEvent[] = [];
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 1000);
  } finally {
    pool.uninstall();
  }
});
```

Stream delivery pattern:

```typescript
Deno.test("stream delivery of 1000 events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const received: NostrEvent[] = [];
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "live", { kinds: [1] }]));

        const stream = startStream(relay, {
          eventGenerator: () => EventBuilder.random({ kind: 1 }),
          interval: 1,
          count: 1000,
        });

        setTimeout(() => {
          stream.stop();
          ws.close();
        }, 2000);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
      };

      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 1000);
  } finally {
    pool.uninstall();
  }
});
```

Performance measurement with Deno.bench:

```typescript
Deno.bench("EventBuilder.bulk(1000)", () => {
  EventBuilder.bulk(1000, { kind: 1 });
});

Deno.bench("filterEvents 100 from 10000", () => {
  const events = EventBuilder.bulk(10000, { kind: 1 });
  filterEvents(events, { kinds: [1], limit: 100 });
});

Deno.bench("matchFilter", () => {
  const event = EventBuilder.kind1().build();
  matchFilter(event, { kinds: [1], authors: [event.pubkey] });
});
```

Run command:

```bash
deno bench
```

Manual measurement:

```typescript
const start = performance.now();

const events = EventBuilder.bulk(10000);
for (const e of events) relay.store(e);

const elapsed = performance.now() - start;
console.log(`${elapsed.toFixed(2)}ms`);
```
