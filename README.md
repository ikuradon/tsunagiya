# 繋ぎ屋 (tsunagiya)

Nostr relay mock library for Deno/TypeScript.

`globalThis.WebSocket`
を差し替えることで、**既存のNostrクライアントコードを一切変更せず**にテストできます。

## インストール

**Deno:**

```bash
deno add jsr:@ikuradon/tsunagiya
```

**npm:**

```bash
npm install @ikuradon/tsunagiya
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
- Indexed EventStore + compiled filter fast path による高速な `REQ` / `COUNT`
- NIP-01 フィルター自動マッチング + カスタムハンドラー
- 不安定リレーのシミュレート（レイテンシ、エラー率、切断）
- NIP-42 AUTH チャレンジ/レスポンス
- ランタイム入力検証（message/filter/subId/tag/content limit）
- 送信メッセージの記録・検証ヘルパー
- NIP-01 イベント種別自動処理（Regular/Replaceable/Ephemeral/Addressable）
- NIP-09 Event Deletion Request
- NIP-11 リレー情報ドキュメント（setInfo/getInfo + fetch インターセプト）
- NIP-17 Private Direct Messages（EventBuilder
  chatMessage/seal/giftWrap/dmRelayList/privateDM）
- NIP-18 Reposts（EventBuilder repost/genericRepost）
- NIP-23 Long-form Content（EventBuilder longFormContent/longFormDraft）
- NIP-25 Reactions（EventBuilder withReactions/externalReaction）
- NIP-40 Expiration Timestamp（EventBuilder `withExpiration()`）
- NIP-51 Lists（EventBuilder
  muteList/pinList/bookmarks/followSet/relaySet/emojiSet）
- NIP-65 Relay List Metadata（EventBuilder relayList）
- NIP-45 COUNT メッセージ対応
- NIP-50 検索フィルター対応
- テスト支援ヘルパー（EventBuilder, FilterBuilder, assertions）
- リアルタイムストリーム・スナップショット
- ログ機能（console / カスタムハンドラー）
- テストフレームワーク非依存
- 外部依存ゼロ
- E2Eテスト対応（nostr-tools, NDK, rx-nostr, nostr-fetch）
- 決定論的 runtime 注入（`MockRelayOptions.clock/random`,
  `EventBuilderRuntimeOptions`, `StreamOptions.random`）

## 公開 API 互換性と内部刷新

2026-03 の全面リファクタリングでは、公開 API
を維持したまま内部を再設計しました。

- `MockPool`、`MockRelay`、`AuthState`、`@ikuradon/tsunagiya/testing` の import
  path はそのまま使えます
- 内部は `EventStore`、`SubscriptionRegistry`、`AuthService`、
  `DeliveryScheduler`、platform hook に分割されています
- 大きいストアに対する `REQ` / `COUNT` は、索引付きストアと compiled filter
  により従来より高速です
- 入力検証は厳格化されています。 `max_message_length`、filter
  数、`max_subid_length`、`max_limit`、 `max_event_tags`、`max_content_length`
  を routing 前に拒否します

内部実装の import path は安定 API ではありません。公開 export を使ってください。

2026-03 の全面リファクタリング本体は 2026-03-29 にクローズしました。
クローズアウトの判断と以後の運用ルールは
`docs/superpowers/plans/2026-03-29-refactor-closeout.md` と
`docs/superpowers/plans/2026-03-29-maintainer-operating-rules.md`
に集約しています。

## MockPool

テストのエントリポイント。複数の `MockRelay` を管理し、`globalThis.WebSocket`
を差し替える。

### 基本的な使い方

```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

pool.install(); // WebSocket差し替え
pool.uninstall(); // 元に戻す
pool.reset(); // 全リレーの状態をリセット
pool.connections; // アクティブ接続一覧 (Map<string, number>)
```

### 複数リレーの使い方

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
const fastRelay = pool.relay("wss://fast.relay.test", { latency: 10 });
const slowRelay = pool.relay("wss://slow.relay.test", { latency: 500 });

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

**注意:** `pool.relay()`
で登録していないURLに接続しようとすると、接続失敗として扱われます（エラーイベント +
クローズイベント
code:1006）。これは実際のリレーに接続できなかった場合と同じ動作です。

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
pool.relay("wss://unstable.relay.test", {
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
const relay = pool.relay("wss://auth.relay.test", {
  requiresAuth: true,
});

relay.requireAuth((authEvent) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.test",
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

### NIP-01 イベント種別（旧 NIP-16/33）

```typescript
import {
  classifyEvent,
  isEphemeral,
  isParameterizedReplaceable,
  isReplaceable,
} from "@ikuradon/tsunagiya";

