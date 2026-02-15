# NIP 対応状況

繋ぎ屋 v0.2.0 の NIP（Nostr Implementation Possibilities）対応状況。

---

## サポート済み NIP（v0.2.0）

### NIP-01: Basic Protocol ✅ 完全対応

Nostr の基本プロトコル。繋ぎ屋のコア機能。

**対応メッセージ:**

| メッセージ | 方向           | 対応                               |
| ---------- | -------------- | ---------------------------------- |
| `EVENT`    | client → relay | ✅ 受信・ストア追加・OK 応答       |
| `REQ`      | client → relay | ✅ フィルタリング・EVENT/EOSE 応答 |
| `CLOSE`    | client → relay | ✅ サブスクリプション解除          |
| `EVENT`    | relay → client | ✅ サブスクリプション配信          |
| `OK`       | relay → client | ✅ EVENT 受理/拒否                 |
| `EOSE`     | relay → client | ✅ ストアイベント送信完了          |
| `NOTICE`   | relay → client | ✅ `sendNotice()`                  |
| `AUTH`     | relay → client | ✅ NIP-42 チャレンジ               |

**フィルタリング:**

```typescript
// 全フィルター条件に対応
const filter: NostrFilter = {
  ids: ["prefix..."], // IDプレフィックスマッチ
  authors: ["prefix..."], // 公開鍵プレフィックスマッチ
  kinds: [1], // kind完全一致
  since: 1700000000, // created_at下限
  until: 1700100000, // created_at上限
  limit: 20, // 返却数上限
  "#e": ["eventId"], // タグフィルター
  "#p": ["pubkey"], // タグフィルター
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

EventBuilder で kind:4 DM
イベントのテンプレートを提供。**暗号化はモック**（実際の NIP-04
暗号化は行わない）。

```typescript
const dm = EventBuilder.dm("recipient-pubkey", "hello").build();
// → kind: 4, content: "mock-encrypted:hello", tags: [["p", "recipient-pubkey"]]
```

---

### NIP-09: Event Deletion ✅ 完全対応

kind:5 削除リクエストの処理に対応。`e` タグによるイベント ID 指定、`a`
タグによるアドレス指定（Replaceable / Parameterized
Replaceable）の両方をサポート。

削除されたイベントは `deletedIds` で追跡され、再投稿が拒否される。

```typescript
// イベントIDで削除
const deletion = EventBuilder.deletion(["target-event-id1", "target-event-id2"])
  .pubkey(authorPubkey)
  .build();
relay.store(deletion);

// アドレス指定で削除（Parameterized Replaceable イベント）
const addrDeletion = EventBuilder.deletionByAddress([
  "30023:pubkey:article-slug",
])
  .pubkey(authorPubkey)
  .build();
relay.store(addrDeletion);

// 削除済みイベントの確認
console.log(relay.deletedIds); // Set { "target-event-id1", "target-event-id2" }
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

### NIP-16: Event Treatment ✅ 完全対応

イベントの `kind` 値に基づく種別判定と、種別ごとのストア処理に対応。

| 種別                      | kind 範囲      | ストア挙動                                        |
| ------------------------- | -------------- | ------------------------------------------------- |
| Regular                   | 0-9999, 40000+ | 通常通り追加                                      |
| Replaceable               | 10000-19999    | 同一 kind+pubkey の古いイベントを削除し追加       |
| Ephemeral                 | 20000-29999    | ストアに追加せず、ブロードキャストのみ            |
| Parameterized Replaceable | 30000-39999    | 同一 kind+pubkey+d-tag の古いイベントを削除し追加 |

```typescript
import { classifyEvent, isEphemeral, isReplaceable } from "@ikuradon/tsunagiya";

classifyEvent(1); // "regular"
classifyEvent(10002); // "replaceable"
classifyEvent(20001); // "ephemeral"
classifyEvent(30023); // "parameterized_replaceable"

isReplaceable(10002); // true
isEphemeral(20001); // true
```

---

### NIP-33: Parameterized Replaceable Events ✅ 完全対応

`d` タグによるパラメータ化された Replaceable イベントの管理に対応。同一
`kind:pubkey:d-tag`
の組み合わせで一意に識別され、より新しいイベントで置換される。

