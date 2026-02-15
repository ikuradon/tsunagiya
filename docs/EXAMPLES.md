# 使用例集

tsunagiya の実践的な使用例を紹介する。

## 目次

1. [基本的な REQ/EVENT テスト](#1-基本的な-reqevent-テスト)
2. [イベントの投稿テスト](#2-イベントの投稿テスト)
3. [複数リレーのテスト](#3-複数リレーのテスト)
4. [フィルターマッチングのテスト](#4-フィルターマッチングのテスト)
5. [カスタム REQ ハンドラー](#5-カスタム-req-ハンドラー)
6. [エラーハンドリングのテスト](#6-エラーハンドリングのテスト)
7. [NIP-42 AUTH 処理のテスト](#7-nip-42-auth-処理のテスト)
8. [大量イベントのテスト](#8-大量イベントのテスト)
9. [リアルタイムストリームのテスト](#9-リアルタイムストリームのテスト)
10. [スレッド（リプライチェーン）のテスト](#10-スレッドリプライチェーンのテスト)
11. [リアクションのテスト](#11-リアクションのテスト)
12. [不正データの処理テスト](#12-不正データの処理テスト)
13. [ログ出力のテスト](#13-ログ出力のテスト)
14. [スナップショットを使ったテスト](#14-スナップショットを使ったテスト)

---

## 1. 基本的な REQ/EVENT テスト

```typescript
import { MockPool } from "@ikuradon/tsunagiya";
import { assertReceivedREQ, EventBuilder } from "@ikuradon/tsunagiya/testing";
import { assertEquals } from "@std/assert";

Deno.test("kind:1 のイベントを取得する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("hello").build());
  relay.store(EventBuilder.kind(0).content('{"name":"Alice"}').build());

  pool.install();
  try {
    const events: string[] = [];
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") events.push(msg[2].content);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(events, ["hello"]); // kind:0 はフィルターされる
    assertReceivedREQ(relay, { kinds: [1] });
  } finally {
    pool.uninstall();
  }
});
```

## 2. イベントの投稿テスト

```typescript
Deno.test("イベントを投稿して OK を受け取る", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const event = EventBuilder.kind1().content("my post").build();
    let okReceived = false;

    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["EVENT", event]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "OK" && msg[1] === event.id && msg[2] === true) {
          okReceived = true;
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    assertEquals(okReceived, true);
    assertEquals(relay.hasEvent(event.id), true);
  } finally {
    pool.uninstall();
  }
});
```

## 3. 複数リレーのテスト

```typescript
Deno.test("3つのリレーからイベントを集約する", async () => {
  const pool = new MockPool();
  const urls = [
    "wss://relay1.example.com",
    "wss://relay2.example.com",
    "wss://relay3.example.com",
  ];

  urls.forEach((url, i) => {
    pool.relay(url).store(
      EventBuilder.kind1().content(`event from relay ${i + 1}`).build(),
    );
  });

  pool.install();
  try {
    const allEvents: string[] = [];
    let done = 0;

    await new Promise<void>((resolve) => {
      for (const url of urls) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") allEvents.push(msg[2].content);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => {
          if (++done === 3) resolve();
        };
      }
    });

    assertEquals(allEvents.length, 3);
  } finally {
    pool.uninstall();
  }
});
```

## 4. フィルターマッチングのテスト

```typescript
import { filterEvents, matchFilter } from "@ikuradon/tsunagiya";

Deno.test("フィルターマッチング", () => {
  const event = EventBuilder.kind1()
    .pubkey("alice")
    .createdAt(1700000000)
    .tag("t", "nostr")
    .build();

  // kind マッチ
  assertEquals(matchFilter(event, { kinds: [1] }), true);
  assertEquals(matchFilter(event, { kinds: [0] }), false);

  // author マッチ（プレフィックス）
  assertEquals(matchFilter(event, { authors: ["alice"] }), true);

  // 時間範囲
  assertEquals(matchFilter(event, { since: 1699999999 }), true);
  assertEquals(matchFilter(event, { since: 1700000001 }), false);

  // タグフィルター
  assertEquals(matchFilter(event, { "#t": ["nostr"] }), true);
  assertEquals(matchFilter(event, { "#t": ["bitcoin"] }), false);
});

Deno.test("filterEvents で limit を適用する", () => {
  const events = EventBuilder.timeline(100, { kind: 1 });
  const result = filterEvents(events, { kinds: [1], limit: 10 });
  assertEquals(result.length, 10);
});
```

## 5. カスタム REQ ハンドラー

```typescript
Deno.test("カスタム REQ ハンドラーで動的にイベントを返す", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onREQ((subId, filters) => {
    // フィルターに基づいて動的にイベント生成
    const kind = filters[0]?.kinds?.[0] ?? 1;
    return [
      EventBuilder.kind(kind).content(`dynamic event for ${subId}`).build(),
    ];
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    let content = "";

    await new Promise<void>((resolve) => {
      ws.onopen = () =>
        ws.send(JSON.stringify(["REQ", "my-sub", { kinds: [1] }]));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") content = msg[2].content;
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(content, "dynamic event for my-sub");
  } finally {
    pool.uninstall();
  }
});
```

## 6. エラーハンドリングのテスト

```typescript
Deno.test("未登録URLへの接続は失敗する", async () => {
  const pool = new MockPool();
  pool.relay("wss://known.relay.com"); // 別のURLだけ登録

  pool.install();
  try {
    const ws = new WebSocket("wss://unknown.relay.com");
    let errorFired = false;

    const code = await new Promise<number>((resolve) => {
      ws.onerror = () => {
        errorFired = true;
      };
      ws.onclose = (e) => resolve(e.code);
    });

    assertEquals(errorFired, true);
    assertEquals(code, 1006);
  } finally {
    pool.uninstall();
  }
});

Deno.test("EVENT が拒否されるケース", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((event) => {
    return ["OK", event.id, false, "blocked: content policy violation"];
  });

  pool.install();
  try {
    const event = EventBuilder.kind1().content("spam").build();
    const ws = new WebSocket("wss://relay.example.com");

    const result = await new Promise<[boolean, string]>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify(["EVENT", event]));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "OK") {
          resolve([msg[2], msg[3]]);
          ws.close();
        }
      };
    });

    assertEquals(result[0], false);
    assertEquals(result[1], "blocked: content policy violation");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NOTICE メッセージの受信", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    let notice = "";

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // サーバー側からNOTICE送信
        relay.sendNotice("rate-limited: slow down");
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "NOTICE") {
          notice = msg[1];
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    assertEquals(notice, "rate-limited: slow down");
  } finally {
    pool.uninstall();
  }
});
```

## 7. NIP-42 AUTH 処理のテスト

```typescript
Deno.test("AUTH チャレンジ/レスポンス", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.com", { requiresAuth: true });

  relay.requireAuth((authEvent) => {
    return authEvent.tags.some(
      (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
    );
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://auth.relay.com");
    let authResult = false;

    await new Promise<void>((resolve) => {
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "AUTH") {
          // チャレンジを受け取ったら AUTH イベントを返す
          const challenge = msg[1];
          const authEvent = EventBuilder.kind(22242)
            .tag("relay", "wss://auth.relay.com")
            .tag("challenge", challenge)
            .build();
          ws.send(JSON.stringify(["AUTH", authEvent]));
        }
        if (msg[0] === "OK") {
          authResult = msg[2];
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    assertEquals(authResult, true);
  } finally {
    pool.uninstall();
  }
});
```

## 8. 大量イベントのテスト

```typescript
Deno.test("1000件のイベントを処理する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const events = EventBuilder.bulk(1000, { kind: 1 });
  for (const e of events) relay.store(e);

  pool.install();
  try {
    const received: unknown[] = [];
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 1000);
  } finally {
    pool.uninstall();
  }
});
```

## 9. リアルタイムストリームのテスト

```typescript
import { startStream, streamEvents } from "@ikuradon/tsunagiya/testing";

Deno.test("時間差でイベントが配信される", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const events = EventBuilder.bulk(5, { kind: 1 });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const received: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "stream", { kinds: [1] }]));

        // 100ms間隔でイベントを配信
        const handle = streamEvents(relay, events, { interval: 100 });

        setTimeout(() => {
          handle.stop();
          ws.close();
        }, 700);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
      };

      ws.onclose = () => resolve();
    });

    assertEquals(received.length >= 3, true); // タイミング依存
  } finally {
    pool.uninstall();
  }
});

Deno.test("継続的ストリーム", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const received: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "live", { kinds: [1] }]));

        // 5件のイベントを自動生成
        const stream = startStream(relay, {
          eventGenerator: () => EventBuilder.random({ kind: 1 }),
          interval: 50,
          count: 5,
        });

        setTimeout(() => {
          stream.stop();
          ws.close();
        }, 500);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
      };

      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 5);
  } finally {
    pool.uninstall();
  }
});
```

## 10. スレッド（リプライチェーン）のテスト

```typescript
Deno.test("スレッドの取得", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const thread = EventBuilder.thread(5);
  for (const e of thread) relay.store(e);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const replies: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // root イベントへの返信を検索
        ws.send(JSON.stringify(["REQ", "thread", { "#e": [thread[0].id] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") replies.push(msg[2]);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    // thread[0] は root なので #e タグを持たない → 4件の返信
    assertEquals(replies.length, 4);
  } finally {
    pool.uninstall();
  }
});
```

## 11. リアクションのテスト

```typescript
Deno.test("リアクションの取得", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const [post, reactions] = EventBuilder.withReactions(10);
  relay.store(post);
  for (const r of reactions) relay.store(r);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const received: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify(["REQ", "reactions", { kinds: [7], "#e": [post.id] }]),
        );
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EVENT") received.push(msg[2]);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    assertEquals(received.length, 10);
  } finally {
    pool.uninstall();
  }
});
```

## 12. 不正データの処理テスト

```typescript
Deno.test("不正JSONの受信", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const messages: string[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // サーバーから不正データを送信
        relay.sendRaw("this is not json");
        relay.sendRaw('{"also": "not a nostr message"}');

        setTimeout(() => ws.close(), 100);
      };
      ws.onmessage = (e) => messages.push(e.data);
      ws.onclose = () => resolve();
    });

    // 不正データもそのまま受信される
    assertEquals(messages.length, 2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("壊れたイベントの投稿", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((event) => {
    // IDが不正なら拒否
    if (event.id.startsWith("corrupted_")) {
      return ["OK", event.id, false, "invalid: bad event id"];
    }
    return ["OK", event.id, true, ""];
  });

  pool.install();
  try {
    const broken = EventBuilder.kind1().corrupt({ id: true }).build();
    const ws = new WebSocket("wss://relay.example.com");

    const result = await new Promise<boolean>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify(["EVENT", broken]));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "OK") {
          resolve(msg[2]);
          ws.close();
        }
      };
    });

    assertEquals(result, false);
  } finally {
    pool.uninstall();
  }
});
```

## 13. ログ出力のテスト

```typescript
import type { LogEntry } from "@ikuradon/tsunagiya";

Deno.test("カスタムログハンドラー", async () => {
  const pool = new MockPool();
  const logs: LogEntry[] = [];

  pool.relay("wss://relay.example.com", {
    logging: (entry) => logs.push(entry),
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") ws.close();
      };
      ws.onclose = () => resolve();
    });

    // receive: REQ, send: EOSE
    const receives = logs.filter((l) => l.direction === "receive");
    const sends = logs.filter((l) => l.direction === "send");
    assertEquals(receives.length >= 1, true);
    assertEquals(sends.length >= 1, true);
  } finally {
    pool.uninstall();
  }
});
```

## 14. スナップショットを使ったテスト

```typescript
import { restore, snapshot } from "@ikuradon/tsunagiya/testing";

Deno.test("スナップショットで複数テストケースを効率的に実行", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // 基本データをセットアップ
  const baseEvents = EventBuilder.bulk(10, { kind: 1 });
  for (const e of baseEvents) relay.store(e);

  // ベースラインを保存
  const baseline = snapshot(relay);

  // テスト1: イベント追加
  relay.store(EventBuilder.kind1().content("extra").build());
  // ... 検証 ...

  // ベースラインに復元
  restore(relay, baseline);

  // テスト2: 別のシナリオ（ベースラインから再開）
  relay.store(EventBuilder.kind(7).content("+").build());
  // ... 検証 ...

  restore(relay, baseline); // また復元
});
```

---

## 関連ドキュメント

- [API_REFERENCE.md](./API_REFERENCE.md) - 全 API の詳細
- [TEST_PATTERNS.md](./TEST_PATTERNS.md) - テストパターン集
- [BEST_PRACTICES.md](./BEST_PRACTICES.md) - テスト設計のベストプラクティス
