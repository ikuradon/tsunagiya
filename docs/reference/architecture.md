---
outline: deep
---

# アーキテクチャ

繋ぎ屋は `globalThis.WebSocket` を差し替えることで、既存の Nostr
クライアントコードを無変更でテスト可能にするモックライブラリです。

## 概要

```mermaid
flowchart LR
    TC["テストコード"] -->|"pool.install()"| GWS["globalThis.WebSocket"]
    TC -->|"pool.install()"| GF["globalThis.fetch"]
    GWS -->|"差し替え"| MWS["MockWebSocket"]
    GF -->|"差し替え"| NIP11["NIP-11 インターセプト"]
    MWS -->|"ルーティング"| MR["MockRelay（URL単位）"]
    NIP11 --> MR
```

---

## コンポーネント構成

```
src/
├── pool.ts         MockPool       — 全体管理・WebSocket差し替え
├── relay.ts        MockRelay      — URL単位の仮想リレー
├── websocket.ts    MockWebSocket  — WebSocket API互換モック
├── filter.ts       matchFilter 等 — NIP-01フィルターマッチング（純粋関数）
├── auth.ts         AuthState      — NIP-42 AUTHチャレンジ/レスポンス
├── event_kind.ts                  — イベント種別判定（Regular/Replaceable/Ephemeral等）
├── logger.ts                      — ロガー
└── types.ts                       — 型定義
```

### クラス関係図

```mermaid
classDiagram
    class MockPool {
        +relay(url, options?) MockRelay
        +install() void
        +uninstall() void
        +reset() void
        -relays Map~string, MockRelay~
        -originalWebSocket typeof WebSocket
        -originalFetch typeof fetch
    }
    class MockRelay {
        +store(event) void
        +onREQ(handler) void
        +hasEvent(id) boolean
        +countREQs() number
        +snapshot() RelaySnapshot
        -store NostrEvent[]
        -received ReceivedMessage[]
        -connections Set~MockWebSocket~
        -subscriptions Map
        -authState AuthState
    }
    class MockWebSocket {
        +send(data) void
        +close() void
        -relay MockRelay
        -readyState number
        +_receiveMessage(data) void
        +_forceClose(code, reason) void
    }
    class AuthState {
        +sendChallenge(ws) string
        +handleAuthResponse(ws, event, url) boolean
        -validator Function
        -challenges Map
        -authenticated Set
    }

    MockPool "1" --> "0..*" MockRelay : 管理
    MockRelay "1" --> "0..*" MockWebSocket : 接続管理
    MockRelay "1" --> "1" AuthState : 認証管理
```

### MockPool (`src/pool.ts`)

複数の MockRelay を URL 単位で管理するコンテナ。テストのエントリポイント。

| 主要メンバー         | 型                         | 役割                                |
| -------------------- | -------------------------- | ----------------------------------- |
| `#relays`            | `Map<string, MockRelay>`   | URL → MockRelay のマッピング        |
| `#originalWebSocket` | `typeof WebSocket \| null` | uninstall 用に元の WebSocket を保存 |
| `#originalFetch`     | `typeof fetch \| null`     | uninstall 用に元の fetch を保存     |

**主要メソッド:**

- `relay(url, options?)` — MockRelay を登録・取得（同一 URL
  は既存インスタンスを返す）
- `install()` — `globalThis.WebSocket` と `globalThis.fetch` を差し替え
- `uninstall()` — 元の実装を復元
- `reset()` — 全リレーの状態をクリア

### MockRelay (`src/relay.ts`)

URL 単位で動作する仮想 Nostr
リレー。イベントのストア・フィルタリング・カスタムハンドラー・検証ヘルパー・不安定性シミュレート・NIP-42
AUTH を提供する。

| 主要フィールド   | 型                                               | 役割                             |
| ---------------- | ------------------------------------------------ | -------------------------------- |
| `#store`         | `NostrEvent[]`                                   | イベントストア（永続イベント）   |
| `#received`      | `ReceivedMessage[]`                              | 受信メッセージのログ             |
| `#connections`   | `Set<MockWebSocket>`                             | アクティブな接続一覧             |
| `#subscriptions` | `Map<MockWebSocket, Map<string, NostrFilter[]>>` | 接続ごとのサブスクリプション     |
| `#authState`     | `AuthState`                                      | NIP-42 認証状態                  |
| `#pendingTimers` | `Set<ReturnType<typeof setTimeout>>`             | 保留中タイマー（reset 時クリア） |

### MockWebSocket (`src/websocket.ts`)

`globalThis.WebSocket` の差し替え先。`EventTarget` を継承して WebSocket API
を模倣する。

