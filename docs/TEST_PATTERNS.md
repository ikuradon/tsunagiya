# テストパターン集

Nostr クライアント開発でよくあるテストシナリオとその実装パターン。

## 目次

1. [リレー切断時のリトライテスト](#1-リレー切断時のリトライテスト)
2. [複数リレーのフェイルオーバーテスト](#2-複数リレーのフェイルオーバーテスト)
3. [タイムアウト処理のテスト](#3-タイムアウト処理のテスト)
4. [エラーハンドリングのテスト](#4-エラーハンドリングのテスト)
5. [並行接続のテスト](#5-並行接続のテスト)
6. [サブスクリプション管理のテスト](#6-サブスクリプション管理のテスト)
7. [イベントの重複排除テスト](#7-イベントの重複排除テスト)
8. [段階的な切断テスト](#8-段階的な切断テスト)
9. [レート制限のテスト](#9-レート制限のテスト)
10. [再接続後の状態復元テスト](#10-再接続後の状態復元テスト)

---

## 1. リレー切断時のリトライテスト

クライアントがリレー切断後に再接続を試みるかテストする。

```typescript
Deno.test("切断後に再接続する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    let connectionCount = 0;

    // クライアントの再接続ロジック
    function connect(): Promise<void> {
      return new Promise((resolve) => {
        const ws = new WebSocket("wss://relay.example.com");
        ws.onopen = () => {
          connectionCount++;
          if (connectionCount === 1) {
            // 最初の接続を切断
            relay.disconnect(1006);
          } else {
            ws.close();
            resolve();
          }
        };
        ws.onclose = (e) => {
          if (e.code !== 1000 && connectionCount < 3) {
            // 再接続
            setTimeout(() => connect().then(resolve), 100);
          }
        };
      });
    }

    await connect();
    assertEquals(connectionCount, 2); // 初回 + 再接続
  } finally {
    pool.uninstall();
  }
});
```

## 2. 複数リレーのフェイルオーバーテスト

一部のリレーが利用不可でも、他のリレーからデータを取得できるかテストする。

```typescript
Deno.test("一部リレーがダウンしても動作する", async () => {
  const pool = new MockPool();

  // 正常なリレー
  const goodRelay = pool.relay("wss://good.relay.com");
  goodRelay.store(EventBuilder.kind1().content("available").build());

  // ダウンしたリレー
  const badRelay = pool.relay("wss://bad.relay.com");
  badRelay.refuse();

  pool.install();
  try {
    const events: string[] = [];
    const errors: string[] = [];
    let done = 0;

    await new Promise<void>((resolve) => {
      for (const url of ["wss://good.relay.com", "wss://bad.relay.com"]) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") events.push(msg[2].content);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onerror = () => errors.push(url);
        ws.onclose = () => {
          if (++done === 2) resolve();
        };
      }
    });

    assertEquals(events, ["available"]);
    assertEquals(errors, ["wss://bad.relay.com"]);
  } finally {
    pool.uninstall();
  }
});
```

## 3. タイムアウト処理のテスト

接続タイムアウトが正しく処理されるかテストする。

```typescript
Deno.test("接続タイムアウト", async () => {
  const pool = new MockPool();
  pool.relay("wss://slow.relay.com", {
    connectionTimeout: 100, // 100msでタイムアウト
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://slow.relay.com");
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
```

## 4. エラーハンドリングのテスト

様々なエラーケースを網羅的にテストする。

```typescript
Deno.test("エラー率のあるリレー", async () => {
  const pool = new MockPool();
  pool.relay("wss://flaky.relay.com", {
    errorRate: 1.0, // 100%エラー
  });

  // イベントを登録してもエラー率100%なのでNOTICEが返る
  pool.relay("wss://flaky.relay.com").store(
    EventBuilder.kind1().content("test").build(),
  );

  pool.install();
  try {
    const ws = new WebSocket("wss://flaky.relay.com");
    let gotNotice = false;

    await new Promise<void>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "NOTICE") {
          gotNotice = true;
          ws.close();
        }
      };
      ws.onclose = () => resolve();
    });

    assertEquals(gotNotice, true);
  } finally {
    pool.uninstall();
  }
});
```

## 5. 並行接続のテスト

同じリレーへの複数同時接続をテストする。

```typescript
Deno.test("同一リレーに複数接続", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.store(EventBuilder.kind1().content("shared").build());

  pool.install();
  try {
    const results: number[] = [];

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        new Promise<void>((resolve) => {
          const ws = new WebSocket("wss://relay.example.com");
          let count = 0;
          ws.onopen = () =>
            ws.send(JSON.stringify(["REQ", `s${i}`, { kinds: [1] }]));
          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg[0] === "EVENT") count++;
            if (msg[0] === "EOSE") ws.close();
          };
          ws.onclose = () => {
            results.push(count);
            resolve();
          };
        })),
    );

    // 全接続が同じイベントを受信
    assertEquals(results, [1, 1, 1, 1, 1]);
  } finally {
    pool.uninstall();
  }
});
```

## 6. サブスクリプション管理のテスト

CLOSE メッセージによるサブスクリプション管理をテストする。

```typescript
Deno.test("サブスクリプションのCLOSE", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // 複数サブスクリプションを開く
        ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
        ws.send(JSON.stringify(["REQ", "sub2", { kinds: [0] }]));
      };

      let eoseCount = 0;
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "EOSE") {
          eoseCount++;
          if (eoseCount === 2) {
            // サブスクリプションを閉じる
            ws.send(JSON.stringify(["CLOSE", "sub1"]));
            ws.send(JSON.stringify(["CLOSE", "sub2"]));
            ws.close();
          }
        }
      };
      ws.onclose = () => resolve();
    });

    assertReceivedREQ(relay, { kinds: [1] });
    assertReceivedREQ(relay, { kinds: [0] });
    assertClosed(relay, "sub1");
    assertClosed(relay, "sub2");
  } finally {
    pool.uninstall();
  }
});
```

## 7. イベントの重複排除テスト

複数リレーから同じイベントを受信した場合の重複排除をテストする。

```typescript
Deno.test("重複イベントの排除", async () => {
  const pool = new MockPool();

  // 同じイベントを複数リレーに登録
  const sharedEvent = EventBuilder.kind1().id("shared-id").content("shared")
    .build();

  pool.relay("wss://relay1.example.com").store(sharedEvent);
  pool.relay("wss://relay2.example.com").store(sharedEvent);

  pool.install();
  try {
    const eventIds = new Set<string>();
    let done = 0;

    await new Promise<void>((resolve) => {
      for (
        const url of ["wss://relay1.example.com", "wss://relay2.example.com"]
      ) {
        const ws = new WebSocket(url);
        ws.onopen = () => ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") eventIds.add(msg[2].id);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => {
          if (++done === 2) resolve();
        };
      }
    });

    // Set で重複排除 → 1件
    assertEquals(eventIds.size, 1);
  } finally {
    pool.uninstall();
  }
});
```

## 8. 段階的な切断テスト

`disconnectAfter` を使って一定時間後の切断をテストする。

```typescript
Deno.test("3秒後に切断される", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const start = Date.now();

    // 500ms後に切断をスケジュール
    relay.disconnectAfter(500);

    const elapsed = await new Promise<number>((resolve) => {
      ws.onclose = () => resolve(Date.now() - start);
    });

    // 500ms前後で切断されたことを確認（マージン込み）
    assertEquals(elapsed >= 400, true);
    assertEquals(elapsed <= 700, true);
  } finally {
    pool.uninstall();
  }
});
```

## 9. レート制限のテスト

NOTICE を使ったレート制限の通知をテストする。

```typescript
Deno.test("レート制限の NOTICE", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  let reqCount = 0;
  relay.onREQ((subId, filters) => {
    reqCount++;
    if (reqCount > 3) {
      // 3回目以降はレート制限を通知（NOTICEはハンドラー外で送信）
      relay.sendNotice("rate-limited: too many REQs");
    }
    return [];
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    const notices: string[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // 5回REQを送信
        for (let i = 0; i < 5; i++) {
          ws.send(JSON.stringify(["REQ", `sub${i}`, { kinds: [1] }]));
        }
        setTimeout(() => ws.close(), 200);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "NOTICE") notices.push(msg[1]);
      };
      ws.onclose = () => resolve();
    });

    assertEquals(notices.length, 2); // 4回目と5回目のREQで通知
  } finally {
    pool.uninstall();
  }
});
```

## 10. 再接続後の状態復元テスト

切断後に再接続した場合、サブスクリプションが正しく復元されるかテストする。

```typescript
Deno.test("再接続後にサブスクリプションを再登録する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.store(EventBuilder.kind1().content("persistent").build());

  pool.install();
  try {
    let connectCount = 0;
    const allEvents: string[] = [];

    async function connectAndSubscribe(): Promise<void> {
      return new Promise((resolve) => {
        const ws = new WebSocket("wss://relay.example.com");
        ws.onopen = () => {
          connectCount++;
          ws.send(JSON.stringify(["REQ", "main", { kinds: [1] }]));
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg[0] === "EVENT") allEvents.push(msg[2].content);
          if (msg[0] === "EOSE") ws.close();
        };
        ws.onclose = () => resolve();
      });
    }

    // 1回目の接続
    await connectAndSubscribe();
    // 2回目の接続（再接続シミュレート）
    await connectAndSubscribe();

    assertEquals(connectCount, 2);
    assertEquals(allEvents, ["persistent", "persistent"]); // 両方で取得
  } finally {
    pool.uninstall();
  }
});
```

---

## 関連ドキュメント

- [EXAMPLES.md](./EXAMPLES.md) - 具体的な使用例
- [BEST_PRACTICES.md](./BEST_PRACTICES.md) - テスト設計のベストプラクティス
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - エラー解決
- [PERFORMANCE.md](./PERFORMANCE.md) - パフォーマンス最適化
