---
outline: deep
---

# アーキテクチャ

繋ぎ屋は `globalThis.WebSocket` と `globalThis.fetch` を差し替えることで、
既存の Nostr クライアントコードを無変更でテストできるモックライブラリです。

2026-03 の全面リファクタリングでは、公開 API を変えずに内部を責務分離しました。
`MockPool` と `MockRelay` は引き続きエントリポイントですが、実装本体は platform
hook、message codec、router、event store、auth、subscription、 delivery
に分割されています。

## 概要

```mermaid
flowchart LR
    TC["テストコード"] --> MP["MockPool"]
    MP --> PH["platform/pool_hooks"]
    PH --> GWS["globalThis.WebSocket"]
    PH --> GF["globalThis.fetch"]
    GWS --> MWS["MockWebSocket"]
    GF --> N11["NIP-11 fetch handler"]
    MWS --> MR["MockRelay"]
    N11 --> MR

    MR --> CODEC["message_codec"]
    MR --> ROUTER["router"]
    MR --> STORE["EventStore"]
    MR --> SUBS["SubscriptionRegistry"]
    MR --> AUTH["AuthService"]
    MR --> DELIV["DeliveryScheduler"]
    STORE --> FC["filter_compiler"]
```

## コンポーネント構成

```text
src/
├── pool.ts                       MockPool
├── relay.ts                      MockRelay（公開 API 用オーケストレータ）
├── websocket.ts                  MockWebSocket
├── auth.ts                       AuthState 互換エクスポート
├── filter.ts                     matchFilter / filterEvents
├── event_kind.ts                 kind 分類・replaceable 判定
├── logger.ts                     Logger
├── types.ts                      公開型定義の互換 re-export
├── types/
│   ├── nostr.ts                 Nostr event/filter/message 型
│   ├── relay.ts                 relay option/snapshot/handler 型
│   ├── runtime.ts               logger/clock/random/WebSocket readyState 型
│   └── testing.ts               stream option/handle 型
├── internal/
│   ├── clone.ts                  defensive copy
│   ├── runtime.ts                system clock / random defaults
│   ├── url.ts                    URL 正規化・NIP-11 判定
│   └── validation.ts             runtime shape validation
├── platform/
│   ├── global_hooks.ts           globalThis 差し替え/復元
│   ├── nip11_fetch.ts            NIP-11 fetch fallback/intercept
│   └── pool_hooks.ts             MockPool 用 install/uninstall
├── relay/
│   ├── auth_service.ts           AUTH challenge/validation
│   ├── connection_runtime.ts     接続集合・受信経路・配送起点
│   ├── delivery_scheduler.ts     timer 管理と配送
│   ├── error_messages.ts         エラー文言生成
│   ├── event_store.ts            保存・置換・削除・query/count
│   ├── filter_compiler.ts        compiled predicate / fast path
│   ├── message_codec.ts          parse + limit validation
│   ├── response_builders.ts      relay 応答メッセージ生成
│   ├── relay_inspector.ts        received/errors/authResults の診断境界
│   ├── router.ts                 message type dispatch
│   └── subscription_registry.ts  接続ごとの購読管理
└── testing/
    ├── assertions.ts
    ├── event_builder.ts
    ├── filter_builder.ts
    ├── snapshot.ts
    ├── stream.ts
    └── wait.ts
```

## 主要オブジェクト

```mermaid
classDiagram
    class MockPool {
        +relay(url, options?) MockRelay
        +install() void
        +uninstall() void
        +reset() void
        +connections Map~string, number~
        +installed boolean
    }
    class MockRelay {
        +store(event) boolean
        +broadcast(event) void
        +onREQ(handler) void
        +onEVENT(handler) void
        +onCOUNT(handler) void
        +requireAuth(validator) void
        +setVerifier(verifier) void
        +setAuthVerifier(verifier) void
        +snapshot() RelaySnapshot
        +restore(snapshot) void
    }
    class EventStore {
        +store(event) boolean
        +publish(event) PublishEventResult
        +queryMany(filters) NostrEvent[]
        +count(filters) number
        +snapshot() EventStoreSnapshot
        +restore(snapshot) void
    }
    class RelayConnectionRuntime {
        +registerConnection(ws) void
        +unregisterConnection(ws) void
        +handleOpen(ws) void
        +handleMessage(ws, raw) void
        +sendMessage(ws, message) void
    }
    class SubscriptionRegistry {
        +set(ws, subId, filters) void
        +delete(ws, subId) void
        +matchingSubscriptions(event) Array
        +getView() ReadonlyMap
    }
    class AuthService {
        +sendChallenge(ws) RelayMessage
        +handleAuthResponse(ws, event, relayUrl) Promise
        +isAuthenticated(ws) boolean
    }
    class DeliveryScheduler {
        +schedule(delayMs, task) void
        +deliver(ws, payload, delayMs) void
        +clear() void
    }
    class MockWebSocket {
        +send(data) void
        +close() void
        +setRelayResolver(resolver) void
        +_receiveMessage(data) void
        +_forceClose(code, reason) void
    }

    MockPool --> MockRelay : URLごとに管理
    MockPool --> MockWebSocket : install 時に差し替え
    MockRelay --> EventStore
    MockRelay --> RelayConnectionRuntime
    MockRelay --> SubscriptionRegistry
    MockRelay --> AuthService
    MockRelay --> DeliveryScheduler
    MockWebSocket --> MockRelay : resolver 経由で接続
```