| 主要メンバー                | 役割                                         |
| --------------------------- | -------------------------------------------- |
| `static _resolveRelay`      | MockPool が設定する URL → MockRelay 解決関数 |
| `#relay`                    | ルーティング先の MockRelay                   |
| `send(data)`                | `relay._handleMessage()` に転送              |
| `_receiveMessage(data)`     | リレーから呼ばれる受信コールバック           |
| `_forceClose(code, reason)` | リレーから強制切断                           |

### WebSocket readyState 遷移

```mermaid
stateDiagram-v2
    [*] --> CONNECTING : new WebSocket(url)
    CONNECTING --> OPEN : queueMicrotask\n(scheduleOpen)
    OPEN --> CLOSING : ws.close()
    OPEN --> CLOSED : _forceClose()\n（リレーから強制切断）
    CLOSING --> CLOSED : close イベント発火
    CONNECTING --> CLOSED : URL 未登録\n(エラー)
    CLOSED --> [*]

    note right of CONNECTING
        readyState = 0
        リレー検索中
    end note
    note right of OPEN
        readyState = 1
        メッセージ送受信可能
    end note
    note right of CLOSING
        readyState = 2
        クローズ処理中
    end note
    note right of CLOSED
        readyState = 3
        接続終了
    end note
```

### filter.ts

NIP-01 フィルターマッチングの純粋関数群。副作用なし。

| 関数                           | 説明                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `matchFilter(event, filter)`   | イベントが単一フィルターにマッチするか（全条件AND）      |
| `matchFilters(event, filters)` | 複数フィルターのいずれかにマッチするか（フィルター間OR） |
| `filterEvents(events, filter)` | イベント配列を絞り込み・降順ソート・limit 適用           |

### auth.ts (NIP-42)

接続ごとの AUTH チャレンジ/レスポンスを管理するクラス。

| メンバー                             | 役割                                               |
| ------------------------------------ | -------------------------------------------------- |
| `#validator`                         | カスタムバリデーター関数                           |
| `#challenges`                        | 接続 → チャレンジ文字列 のマッピング               |
| `#authenticated`                     | 認証済み接続の Set                                 |
| `sendChallenge(ws)`                  | ランダムチャレンジを生成して AUTH メッセージを返す |
| `handleAuthResponse(ws, event, url)` | kind:22242 の AUTH 応答を検証                      |

---

## WebSocket インターセプトの仕組み

```mermaid
sequenceDiagram
    participant TC as テストコード
    participant MP as MockPool
    participant MWS as MockWebSocket
    participant MR as MockRelay

    TC->>MP: pool.install()
    Note over MP: globalThis.WebSocket = MockWebSocket<br>MockWebSocket._resolveRelay = ...<br>globalThis.fetch = NIP-11インターセプト版

    TC->>MWS: new WebSocket("wss://...")
    MWS->>MR: _resolveRelay(url) で検索
    MR-->>MWS: MockRelay インスタンス
    MWS->>MR: relay._registerConnection(this)
    Note over MWS: queueMicrotask で scheduleOpen()

    MWS->>MWS: readyState = OPEN
    MWS->>TC: open イベント / onopen 発火
    MWS->>MR: relay._handleOpen(this)
    Note over MR: requiresAuth の場合<br>setTimeout(0) で AUTH チャレンジ送信

    TC->>MP: pool.uninstall()
    Note over MP: globalThis.WebSocket = 元の WebSocket<br>globalThis.fetch = 元の fetch
```

---

## メッセージフロー

### クライアント → リレー (send)

```mermaid
sequenceDiagram
    participant C as クライアント
    participant MWS as MockWebSocket
    participant MR as MockRelay

    C->>MWS: ws.send('["REQ", "sub1", {...}]')
    Note over MWS: readyState が OPEN でなければ DOMException
    MWS->>MR: relay._handleMessage(this, data)

    Note over MR: 1. JSON.parse でパース<br>2. メッセージ構造の基本検証<br>3. received[] にログ記録<br>4. ランダム切断チェック (disconnectRate)<br>5. エラー率チェック (errorRate)<br>6. AUTH 未認証チェック (requiresAuth)<br>7. メッセージ種別に応じてルーティング

    alt EVENT
        MR->>MR: #handleEvent()
    else REQ
        MR->>MR: #handleReq()
    else CLOSE
        MR->>MR: #handleClose()
    else AUTH
        MR->>MR: #handleAuth()
    else COUNT
        MR->>MR: #handleCount()
    end

    MR->>MWS: #sendWithLatency(ws, response)
```

