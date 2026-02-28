カスタム REQ ハンドラー:

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

エラーハンドリングのテスト:

```typescript
Deno.test("未登録URLへの接続は失敗する", async () => {
  const pool = new MockPool();
  pool.relay("wss://known.relay.test"); // 別のURLだけ登録

  pool.install();
  try {
    const ws = new WebSocket("wss://unknown.relay.test");
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

NIP-42 AUTH 処理のテスト:

```typescript
Deno.test("AUTH チャレンジ/レスポンス", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test", { requiresAuth: true });

  relay.requireAuth((authEvent, context) => {
    return authEvent.tags.some(
      (t) => t[0] === "relay" && t[1] === context.relayUrl,
    );
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://auth.relay.test");
    let authResult = false;

    await new Promise<void>((resolve) => {
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg[0] === "AUTH") {
          const challenge = msg[1];
          const authEvent = EventBuilder.kind(22242)
            .tag("relay", "wss://auth.relay.test")
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

大量イベントのテスト:

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
