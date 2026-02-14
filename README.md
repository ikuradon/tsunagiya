# tsunagiya

Nostr relay mock library for Deno/TypeScript.

`globalThis.WebSocket`
を差し替えることで、**既存のNostrクライアントコードを一切変更せず**にテストできます。

## インストール

```bash
deno add jsr:@ikuradon/tsunagiya
```

## 基本的な使い方

```typescript
import { MockPool } from "@ikuradon/tsunagiya";

Deno.test("fetch events from relay", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store({
    id: "abc123",
    pubkey: "pubkey1",
    kind: 1,
    content: "hello nostr",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    // ... テスト対象のクライアントコードがそのまま動く
  } finally {
    pool.uninstall();
  }
});
```

## 機能

- WebSocket 完全乗っ取り型モック
- 複数リレー同時対応
- NIP-01 フィルター自動マッチング + カスタムハンドラー
- 不安定リレーのシミュレート（レイテンシ、エラー率、切断）
- NIP-42 AUTH チャレンジ/レスポンス
- 送信メッセージの記録・検証ヘルパー
- テスト支援ヘルパー（EventBuilder, FilterBuilder, assertions）
- リアルタイムストリーム・スナップショット
- ログ機能（console / カスタムハンドラー）
- テストフレームワーク非依存
- 外部依存ゼロ

## MockPool

テストのエントリポイント。複数の `MockRelay` を管理し、`globalThis.WebSocket`
を差し替える。

```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

pool.install(); // WebSocket差し替え
pool.uninstall(); // 元に戻す
pool.reset(); // 全リレーの状態をリセット
pool.connections; // アクティブ接続一覧 (Map<string, number>)
```

## MockRelay

URL単位で動作する仮想リレー。

### イベントの登録とカスタムハンドラー

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

### 不安定リレーのシミュレート

```typescript
pool.relay("wss://unstable.relay.com", {
  latency: { min: 100, max: 2000 },
  errorRate: 0.3,
  disconnectRate: 0.1,
  connectionTimeout: 5000,
});
```

### エラーケーステスト

```typescript
relay.refuse(); // 接続拒否
relay.disconnect(); // 全接続を即座に切断
relay.disconnectAfter(3000); // 3秒後に切断
relay.close(1006); // 特定クローズコードで切断
relay.sendRaw("not json"); // 不正データ送信
relay.sendNotice("rate-limited"); // NOTICE送信
```

### NIP-42 AUTH

```typescript
const relay = pool.relay("wss://auth.relay.com", {
  requiresAuth: true,
});

relay.requireAuth((authEvent) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
  );
});
```

### 検証ヘルパー

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

### スナップショット

```typescript
const snap = relay.snapshot();

relay.store(event2);
relay.store(event3);

relay.restore(snap); // event2, event3 追加前の状態に戻る
```

### ログ機能

```typescript
// console出力
pool.relay("wss://relay.example.com", { logging: true });

// カスタムハンドラー
const logs: LogEntry[] = [];
pool.relay("wss://relay.example.com", {
  logging: (entry) => logs.push(entry),
});
```

## テスト支援ヘルパー

`@ikuradon/tsunagiya/testing` からインポートする。

```typescript
import {
  assertReceivedREQ,
  EventBuilder,
  FilterBuilder,
  restore,
  snapshot,
  streamEvents,
} from "@ikuradon/tsunagiya/testing";
```

### EventBuilder

```typescript
// ビルダーパターンでイベント生成
const event = EventBuilder.kind1()
  .content("hello world")
  .tag("p", pubkey)
  .build();

// ランダム生成
const random = EventBuilder.random({ kind: 1 });

// 壊れたイベント
const broken = EventBuilder.kind1()
  .corrupt({ id: true, sig: true })
  .build();

// バルク生成
const events = EventBuilder.bulk(100, { kind: 1 });

// 時系列データ
const timeline = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});

// リプライチェーン
const thread = EventBuilder.thread(5);

// リアクション付き
const [post, reactions] = EventBuilder.withReactions(3);

// NIP別テンプレート
EventBuilder.metadata({ name: "Alice", about: "Nostr user" });
EventBuilder.contacts(["pub1", "pub2"]);
EventBuilder.dm("recipient", "secret message");
EventBuilder.groupMessage("group-id").content("hello");
EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://r.com"],
  lnurl: "...",
});
```

### FilterBuilder

```typescript
FilterBuilder.timeline({ limit: 20 });
// => { kinds: [1], limit: 20 }

FilterBuilder.profile("pubkey");
// => { kinds: [0], authors: ["pubkey"] }

FilterBuilder.mentions("pubkey");
// => { kinds: [1], "#p": ["pubkey"] }

FilterBuilder.reactions("eventId");
// => { kinds: [7], "#e": ["eventId"] }
```

### アサーションヘルパー

```typescript
import {
  assertAuthCompleted,
  assertClosed,
  assertEventPublished,
  assertNoErrors,
  assertReceived,
  assertReceivedREQ,
} from "@ikuradon/tsunagiya/testing";

assertReceivedREQ(relay, { kinds: [1] });
assertEventPublished(relay, "event-id");
assertNoErrors(relay);
assertAuthCompleted(relay);
assertClosed(relay, "sub1");
assertReceived(relay, (messages) => messages.some((m) => m[0] === "REQ"));
```

### リアルタイムストリーム

```typescript
import { startStream, streamEvents } from "@ikuradon/tsunagiya/testing";

// 時間差でイベント配信
const handle = streamEvents(relay, events, {
  interval: 100,
  jitter: 50,
});
handle.stop();

// 継続的ストリーム
const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
});
stream.stop();
```

### スナップショット（テスト支援）

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

const snap = snapshot(relay);
// ... 操作 ...
restore(relay, snap);
```

## 対応NIP

| NIP    | 内容            | 対応状況                            |
| ------ | --------------- | ----------------------------------- |
| NIP-01 | Basic Protocol  | EVENT, REQ, CLOSE, EOSE, OK, NOTICE |
| NIP-04 | Encrypted DM    | EventBuilder テンプレート           |
| NIP-10 | Reply Threading | EventBuilder e/p タグ               |
| NIP-29 | Group Chat      | EventBuilder テンプレート           |
| NIP-30 | Custom Emoji    | EventBuilder emoji タグ             |
| NIP-42 | AUTH            | チャレンジ/レスポンス               |
| NIP-52 | Geohash         | EventBuilder geohash タグ           |
| NIP-57 | Zap Request     | EventBuilder テンプレート           |

## ライセンス

MIT