### エラーシミュレーション判定フロー

```mermaid
flowchart TD
    Start["メッセージ受信"] --> DC{"disconnectRate\nチェック"}
    DC -->|"乱数 < disconnectRate"| FClose["強制切断\n_forceClose()"]
    DC -->|"通過"| EC{"errorRate\nチェック"}
    EC -->|"乱数 < errorRate"| NErr["NOTICE エラー返送"]
    EC -->|"通過"| Auth{"requiresAuth\nかつ未認証?"}
    Auth -->|"Yes"| AuthErr["restricted: auth required\nエラー返送"]
    Auth -->|"No / 認証済み"| Route["メッセージ種別ルーティング\nEVENT / REQ / CLOSE / AUTH / COUNT"]
    FClose --> End["処理終了"]
    NErr --> End
    AuthErr --> End
    Route --> End
```

### リレー → クライアント (受信)

```mermaid
sequenceDiagram
    participant MR as MockRelay
    participant MWS as MockWebSocket
    participant C as クライアント

    MR->>MR: #sendWithLatency(ws, message)
    Note over MR: latency == 0: queueMicrotask で即時配信<br>latency  > 0: setTimeout(latency) で遅延配信

    MR->>MWS: _receiveMessage(data)
    Note over MWS: readyState が OPEN でなければ無視
    MWS->>MWS: MessageEvent を作成
    MWS->>C: onmessage / "message" イベント発火
```

---

## データフロー

### イベントストア

```mermaid
flowchart TD
    Store["store(event)"] --> K5{"kind:5\n（削除）?"}
    K5 -->|"Yes"| Del["#handleDeletion()\n+ store に追加"]
    K5 -->|"No"| KClass{"イベント種別分類"}
    KClass --> Regular["Regular\n→ store に追加"]
    KClass --> Repl["Replaceable\n→ 同一 kind+pubkey の古いものを置換"]
    KClass --> ParamRepl["Addressable\n→ 同一 kind+pubkey+d-tag の古いものを置換"]
    KClass --> Ephem["Ephemeral\n→ store に追加しない"]
```

### イベント種別の分類フロー

```mermaid
flowchart TD
    Start["kind 番号"] --> R1{"kind == 0, 3\nまたは\n10000-19999?"}
    R1 -->|"Yes"| Replaceable["Replaceable\n（置換可能）"]
    R1 -->|"No"| R2{"kind == 20000-29999?"}
    R2 -->|"Yes"| Ephemeral["Ephemeral\n（非永続）"]
    R2 -->|"No"| R3{"kind == 30000-39999?"}
    R3 -->|"Yes"| Addressable["Addressable\n（d-tag で識別）"]
    R3 -->|"No"| R4{"kind == 1000-9999\nまたは\n4000-4999?"}
    R4 -->|"Yes"| Regular["Regular\n（通常）"]
    R4 -->|"No"| Unknown["Unknown\n（Regular として扱う）"]
```

### REQ 処理とサブスクリプション管理

```mermaid
sequenceDiagram
    participant C as クライアント
    participant MR as MockRelay
    participant Store as イベントストア

    C->>MR: REQ 送信 (subId, filters)
    MR->>MR: subscriptions[ws][subId] = filters を登録

    alt カスタム reqHandler あり
        MR->>MR: reqHandler(subId, filters) を呼ぶ
    else なし
        MR->>Store: filterEvents() でマッチするイベントを取得
        Store-->>MR: マッチしたイベント一覧
    end

    loop マッチした各イベント
        MR->>C: EVENT メッセージ送信
    end
    MR->>C: EOSE メッセージ送信

    Note over MR,C: 以降、store() + broadcast() で<br>新着イベントをアクティブなサブスクリプションへ配信
```

### サブスクリプションデータ構造

```
#subscriptions: Map<MockWebSocket, Map<string, NostrFilter[]>>

  ConnectionA ──→ { "sub1": [filter1, filter2],
                    "sub2": [filter3] }
  ConnectionB ──→ { "sub1": [filter4] }
```

---

## NIP 処理フロー

### NIP-42 AUTH フロー

```mermaid
sequenceDiagram
    participant C as クライアント
    participant MR as MockRelay
    participant AS as AuthState

    Note over MR: requiresAuth: true / requireAuth(validator) 設定済み

    C->>MR: 接続 (new WebSocket)
    MR->>MR: _handleOpen(ws)
    Note over MR: setTimeout(0) で AUTH チャレンジ送信
    MR->>AS: sendChallenge(ws)
    AS-->>C: ["AUTH", challenge]

    C->>MR: AUTH イベント (kind:22242) 送信
    MR->>AS: handleAuthResponse(ws, authEvent, url)
    Note over AS: 1. チャレンジタグの一致確認<br>2. kind:22242 チェック<br>3. validator(authEvent) または relay タグ検証<br>4. 成功 → authenticated.add(ws)
    AS-->>MR: 認証結果
    MR-->>C: ["OK", eventId, true/false, message]
```