classifyEvent(10000); // "replaceable"
classifyEvent(20000); // "ephemeral"
classifyEvent(30000); // "parameterized_replaceable"
```

### NIP-09 削除リクエスト

```typescript
import { EventBuilder } from "@ikuradon/tsunagiya/testing";

// kind:5 削除リクエストイベントを生成
const deletion = EventBuilder.deletion(["event-id-1", "event-id-2"])
  .content("spam")
  .build();

relay.store(deletion);
// ストア内の対象イベントが自動的に削除される
```

### NIP-45 COUNT

```typescript
// COUNTハンドラーのカスタマイズ
relay.onCOUNT((subId, filters) => {
  return { count: 42 };
});

// クライアントから COUNT メッセージを送信
ws.send(JSON.stringify(["COUNT", "sub1", { kinds: [1] }]));
// => ["COUNT", "sub1", {"count": 42}]
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
  startStream,
  streamEvents,
  waitFor,
} from "@ikuradon/tsunagiya/testing";
```

EventBuilder の使用例:

```typescript
// ビルダーパターンでイベント生成
const event = EventBuilder.kind1()
  .content("hello world")
  .tag("p", pubkey)
  .build();

// ランダム生成
const random = EventBuilder.random({ kind: 1 });

// deterministic runtime
const fixedClock = { now: () => 1700000000000 };
const fixedRandom = {
  next: () => 0.25,
  fill(bytes: Uint8Array) {
    bytes.fill(0x11);
  },
};
const deterministic = EventBuilder.kind1({
  clock: fixedClock,
  random: fixedRandom,
})
  .content("stable")
  .build();

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
  relays: ["wss://r.test"],
  lnurl: "...",
});
```

FilterBuilder の使用例:

```typescript
FilterBuilder.timeline({ limit: 20 });
// => { kinds: [1], limit: 20 }

FilterBuilder.profile("pubkey");
// => { kinds: [0], authors: ["pubkey"] }

FilterBuilder.mentions("pubkey");
// => { kinds: [1], "#p": ["pubkey"] }

FilterBuilder.reactions("eventId");
// => { kinds: [7], "#e": ["eventId"] }

FilterBuilder.search("nostr");
// => { search: "nostr" }
```

アサーションヘルパー:

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

リアルタイムストリーム:

```typescript
const fixedRandom = {
  next: () => 0.5,
  fill(bytes: Uint8Array) {
    bytes.fill(0x22);
  },
};

// 時間差でイベント配信
const handle = streamEvents(relay, events, {
  interval: 100,
  jitter: 50,
  random: fixedRandom,
});
handle.stop();

// 継続的ストリーム
const stream = startStream(relay, {
  eventGenerator: () => EventBuilder.random({ kind: 1 }),
  interval: 1000,
  count: 10,
  random: fixedRandom,
});
stream.stop();
```

条件待ちヘルパー:

```typescript
import { waitFor } from "@ikuradon/tsunagiya/testing";

// 条件が満たされるまでポーリングで待機（固定 setTimeout の代替）
await waitFor(() => received.length >= 3);

// タイムアウト・ポーリング間隔のカスタマイズ
await waitFor(() => relay.connectionCount === 0, {
  timeout: 3000,
  interval: 20,
});
```

スナップショット:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

const snap = snapshot(relay);
// ... 操作 ...
restore(relay, snap);
```

## Vitest での使い方

npm パッケージとしてインストールすれば、Vitest でそのまま使えます。

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { MockPool } from "@ikuradon/tsunagiya";
import { waitFor } from "@ikuradon/tsunagiya/testing";

