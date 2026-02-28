Basic REQ/EVENT testing:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { assertReceivedREQ, EventBuilder } from "@ikuradon/tsunagiya/testing";
import { assertEquals } from "@std/assert";

Deno.test("fetch kind:1 events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("hello").build());
  relay.store(EventBuilder.kind(0).content('{"name":"Alice"}').build());

  pool.install();
  try {
    const events: string[] = [];
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") events.push(msg[2].content);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(events, ["hello"]); // kind:0 is filtered out
    assertReceivedREQ(relay, { kinds: [1] });
  } finally {
    pool.uninstall();
  }
});
```

Event publishing test:

```typescript
Deno.test("publish an event and receive OK", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const event = EventBuilder.kind1().content("my post").build();
    let okReceived = false;

    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["EVENT", event]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "OK" && msg[1] === event.id && msg[2] === true) {
          okReceived = true;
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    assertEquals(okReceived, true);
    assertEquals(relay.hasEvent(event.id), true);
  } finally {
    pool.uninstall();
  }
});
```

Multiple relay testing:

```typescript
Deno.test("aggregate events from 3 relays", async () => {
  const pool = new MockPool();
  const urls = [
    "wss://relay1.example.com",
    "wss://relay2.example.com",
    "wss://relay3.example.com",
  ];

  urls.forEach((url, i) => {
    pool.relay(url).store(
      EventBuilder.kind1().content(`event from relay ${i + 1}`).build(),
    );
  });

  pool.install();
  try {
    const allEvents: string[] = [];
    let done = 0;

    await new Promise<void>((resolve) => {
      for (const url of urls) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") allEvents.push(msg[2].content);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => {
          if (++done === 3) resolve();
        };
      }
    });

    assertEquals(allEvents.length, 3);
  } finally {
    pool.uninstall();
  }
});
```

Filter matching testing:

```typescript
import { filterEvents, matchFilter } from "@ikuradon/tsunagiya";

Deno.test("filter matching", () => {
  const event = EventBuilder.kind1()
    .pubkey("alice")
    .createdAt(1700000000)
    .tag("t", "nostr")
    .build();

  // kind match
  assertEquals(matchFilter(event, { kinds: [1] }), true);
  assertEquals(matchFilter(event, { kinds: [0] }), false);

  // author match (prefix)
  assertEquals(matchFilter(event, { authors: ["alice"] }), true);

  // time range
  assertEquals(matchFilter(event, { since: 1699999999 }), true);
  assertEquals(matchFilter(event, { since: 1700000001 }), false);

  // tag filter
  assertEquals(matchFilter(event, { "#t": ["nostr"] }), true);
  assertEquals(matchFilter(event, { "#t": ["bitcoin"] }), false);
});

Deno.test("apply limit with filterEvents", () => {
  const events = EventBuilder.timeline(100, { kind: 1 });
  const result = filterEvents(events, { kinds: [1], limit: 10 });
  assertEquals(result.length, 10);
});
```