`src/auth.ts` の `AuthState` は互換エクスポートです。実装本体は
`src/relay/auth_service.ts` にあります。接続数、AUTH 強制、parse/router
入口、ランダムエラー、NOTICE/OK/CLOSED の配送起点は
`src/relay/connection_runtime.ts` にあります。received / errors / authResults の
診断 API は `src/relay/relay_inspector.ts` に集約され、`MockRelay` は facade
のみを 提供します。`EventStore` は `id` / `kind` / `pubkey` に加えて tag
値索引も持ち、 `#e` / `#p` / `#d` を含む filter
の候補集合を狭めます。`MockRelayOptions.clock` と `MockRelayOptions.random`
を使うと、snapshot timestamp、ログ時刻、AUTH challenge、
latency/error/disconnect の乱択を決定論的に差し替えられます。公開型定義は
`src/types.ts` から見えますが、実体は `src/types/*` へ分割されています。

## 受信経路

```mermaid
sequenceDiagram
    participant C as クライアント
    participant MWS as MockWebSocket
    participant MR as MockRelay
    participant Codec as message_codec
    participant Router as router
    participant Store as EventStore
    participant Subs as SubscriptionRegistry
    participant Auth as AuthService
    participant Deliv as DeliveryScheduler

    C->>MWS: ws.send(rawJson)
    MWS->>MR: _handleMessage(ws, rawJson)
    MR->>Codec: parseClientMessage(rawJson, limits)

    alt validation error
        Codec-->>MR: NOTICE 用エラー
        MR->>Deliv: deliver(ws, notice, latency)
    else parse success
        Codec-->>MR: ParsedClientMessage
        MR->>MR: RelayInspector と log を更新
        MR->>Router: routeClientMessage(message, handlers)

        alt EVENT
            Router->>Store: publish(event)
            Router->>Subs: matchingSubscriptions(event)
        else REQ / COUNT
            Router->>Store: queryMany(filters) / count(filters)
            Router->>Subs: set(ws, subId, filters)
        else AUTH
            Router->>Auth: handleAuthResponse(...)
        else CLOSE
            Router->>Subs: delete(ws, subId)
        end

        MR->>Deliv: deliver(ws, payload, latency)
    end
```

ポイント:

- `message_codec.ts` が JSON parse、構造検証、サイズ制限を先に処理する
- `router.ts` は type ごとの dispatch だけを担当し、`MockRelay` に async error
  callback を返す
- `MockRelay` 本体は orchestration
  に寄せ、保存・購読・認証・配送は専用クラスへ委譲する

## ストアと問い合わせ

### 保存・置換・削除

```mermaid
flowchart TD
    Publish["EventStore.publish(event)"] --> Deleted{"deletedIds\nに存在?"}
    Deleted -->|"Yes"| Block["blocked を返す"]
    Deleted -->|"No"| Kind5{"kind == 5?"}
    Kind5 -->|"Yes"| Delete["e/a タグを解釈して削除\nkind:5 自体は保存"]
    Kind5 -->|"No"| Classify{"kind 分類"}
    Classify --> Regular["Regular: 保存"]
    Classify --> Repl["Replaceable: kind+pubkey 最新を置換"]
    Classify --> Param["Addressable: kind+pubkey+d-tag 最新を置換"]
    Classify --> Ephem["Ephemeral: 保存せず配信のみ"]
```

`EventStore` は次の索引を持ちます。

