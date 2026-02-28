import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { AuthState } from "../src/auth.ts";
import type { AuthContext, NostrEvent } from "../src/types.ts";

function makeAuthEvent(
  challenge: string,
  relayUrl: string,
  overrides: Partial<NostrEvent> = {},
): NostrEvent {
  return {
    id: "auth-event-1",
    pubkey: "pub1",
    kind: 22242,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["relay", relayUrl],
      ["challenge", challenge],
    ],
    sig: "sig1",
    ...overrides,
  };
}

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

function collectMessages(ws: WebSocket): string[] {
  const messages: string[] = [];
  ws.addEventListener("message", (ev: MessageEvent) => {
    messages.push(ev.data as string);
  });
  return messages;
}

Deno.test("NIP-42 AUTH - sends challenge on connect with requiresAuth option", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.test", { requiresAuth: true });

  pool.install();
  try {
    const ws = new WebSocket("wss://auth.relay.test");
    const messages: string[] = [];

    ws.onmessage = (ev: MessageEvent) => {
      messages.push(ev.data as string);
    };

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    // AUTH チャレンジを受信するのを待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "AUTH");
    assertEquals(typeof parsed[1], "string");
    assertEquals(parsed[1].length, 64); // hex 32 bytes

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - validates auth response via requireAuth()", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  relay.requireAuth((authEvent) => {
    return authEvent.tags.some(
      (t) => t[0] === "relay" && t[1] === "wss://auth.relay.test",
    );
  });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    // チャレンジ受信を待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    const authMsg = JSON.parse(messages[0]);
    assertEquals(authMsg[0], "AUTH");
    const challenge = authMsg[1] as string;

    // AUTH応答を送信
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // OK応答
    assertEquals(messages.length, 2);
    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], true); // accepted

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - returns OK false on validation failure", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  // 常に拒否するバリデーター
  relay.requireAuth(() => false);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // AUTH応答を送信
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], false); // rejected
    assertEquals(
      (okMsg[3] as string).startsWith("auth-required:"),
      true,
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - rejects wrong challenge", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  relay.requireAuth(() => true);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 間違ったチャレンジで応答
    const authEvent = makeAuthEvent(
      "wrong-challenge",
      "wss://auth.relay.test",
    );
    ws.send(JSON.stringify(["AUTH", authEvent]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], false);
    assertEquals(
      (okMsg[3] as string).includes("challenge mismatch"),
      true,
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - rejects wrong event kind", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  relay.requireAuth(() => true);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // 間違ったkindで応答
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test", {
      kind: 1, // should be 22242
    });
    ws.send(JSON.stringify(["AUTH", authEvent]));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], false);
    assertEquals(
      (okMsg[3] as string).includes("invalid auth event kind"),
      true,
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - rejects REQ from unauthenticated connection", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.test", { requiresAuth: true });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    // AUTHチャレンジを受信するのを待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 認証せずにREQを送信
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // CLOSED応答を受信するはず（AUTH + CLOSED = 2メッセージ）
    assertEquals(messages.length, 2);
    const closedMsg = JSON.parse(messages[1]);
    assertEquals(closedMsg[0], "CLOSED");
    assertEquals(closedMsg[1], "sub1");
    assertEquals(
      (closedMsg[2] as string).startsWith("auth-required:"),
      true,
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - rejects EVENT from unauthenticated connection", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.test", { requiresAuth: true });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 認証せずにEVENTを送信
    const event: NostrEvent = {
      id: "test-event-1",
      pubkey: "pub1",
      kind: 1,
      content: "hello",
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      sig: "sig1",
    };
    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // OK:false応答を受信するはず（AUTH + OK = 2メッセージ）
    assertEquals(messages.length, 2);
    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[1], "test-event-1");
    assertEquals(okMsg[2], false);
    assertEquals(
      (okMsg[3] as string).startsWith("auth-required:"),
      true,
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - allows REQ after successful authentication", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test", { requiresAuth: true });

  relay.requireAuth((authEvent) => {
    return authEvent.tags.some(
      (t) => t[0] === "relay" && t[1] === "wss://auth.relay.test",
    );
  });

  // ストアにイベントを追加
  relay.store({
    id: "stored-event",
    pubkey: "pub1",
    kind: 1,
    content: "test",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    // チャレンジ受信
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // 認証
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 認証成功を確認
    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[2], true);

    // 認証後にREQを送信
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // EVENT + EOSE が返ってくるはず
    const eventMsg = JSON.parse(messages[2]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].id, "stored-event");

    const eoseMsg = JSON.parse(messages[3]);
    assertEquals(eoseMsg[0], "EOSE");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - accepts matching relay URL", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.test", { requiresAuth: true });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // 正しいリレーURLで認証
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - rejects mismatched relay URL", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.test", { requiresAuth: true });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // 間違ったリレーURLで認証
    const authEvent = makeAuthEvent(challenge, "wss://wrong.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], false);
    assertEquals(
      (okMsg[3] as string).includes("relay URL mismatch"),
      true,
    );

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - overrides relay URL check with custom validator", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  // relay URLチェックを行わないカスタムバリデーター
  relay.requireAuth((_authEvent, _context) => true);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // 間違ったリレーURLでも、カスタムバリデーターが許可すれば通る
    const authEvent = makeAuthEvent(challenge, "wss://wrong.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - passes AuthContext to custom validator", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  let receivedContext: AuthContext | null = null;
  relay.requireAuth((_authEvent, context) => {
    receivedContext = context;
    return true;
  });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // context が正しく渡されているか検証
    assertEquals(receivedContext !== null, true);
    assertEquals(receivedContext!.relayUrl, "wss://auth.relay.test");
    assertEquals(receivedContext!.challenge, challenge);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - re-issues challenge when requireAuth is called on existing connection", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  pool.install();
  try {
    // 先に接続を開く（AUTH なし）
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    // REQ が通ることを確認（認証不要）
    ws.send(JSON.stringify(["REQ", "sub-before", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const eoseMsg = JSON.parse(messages[messages.length - 1]);
    assertEquals(eoseMsg[0], "EOSE");

    // 後から requireAuth を設定
    relay.requireAuth((authEvent) => {
      return authEvent.tags.some(
        (t) => t[0] === "relay" && t[1] === "wss://auth.relay.test",
      );
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 既存接続にチャレンジが送られる
    const authMsg = JSON.parse(messages[messages.length - 1]);
    assertEquals(authMsg[0], "AUTH");
    const challenge = authMsg[1] as string;
    assertEquals(typeof challenge, "string");
    assertEquals(challenge.length, 64);

    // 未認証状態でREQを送ると CLOSED が返る
    ws.send(JSON.stringify(["REQ", "sub-after", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const closedMsg = JSON.parse(messages[messages.length - 1]);
    assertEquals(closedMsg[0], "CLOSED");
    assertEquals(closedMsg[1], "sub-after");
    assertEquals(
      (closedMsg[2] as string).startsWith("auth-required:"),
      true,
    );

    // AUTH応答を送信して認証
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.test");
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const okMsg = JSON.parse(messages[messages.length - 1]);
    assertEquals(okMsg[0], "OK");
    assertEquals(okMsg[2], true);

    // 認証後はREQが通る
    relay.store({
      id: "stored-event",
      pubkey: "pub1",
      kind: 1,
      content: "test",
      created_at: 1700000000,
      tags: [],
      sig: "sig1",
    });

    ws.send(JSON.stringify(["REQ", "sub-authed", { kinds: [1] }]));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const eventMsg = JSON.parse(messages[messages.length - 2]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].id, "stored-event");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - new connection after requireAuth also gets challenge", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  // 先に requireAuth を設定
  relay.requireAuth(() => true);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 新規接続にもチャレンジが送られる
    assertEquals(messages.length, 1);
    const authMsg = JSON.parse(messages[0]);
    assertEquals(authMsg[0], "AUTH");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-42 AUTH - sends challenge to existing connection on requireAuth", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.test");

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.test");
    const messages = collectMessages(ws);

    // 接続後にrequireAuthを設定
    relay.requireAuth(() => true);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 既存接続にもチャレンジが送られる
    assertEquals(messages.length, 1);
    const authMsg = JSON.parse(messages[0]);
    assertEquals(authMsg[0], "AUTH");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== AuthState - handleAuthResponse without challenge =====

Deno.test("AuthState - handleAuthResponse without challenge returns auth-required error", async () => {
  const pool = new MockPool();
  pool.relay("wss://authstate.relay.test");

  pool.install();
  try {
    const ws = await openWs("wss://authstate.relay.test");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // AuthState を直接インスタンス化してテスト
    // sendChallenge を呼ばずに handleAuthResponse を呼ぶ
    const authState = new AuthState();
    const mockWs = new WebSocket("wss://authstate.relay.test");
    await new Promise<void>((resolve) => {
      mockWs.onopen = () => resolve();
    });

    const dummyEvent: NostrEvent = {
      id: "test-id",
      pubkey: "pub1",
      kind: 22242,
      content: "",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["relay", "wss://authstate.relay.test"],
        ["challenge", "dummy-challenge"],
      ],
      sig: "sig1",
    };

    // sendChallenge を呼ばずに handleAuthResponse を直接呼ぶ
    // MockWebSocket 型が必要なため、AuthState を単体でテストするため型キャストを行う
    const result = await authState.handleAuthResponse(
      mockWs as unknown as Parameters<typeof authState.handleAuthResponse>[0],
      dummyEvent,
      "wss://authstate.relay.test",
    );

    assertEquals(result[0], false);
    assertEquals(result[1], "auth-required: no challenge issued");

    ws.close();
    mockWs.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  } finally {
    pool.uninstall();
  }
});