```typescript
import {
  getParameterizedId,
  isParameterizedReplaceable,
} from "@ikuradon/tsunagiya";

isParameterizedReplaceable(30023); // true

const article = EventBuilder.kind(30023)
  .tag("d", "my-article")
  .pubkey("author-pubkey")
  .content("article content")
  .build();

getParameterizedId(article); // "30023:author-pubkey:my-article"

// ストアは自動的に古いバージョンを置換
relay.store(article); // true
const updated = EventBuilder.kind(30023)
  .tag("d", "my-article")
  .pubkey("author-pubkey")
  .createdAt(article.created_at + 60)
  .content("updated content")
  .build();
relay.store(updated); // true（古いバージョンが削除される）
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
const msg = EventBuilder.groupMessage("group-id").content("hello group")
  .build();
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

AUTH チャレンジ/レスポンスのフルフローに対応。認証必須リレーでは、未認証の
REQ/EVENT を自動的に拒否する。

```typescript
const relay = pool.relay("wss://auth.relay.com", { requiresAuth: true });

relay.requireAuth((authEvent) => {
  // kind:22242 検証
  // challengeタグ検証（自動）
  // relayタグ検証（カスタム）
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
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

### NIP-45: COUNT ✅ 完全対応

`["COUNT", subId, ...filters]`
メッセージへの応答に対応。ストアに対してフィルタリングし、マッチするイベント数を返す。カスタムハンドラーでの応答カスタマイズも可能。

```typescript
const relay = pool.relay("wss://relay.example.com");

// ストアにイベントを追加
for (const event of EventBuilder.bulk(50, { kind: 1 })) {
  relay.store(event);
}

pool.install();
try {
  const ws = new WebSocket("wss://relay.example.com");
  ws.onopen = () => {
    ws.send(JSON.stringify(["COUNT", "count1", { kinds: [1] }]));
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // → ["COUNT", "count1", { count: 50 }]
  };
} finally {
  pool.uninstall();
}

// カスタムハンドラー
relay.onCOUNT((subId, filters) => {
  return { count: 42 };
});
```

---

### NIP-50: Search ✅ 完全対応

フィルターの `search` フィールドに対応。`content`
の部分一致（大文字小文字非区別）でマッチングを行う。

```typescript
import { FilterBuilder } from "@ikuradon/tsunagiya/testing";

const relay = pool.relay("wss://relay.example.com");

relay.store(EventBuilder.kind1().content("Hello Nostr World").build());
relay.store(EventBuilder.kind1().content("goodbye").build());

pool.install();
try {
  const ws = new WebSocket("wss://relay.example.com");
  ws.onopen = () => {
    // search フィルターを使用
    ws.send(JSON.stringify(["REQ", "search1", { search: "nostr" }]));
    // → "Hello Nostr World" のみマッチ
  };
} finally {
  pool.uninstall();
}

// FilterBuilder でも生成可能
const filter = FilterBuilder.search("nostr");
// → { search: "nostr" }
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

## 実装予定 NIP（v0.3.0 以降）

| NIP    | 内容                | 予定バージョン | 概要                               |
| ------ | ------------------- | -------------- | ---------------------------------- |
| NIP-11 | Relay Information   | v0.3.0         | `GET /` で返す relay info のモック |
| NIP-65 | Relay List Metadata | v0.3.0         | kind:10002 イベントのテンプレート  |
| NIP-94 | File Metadata       | v0.3.0         | kind:1063 のテンプレート           |

---

## 非対応 NIP（対応予定なし）

| NIP    | 内容              | 非対応理由                                                                                                                  |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| NIP-05 | DNS Identifier    | DNS 解決はモックライブラリの範囲外                                                                                          |
| NIP-07 | Browser Extension | ブラウザ API のモックは別ライブラリで対応すべき（※ `EventBuilder.nip07Request()` で kind:24133 テストイベントの生成は可能） |
| NIP-19 | bech32 Encoding   | エンコーディングはクライアント側の処理                                                                                      |
| NIP-46 | Nostr Connect     | リモート署名はモックリレーの範囲外                                                                                          |

---

## 関連ドキュメント

- [API_REFERENCE.md](./API_REFERENCE.md) - API 詳細
- [EXAMPLES.md](./EXAMPLES.md) - 使用例
- [TUTORIAL.md](./TUTORIAL.md) - チュートリアル
