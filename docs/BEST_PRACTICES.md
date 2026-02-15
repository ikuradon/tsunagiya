# ベストプラクティス

tsunagiya を使った Nostr クライアントテストの設計指針。

---

## テストの構成方法

### テストファイルの構成

```
tests/
├── relay/
│   ├── connection_test.ts    # 接続・切断
│   ├── req_test.ts           # REQ/EOSE
│   ├── event_test.ts         # EVENT/OK
│   └── auth_test.ts          # NIP-42 AUTH
├── pool/
│   ├── multi_relay_test.ts   # 複数リレー
│   └── failover_test.ts      # フェイルオーバー
├── client/
│   ├── timeline_test.ts      # タイムライン取得
│   ├── publish_test.ts       # 投稿
│   └── stream_test.ts        # リアルタイム
└── helpers/
    └── setup.ts              # 共通セットアップ
```

### 共通セットアップの抽出

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

---

## テストの粒度

### 良い例：1テスト1検証

```typescript
Deno.test("REQ送信後にEOSEを受信する", async () => {/* ... */});
Deno.test("storeしたイベントがフィルターにマッチする", async () => {/* ... */});
Deno.test("未登録URLへの接続はcode:1006で閉じる", async () => {/* ... */});
```

### 悪い例：1テストで複数のことを検証

```typescript
// ❌ これは分割すべき
Deno.test("リレーの全機能テスト", async () => {
  // REQ → EVENT → CLOSE → AUTH → disconnect... 全部入り
});
```

### テストのグルーピング

```typescript
Deno.test("MockRelay", async (t) => {
  await t.step("store() でイベントを登録できる", () => {/* ... */});
  await t.step("onREQ() でカスタムハンドラーを設定できる", () => {/* ... */});
  await t.step("refuse() で接続を拒否できる", () => {/* ... */});
});
```

---

## テストの命名規則

### 日本語での命名を推奨

tsunagiya は日本語プロジェクトなので、テスト名も日本語で書くと分かりやすい。

```typescript
// ✅ 良い例
Deno.test("kind:1のイベントがフィルターにマッチする", () => {});
Deno.test("接続拒否後の新規接続はエラーになる", () => {});
Deno.test("1000件のイベントを100ms以内に処理する", () => {});

// ❌ 悪い例
Deno.test("test1", () => {});
Deno.test("it works", () => {});
```

### 命名パターン

| パターン                     | 例                                  |
| ---------------------------- | ----------------------------------- |
| `[対象]が[条件]で[期待結果]` | `フィルターがkind:1で1件マッチする` |
| `[操作]すると[結果]`         | `refuse()すると接続が拒否される`    |
| `[状況]のとき[動作]`         | `未登録URLのとき接続失敗する`       |

---

## DRY 原則の適用

### ヘルパー関数で重複を排除

```typescript
// WebSocket接続 → REQ → イベント受信 → CLOSE の定型パターン
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

// 使用例
Deno.test("タイムラインを取得する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.store(EventBuilder.kind1().content("hello").build());

  pool.install();
  try {
    const events = await fetchEvents("wss://relay.example.com", { kinds: [1] });
    assertEquals(events.length, 1);
  } finally {
    pool.uninstall();
  }
});
```

### ただし過度な抽象化は避ける

```typescript
// ❌ 抽象化しすぎてテストの意図が分からない
Deno.test("scenario-1", () => runScenario(config1));

// ✅ テストの意図が読める程度に
Deno.test("遅延リレーでも10秒以内に応答する", async () => {
  // セットアップが多少重複しても、テストの意図が明確な方が良い
});
```

---

## テストの実行速度最適化

### 1. レイテンシを最小限にする

```typescript
// ❌ 遅い：実際の遅延をシミュレート
pool.relay("wss://relay.example.com", { latency: 2000 });

// ✅ 速い：遅延テスト以外ではレイテンシ0
pool.relay("wss://relay.example.com"); // デフォルトは0ms
```

### 2. タイムアウトを短くする

```typescript
// テスト用の短いタイムアウト
pool.relay("wss://relay.example.com", { connectionTimeout: 50 });
```

### 3. streamEvents の間隔を短くする

```typescript
// ❌ 遅い
streamEvents(relay, events, { interval: 1000 });

// ✅ 速い
streamEvents(relay, events, { interval: 10 });
```

### 4. pool.reset() で状態をクリア

テスト間で MockPool を再利用する場合は `reset()` を使う。

```typescript
Deno.test("テストスイート", async (t) => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    await t.step("テスト1", async () => {
      relay.store(EventBuilder.kind1().build());
      // ... テスト ...
      pool.reset(); // 次のテスト用にクリア
    });

    await t.step("テスト2", async () => {
      // クリーンな状態から開始
    });
  } finally {
    pool.uninstall();
  }
});
```

### 5. 並行テストを活用する

独立したテストは `Promise.all` で並行実行する。

```typescript
Deno.test("並行テスト", async () => {
  const pool = new MockPool();
  // 各テスト用に別URLのリレーを用意
  const relay1 = pool.relay("wss://test1.relay.com");
  const relay2 = pool.relay("wss://test2.relay.com");

  pool.install();
  try {
    await Promise.all([
      testScenario1("wss://test1.relay.com"),
      testScenario2("wss://test2.relay.com"),
    ]);
  } finally {
    pool.uninstall();
  }
});
```

---

## try/finally パターンの徹底

**`pool.install()` と `pool.uninstall()` は必ず `try/finally` で囲む。**

```typescript
// ✅ 必須パターン
pool.install();
try {
  // テスト
} finally {
  pool.uninstall();
}
```

`uninstall()` を忘れると `globalThis.WebSocket`
が差し替えられたままになり、後続のテストが壊れる。

---

## 関連ドキュメント

- [TEST_PATTERNS.md](./TEST_PATTERNS.md) - テストパターン集
- [PERFORMANCE.md](./PERFORMANCE.md) - パフォーマンス最適化
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - エラー解決