- `idIndex`: `id -> Set<NostrEvent>`
- `kindIndex`: `kind -> Set<NostrEvent>`
- `pubkeyIndex`: `pubkey -> Set<NostrEvent>`
- `replaceableIndex`: `kind:pubkey -> latest event`
- `parameterizedIndex`: `kind:pubkey:d-tag -> latest event`

同 timestamp の replaceable / parameterized replaceable は、 `created_at`
が同じなら `id` の辞書順が小さい方を優先して保持します。

### REQ / COUNT fast path

```mermaid
flowchart TD
    Filters["REQ / COUNT filters"] --> Compile["filter_compiler.compileFilter()"]
    Compile --> Pick["使える索引(id/kind/pubkey)から\n最小候補集合を選択"]
    Pick --> Ordered["順序付き候補列を構築"]
    Ordered --> Match["compiled predicate で評価"]
    Match --> Limit["created_at desc / id asc を維持\nlimit を適用"]
    Limit --> Result["EVENT 群 または count"]
```

ポイント:

- `REQ` と `COUNT` はフィルターごとに compiled predicate を使う
- 索引が使えない広いフィルターだけがフルスキャンへフォールバックする
- `restore()` 後は索引を再構築するため、snapshot 復元後も同じ fast path が使える

## Platform hook と NIP-11

```mermaid
sequenceDiagram
    participant TC as テストコード
    participant MP as MockPool
    participant PH as pool_hooks
    participant GH as global_hooks
    participant N11 as nip11_fetch
    participant MR as MockRelay

    TC->>MP: pool.install()
    MP->>PH: installPoolHooks(lookupRelay)
    PH->>GH: 現在の WebSocket/fetch を退避
    PH->>GH: MockWebSocket を install
    PH->>N11: createNip11FetchHandler(lookupRelay, originalFetch)
    PH->>GH: fetch handler を install

    TC->>globalThis.fetch: fetch("https://relay...", {Accept: application/nostr+json})
    globalThis.fetch->>N11: intercept
    N11->>MR: lookupRelay(normalizedWsUrl)

    alt relay が存在
        MR-->>N11: getInfo()
        N11-->>TC: application/nostr+json Response
    else relay が存在しない / 非 NIP-11
        N11-->>TC: original fetch へ fallback
    end
```

`MockPool` 自体は global state を持たず、install/uninstall の責務は
`platform/pool_hooks.ts` に集約されています。

## 性能と安全性

| 項目                   | 現在の特性                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `REQ` / `COUNT`        | compiled filter + 索引選択で大規模ストア時の候補数を減らす                                                                   |
| `snapshot` / `restore` | deep copy を返し、`restore()` 時に索引を再構築する                                                                           |
| AUTH                   | challenge / authenticated を接続単位で保持し、ストア走査に依存しない                                                         |
| 配送                   | latency 0 は `queueMicrotask`、遅延配送は `DeliveryScheduler` が relay-wide batch flush で 1 本の timer へ集約する           |
| reset                  | `DeliveryScheduler.clear()`、購読、AUTH 状態、受信ログをまとめて初期化                                                       |
| 入力検証               | `max_message_length`、filter 数、`max_subid_length`、`max_limit`、`max_event_tags`、`max_content_length` を routing 前に拒否 |
| 署名検証               | EVENT 用 `setVerifier()` と AUTH 用 `setAuthVerifier()` を分離                                                               |

## 公開 API 互換性

このリファクタリングは内部構造の変更であり、公開 API の互換性を維持します。

- `MockPool`、`MockRelay`、`filter.ts`、`event_kind.ts` の公開エクスポートは維持
- `AuthState` は `AuthService` への互換ラッパーとして維持
- `@ikuradon/tsunagiya/testing` の helper 群は同じ import path で利用可能
- 安定対象は公開 export
  のみで、`src/internal/**`、`src/relay/**`、`src/platform/**`
  は内部実装として扱う

## テスト時のライフサイクル

```ts
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

relay.store(event);
pool.install();

try {
  const ws = new WebSocket("wss://relay.example.com");
  // テスト対象コードをそのまま実行
} finally {
  pool.uninstall();
}
```

実運用上の注意:

- `pool.install()` は同時に 1 インスタンスのみ
- テストでは `finally` で必ず `pool.uninstall()` する
- 固定 `setTimeout` より `testing/wait.ts` の `waitFor()` を優先する
- 内部モジュールを直接 import せず、公開 export を使う
