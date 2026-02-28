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
    // ... existing client code runs without modification
  } finally {
    pool.uninstall();
  }
});
```
