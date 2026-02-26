未登録 URL への接続:

```typescript
pool.relay("wss://known.relay.com"); // これだけ登録
const ws = new WebSocket("wss://unknown.relay.com"); // → エラー + close(1006)
```

複数リレーの追加:

```typescript
const pool = new MockPool();
const relay1 = pool.relay("wss://relay1.example.com");
const relay2 = pool.relay("wss://relay2.example.com");
const relay3 = pool.relay("wss://relay3.example.com");
```

onEVENT でのカスタムレスポンス:

```typescript
relay.onEVENT((event) => {
  if (event.kind === 1) {
    return ["OK", event.id, true, ""];
  }
  return ["OK", event.id, false, "blocked: kind not allowed"];
});
```

AUTH チャレンジの取得:

```typescript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "AUTH") {
    const challenge = msg[1]; // チャレンジ文字列
  }
};
```

同一 URL への複数回呼び出し:

```typescript
const r1 = pool.relay("wss://relay.example.com", { latency: 100 });
const r2 = pool.relay("wss://relay.example.com"); // r1 と同一インスタンス
console.log(r1 === r2); // true
```

globalThis.WebSocket を直接使いたい場合:

```typescript
const RealWebSocket = globalThis.WebSocket;
pool.install();
// new WebSocket() は MockWebSocket
// new RealWebSocket() は本物の WebSocket
```

EventBuilder のデフォルトフィールド値:

| フィールド   | デフォルト値             |
| ------------ | ------------------------ |
| `id`         | ランダム 64 文字 hex     |
| `pubkey`     | ランダム 64 文字 hex     |
| `created_at` | 現在時刻（UNIX 秒）      |
| `kind`       | ファクトリメソッドによる |
| `tags`       | `[]`                     |
| `content`    | `""`                     |
| `sig`        | ランダム 128 文字 hex    |
