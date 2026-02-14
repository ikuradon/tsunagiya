import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import type { NostrEvent } from "../src/types.ts";

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

Deno.test("AUTH - sends challenge on connect with requiresAuth option", async () => {
  const pool = new MockPool();
  pool.relay("wss://auth.relay.com", { requiresAuth: true });

  pool.install();
  try {
    const ws = new WebSocket("wss://auth.relay.com");
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

Deno.test("AUTH - requireAuth() sends challenge and validates", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.com");

  relay.requireAuth((authEvent) => {
    return authEvent.tags.some(
      (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
    );
  });

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.com");
    const messages = collectMessages(ws);

    // チャレンジ受信を待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    const authMsg = JSON.parse(messages[0]);
    assertEquals(authMsg[0], "AUTH");
    const challenge = authMsg[1] as string;

    // AUTH応答を送信
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.com");
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

Deno.test("AUTH - validation failure returns OK with false", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.com");

  // 常に拒否するバリデーター
  relay.requireAuth(() => false);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.com");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // AUTH応答を送信
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.com");
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

Deno.test("AUTH - wrong challenge is rejected", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.com");

  relay.requireAuth(() => true);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.com");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // 間違ったチャレンジで応答
    const authEvent = makeAuthEvent(
      "wrong-challenge",
      "wss://auth.relay.com",
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

Deno.test("AUTH - wrong kind is rejected", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.com");

  relay.requireAuth(() => true);

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.com");
    const messages = collectMessages(ws);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const authMsg = JSON.parse(messages[0]);
    const challenge = authMsg[1] as string;

    // 間違ったkindで応答
    const authEvent = makeAuthEvent(challenge, "wss://auth.relay.com", {
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

Deno.test("AUTH - requireAuth on existing connection sends challenge", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://auth.relay.com");

  pool.install();
  try {
    const ws = await openWs("wss://auth.relay.com");
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
