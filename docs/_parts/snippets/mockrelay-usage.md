イベントの登録とカスタムハンドラー:

```typescript
const relay = pool.relay("wss://relay.example.com");

// イベントを事前登録（REQ受信時に自動マッチング）
relay.store(event);

// REQハンドラーのカスタマイズ
relay.onREQ((subId, filters) => {
  return [customEvent];
});

// EVENTハンドラーのカスタマイズ
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});
```

不安定リレーのシミュレート:

```typescript
pool.relay("wss://unstable.relay.com", {
  latency: { min: 100, max: 2000 },
  errorRate: 0.3,
  disconnectRate: 0.1,
  connectionTimeout: 5000,
});
```

エラーケーステスト:

```typescript
relay.refuse(); // 接続拒否
relay.disconnect(); // 全接続を即座に切断
relay.disconnectAfter(3000); // 3秒後に切断
relay.close(1006); // 特定クローズコードで切断
relay.sendRaw("not json"); // 不正データ送信
relay.sendNotice("rate-limited"); // NOTICE送信
```

NIP-42 AUTH:

```typescript
const relay = pool.relay("wss://auth.relay.com", {
  requiresAuth: true,
});

// 標準検証（バリデーター未設定）: relay URL 一致を自動確認
// カスタムバリデーター: context.relayUrl / context.challenge を参照可能
relay.requireAuth((authEvent, context) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === context.relayUrl,
  );
});
```

検証ヘルパー:

```typescript
relay.received; // 全受信メッセージ
relay.findREQ("sub1"); // REQ検索
relay.countREQs(); // REQ数
relay.hasREQ("sub1"); // REQ存在確認
relay.findEvent("id1"); // EVENT検索
relay.countEvents(); // EVENT数
relay.hasEvent("id1"); // EVENT存在確認
relay.findCLOSE("sub1"); // CLOSE検索
relay.connectionCount; // アクティブ接続数
```
