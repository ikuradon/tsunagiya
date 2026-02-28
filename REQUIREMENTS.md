# 繋ぎ屋 (tsunagiya) - 要件定義書

## 1. 概要

**tsunagiya**（繋ぎ屋）は、Nostrプロトコルのリレーをモックするテスト用ライブラリ。`globalThis.WebSocket`を差し替えることで、既存のNostrクライアントコードを一切変更せずにテストできる。

## 2. 用語

| 用語         | 意味                              |
| ------------ | --------------------------------- |
| MockRelay    | URL単位で動作する仮想リレー       |
| MockPool     | 複数のMockRelayを管理するコンテナ |
| Interception | WebSocketの差し替え・復元の仕組み |

## 3. アーキテクチャ

```
クライアントコード
    ↓ new WebSocket("wss://relay.example.com")
MockWebSocket (globalThis.WebSocket を差し替え済み)
    ↓ URL でルーティング
MockPool → MockRelay("wss://relay.example.com")
             ↓
           フィルタリング / レスポンス生成
```

## 4. API設計

### 4.1 MockPool（メインエントリポイント）

```typescript
import { MockPool } from "@ikuradon/tsunagiya";

// 作成
const pool = new MockPool();

// リレー登録
const relay = pool.relay("wss://relay.example.com");
const relay2 = pool.relay("wss://relay2.example.com", {
  latency: { min: 50, max: 200 },
  errorRate: 0.1,
});

// WebSocket差し替え開始
pool.install();

// ... テスト実行 ...

// 復元
pool.uninstall();
```

#### メソッド

| メソッド               | 説明                                     |
| ---------------------- | ---------------------------------------- |
| `relay(url, options?)` | MockRelayを登録・取得                    |
| `install()`            | globalThis.WebSocketを差し替え           |
| `uninstall()`          | 元のWebSocketを復元                      |
| `reset()`              | 全リレーの状態をリセット（記録クリア等） |
| `connections`          | 現在のアクティブ接続一覧                 |

### 4.2 MockRelay

```typescript
const relay = pool.relay("wss://relay.example.com");

// イベントを事前登録
relay.store(event1);
relay.store(event2);

// REQハンドラーのカスタマイズ
relay.onREQ((subId, filters) => {
  return [customEvent];
});

// EVENTハンドラー
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});

// AUTH
relay.requireAuth((authEvent) => {
  return true; // or false
});

// 不安定性シミュレート
relay.disconnect(); // 即座に切断
relay.disconnectAfter(3000); // 3秒後に切断
relay.refuse(); // 接続拒否モード
relay.sendError("error message"); // NOTICEを送信

// 検証
relay.received; // 全受信メッセージ（生データ）
relay.findREQ(subId); // 特定subIdのREQを検索
relay.countREQs(); // REQ数
relay.hasREQ(subId); // subIdのREQが存在するか
relay.findEvent(eventId); // 特定IDのEVENTを検索
relay.countEvents(); // 受信EVENT数
relay.hasEvent(eventId); // eventIdが送信されたか
relay.findCLOSE(subId); // CLOSE検索
```

#### MockRelayOptions

```typescript
interface MockRelayOptions {
  /** レイテンシ (ms) */
  latency?: { min: number; max: number } | number;
  /** エラー率 (0.0 - 1.0) */
  errorRate?: number;
  /** ランダム切断確率 (0.0 - 1.0) */
  disconnectRate?: number;
  /** 接続タイムアウト (ms)。設定するとタイムアウトをシミュレート */
  connectionTimeout?: number;
  /** 再接続遅延 (ms) */
  reconnectDelay?: number;
  /** 接続時にAUTH要求するか */
  requiresAuth?: boolean;
  /** ログ出力 */
  logging?: boolean | LogHandler;
}

type LogHandler = (entry: LogEntry) => void;

interface LogEntry {
  timestamp: number;
  relay: string;
  direction: "send" | "receive";
  data: unknown;
}
```

### 4.3 フィルタリング（ハイブリッド方式）

#### デフォルト: 自動マッチング

`relay.store()`
で登録されたイベントに対して、NIP-01のフィルター仕様に従い自動マッチング。

対応フィルターフィールド:

- `ids` — イベントIDプレフィックスマッチ
- `authors` — 公開鍵プレフィックスマッチ
- `kinds` — kindの完全一致
- `since` / `until` — created_atの範囲
- `#e`, `#p` 等 — タグフィルター
- `limit` — 返却数制限

マッチしたイベントを送信後、EOSEを返す。

#### カスタム: onREQハンドラー

