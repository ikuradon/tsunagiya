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

### 条件待ちヘルパー（`waitFor`）

固定時間の `setTimeout` 待ちは CI
環境でフレーキーテストの原因になります。`waitFor`
はポーリングベースで条件が満たされるまで待機します:

```typescript
import { waitFor } from "@ikuradon/tsunagiya/testing";

// 3件のイベントが届くまで待つ（固定 setTimeout の代わりに）
await waitFor(() => received.length >= 3);

// タイムアウト・間隔のカスタマイズ
await waitFor(() => relay.connectionCount === 0, {
  timeout: 3000,
  interval: 20,
});
```

### 非同期クリーンアップの待機

rx-nostr 等のライブラリは `dispose()` 後も内部で非同期的に WebSocket
を閉じることがあります。`waitFor` で全接続が閉じるまで確実に待機できます:

```typescript
import { waitFor } from "@ikuradon/tsunagiya/testing";

afterEach(async () => {
  rxNostr.dispose();
  // 全接続が閉じるまで待つ
  await waitFor(() => relay.connectionCount === 0);
  pool.uninstall();
});
```

これにより、テスト間の非同期リークによるフレーキーテストを防止できます。

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
