```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

pool.install(); // WebSocket差し替え
pool.uninstall(); // 元に戻す
pool.reset(); // 全リレーの状態をリセット
pool.connections; // アクティブ接続一覧 (Map<string, number>)
```

複数リレーの使い方:

```typescript
const pool = new MockPool();

// 複数のリレーを登録（それぞれ独立して動作）
const relay1 = pool.relay("wss://relay1.example.com");
const relay2 = pool.relay("wss://relay2.example.com");
const relay3 = pool.relay("wss://relay3.example.com");

// 各リレーに異なるイベントを登録
relay1.store(event1);
relay2.store(event2);
relay3.store(event3);

// 各リレーに異なる設定も可能
const fastRelay = pool.relay("wss://fast.relay.com", { latency: 10 });
const slowRelay = pool.relay("wss://slow.relay.com", { latency: 500 });

pool.install();
try {
  // 複数リレーに同時接続するクライアントコードがそのまま動く
  const ws1 = new WebSocket("wss://relay1.example.com");
  const ws2 = new WebSocket("wss://relay2.example.com");
  const ws3 = new WebSocket("wss://relay3.example.com");
  // ... テスト対象のクライアントロジック
} finally {
  pool.uninstall();
}
```
