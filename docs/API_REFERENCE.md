# API リファレンス

tsunagiya v0.2.0 の全クラス・関数・型の詳細リファレンス。

## 目次

- [メインモジュール (`@ikuradon/tsunagiya`)](#メインモジュール)
  - [MockPool](#mockpool)
  - [MockRelay](#mockrelay)
  - [フィルター関数](#フィルター関数)
  - [イベント種別関数](#イベント種別関数)
  - [AUTH関連](#auth関連)
  - [Logger](#logger)
- [テストモジュール (`@ikuradon/tsunagiya/testing`)](#テストモジュール)
  - [EventBuilder](#eventbuilder)
  - [FilterBuilder](#filterbuilder)
  - [アサーション関数](#アサーション関数)
  - [ストリーム関数](#ストリーム関数)
  - [スナップショット関数](#スナップショット関数)
- [型定義](#型定義)

---

## メインモジュール

```typescript
import {
  AuthState,
  classifyEvent,
  createLogger,
  filterEvents,
  generateChallenge,
  getParameterizedId,
  isEphemeral,
  isParameterizedReplaceable,
  isReplaceable,
  Logger,
  matchFilter,
  matchFilters,
  MockPool,
  MockRelay,
} from "@ikuradon/tsunagiya";
```

### MockPool

テストのエントリポイント。複数の MockRelay を管理し、`globalThis.WebSocket`
を差し替える。

#### コンストラクタ

```typescript
new MockPool();
```

引数なし。

#### メソッド

##### `relay(url: string, options?: MockRelayOptions): MockRelay`

MockRelay を登録・取得する。同一 URL
に対して複数回呼び出すと、既存のインスタンスを返す。

```typescript
const relay = pool.relay("wss://relay.example.com");

// オプション付き
const relay = pool.relay("wss://relay.example.com", {
  latency: 100,
  errorRate: 0.1,
});
```

##### `install(): void`

`globalThis.WebSocket` を MockWebSocket に差し替える。

- **throws**: 既に install 済みの場合 `Error`

```typescript
pool.install();
```

##### `uninstall(): void`

元の WebSocket を復元する。

- **throws**: install されていない場合 `Error`

```typescript
pool.uninstall();
```

##### `reset(): void`

全リレーの状態をリセットする（ストア、受信ログ、サブスクリプション、ハンドラー）。

```typescript
pool.reset();
```

#### プロパティ

##### `connections: Map<string, number>` (readonly)

現在のアクティブ接続一覧。URL → 接続数のマップ。

```typescript
console.log(pool.connections); // Map { "wss://relay.example.com" => 2 }
```

##### `installed: boolean` (readonly)

install 済みかどうか。

---

### MockRelay

URL 単位で動作する仮想リレー。

#### プロパティ

| プロパティ        | 型                                 | 説明                           |
| ----------------- | ---------------------------------- | ------------------------------ |
| `url`             | `string` (readonly)                | リレーURL                      |
| `options`         | `MockRelayOptions` (readonly)      | リレーオプション               |
| `received`        | `ClientMessage[]` (readonly)       | 全受信メッセージ               |
| `connectionCount` | `number` (readonly)                | アクティブ接続数               |
| `errors`          | `ReadonlyArray<string>` (readonly) | 発生したエラーレスポンスのログ |
| `deletedIds`      | `ReadonlySet<string>` (readonly)   | 削除済みイベントID (NIP-09)    |
| `logger`          | `Logger \| null` (readonly)        | ロガーインスタンス             |

#### ストア・ハンドラー

##### `store(event: NostrEvent): boolean`

イベントをストアに登録する。REQ 受信時の自動マッチングに使用される。

NIP-16 に基づき、イベント種別に応じた処理を行う:

- **Regular** (kind 0-9999, 40000+): 通常通り追加
- **Replaceable** (kind 10000-19999): 同一 kind+pubkey
  の古いイベントを削除し追加（古い場合は無視）
- **Ephemeral** (kind 20000-29999): ストアに追加せず、ブロードキャストのみ
- **Parameterized Replaceable** (kind 30000-39999): 同一 kind+pubkey+d-tag
  の古いイベントを削除し追加

戻り値はストアに追加された場合 `true`、無視された場合（Ephemeral、古い
Replaceable、削除済み等）`false`。

```typescript
relay.store({
  id: "abc123",
  pubkey: "pubkey1",
  kind: 1,
  content: "hello",
  created_at: 1700000000,
  tags: [],
  sig: "sig1",
}); // → true

// Ephemeral イベントはストアに追加されない
relay.store(EventBuilder.kind(20001).build()); // → false
```

##### `onREQ(handler: REQHandler): void`

REQ
ハンドラーを設定する。設定すると自動マッチングがスキップされ、このハンドラーが呼ばれる。

```typescript
relay.onREQ((subId, filters) => {
  return [customEvent]; // マッチするイベントを返す
});

// 非同期も可能
relay.onREQ(async (subId, filters) => {
  return await fetchEvents(filters);
});
```

**型**:
`REQHandler = (subId: string, filters: NostrFilter[]) => NostrEvent[] | Promise<NostrEvent[]>`

##### `onEVENT(handler: EVENTHandler): void`

EVENT ハンドラーを設定する。クライアントから EVENT
メッセージを受信したときの処理をカスタマイズする。

```typescript
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});

// 拒否する場合
relay.onEVENT((event) => {
  return ["OK", event.id, false, "blocked: spam"];
});
```

**型**:
`EVENTHandler = (event: NostrEvent) => ["OK", string, boolean, string] | Promise<["OK", string, boolean, string]>`

##### `onCOUNT(handler: COUNTHandler): void`

COUNT ハンドラーを設定する。クライアントから COUNT
メッセージを受信したときの処理をカスタマイズする。未設定の場合、ストアに対してフィルタリングし、マッチ数を返す。

```typescript
relay.onCOUNT((subId, filters) => {
  return { count: 42 };
});

// 非同期も可能
relay.onCOUNT(async (subId, filters) => {
  return { count: await computeCount(filters) };
});
```

**型**:
`COUNTHandler = (subId: string, filters: NostrFilter[]) => { count: number } | Promise<{ count: number }>`

#### エラーケース

##### `refuse(): void`

接続拒否モードにする。以降の新規接続はすべてエラーで閉じられる。

```typescript
relay.refuse();
// 以降の new WebSocket("wss://...") は即座にエラー
```

##### `disconnect(code?: number, reason?: string): void`

全接続を即座に切断する。

- `code`: WebSocket クローズコード（デフォルト: 1000）
- `reason`: クローズ理由（デフォルト: ""）

```typescript
relay.disconnect(); // code: 1000
relay.disconnect(1006); // 異常切断
```

##### `disconnectAfter(ms: number, code?: number): void`

指定時間後に全接続を切断する。

- `ms`: 遅延ミリ秒
- `code`: クローズコード（デフォルト: 1006）

```typescript
relay.disconnectAfter(3000); // 3秒後に切断
relay.disconnectAfter(5000, 1001); // 5秒後にcode:1001で切断
```

##### `close(code: number): void`

特定のクローズコードで全接続を閉じる。`disconnect(code, "")` のエイリアス。

```typescript
relay.close(1006); // 異常切断をシミュレート
```

##### `sendRaw(data: string): void`

生データを全接続に送信する。不正 JSON のテスト等に使用する。

```typescript
relay.sendRaw("not json");
relay.sendRaw('{"invalid": "nostr message"}');
```

##### `sendNotice(message: string): void`

NOTICE メッセージを全接続に送信する。

```typescript
relay.sendNotice("rate-limited");
relay.sendNotice("error: too many requests");
```

#### NIP-42 AUTH

##### `requireAuth(validator: AuthValidator): void`

AUTH 要求を設定する。接続時に AUTH
チャレンジが送信される。既存の接続にも即座にチャレンジが送信される。

認証必須リレー（`requiresAuth: true` または `requireAuth()`
設定済み）では、未認証の接続からの REQ/EVENT は自動的に拒否される：

- REQ → `["CLOSED", subId, "auth-required: authentication required"]`
- EVENT → `["OK", id, false, "auth-required: authentication required"]`

```typescript
relay.requireAuth((authEvent) => {
  // relayタグの検証
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
  );
});
```

**型**: `AuthValidator = (authEvent: NostrEvent) => boolean | Promise<boolean>`

#### 検証ヘルパー

##### `findREQ(subId: string): ["REQ", string, ...NostrFilter[]] | undefined`

特定サブスクリプション ID の REQ を検索する。

```typescript
const req = relay.findREQ("sub1");
if (req) {
  console.log(req[1]); // "sub1"
  console.log(req[2]); // 最初のフィルター
}
```

##### `countREQs(): number`

REQ メッセージの受信数。

##### `hasREQ(subId: string): boolean`

特定サブスクリプション ID の REQ が存在するか。

##### `findEvent(eventId: string): NostrEvent | undefined`

特定イベント ID の EVENT を検索する。

##### `countEvents(): number`

EVENT メッセージの受信数。

##### `hasEvent(eventId: string): boolean`

特定イベント ID の EVENT が存在するか。

##### `findCLOSE(subId: string): ["CLOSE", string] | undefined`

特定サブスクリプション ID の CLOSE を検索する。

##### `findCOUNT(subId: string): ["COUNT", string, ...NostrFilter[]] | undefined`

特定サブスクリプション ID の COUNT を検索する。

```typescript
const count = relay.findCOUNT("count1");
if (count) {
  console.log(count[1]); // "count1"
  console.log(count[2]); // 最初のフィルター
}
```

##### `countCOUNTs(): number`

COUNT メッセージの受信数。

##### `hasCOUNT(subId: string): boolean`

特定サブスクリプション ID の COUNT が存在するか。

#### スナップショット

##### `snapshot(): RelaySnapshot`

リレーの現在の状態を保存する。ストアと受信メッセージのスナップショットを作成する。接続状態やハンドラーは保存されない。

```typescript
const snap = relay.snapshot();
```

##### `restore(snap: RelaySnapshot): void`

スナップショットからリレーの状態を復元する。

```typescript
relay.restore(snap);
```

##### `reset(): void`

リレーの状態を完全にリセットする。ストア、受信ログ、サブスクリプション、ハンドラー、AUTH
状態がクリアされる。

---

### フィルター関数

##### `matchFilter(event: NostrEvent, filter: NostrFilter): boolean`

イベントが単一フィルターにマッチするか判定する。NIP-01
のフィルター仕様に準拠。全条件が AND で評価される。`limit`
はマッチング自体には影響しない。

```typescript
const matches = matchFilter(event, { kinds: [1], authors: ["pubkey1"] });
```

##### `matchFilters(event: NostrEvent, filters: NostrFilter[]): boolean`

イベントが複数フィルターのいずれかにマッチするか判定する。フィルター間は OR
条件。

```typescript
const matches = matchFilters(event, [
  { kinds: [1] },
  { kinds: [0], authors: ["pubkey1"] },
]);
```

##### `filterEvents(events: NostrEvent[], filter: NostrFilter): NostrEvent[]`

イベント配列からフィルター条件にマッチするものを抽出する。`created_at`
降順でソートし、`limit` が指定されていれば制限する。

```typescript
const results = filterEvents(allEvents, { kinds: [1], limit: 10 });
```

---

### イベント種別関数

NIP-16 および NIP-33 に基づくイベント種別判定ユーティリティ。

##### `classifyEvent(kind: number): EventKind`

kind 値からイベント種別を判定する。

- `"regular"`: kind 0-9999, 40000+
- `"replaceable"`: kind 10000-19999
- `"ephemeral"`: kind 20000-29999
- `"parameterized_replaceable"`: kind 30000-39999

```typescript
classifyEvent(1); // "regular"
classifyEvent(10002); // "replaceable"
classifyEvent(20001); // "ephemeral"
classifyEvent(30023); // "parameterized_replaceable"
```

##### `isReplaceable(kind: number): boolean`

Replaceable イベント (kind 10000-19999) かどうか判定する。

##### `isEphemeral(kind: number): boolean`

Ephemeral イベント (kind 20000-29999) かどうか判定する。

##### `isParameterizedReplaceable(kind: number): boolean`

Parameterized Replaceable イベント (kind 30000-39999) かどうか判定する。

##### `getParameterizedId(event: NostrEvent): string | null`

Parameterized Replaceable
イベントの識別キーを取得する。`kind:pubkey:d-tag-value` 形式の文字列を返す。kind
30000-39999 以外の場合は `null` を返す。

```typescript
const event = EventBuilder.kind(30023)
  .tag("d", "my-article")
  .pubkey("author-pubkey")
  .build();

getParameterizedId(event); // "30023:author-pubkey:my-article"
getParameterizedId(EventBuilder.kind1().build()); // null
```

---

### AUTH関連

##### `generateChallenge(): string`

ランダムな AUTH チャレンジ文字列（64 文字 hex）を生成する。

##### `AuthState`

接続ごとの AUTH 状態を管理するクラス。通常は MockRelay
が内部で使用するため、直接利用する必要はない。

---

### Logger

##### `createLogger(logging: boolean | LogHandler | undefined, level?: LogLevel): Logger | null`

MockRelayOptions の `logging` フィールドからロガーインスタンスを生成する。

- `false` / `undefined` → `null`
- `true` → console 出力ロガー
- `LogHandler` → カスタムハンドラーロガー

##### `Logger` クラス

| メソッド/プロパティ   | 型                                   | 説明                   |
| --------------------- | ------------------------------------ | ---------------------- |
| `level`               | `LogLevel` (readonly)                | 現在のログレベル       |
| `entries`             | `ReadonlyArray<LogEntry>` (readonly) | 蓄積されたログエントリ |
| `setLevel(level)`     | `void`                               | ログレベル変更         |
| `setHandler(handler)` | `void`                               | カスタムハンドラー設定 |
| `clear()`             | `void`                               | ログエントリクリア     |
| `log(entry, level?)`  | `void`                               | ログ記録               |

---

## テストモジュール

```typescript
import {
  assertAuthCompleted,
  assertClosed,
  assertEventPublished,
  assertNoErrors,
  assertReceived,
  assertReceivedREQ,
  EventBuilder,
  FilterBuilder,
  restore,
  snapshot,
  startStream,
  streamEvents,
} from "@ikuradon/tsunagiya/testing";
```

### EventBuilder

テスト用 Nostr イベントのビルダー。メソッドチェーンでイベントを構築する。

#### ファクトリメソッド

| メソッド                       | 説明                              |
| ------------------------------ | --------------------------------- |
| `EventBuilder.kind0()`         | kind:0 (Metadata) ビルダー        |
| `EventBuilder.kind1()`         | kind:1 (Short Text Note) ビルダー |
| `EventBuilder.kind3()`         | kind:3 (Contacts) ビルダー        |
| `EventBuilder.kind4()`         | kind:4 (Encrypted DM) ビルダー    |
| `EventBuilder.kind7()`         | kind:7 (Reaction) ビルダー        |
| `EventBuilder.kind(k: number)` | 任意の kind                       |

#### ビルダーメソッド

すべてのビルダーメソッドは `EventBuilder` を返す（チェーン可能）。

| メソッド                                | 説明                                 |
| --------------------------------------- | ------------------------------------ |
| `content(text: string)`                 | コンテンツ設定                       |
| `tag(key: string, ...values: string[])` | タグ追加                             |
| `pubkey(pubkey: string)`                | 公開鍵設定                           |
| `id(id: string)`                        | ID 設定                              |
| `createdAt(timestamp: number)`          | created_at 設定                      |
| `sign(privateKey?: string)`             | モック署名生成（暗号的に正しくない） |
| `corrupt(options: CorruptOptions)`      | フィールドを不正な値に置換           |
| `geohash(hash: string)`                 | geohash タグ追加 (NIP-52)            |
| `emoji(name: string, url: string)`      | emoji タグ追加 (NIP-30)              |
| `build()`                               | `NostrEvent` を構築して返す          |

#### CorruptOptions

```typescript
interface CorruptOptions {
  id?: boolean; // IDを不正な値にする
  pubkey?: boolean; // pubkeyを不正な値にする
  sig?: boolean; // 署名を不正な値にする
  created_at?: boolean; // created_atを-1にする
}
```

#### スタティックヘルパー

##### `EventBuilder.random(options?: { kind?: number; pubkey?: string }): NostrEvent`

ランダムなイベントを生成する。

##### `EventBuilder.bulk(count: number, options?: BulkOptions): NostrEvent[]`

複数のイベントを一括生成する。

```typescript
const events = EventBuilder.bulk(100, { kind: 1 });
```

##### `EventBuilder.timeline(count: number, options?: TimelineOptions): NostrEvent[]`

時系列のイベントを生成する。`created_at` が `interval` 秒ずつ増加する。

```typescript
const events = EventBuilder.timeline(50, {
  kind: 1,
  interval: 60,
  startTime: 1700000000,
});
```

##### `EventBuilder.thread(depth: number): NostrEvent[]`

リプライチェーン（スレッド）を生成する。`[root, reply1, reply2, ...]`
の配列を返す。

##### `EventBuilder.withReactions(reactionCount: number): [NostrEvent, NostrEvent[]]`

リアクション付き投稿を生成する。`[post, reactions[]]` のタプルを返す。

#### NIP-09 削除リクエスト

##### `EventBuilder.deletion(eventIds: string[]): EventBuilder`

削除リクエスト (kind:5) ビルダーを作成する。指定したイベント ID を `e`
タグとして設定する。**注意**: ビルダーを返すので `.build()` が必要。

```typescript
const deletion = EventBuilder.deletion(["event-id-1", "event-id-2"])
  .pubkey(authorPubkey)
  .build();
// → kind: 5, tags: [["e", "event-id-1"], ["e", "event-id-2"]]
```

##### `EventBuilder.deletionByAddress(addresses: string[]): EventBuilder`

アドレス指定の削除リクエスト (kind:5) ビルダーを作成する。`kind:pubkey:d-tag`
形式のアドレスを `a` タグとして設定する。**注意**: ビルダーを返すので `.build()`
が必要。

```typescript
const deletion = EventBuilder.deletionByAddress([
  "30023:pubkey:article-slug",
])
  .pubkey(authorPubkey)
  .build();
// → kind: 5, tags: [["a", "30023:pubkey:article-slug"]]
```

#### NIP 別テンプレート

##### `EventBuilder.metadata(profile: { name?: string; about?: string; picture?: string }): NostrEvent`

kind:0 メタデータイベント。

##### `EventBuilder.contacts(pubkeys: string[]): NostrEvent`

kind:3 コンタクトリストイベント。

##### `EventBuilder.dm(recipientPubkey: string, content: string): EventBuilder`

kind:4 DM ビルダー（暗号化はモック）。**注意**: ビルダーを返すので `.build()`
が必要。

##### `EventBuilder.groupMessage(groupId: string): EventBuilder`

NIP-29 グループメッセージビルダー。**注意**: ビルダーを返すので `.build()`
が必要。

##### `EventBuilder.zapRequest(options: ZapRequestOptions): NostrEvent`

NIP-57 Zap Request イベント。

```typescript
interface ZapRequestOptions {
  amount: number; // millisats
  relays: string[]; // リレーURL一覧
  lnurl: string; // LNURL
  eventId?: string; // 対象イベントID
  recipientPubkey?: string; // 対象公開鍵
}
```

##### `EventBuilder.nip07Request(): NostrEvent`

NIP-07 リクエストイベント (kind:24133)
を生成する。ブラウザ拡張連携のテストデータとして使用する。

**注意**: tsunagiya は NIP-07 のブラウザ API (`window.nostr`)
のモック機能は提供しない。このメソッドはテスト用イベントの生成のみを行う。

```typescript
const event = EventBuilder.nip07Request();
// → kind: 24133, content: "mock-nip07-request"
```

---

### FilterBuilder

よくあるフィルターパターンをワンライナーで生成する。

##### `FilterBuilder.timeline(options?: TimelineFilterOptions): NostrFilter`

```typescript
FilterBuilder.timeline({ limit: 20 });
// → { kinds: [1], limit: 20 }
```

##### `FilterBuilder.profile(pubkey: string): NostrFilter`

```typescript
FilterBuilder.profile("pubkey1");
// → { kinds: [0], authors: ["pubkey1"] }
```

##### `FilterBuilder.mentions(pubkey: string): NostrFilter`

```typescript
FilterBuilder.mentions("pubkey1");
// → { kinds: [1], "#p": ["pubkey1"] }
```

##### `FilterBuilder.reactions(eventId: string): NostrFilter`

```typescript
FilterBuilder.reactions("event1");
// → { kinds: [7], "#e": ["event1"] }
```

##### `FilterBuilder.search(keyword: string): NostrFilter`

NIP-50 検索フィルターを生成する。

```typescript
FilterBuilder.search("nostr");
// → { search: "nostr" }
```

---

### アサーション関数

##### `assertReceivedREQ(relay: MockRelay, filters: NostrFilter): void`

REQ メッセージが指定フィルター条件で受信されたことを検証する。部分一致で判定。

```typescript
assertReceivedREQ(relay, { kinds: [1] });
```

##### `assertEventPublished(relay: MockRelay, eventId: string): void`

特定 ID の EVENT メッセージが受信されたことを検証する。

##### `assertNoErrors(relay: MockRelay): void`

エラーレスポンスが発生していないことを検証する。OK:false、CLOSED（auth-required）、error
NOTICE が1件でもあれば失敗する。

##### `assertAuthCompleted(relay: MockRelay): void`

AUTH 応答が受信されていることを検証する。

##### `assertClosed(relay: MockRelay, subId: string): void`

特定サブスクリプション ID の CLOSE メッセージが受信されたことを検証する。

##### `assertReceived(relay: MockRelay, predicate: (messages: ClientMessage[]) => boolean): void`

カスタム述語で受信メッセージを検証する。

```typescript
assertReceived(relay, (messages) => messages.some((m) => m[0] === "REQ"));
```

---

### ストリーム関数

##### `streamEvents(relay: MockRelay, events: NostrEvent[], options?: StreamOptions): StreamHandle`

イベントを時間差で配信する。各イベントはストアにも追加され、アクティブなサブスクリプションにブロードキャストされる。

```typescript
interface StreamOptions {
  interval?: number; // 送信間隔 (ms), デフォルト: 100
  jitter?: number; // ジッター幅 (±ms), デフォルト: 0
}
```

##### `startStream(relay: MockRelay, options: StartStreamOptions): StreamHandle`

イベント生成関数を使った継続的ストリーム。

```typescript
interface StartStreamOptions extends StreamOptions {
  eventGenerator: () => NostrEvent; // 必須
  interval?: number; // デフォルト: 1000
  count?: number; // 件数上限（省略で無制限）
}
```

##### `StreamHandle`

```typescript
interface StreamHandle {
  stop(): void; // ストリーム停止
  readonly stopped: boolean; // 停止済みか
}
```

---

### スナップショット関数

##### `snapshot(relay: MockRelay): RelaySnapshot`

`relay.snapshot()` のラッパー。

##### `restore(relay: MockRelay, snap: RelaySnapshot): void`

`relay.restore(snap)` のラッパー。

---

## 型定義

### NostrEvent

```typescript
interface NostrEvent {
  id: string; // イベントID (64文字hex)
  pubkey: string; // 公開鍵 (64文字hex)
  created_at: number; // UNIXタイムスタンプ (秒)
  kind: number; // イベント種別
  tags: string[][]; // タグ配列
  content: string; // コンテンツ文字列
  sig: string; // 署名 (128文字hex)
}
```

### NostrFilter

```typescript
interface NostrFilter {
  ids?: string[]; // IDプレフィックスマッチ
  authors?: string[]; // 公開鍵プレフィックスマッチ
  kinds?: number[]; // kind完全一致
  since?: number; // created_at下限 (inclusive)
  until?: number; // created_at上限 (inclusive)
  limit?: number; // 返却数上限
  search?: string; // NIP-50: 検索キーワード
  [key: `#${string}`]: string[] | undefined; // タグフィルター
}
```

### ClientMessage

```typescript
type ClientMessage =
  | ["EVENT", NostrEvent]
  | ["REQ", string, ...NostrFilter[]]
  | ["CLOSE", string]
  | ["AUTH", NostrEvent]
  | ["COUNT", string, ...NostrFilter[]];
```

### RelayMessage

```typescript
type RelayMessage =
  | ["EVENT", string, NostrEvent]
  | ["OK", string, boolean, string]
  | ["EOSE", string]
  | ["CLOSED", string, string]
  | ["NOTICE", string]
  | ["AUTH", string]
  | ["COUNT", string, { count: number }];
```

### MockRelayOptions

```typescript
interface MockRelayOptions {
  latency?: { min: number; max: number } | number;
  errorRate?: number; // 0.0 - 1.0
  disconnectRate?: number; // 0.0 - 1.0
  connectionTimeout?: number; // ms
  requiresAuth?: boolean;
  logging?: boolean | LogHandler;
}
```

### LogEntry

```typescript
interface LogEntry {
  timestamp: number; // ms
  relay: string; // リレーURL
  direction: "send" | "receive";
  data: unknown;
}
```

### RelaySnapshot

```typescript
interface RelaySnapshot {
  timestamp: number; // 保存時刻 (ms)
  store: NostrEvent[]; // ストア内のイベント
  received: ClientMessage[]; // 受信メッセージログ
  deletedIds?: string[]; // 削除済みイベントID (NIP-09)
}
```

### EventKind

```typescript
type EventKind =
  | "regular"
  | "replaceable"
  | "ephemeral"
  | "parameterized_replaceable";
```

### COUNTHandler

```typescript
type COUNTHandler = (
  subId: string,
  filters: NostrFilter[],
) => { count: number } | Promise<{ count: number }>;
```

### LogLevel

```typescript
type LogLevel = "silent" | "error" | "info" | "debug";
```
