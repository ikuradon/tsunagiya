# パフォーマンスガイド

tsunagiya を使った大規模テストの最適化方法。

---

## 大量イベント処理のベストプラクティス

### EventBuilder.bulk() を使う

```typescript
// ✅ 効率的：一括生成
const events = EventBuilder.bulk(1000, { kind: 1 });
for (const e of events) relay.store(e);

// ❌ 非効率：個別にビルダーを使う
for (let i = 0; i < 1000; i++) {
  relay.store(EventBuilder.kind1().content(`event ${i}`).build());
}
```

`bulk()` は内部で最小限の処理でイベントを生成する。

### timeline() で時系列データを効率的に生成

```typescript
const events = EventBuilder.timeline(1000, {
  kind: 1,
  interval: 60,      // 1分間隔
  startTime: 1700000000,
});
```

### limit を活用してフィルタリングを絞る

```typescript
// ✅ 必要な件数だけ取得
ws.send(JSON.stringify(["REQ", "s", { kinds: [1], limit: 50 }]));

// ❌ 全件取得（1000件のストアから全部返す）
ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
```

---

## メモリ使用量の最適化

### pool.reset() でメモリを解放

テスト間で MockPool を再利用する場合、`reset()` でストアと受信ログをクリアする。

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

### スナップショットのサイズに注意

スナップショットはストアと受信ログのディープコピーを作成する。大量データがある場合はメモリ消費が2倍になる。

```typescript
// ⚠️ 10000件のストア → スナップショットで追加10000件分のメモリ
relay.store(...EventBuilder.bulk(10000).map(e => (relay.store(e), e)));
const snap = snapshot(relay); // ← 10000件のコピー
```

### 不要なログを無効化

`logging: true` はすべてのメッセージをメモリに蓄積する。大量テストでは無効にする。

```typescript
// ✅ パフォーマンステストではログ無効（デフォルト）
pool.relay("wss://relay.example.com");

// ⚠️ ログ有効は開発時のみ
pool.relay("wss://relay.example.com", { logging: true });
```

---

## ベンチマーク結果

tsunagiya v0.1.0 での参考値（環境依存）。

### イベントストア登録

```
1,000 件  → < 5ms
10,000 件 → < 30ms
100,000 件 → < 300ms
```

### フィルターマッチング（filterEvents）

10,000 件のストアから：

```
kinds のみ       → < 5ms
kinds + authors → < 8ms
タグフィルター     → < 15ms
limit: 10       → < 3ms（ソート後にスライス）
```

### WebSocket メッセージの送受信

```
1 REQ → 100 EVENT + EOSE  → < 10ms (latency: 0)
1 REQ → 1000 EVENT + EOSE → < 50ms (latency: 0)
```

---

## 1000 件のイベントを効率的にテストする方法

### パターン 1: 一括取得

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

### パターン 2: ストリーム配信

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

        // 1ms間隔で1000件配信
        const stream = startStream(relay, {
          eventGenerator: () => EventBuilder.random({ kind: 1 }),
          interval: 1,
          count: 1000,
        });

        // 十分な時間を待つ
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

### パターン 3: 複数リレーに分散

```typescript
Deno.test("10リレー × 100件 = 1000件", async () => {
  const pool = new MockPool();

  // 10リレーに100件ずつ
  const urls: string[] = [];
  for (let i = 0; i < 10; i++) {
    const url = `wss://relay${i}.example.com`;
    urls.push(url);
    const events = EventBuilder.bulk(100, { kind: 1 });
    const relay = pool.relay(url);
    for (const e of events) relay.store(e);
  }

  pool.install();
  try {
    const allReceived: NostrEvent[] = [];
    let done = 0;

    await new Promise<void>((resolve) => {
      for (const url of urls) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") allReceived.push(msg[2]);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => { if (++done === 10) resolve(); };
      }
    });

    assertEquals(allReceived.length, 1000);
  } finally {
    pool.uninstall();
  }
});
```

---

## パフォーマンス測定方法

### Deno.bench を使う

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

実行：

```bash
deno bench
```

### 手動計測

```typescript
const start = performance.now();

// 計測対象の処理
const events = EventBuilder.bulk(10000);
for (const e of events) relay.store(e);

const elapsed = performance.now() - start;
console.log(`${elapsed.toFixed(2)}ms`);
```

---

## 関連ドキュメント

- [BEST_PRACTICES.md](./BEST_PRACTICES.md) - テスト設計指針
- [API_REFERENCE.md](./API_REFERENCE.md) - API 詳細
- [TEST_PATTERNS.md](./TEST_PATTERNS.md) - テストパターン
