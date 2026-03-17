npm パッケージとしてインストールすれば、Vitest でそのまま使えます。

### セットアップ

```bash
npm install -D vitest
npm install @ikuradon/tsunagiya
```

`vitest.config.ts` は特別な設定不要ですが、環境は `node` を推奨します:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

::: warning jsdom / happy-dom 環境について `jsdom` や `happy-dom` は独自の
WebSocket モックを持つため、`pool.install()` による `globalThis.WebSocket`
の差し替えと競合する可能性があります。`environment: 'node'` の使用を推奨します。
:::

### テストの書き方

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

### テスト支援ヘルパーの活用

`@ikuradon/tsunagiya/testing` のヘルパーも Vitest でそのまま使えます:

```typescript
import {
  assertEventPublished,
  assertReceivedREQ,
} from "@ikuradon/tsunagiya/testing";

// アサーションヘルパー（throw Error ベースなので Vitest 互換）
assertReceivedREQ(relay, { kinds: [1] });
assertEventPublished(relay, event.id);
```
