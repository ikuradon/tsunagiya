EventBuilder.bulk() での効率的な生成:

```typescript
// ✅ 効率的：一括生成
const events = EventBuilder.bulk(1000, { kind: 1 });
for (const e of events) relay.store(e);

// ❌ 非効率：個別にビルダーを使う
for (let i = 0; i < 1000; i++) {
  relay.store(EventBuilder.kind1().content(`event ${i}`).build());
}
```

timeline() での時系列データ生成:

```typescript
const events = EventBuilder.timeline(1000, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});
```

limit を活用したフィルタリング:

```typescript
// ✅ 必要な件数だけ取得
ws.send(JSON.stringify(["REQ", "s", { kinds: [1], limit: 50 }]));
```

pool.reset() でメモリを解放:

```typescript
Deno.test("テストスイート", async (t) => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();

  try {
    await t.step("テスト1", () => {
      const events = EventBuilder.bulk(10000);
      for (const e of events) relay.store(e);
      // ...
      pool.reset(); // ← 10000件を解放
    });

    await t.step("テスト2", () => {
      // クリーンな状態
    });
  } finally {
    pool.uninstall();
  }
});
```

1000件を一括取得するパターン:

```typescript
Deno.test("1000件のイベントを一括取得", async () => {
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

ストリーム配信パターン:

```typescript
Deno.test("1000件をストリーム配信", async () => {
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

Deno.bench を使ったパフォーマンス測定:

```typescript
Deno.bench("EventBuilder.bulk(1000)", () => {
  EventBuilder.bulk(1000, { kind: 1 });
});

Deno.bench("filterEvents 10000件から100件", () => {
  const events = EventBuilder.bulk(10000, { kind: 1 });
  filterEvents(events, { kinds: [1], limit: 100 });
});

Deno.bench("matchFilter", () => {
  const event = EventBuilder.kind1().build();
  matchFilter(event, { kinds: [1], authors: [event.pubkey] });
});
```

実行コマンド:

```bash
deno bench
```

手動計測:

```typescript
const start = performance.now();

const events = EventBuilder.bulk(10000);
for (const e of events) relay.store(e);

const elapsed = performance.now() - start;
console.log(`${elapsed.toFixed(2)}ms`);
```
