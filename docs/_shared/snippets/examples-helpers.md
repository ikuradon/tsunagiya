リアルタイムストリームのテスト:

```typescript
import { startStream, streamEvents } from "@ikuradon/tsunagiya/testing";

Deno.test("時間差でイベントが配信される", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const events = EventBuilder.bulk(5, { kind: 1 });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const received: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "stream", { kinds: [1] }]));

        const handle = streamEvents(relay, events, { interval: 100 });

        setTimeout(() => {
          handle.stop();
          ws.close();
        }, 700);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
      };

      ws.onclose = () => resolve();
    });

    assertEquals(received.length >= 3, true);
  } finally {
    pool.uninstall();
  }
});

Deno.test("継続的ストリーム", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const received: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "live", { kinds: [1] }]));

        const stream = startStream(relay, {
          eventGenerator: () => EventBuilder.random({ kind: 1 }),
          interval: 50,
          count: 5,
        });

        setTimeout(() => {
          stream.stop();
          ws.close();
        }, 500);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
      };

      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 5);
  } finally {
    pool.uninstall();
  }
});
```

スレッドとリアクションのテスト:

```typescript
Deno.test("スレッドの取得", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const thread = EventBuilder.thread(5);
  for (const e of thread) relay.store(e);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const replies: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "thread", { "#e": [thread[0].id] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") replies.push(msg[2]);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(replies.length, 4);
  } finally {
    pool.uninstall();
  }
});

Deno.test("リアクションの取得", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const [post, reactions] = EventBuilder.withReactions(10);
  relay.store(post);
  for (const r of reactions) relay.store(r);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const received: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify(["REQ", "reactions", { kinds: [7], "#e": [post.id] }]),
        );
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 10);
  } finally {
    pool.uninstall();
  }
});
```

不正データとログのテスト:

```typescript
Deno.test("不正JSONの受信", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        relay.sendRaw("this is not json");
        relay.sendRaw('{"also": "not a nostr message"}');
        setTimeout(() => ws.close(), 100);
      };
      ws.onmessage = (e) => messages.push(e.data);
      ws.onclose = () => resolve();
    });

    assertEquals(messages.length, 2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("カスタムログハンドラー", async () => {
  const pool = new MockPool();
  const logs: LogEntry[] = [];

  pool.relay("wss://relay.example.com", {
    logging: (entry) => logs.push(entry),
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    const receives = logs.filter((l) => l.direction === "receive");
    const sends = logs.filter((l) => l.direction === "send");
    assertEquals(receives.length >= 1, true);
    assertEquals(sends.length >= 1, true);
  } finally {
    pool.uninstall();
  }
});
```

スナップショットを使ったテスト:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

Deno.test("スナップショットで複数テストケースを効率的に実行", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const baseEvents = EventBuilder.bulk(10, { kind: 1 });
  for (const e of baseEvents) relay.store(e);

  const baseline = snapshot(relay);

  relay.store(EventBuilder.kind1().content("extra").build());
  // ... 検証 ...

  restore(relay, baseline);

  relay.store(EventBuilder.kind(7).content("+").build());
  // ... 検証 ...

  restore(relay, baseline);
});
```
