最小限のテスト:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { assertEquals } from "@std/assert";

Deno.test("リレーからイベントを取得する", async () => {
  // 1. セットアップ
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // テストデータを登録
  relay.store({
    id: "event1",
    pubkey: "pubkey1",
    kind: 1,
    content: "Hello, Nostr!",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  // 2. WebSocket差し替え
  pool.install();
  try {
    // 3. テスト対象コード
    const ws = new WebSocket("wss://relay.example.com");
    const events: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") {
          events.push(msg[2]);
        }
        if (msg[0] === "EOSE") {
          ws.close();
        }
      };

      ws.onclose = () => resolve();
    });

    assertEquals(events.length, 1);
    assertEquals((events[0] as { content: string }).content, "Hello, Nostr!");
  } finally {
    pool.uninstall();
  }
});
```

複数リレーのテスト:

```typescript
Deno.test("複数リレーからイベントを集約する", async () => {
  const pool = new MockPool();

  const relay1 = pool.relay("wss://relay1.example.com");
  const relay2 = pool.relay("wss://relay2.example.com");

  relay1.store({
    id: "event-from-relay1",
    pubkey: "alice",
    kind: 1,
    content: "from relay1",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  relay2.store({
    id: "event-from-relay2",
    pubkey: "bob",
    kind: 1,
    content: "from relay2",
    created_at: 1700000001,
    tags: [],
    sig: "sig2",
  });

  pool.install();
  try {
    const allEvents: unknown[] = [];
    let closedCount = 0;

    await new Promise<void>((resolve) => {
      for (
        const url of ["wss://relay1.example.com", "wss://relay2.example.com"]
      ) {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") allEvents.push(msg[2]);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => {
          closedCount++;
          if (closedCount === 2) resolve();
        };
      }
    });

    assertEquals(allEvents.length, 2);
  } finally {
    pool.uninstall();
  }
});
```

不安定リレーのシミュレート:

```typescript
Deno.test("遅延のあるリレー", async () => {
  const pool = new MockPool();

  // 100ms〜500msのランダムな遅延
  pool.relay("wss://slow.relay.com", {
    latency: { min: 100, max: 500 },
  });

  pool.install();
  try {
    const start = Date.now();
    const ws = new WebSocket("wss://slow.relay.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") {
          const elapsed = Date.now() - start;
          console.log(`応答時間: ${elapsed}ms`);
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("一定時間後に切断されるリレー", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://unstable.relay.com");

  // 1秒後に切断
  relay.disconnectAfter(1000);

  pool.install();
  try {
    const ws = new WebSocket("wss://unstable.relay.com");

    const closeCode = await new Promise<number>((resolve) => {
      ws.onclose = (e) => resolve(e.code);
    });

    assertEquals(closeCode, 1006);
  } finally {
    pool.uninstall();
  }
});

Deno.test("接続拒否するリレー", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://down.relay.com");
  relay.refuse();

  pool.install();
  try {
    const ws = new WebSocket("wss://down.relay.com");

    const closeCode = await new Promise<number>((resolve) => {
      ws.onerror = () => {}; // エラーは無視
      ws.onclose = (e) => resolve(e.code);
    });

    assertEquals(closeCode, 1006);
  } finally {
    pool.uninstall();
  }
});
```

EventBuilder の活用:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { EventBuilder } from "@ikuradon/tsunagiya/testing";

Deno.test("EventBuilderでテストデータを生成する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // ビルダーパターンで生成
  const event = EventBuilder.kind1()
    .content("hello world")
    .tag("t", "nostr")
    .build();

  relay.store(event);

  // バルク生成
  const events = EventBuilder.bulk(10, { kind: 1 });
  for (const e of events) {
    relay.store(e);
  }

  // 時系列データ
  const timeline = EventBuilder.timeline(5, {
    interval: 60,
    startTime: 1700000000,
  });
  for (const e of timeline) {
    relay.store(e);
  }

  // スレッド生成
  const thread = EventBuilder.thread(3);
  // thread[0] = root, thread[1] = reply1, thread[2] = reply2
  for (const e of thread) {
    relay.store(e);
  }

  pool.install();
  try {
    // ... テスト
  } finally {
    pool.uninstall();
  }
});
```

よく使うテンプレート:

```typescript
// プロフィール
const profile = EventBuilder.metadata({ name: "Alice", about: "Nostr user" });

// コンタクトリスト
const contacts = EventBuilder.contacts(["pubkey1", "pubkey2"]);

// DM
const dm = EventBuilder.dm("recipient-pubkey", "秘密のメッセージ").build();

// 壊れたイベント（バリデーションテスト用）
const broken = EventBuilder.kind1()
  .corrupt({ id: true, sig: true })
  .build();
```

検証ヘルパーの使い方:

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import {
  assertClosed,
  assertEventPublished,
  assertReceivedREQ,
} from "@ikuradon/tsunagiya/testing";

Deno.test("クライアントが正しいメッセージを送信したか検証する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], limit: 20 }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") {
          ws.send(JSON.stringify(["CLOSE", "sub1"]));
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    // 検証
    assertReceivedREQ(relay, { kinds: [1] });
    assertClosed(relay, "sub1");
  } finally {
    pool.uninstall();
  }
});
```

スナップショットで状態管理:

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

Deno.test("スナップショットで状態を復元する", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("original").build());

  // 状態を保存
  const snap = snapshot(relay);

  // 追加操作
  relay.store(EventBuilder.kind1().content("added").build());

  // 復元
  restore(relay, snap);
  // → "added" は消え、"original" だけの状態に戻る
});
```
