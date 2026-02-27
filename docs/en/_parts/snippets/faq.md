Connecting to an unregistered URL:

```typescript
pool.relay("wss://known.relay.com"); // only this is registered
const ws = new WebSocket("wss://unknown.relay.com"); // → error + close(1006)
```

Adding multiple relays:

```typescript
const pool = new MockPool();
const relay1 = pool.relay("wss://relay1.example.com");
const relay2 = pool.relay("wss://relay2.example.com");
const relay3 = pool.relay("wss://relay3.example.com");
```

Custom response with onEVENT:

```typescript
relay.onEVENT((event) => {
  if (event.kind === 1) {
    return ["OK", event.id, true, ""];
  }
  return ["OK", event.id, false, "blocked: kind not allowed"];
});
```

Getting the AUTH challenge:

```typescript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "AUTH") {
    const challenge = msg[1]; // challenge string
  }
};
```

Calling the same URL multiple times:

```typescript
const r1 = pool.relay("wss://relay.example.com", { latency: 100 });
const r2 = pool.relay("wss://relay.example.com"); // same instance as r1
console.log(r1 === r2); // true
```

When you want to use globalThis.WebSocket directly:

```typescript
const RealWebSocket = globalThis.WebSocket;
pool.install();
// new WebSocket() is MockWebSocket
// new RealWebSocket() is the real WebSocket
```

EventBuilder default field values:

| Field        | Default Value               |
| ------------ | --------------------------- |
| `id`         | Random 64-char hex          |
| `pubkey`     | Random 64-char hex          |
| `created_at` | Current time (UNIX seconds) |
| `kind`       | Depends on factory method   |
| `tags`       | `[]`                        |
| `content`    | `""`                        |
| `sig`        | Random 128-char hex         |
