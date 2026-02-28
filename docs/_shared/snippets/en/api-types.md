NostrEvent:

```typescript
interface NostrEvent {
  id: string; // event ID (64-char hex)
  pubkey: string; // public key (64-char hex)
  created_at: number; // UNIX timestamp (seconds)
  kind: number; // event kind
  tags: string[][]; // tag array
  content: string; // content string
  sig: string; // signature (128-char hex)
}
```

NostrFilter:

```typescript
interface NostrFilter {
  ids?: string[]; // ID prefix match
  authors?: string[]; // public key prefix match
  kinds?: number[]; // exact kind match
  since?: number; // created_at lower bound (inclusive)
  until?: number; // created_at upper bound (inclusive)
  limit?: number; // maximum results
  search?: string; // NIP-50: search keyword
  [key: `#${string}`]: string[] | undefined; // tag filter
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
  connectionDelay?: number; // ms (simulate connection delay)
  requiresAuth?: boolean;
  logging?: boolean | LogHandler;
  verifier?: EventVerifier; // event signature verification
}
```

LogEntry:

```typescript
interface LogEntry {
  timestamp: number; // ms
  relay: string; // relay URL
  direction: "send" | "receive";
  data: unknown;
}
```

RelaySnapshot:

```typescript
interface RelaySnapshot {
  timestamp: number; // save time (ms)
  store: NostrEvent[]; // events in store
  received: ClientMessage[]; // received message log
  deletedIds?: string[]; // deleted event IDs (NIP-09)
  info?: RelayInformation; // relay information (NIP-11)
  metadata?: {
    subscriptionCount: number; // number of subscriptions
    connectionCount: number; // number of connections
    eventCount: number; // number of events
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
  pubkey: string; // public key (64-char hex)
  created_at: number; // UNIX timestamp (seconds)
  kind: number; // event kind
  tags: string[][]; // tag array
  content: string; // content string
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
