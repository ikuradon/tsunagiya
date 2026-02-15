# チュートリアル

tsunagiya を使って Nostr クライアントのテストを書く方法を、ステップバイステップで解説する。

## 前提条件

- Deno がインストール済み
- Nostr プロトコルの基本（EVENT, REQ, CLOSE）を理解している

## セットアップ

```bash
deno add jsr:@ikuradon/tsunagiya
```

---

## ステップ 1: 最初のテストを作成する

### 基本的な流れ

tsunagiya のテストは以下の3ステップで構成される：

1. **MockPool を作成し、リレーを登録する**
2. **`pool.install()` で WebSocket を差し替える**
3. **テスト対象コードを実行し、`pool.uninstall()` で復元する**

### 最小限のテスト

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

### ポイント

- `pool.install()` と `pool.uninstall()` は必ず `try/finally` で囲む
- `relay.store()` で事前にテストデータを登録しておく
- REQ を送信すると、フィルターにマッチするイベントが自動的に返される
- マッチング後に EOSE（End of Stored Events）が送信される

---

## ステップ 2: 複数リレーのテスト

実際の Nostr クライアントは複数のリレーに接続する。tsunagiya はこれを簡単にテストできる。

```typescript
Deno.test("複数リレーからイベントを集約する", async () => {
  const pool = new MockPool();

  const relay1 = pool.relay("wss://relay1.example.com");
  const relay2 = pool.relay("wss://relay2.example.com");

  // 各リレーに異なるイベントを登録
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
      for (const url of ["wss://relay1.example.com", "wss://relay2.example.com"]) {
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

### ポイント

- `pool.relay()` を URL ごとに呼び出す
- 各リレーは独立して動作する
- 未登録 URL に接続すると、接続失敗（code: 1006）として扱われる

---

## ステップ 3: 不安定リレーのシミュレート

実際のリレーはネットワーク遅延やエラーが発生する。tsunagiya でこれをシミュレートできる。

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

### MockRelayOptions 一覧

| オプション | 型 | 説明 |
|-----------|-----|------|
| `latency` | `number \| { min, max }` | 応答遅延 (ms) |
| `errorRate` | `0.0 - 1.0` | エラー応答の確率 |
| `disconnectRate` | `0.0 - 1.0` | ランダム切断の確率 |
| `connectionTimeout` | `number` | 接続タイムアウト (ms) |
| `requiresAuth` | `boolean` | AUTH 要求の有効化 |
| `logging` | `boolean \| LogHandler` | ログ出力 |

---

## ステップ 4: EventBuilder の活用

テストデータを手書きするのは面倒。EventBuilder を使えば簡潔に書ける。

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

### よく使うテンプレート

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

---

## ステップ 5: 検証ヘルパーの使い方

テスト対象のクライアントが正しいメッセージを送信したか検証する。

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import {
  assertReceivedREQ,
  assertEventPublished,
  assertClosed,
} from "@ikuradon/tsunagiya/testing";

Deno.test("クライアントが正しいメッセージを送信したか検証する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // REQ送信
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], limit: 20 }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") {
          // CLOSE送信
          ws.send(JSON.stringify(["CLOSE", "sub1"]));
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    // 検証
    assertReceivedREQ(relay, { kinds: [1] });
    assertClosed(relay, "sub1");

    // 手動検証も可能
    assertEquals(relay.countREQs(), 1);
    assertEquals(relay.hasREQ("sub1"), true);
  } finally {
    pool.uninstall();
  }
});
```

### スナップショットで状態管理

```typescript
import { snapshot, restore } from "@ikuradon/tsunagiya/testing";

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

---

## 次のステップ

- [EXAMPLES.md](./EXAMPLES.md) - 実践的な使用例集
- [TEST_PATTERNS.md](./TEST_PATTERNS.md) - よくあるテストシナリオ
- [API_REFERENCE.md](./API_REFERENCE.md) - 全 API の詳細リファレンス
- [BEST_PRACTICES.md](./BEST_PRACTICES.md) - テスト設計のベストプラクティス
