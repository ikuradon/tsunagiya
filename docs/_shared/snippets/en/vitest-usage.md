Install as an npm package and use directly with Vitest.

### Setup

```bash
npm install -D vitest
npm install @ikuradon/tsunagiya
```

No special `vitest.config.ts` configuration is needed, but the `node`
environment is recommended:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

::: warning About jsdom / happy-dom environments `jsdom` and `happy-dom` have
their own WebSocket mocks, which may conflict with `pool.install()`'s
replacement of `globalThis.WebSocket`. Using `environment: 'node'` is
recommended. :::

### Writing Tests

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { MockPool } from "@ikuradon/tsunagiya";
import { EventBuilder } from "@ikuradon/tsunagiya/testing";

describe("Nostr client", () => {
  let pool: MockPool;

  afterEach(() => pool?.uninstall());

  it("should fetch events from relay", async () => {
    pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");

    const event = EventBuilder.kind1().content("hello nostr").build();
    relay.store(event);

    pool.install();

    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const messages: string[] = [];
    ws.onmessage = (ev) => messages.push(ev.data as string);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise((r) => setTimeout(r, 50));

    expect(messages.some((m) => m.includes("hello nostr"))).toBe(true);
    ws.close();
  });

  it("should publish events", async () => {
    pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");

    pool.install();

    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const event = EventBuilder.kind1().content("test post").build();
    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise((r) => setTimeout(r, 50));

    expect(relay.hasEvent(event.id)).toBe(true);
    ws.close();
  });
});
```

### Using Test Helpers

The helpers from `@ikuradon/tsunagiya/testing` work with Vitest as-is:

```typescript
import {
  assertEventPublished,
  assertReceivedREQ,
} from "@ikuradon/tsunagiya/testing";

// Assertion helpers are throw-based, so they're Vitest-compatible
assertReceivedREQ(relay, { kinds: [1] });
assertEventPublished(relay, event.id);
```
