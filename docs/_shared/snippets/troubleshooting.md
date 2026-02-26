タイムアウトの原因：uninstall 忘れ:

```typescript
// ❌ uninstall忘れで次のテストが壊れる
pool.install();
// テスト...
// pool.uninstall() がない！

// ✅ 必ず try/finally で囲む
pool.install();
try {
  // テスト
} finally {
  pool.uninstall();
}
```

WebSocket の close() を忘れるケース:

```typescript
// ❌ EOSE後にclose()を呼んでいない
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "EOSE") {
    // ws.close() を忘れている
  }
};

// ✅ EOSE受信後に close() を呼ぶ
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "EOSE") {
    ws.close();
  }
};
```

install前に WebSocket を作成してしまうケース:

```typescript
// ❌ 実際の WebSocket が使われてしまう
const ws = new WebSocket("wss://relay.example.com");
pool.install(); // install が遅い

// ✅ install の後に WebSocket を作成する
pool.install();
const ws = new WebSocket("wss://relay.example.com");
```

「MockPool is already installed」エラー:

```typescript
// ❌ 二重install
pool.install();
pool.install(); // Error!

// ✅ installed プロパティで確認
if (!pool.installed) {
  pool.install();
}
```

「MockPool is not installed」エラー:

```typescript
// ✅ installed プロパティで確認
if (pool.installed) {
  pool.uninstall();
}
```

「WebSocket is not open」エラー:

```typescript
// ✅ onopen で送信する
ws.onopen = () => {
  ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
};

// ❌ 即座に送信（まだCONNECTING状態）
const ws = new WebSocket("wss://relay.example.com");
ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }])); // Error!
```

デバッグ方法：ログの有効化:

```typescript
pool.relay("wss://relay.example.com", { logging: true });
```

カスタムログハンドラー:

```typescript
const logs: LogEntry[] = [];
pool.relay("wss://relay.example.com", {
  logging: (entry) => {
    logs.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  },
});
```

received プロパティでの確認:

```typescript
// テスト後に確認
console.log("受信メッセージ:", JSON.stringify(relay.received, null, 2));
console.log("REQ数:", relay.countREQs());
console.log("EVENT数:", relay.countEvents());
```

connections プロパティでの確認:

```typescript
console.log("アクティブ接続:", pool.connections);
```
