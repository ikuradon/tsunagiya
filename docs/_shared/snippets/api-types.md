NostrEvent:

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

NostrFilter:

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

ClientMessage:

```typescript
type ClientMessage =
  | ["EVENT", NostrEvent]
  | ["REQ", string, ...NostrFilter[]]
  | ["CLOSE", string]
  | ["AUTH", NostrEvent]
  | ["COUNT", string, ...NostrFilter[]];
```

RelayMessage:

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

MockRelayOptions:

```typescript
interface MockRelayOptions {
  latency?: { min: number; max: number } | number;
  errorRate?: number; // 0.0 - 1.0
  disconnectRate?: number; // 0.0 - 1.0
  connectionTimeout?: number; // ms
  connectionDelay?: number; // ms（接続遅延シミュレート）
  requiresAuth?: boolean;
  logging?: boolean | LogHandler;
  verifier?: EventVerifier; // イベント署名検証
  authVerifier?: EventVerifier; // AUTHイベント署名検証
  clock?: Clock; // 時刻ソース
  random?: RandomSource; // 乱数ソース
  network?: NetworkConditions; // ネットワーク条件シミュレーション
}
```

NetworkConditions:

```typescript
interface NetworkConditions {
  connectDelay?: number; // 接続確立遅延 (ms)
  messageDelay?: number; // メッセージ配信遅延 (ms)
  jitter?: number; // 遅延ジッター幅 (ms)
  outOfOrderRate?: number; // 順序シャッフル確率 (0.0–1.0)
  transientDisconnect?: {
    probability: number; // 切断確率 (0.0–1.0)
    duration: number; // 再接続不可期間 (ms)
  };
}
```

LogEntry:

```typescript
interface LogEntry {
  timestamp: number; // ms
  relay: string; // リレーURL
  direction: "send" | "receive";
  data: unknown;
}
```

RelaySnapshot:

```typescript
interface RelaySnapshot {
  timestamp: number; // 保存時刻 (ms)
  store: NostrEvent[]; // ストア内のイベント
  received: ClientMessage[]; // 受信メッセージログ
  deletedIds?: string[]; // 削除済みイベントID (NIP-09)
  info?: RelayInformation; // リレー情報 (NIP-11)
  metadata?: {
    subscriptionCount: number; // サブスクリプション数
    connectionCount: number; // 接続数
    eventCount: number; // イベント数
  };
}
```

EventKind:

```typescript
type EventKind =
  | "regular"
  | "replaceable"
  | "ephemeral"
  | "parameterized_replaceable";
```

COUNTHandler:

```typescript
type COUNTHandler = (
  subId: string,
  filters: NostrFilter[],
) => { count: number } | Promise<{ count: number }>;
```

LogLevel:

```typescript
type LogLevel = "silent" | "error" | "info" | "debug" | "trace";
```

UnsignedEvent:

```typescript
interface UnsignedEvent {
  pubkey: string; // 公開鍵 (64文字hex)
  created_at: number; // UNIXタイムスタンプ (秒)
  kind: number; // イベント種別
  tags: string[][]; // タグ配列
  content: string; // コンテンツ文字列
}
```

EventSigner:

```typescript
interface EventSigner {
  getPublicKey(): string | Promise<string>;
  signEvent(
    event: UnsignedEvent,
  ): { id: string; sig: string } | Promise<{ id: string; sig: string }>;
}
```

EventVerifier:

```typescript
interface EventVerifier {
  verifyEvent(event: NostrEvent): boolean | Promise<boolean>;
}
```
