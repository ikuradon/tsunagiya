# NIP 対応状況

tsunagiya v0.1.0 の NIP（Nostr Implementation Possibilities）対応状況。

---

## サポート済み NIP（v0.1.0）

### NIP-01: Basic Protocol ✅ 完全対応

Nostr の基本プロトコル。tsunagiya のコア機能。

**対応メッセージ:**

| メッセージ | 方向 | 対応 |
|-----------|------|------|
| `EVENT` | client → relay | ✅ 受信・ストア追加・OK 応答 |
| `REQ` | client → relay | ✅ フィルタリング・EVENT/EOSE 応答 |
| `CLOSE` | client → relay | ✅ サブスクリプション解除 |
| `EVENT` | relay → client | ✅ サブスクリプション配信 |
| `OK` | relay → client | ✅ EVENT 受理/拒否 |
| `EOSE` | relay → client | ✅ ストアイベント送信完了 |
| `NOTICE` | relay → client | ✅ `sendNotice()` |
| `AUTH` | relay → client | ✅ NIP-42 チャレンジ |

**フィルタリング:**

```typescript
// 全フィルター条件に対応
const filter: NostrFilter = {
  ids: ["prefix..."],     // IDプレフィックスマッチ
  authors: ["prefix..."], // 公開鍵プレフィックスマッチ
  kinds: [1],             // kind完全一致
  since: 1700000000,      // created_at下限
  until: 1700100000,      // created_at上限
  limit: 20,              // 返却数上限
  "#e": ["eventId"],      // タグフィルター
  "#p": ["pubkey"],       // タグフィルター
};
```

**使用例:**

```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

relay.store(EventBuilder.kind1().content("hello").build());

pool.install();
try {
  const ws = new WebSocket("wss://relay.example.com");
  ws.onopen = () => ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
  // → EVENT, EOSE が返る
} finally {
  pool.uninstall();
}
```

---

### NIP-04: Encrypted Direct Messages ✅ テンプレート対応

EventBuilder で kind:4 DM イベントのテンプレートを提供。**暗号化はモック**（実際の NIP-04 暗号化は行わない）。

```typescript
const dm = EventBuilder.dm("recipient-pubkey", "hello").build();
// → kind: 4, content: "mock-encrypted:hello", tags: [["p", "recipient-pubkey"]]
```

---

### NIP-10: Reply Threading ✅ テンプレート対応

EventBuilder の `thread()` メソッドで NIP-10 準拠のリプライチェーンを生成。

```typescript
const thread = EventBuilder.thread(5);
// thread[0]: root（タグなし）
// thread[1]: reply（["e", root.id, "", "root"], ["p", root.pubkey]）
// thread[2]: reply（["e", root.id, "", "root"], ["e", thread[1].id, "", "reply"], ["p", thread[1].pubkey]）
```

---

### NIP-25: Reactions ✅ テンプレート対応

EventBuilder の `withReactions()` で kind:7 リアクションを生成。

```typescript
const [post, reactions] = EventBuilder.withReactions(5);
// reactions[n]: kind: 7, content: "+", tags: [["e", post.id], ["p", post.pubkey]]
```

---

### NIP-29: Group Chat ✅ テンプレート対応

```typescript
const msg = EventBuilder.groupMessage("group-id").content("hello group").build();
// → kind: 9, tags: [["h", "group-id"]]
```

---

### NIP-30: Custom Emoji ✅ タグ対応

```typescript
const event = EventBuilder.kind1()
  .emoji("sushi", "https://example.com/sushi.png")
  .build();
// → tags: [["emoji", "sushi", "https://example.com/sushi.png"]]
```

---

### NIP-42: Authentication ✅ 完全対応

AUTH チャレンジ/レスポンスのフルフローに対応。認証必須リレーでは、未認証の REQ/EVENT を自動的に拒否する。

```typescript
const relay = pool.relay("wss://auth.relay.com", { requiresAuth: true });

relay.requireAuth((authEvent) => {
  // kind:22242 検証
  // challengeタグ検証（自動）
  // relayタグ検証（カスタム）
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com"
  );
});

// 接続時に ["AUTH", challenge] が送信される
// 未認証の REQ → ["CLOSED", subId, "auth-required: ..."]
// 未認証の EVENT → ["OK", id, false, "auth-required: ..."]
// クライアントが kind:22242 イベントで応答
// バリデーション後に ["OK", id, true/false, message] が返る
// 認証成功後は REQ/EVENT が通常通り処理される
```

---

### NIP-52: Geohash ✅ タグ対応

```typescript
const event = EventBuilder.kind1()
  .geohash("u4pruydqqvj")
  .build();
// → tags: [["g", "u4pruydqqvj"]]
```

---

### NIP-57: Zap Request ✅ テンプレート対応

```typescript
const zap = EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://relay.example.com"],
  lnurl: "lnurl1...",
  eventId: "target-event",
  recipientPubkey: "recipient-pub",
});
// → kind: 9734, tags: [["amount", "1000"], ["lnurl", "..."], ["relays", "..."], ["e", "..."], ["p", "..."]]
```

---

## 実装予定 NIP（v0.2.0 以降）

| NIP | 内容 | 予定バージョン | 概要 |
|-----|------|--------------|------|
| NIP-11 | Relay Information | v0.2.0 | `GET /` で返す relay info のモック |
| NIP-45 | COUNT | v0.2.0 | `["COUNT", subId, ...filters]` への応答 |
| NIP-50 | Search | v0.2.0 | `search` フィルターフィールドの対応 |
| NIP-65 | Relay List Metadata | v0.3.0 | kind:10002 イベントのテンプレート |
| NIP-94 | File Metadata | v0.3.0 | kind:1063 のテンプレート |

---

## 非対応 NIP（対応予定なし）

| NIP | 内容 | 非対応理由 |
|-----|------|-----------|
| NIP-05 | DNS Identifier | DNS 解決はモックライブラリの範囲外 |
| NIP-07 | Browser Extension | ブラウザ API のモックは別ライブラリで対応すべき（※ `EventBuilder.nip07Request()` で kind:24133 テストイベントの生成は可能） |
| NIP-19 | bech32 Encoding | エンコーディングはクライアント側の処理 |
| NIP-46 | Nostr Connect | リモート署名はモックリレーの範囲外 |

---

## 関連ドキュメント

- [API_REFERENCE.md](./API_REFERENCE.md) - API 詳細
- [EXAMPLES.md](./EXAMPLES.md) - 使用例
- [TUTORIAL.md](./TUTORIAL.md) - チュートリアル
