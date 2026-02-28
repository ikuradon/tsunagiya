NDK ブートストラップパターン（日本語）:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";

// 1. MockPool を先にインストール
const bootstrap = new MockPool();
bootstrap.relay("wss://bootstrap");
bootstrap.install();

// 2. NDK を dynamic import（この時点で MockWebSocket を捕捉する）
const { default: NDK } = await import("@nostr-dev-kit/ndk");

// 3. ブートストラップ用の MockPool をアンインストール
bootstrap.uninstall();

// 以降は通常通りテストを記述する
Deno.test("NDK でイベントを取得する", async () => {
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