```typescript
relay.onREQ((subId, filters) => {
  // 返り値: イベント配列 → EVENT送信後EOSE
  return [event1, event2];
});
```

onREQが設定されている場合、自動マッチングはスキップされる。

### 4.4 エラーケーステスト

```typescript
// 接続拒否
const relay = pool.relay("wss://dead.relay.test");
relay.refuse();

// 接続後に突然切断
relay.disconnectAfter(1000);

// 不正JSONを送信
relay.sendRaw("this is not json");

// 特定のクローズコードで切断
relay.close(1006); // Abnormal Closure
relay.close(1008); // Policy Violation

// AUTH失敗
relay.requireAuth(() => false);

// NOTICEを送信
relay.sendNotice("rate-limited");
```

### 4.5 NIP-42 AUTH

```typescript
const relay = pool.relay("wss://auth.relay.test", {
  requiresAuth: true,
});

// 接続時に自動的にAUTHチャレンジを送信
// ["AUTH", "<challenge>"]

// クライアントがAUTH応答を送信 → バリデーション
relay.requireAuth((authEvent) => {
  // authEvent: kind:22242のイベント
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.test",
  );
});
```

## 5. 使用例

### 5.1 基本的なテスト (Deno.test)

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { assertEquals } from "@std/assert";

Deno.test("fetch events from relay", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.store({
    id: "abc123",
    pubkey: "pubkey1",
    kind: 1,
    content: "hello",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  pool.install();
  try {
    // テスト対象のクライアントコード
    const ws = new WebSocket("wss://relay.example.com");
    // ... クライアントロジック ...
  } finally {
    pool.uninstall();
  }
});
```

### 5.2 不安定リレーのテスト

```typescript
Deno.test("handle unstable relay", async () => {
  const pool = new MockPool();
  pool.relay("wss://unstable.relay.test", {
    latency: { min: 100, max: 2000 },
    errorRate: 0.3,
    disconnectRate: 0.1,
  });

  pool.install();
  try {
    // 再接続ロジックのテスト
  } finally {
    pool.uninstall();
  }
});
```

### 5.3 複数リレー

```typescript
Deno.test("multi-relay", async () => {
  const pool = new MockPool();
  const fast = pool.relay("wss://fast.relay.test");
  const slow = pool.relay("wss://slow.relay.test", { latency: 500 });

  fast.store(event1);
  slow.store(event2);

  pool.install();
  try {
    // 複数リレーに同時接続するクライアントのテスト
  } finally {
    pool.uninstall();
  }
});
```

### 5.4 検証

```typescript
Deno.test("verify sent messages", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    // クライアントがイベントを投稿
    // ...

    assertEquals(relay.countEvents(), 1);
    assert(relay.hasEvent("expected-event-id"));
    assertEquals(relay.findREQ("sub1")?.[1], [{ kinds: [1] }]);
  } finally {
    pool.uninstall();
  }
});
```

## 6. テスト支援ヘルパー

### 6.1 EventBuilder - イベント生成ヘルパー

```typescript
import { EventBuilder } from "@ikuradon/tsunagiya/testing";

// 基本的な生成
const event = EventBuilder.kind1()
  .content("hello world")
  .tag("e", eventId, relayUrl, "reply")
  .tag("p", pubkey)
  .sign(privateKey);

// ランダム生成
const random = EventBuilder.random({ kind: 1 });

// 壊れたイベント（テスト用）
const broken = EventBuilder.kind1()
  .content("test")
  .corrupt({ id: true }); // IDを不正に

// 署名エラー
const badSig = EventBuilder.kind1()
  .content("test")
  .sign(privateKey)
  .corrupt({ sig: true }); // 署名だけ壊す
```

#### バルク生成

```typescript
// 100件の正常なイベント
const events = EventBuilder.bulk(100, { kind: 1 });

// 時系列データ（created_atを自動調整）
const timeline = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60, // 60秒間隔
  startTime: Date.now() / 1000,
});
```

#### リレーションシップ生成

```typescript
// リプライチェーン（スレッド）
const thread = EventBuilder.thread(5); // 5階層のリプライ
// → [root, reply1, reply2, reply3, reply4]

// リアクション付き投稿
const [post, reactions] = EventBuilder.withReactions(3); // 3つのリアクション
```

#### Common Tags対応

```typescript
// Geohash (NIP-52)
EventBuilder.kind1()
  .content("at the park")
  .geohash("9q8yy");

// e/p tags (NIP-10)
EventBuilder.kind1()
  .content("reply")
  .tag("e", rootEventId, relayUrl, "root")
  .tag("e", replyEventId, relayUrl, "reply")
  .tag("p", mentionPubkey);

