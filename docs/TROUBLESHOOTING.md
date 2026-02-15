# トラブルシューティング

tsunagiya でよくあるエラーと解決方法。

---

## テストがタイムアウトする

### 症状

テストが `Deno.test` のデフォルトタイムアウト（5秒）で失敗する。

### 原因と対策

**1. `pool.uninstall()` の呼び忘れ**

```typescript
// ❌ uninstall忘れで次のテストが壊れる
pool.install();
// テスト...
// pool.uninstall() がない！
```

→ 必ず `try/finally` で囲む。

**2. WebSocket の `onclose` が発火しない**

Promise が resolve されず、テストが終了しない。

```typescript
// ❌ EOSE後にclose()を呼んでいない
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "EOSE") {
    // ws.close() を忘れている
  }
};
```

→ EOSE 受信後に `ws.close()` を呼ぶ。

**3. レイテンシ設定が大きすぎる**

```typescript
// ❌ 3秒の遅延 × 複数メッセージ → タイムアウト
pool.relay("wss://relay.example.com", { latency: 3000 });
```

→ テストでは小さい値を使う。速度テスト以外では `latency: 0`（デフォルト）。

**4. streamEvents が止まらない**

```typescript
// ❌ stop() を呼ばない無限ストリーム
const handle = startStream(relay, {
  eventGenerator: () => EventBuilder.random(),
  interval: 100,
  // count が未指定 → 無制限
});
```

→ `count` を指定するか、テスト終了時に `handle.stop()` を呼ぶ。

**5. Deno テストのタイムアウトを延長する**

```typescript
Deno.test({
  name: "時間のかかるテスト",
  fn: async () => {/* ... */},
  sanitizeOps: false,
  sanitizeResources: false,
});
```

---

## イベントが受信されない

### 症状

REQ を送信してもイベントが返ってこない。

### 原因と対策

**1. `relay.store()` の呼び忘れ**

```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");
// relay.store(event) を忘れている！
```

→ テストデータを `store()` で登録する。

**2. フィルターが合っていない**

```typescript
relay.store(EventBuilder.kind(0).build()); // kind:0 を登録
// ...
ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }])); // kind:1 を要求
```

→ store したイベントの kind とフィルターの kinds が一致しているか確認する。

**3. `pool.install()` の前に WebSocket を作成している**

```typescript
const ws = new WebSocket("wss://relay.example.com"); // ← 実際のWebSocket！
pool.install(); // install が遅い
```

→ `pool.install()` を WebSocket 作成の前に呼ぶ。

**4. `onREQ` ハンドラーが空配列を返している**

```typescript
relay.onREQ(() => []); // 常に空
```

→ `onREQ`
を設定すると自動マッチングがスキップされる。ハンドラーからイベントを返すか、`onREQ`
を使わずに `store()` を使う。

---

## WebSocket 接続に失敗する

### 症状

接続時に `onerror` → `onclose(code: 1006)` が発火する。

### 原因と対策

**1. URL が未登録**

```typescript
pool.relay("wss://relay.example.com"); // このURLだけ登録
new WebSocket("wss://other.relay.com"); // 未登録 → 失敗
```

→ 接続先 URL を `pool.relay()` で登録する。

**2. `refuse()` が呼ばれている**

```typescript
relay.refuse();
new WebSocket("wss://relay.example.com"); // 拒否される
```

→ `refuse()` を呼ぶ前の接続か確認する。`reset()` でリセットできる。

**3. `connectionTimeout` が短すぎる**

```typescript
pool.relay("wss://relay.example.com", { connectionTimeout: 1 }); // 1ms
```

→ タイムアウトの値を適切に設定する。

---

## 「MockPool is already installed」エラー

### 症状

```
Error: MockPool is already installed
```

### 原因

`pool.install()` を2回呼んでいる。

### 対策

```typescript
// ❌ 二重install
pool.install();
pool.install(); // Error!

// ✅ installed プロパティで確認
if (!pool.installed) {
  pool.install();
}
```

---

## 「MockPool is not installed」エラー

### 症状

```
Error: MockPool is not installed
```

### 原因

`pool.uninstall()` を install 前に呼んでいる、または2回呼んでいる。

### 対策

```typescript
// ✅ installed プロパティで確認
if (pool.installed) {
  pool.uninstall();
}
```

---

## 「WebSocket is not open」エラー

### 症状

```
DOMException: WebSocket is not open
```

### 原因

`readyState` が `OPEN` でないのに `send()` を呼んでいる。

### 対策

```typescript
// ✅ onopen で送信する
ws.onopen = () => {
  ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
};

// ❌ 即座に送信（まだCONNECTING状態）
const ws = new WebSocket("wss://relay.example.com");
ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }])); // Error!
```

---

## デバッグ方法

### 1. ログを有効にする

```typescript
pool.relay("wss://relay.example.com", { logging: true });
```

コンソールにメッセージの送受信が出力される：

```
[2024-01-01T00:00:00.000Z] ← RECV wss://relay.example.com: ["REQ","sub1",{"kinds":[1]}]
[2024-01-01T00:00:00.001Z] → SEND wss://relay.example.com: ["EOSE","sub1"]
```

### 2. カスタムログハンドラーで詳細を記録

```typescript
const logs: LogEntry[] = [];
pool.relay("wss://relay.example.com", {
  logging: (entry) => {
    logs.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  },
});
```

### 3. `received` プロパティで受信メッセージを確認

```typescript
// テスト後に確認
console.log("受信メッセージ:", JSON.stringify(relay.received, null, 2));
console.log("REQ数:", relay.countREQs());
console.log("EVENT数:", relay.countEvents());
```

### 4. `connections` プロパティでアクティブ接続を確認

```typescript
console.log("アクティブ接続:", pool.connections);
```

---

## 関連ドキュメント

- [FAQ.md](./FAQ.md) - よくある質問
- [API_REFERENCE.md](./API_REFERENCE.md) - 正しい API の使い方
- [TUTORIAL.md](./TUTORIAL.md) - 基本的な使い方