### NIP-09 削除処理フロー

```mermaid
flowchart TD
    Start["クライアントが kind:5 イベント送信"] --> HE["MockRelay#handleEvent()"]
    HE --> HD["#handleDeletion(event)"]
    HD --> ETag["e タグで参照されるイベントを store から削除"]
    HD --> ATag["a タグで参照される\nReplaceable / Addressable イベントも削除"]
    HD --> Record["deletedIds に削除済み ID を記録"]
    ETag --> Block["削除済み ID の再投稿は\n'blocked: event was deleted' で拒否"]
    ATag --> Block
    Record --> Block
```

### NIP-11 リレー情報フロー

```mermaid
sequenceDiagram
    participant C as クライアント
    participant MP as MockPool
    participant MR as MockRelay

    Note over MR: relay.setInfo({ name: "...", description: "..." })

    C->>MP: fetch(url, { headers: { Accept: "application/nostr+json" } })
    Note over MP: isNip11Request() で判定<br>HTTP/HTTPS URL を WS/WSS に変換してリレー検索
    MP->>MR: relay.getInfo()
    MR-->>MP: リレー情報オブジェクト
    MP-->>C: Response(JSON.stringify(info),\n{ "Content-Type": "application/nostr+json" })
```

### イベント注入とリアルタイムストリーム

```mermaid
flowchart TD
    Inject["relay.store(event) + relay.broadcast(event)\n（testing/ の streamEvents 等が使用）"]
    Inject --> Classify["store(event)\nでストアに保存"]
    Inject --> Broadcast["broadcast(event)"]
    Broadcast --> Filter["全アクティブサブスクリプションの\nフィルターと照合"]
    Filter --> Match["マッチした接続・サブスクリプションへ\nEVENT メッセージを送信"]
    Match --> Recv["MockWebSocket#_receiveMessage()\n→ クライアントの onmessage"]
```

---

## テスト時のライフサイクル

```typescript
// 1. 初期化
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

// 2. 事前データ・設定
relay.store(event); // イベントを事前登録
relay.onREQ((subId, filters) =>
  // カスタムハンドラー
  customEvents
);

// 3. WebSocket 差し替え
pool.install();

try {
  // 4. テスト実行（クライアントコードをそのまま呼ぶ）
  const ws = new WebSocket("wss://relay.example.com");
  // ...

  // 5. 検証
  relay.hasEvent("abc123"); // イベント受信確認
  relay.countREQs(); // REQ 受信数確認
} finally {
  // 6. 必ず復元（テスト間の干渉を防ぐ）
  pool.uninstall();
}
```

---

## テストヘルパー全体像

```mermaid
flowchart LR
    subgraph testing ["@ikuradon/tsunagiya/testing"]
        EB["EventBuilder\nテスト用イベント生成\n（NIP別テンプレート）"]
        FB["FilterBuilder\nフィルターパターン生成\n（NIP別テンプレート）"]
        Assert["アサーション\nassertReceivedREQ\nassertEventPublished 等"]
        Stream["ストリーム\nstreamEvents\nstartStream"]
        Snap["スナップショット\nrelay.snapshot()\nrelay.restore()"]
    end

    EB -->|"生成したイベントを注入"| MR["MockRelay"]
    FB -->|"フィルター生成"| MR
    MR -->|"状態確認"| Assert
    Stream -->|"リアルタイム配信"| MR
    MR -->|"状態保存・復元"| Snap
```

---

## 注意事項

- **テスト間の干渉**: `globalThis.WebSocket`
  の差し替えはグローバル操作のため、テストの `finally` ブロックで必ず
  `pool.uninstall()` を呼ぶこと
- **署名検証なし**:
  テスト用ライブラリとして、イベント署名は文字列として扱う（実際の暗号処理は依存を増やすため実装しない）。署名検証が必要な場合は
  `onEVENT` ハンドラーで独自に実装する
- **非同期配信**: レイテンシ 0 の場合でも `queueMicrotask`
  で非同期配信する（`send()`
  内で同期的にレスポンスを返すと一部クライアントが誤動作する）
- **単一インスタンス**: `MockPool` は同時に 1 インスタンスのみ `install` 可能
