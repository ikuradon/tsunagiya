NDK bootstrap pattern:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";

// 1. Install MockPool first
const bootstrap = new MockPool();
bootstrap.relay("wss://bootstrap");
bootstrap.install();

// 2. Dynamic import NDK (captures MockWebSocket at this point)
const { default: NDK } = await import("@nostr-dev-kit/ndk");

// 3. Uninstall the bootstrap MockPool
bootstrap.uninstall();

// Write tests as usual from here
Deno.test("fetch events with NDK", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("hello from NDK").build());

  pool.install();
  try {
    const ndk = new NDK({ explicitRelayUrls: ["wss://relay.example.com"] });
    await ndk.connect();

    const events = await ndk.fetchEvents({ kinds: [1] });
    assertEquals([...events].length, 1);
  } finally {
    pool.uninstall();
  }
});
```