describe("Nostr client", () => {
  let pool: MockPool;

  afterEach(() => pool?.uninstall());

  it("should fetch events from relay", async () => {
    pool = new MockPool();
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

    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const messages: string[] = [];
    ws.onmessage = (ev) => messages.push(ev.data as string);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitFor(() => messages.some((m) => m.includes("abc123")));

    expect(messages.some((m) => m.includes("abc123"))).toBe(true);
    ws.close();
  });
});
```

> **Note:** Vitest のデフォルト環境 (`environment: 'node'`) で動作します。
> `jsdom` や `happy-dom` 環境では WebSocket の競合が起きる可能性があるため、
> `environment: 'node'` を推奨します。

## E2Eテスト対応

繋ぎ屋(tsunagiya) は以下の主要 Nostr クライアントライブラリとの互換性を E2E
テストで検証しています。

| ライブラリ  | テストコマンド                  | 検証内容                                            |
| ----------- | ------------------------------- | --------------------------------------------------- |
| nostr-tools | `deno task example:nostr-tools` | SimplePool での REQ/EVENT 処理                      |
| NDK         | `deno task example:ndk`         | NDK インスタンス経由のイベント取得・投稿            |
| rx-nostr    | `deno task example:rx-nostr`    | RxNostr の Reactive API（createRxNostr / use）      |
| nostr-fetch | `deno task example:nostr-fetch` | NostrFetcher によるイベント取得（fetch / iterator） |

全ライブラリで正規の BIP-340 Schnorr
署名を使用し、署名検証を無効化せずにテストを実施しています。

**E2E テストの実行:**

```bash
deno task example             # 全 E2E テスト実行
deno task test:all            # ユニットテスト + E2E テスト
```

## 対応NIP

| NIP    | 内容                                  | 対応状況                                                                           |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------- |
| NIP-01 | Basic Protocol                        | EVENT, REQ, CLOSE, EOSE, OK, CLOSED, NOTICE + Event Treatment + Addressable Events |
| NIP-04 | Encrypted DM ⚠️ deprecated (→ NIP-17) | EventBuilder テンプレート（NIP-17 への移行推奨）                                   |
| NIP-09 | Event Deletion                        | kind:5 削除リクエスト処理                                                          |
| NIP-10 | Reply Threading                       | EventBuilder e/p タグ                                                              |
| NIP-11 | Relay Information                     | setInfo/getInfo + fetch インターセプト                                             |
| NIP-17 | Private Direct Messages               | EventBuilder テンプレート（chatMessage/seal/giftWrap/dmRelayList）                 |
| NIP-18 | Reposts                               | EventBuilder テンプレート（repost/genericRepost）                                  |
| NIP-23 | Long-form Content                     | EventBuilder テンプレート（longFormContent/longFormDraft）                         |
| NIP-25 | Reactions                             | EventBuilder withReactions / externalReaction                                      |
| NIP-29 | Relay-based Groups                    | EventBuilder テンプレート                                                          |
| NIP-30 | Custom Emoji                          | EventBuilder emoji タグ                                                            |
| NIP-40 | Expiration Timestamp                  | EventBuilder `withExpiration()`                                                    |
| NIP-42 | AUTH                                  | チャレンジ/レスポンス                                                              |
| NIP-45 | COUNT                                 | COUNT メッセージ対応                                                               |
| NIP-50 | Search                                | content 部分一致検索                                                               |
| NIP-51 | Lists                                 | EventBuilder テンプレート（muteList/pinList/bookmarks/followSet等）                |
| NIP-52 | Calendar Events                       | EventBuilder テンプレート（全4種対応）                                             |
| NIP-57 | Lightning Zaps                        | EventBuilder テンプレート                                                          |
| NIP-65 | Relay List Metadata                   | EventBuilder relayList（kind:10002）                                               |

> **Note:** 旧 NIP-16 (Event Treatment) および旧 NIP-33 (Parameterized
> Replaceable Events) は現在 NIP-01 に統合されています。本ライブラリの
> Regular/Replaceable/Ephemeral/Addressable イベント処理は NIP-01
> 対応の一部です。

## ドキュメント

| ドキュメント                                                                            | 内容                       |
| --------------------------------------------------------------------------------------- | -------------------------- |
| [API リファレンス](https://ikuradon.github.io/tsunagiya/reference/api)                  | 全クラス・関数・型の詳細   |
| [アーキテクチャ](https://ikuradon.github.io/tsunagiya/reference/architecture)           | 内部構造とデータフロー     |
| [チュートリアル](https://ikuradon.github.io/tsunagiya/guide/tutorial)                   | ステップバイステップガイド |
| [使用例集](https://ikuradon.github.io/tsunagiya/guide/examples)                         | 実践的な使用例（14例）     |
| [テストパターン](https://ikuradon.github.io/tsunagiya/guide/test-patterns)              | よくあるテストシナリオ     |
| [内部リファクタ移行メモ](docs/superpowers/plans/2026-03-20-refactor-migration-notes.md) | maintainers 向けの変更要約 |
| [ベストプラクティス](https://ikuradon.github.io/tsunagiya/advanced/best-practices)      | テスト設計の指針           |
| [トラブルシューティング](https://ikuradon.github.io/tsunagiya/help/troubleshooting)     | よくあるエラーと解決方法   |
| [FAQ](https://ikuradon.github.io/tsunagiya/help/faq)                                    | よくある質問（17問）       |
| [NIP 対応状況](https://ikuradon.github.io/tsunagiya/reference/nip-support)              | NIP ごとの対応・使用例     |
| [パフォーマンス](https://ikuradon.github.io/tsunagiya/advanced/performance)             | 大量データの最適化         |

## ライセンス

MIT