// Emoji (NIP-30)
EventBuilder.kind1()
  .content("cool :fire:")
  .emoji("fire", "https://example.com/fire.png");

// グループチャット (NIP-29)
EventBuilder.groupMessage("group-id")
  .content("hello group");
```

#### NIP別テンプレート

```typescript
// Metadata (kind:0)
EventBuilder.metadata({
  name: "Alice",
  about: "Nostr user",
  picture: "https://example.com/avatar.png",
});

// Contacts (kind:3)
EventBuilder.contacts([pubkey1, pubkey2]);

// DM (kind:4, NIP-04)
EventBuilder.dm(recipientPubkey, "secret message")
  .sign(senderPrivateKey);

// Zap Request (kind:9734, NIP-57)
EventBuilder.zapRequest({
  amount: 1000,
  relays: ["wss://relay.example.com"],
  lnurl: "lnurl1...",
});

// NIP-07 Request (kind:24133)
EventBuilder.nip07Request();
```

### 6.2 FilterBuilder - フィルター生成ヘルパー

```typescript
import { FilterBuilder } from "@ikuradon/tsunagiya/testing";

// よくあるフィルターパターン
const timeline = FilterBuilder.timeline({ limit: 20 });
// → { kinds: [1], limit: 20 }

const profile = FilterBuilder.profile(pubkey);
// → { kinds: [0], authors: [pubkey] }

const mentions = FilterBuilder.mentions(pubkey);
// → { kinds: [1], "#p": [pubkey] }

const reactions = FilterBuilder.reactions(eventId);
// → { kinds: [7], "#e": [eventId] }
```

### 6.3 リアルタイムシミュレート

```typescript
const relay = pool.relay("wss://relay.example.com");

// イベントを時間差で送信
relay.streamEvents([event1, event2, event3], {
  interval: 100, // 100msごと
  jitter: 50, // ランダムで±50ms
});

// 継続的なストリーム
const stream = relay.startStream({
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10, // 10件送ったら停止
});

stream.stop(); // 手動停止
```

### 6.4 スナップショット機能

```typescript
const relay = pool.relay("wss://relay.example.com");
relay.store(event1);

// 状態を保存
const snapshot = relay.snapshot();

relay.store(event2);
relay.store(event3);

// 状態を復元（event1のみの状態に戻る）
relay.restore(snapshot);

assertEquals(relay.countEvents(), 1);
```

### 6.5 アサーションヘルパー

```typescript
// よくある検証パターン
relay.assertReceivedREQ({ kinds: [1] });
relay.assertEventPublished(eventId);
relay.assertNoErrors(); // NOTICEが送られていないか
relay.assertAuthCompleted(); // AUTH成功したか
relay.assertClosed(subId); // CLOSEが送られたか

// カスタムアサーション
relay.assertReceived((messages) => {
  return messages.some((m) => m[0] === "REQ" && m[1] === "sub1");
});
```

## 7. プロジェクト構成

```
tsunagiya/
├── deno.json
├── LICENSE
├── README.md
├── REQUIREMENTS.md
├── CLAUDE.md
├── .gitignore
├── src/
│   ├── mod.ts              # エントリポイント（re-export）
│   ├── pool.ts             # MockPool
│   ├── relay.ts            # MockRelay
│   ├── websocket.ts        # MockWebSocket & interception
│   ├── filter.ts           # NIP-01フィルターマッチング
│   ├── auth.ts             # NIP-42 AUTH処理
│   ├── types.ts            # 型定義
│   ├── logger.ts           # ログ機能
│   └── testing/
│       ├── mod.ts          # テスト支援ヘルパーのエントリポイント
│       ├── event_builder.ts  # EventBuilder
│       ├── filter_builder.ts # FilterBuilder
│       ├── snapshot.ts     # スナップショット機能
│       ├── stream.ts       # リアルタイムストリーム
│       └── assertions.ts   # アサーションヘルパー
└── tests/
    ├── pool_test.ts
    ├── relay_test.ts
    ├── websocket_test.ts
    ├── filter_test.ts
    ├── auth_test.ts
    ├── testing/
    │   ├── event_builder_test.ts
    │   ├── filter_builder_test.ts
    │   ├── snapshot_test.ts
    │   ├── stream_test.ts
    │   └── assertions_test.ts
    └── integration_test.ts
```

## 8. 非機能要件

- **依存関係**: ゼロ外部依存（Deno標準ライブラリのみ）
- **パフォーマンス**: 1000件のイベントストアでもフィルタリングが10ms以内
- **テストカバレッジ**: 90%以上
- **JSR公開**: `@ikuradon/tsunagiya`
