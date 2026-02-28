テストファイルの構成例:

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

共通セットアップの抽出:

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

テストのグルーピング:

```typescript
Deno.test("MockRelay", async (t) => {
  await t.step("store() でイベントを登録できる", () => {/* ... */});
  await t.step("onREQ() でカスタムハンドラーを設定できる", () => {/* ... */});
  await t.step("refuse() で接続を拒否できる", () => {/* ... */});
});
```

DRY 原則 — ヘルパー関数で重複を排除:

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

pool.reset() で状態をクリア:

```typescript
Deno.test("テストスイート", async (t) => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    await t.step("テスト1", async () => {
      relay.store(EventBuilder.kind1().build());
      // ... テスト ...
      pool.reset();
    });

    await t.step("テスト2", async () => {
      // クリーンな状態から開始
    });
  } finally {
    pool.uninstall();
  }
});
```

並行テストの活用:

```typescript
Deno.test("並行テスト", async () => {
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

try/finally パターン（必須）:

```typescript
// ✅ 必須パターン
pool.install();
try {
  // テスト
} finally {
  pool.uninstall();
}
```
