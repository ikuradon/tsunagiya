/**
 * algia 風 CUI クライアント
 *
 * raw WebSocket を使って Nostr リレーと通信する最小限の CLI。
 * 各コマンドのコア関数は export され、テストから直接呼び出せる。
 *
 * @module
 */

import type { NostrEvent, NostrFilter, RelayMessage } from "../../src/types.ts";

/** ランダム hex 文字列を生成する */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** モックイベントを組み立てる（署名は暗号的に正しくない） */
function buildEvent(
  kind: number,
  content: string,
  pubkey: string,
  tags: string[][] = [],
): NostrEvent {
  return {
    id: randomHex(32),
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
    sig: randomHex(64),
  };
}

/** WebSocket が開くまで待つ */
function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket error")), {
      once: true,
    });
  });
}

// ===== メッセージ収集ユーティリティ =====

/**
 * EOSE が届くまでメッセージを収集する
 *
 * REQ 送信後にリレーから返される EVENT メッセージを収集し、
 * EOSE を受信したら解決する。
 */
function collectUntilEOSE(
  ws: WebSocket,
  subId: string,
): Promise<NostrEvent[]> {
  return new Promise<NostrEvent[]>((resolve) => {
    const events: NostrEvent[] = [];
    const handler = (ev: MessageEvent) => {
      const msg = JSON.parse(ev.data as string) as RelayMessage;
      if (msg[0] === "EVENT" && msg[1] === subId) {
        events.push(msg[2]);
      }
      if (msg[0] === "EOSE" && msg[1] === subId) {
        ws.removeEventListener("message", handler);
        resolve(events);
      }
    };
    ws.addEventListener("message", handler);
  });
}

/** OK レスポンスを待つ */
function waitOK(ws: WebSocket, eventId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const handler = (ev: MessageEvent) => {
      const msg = JSON.parse(ev.data as string) as RelayMessage;
      if (msg[0] === "OK" && msg[1] === eventId) {
        ws.removeEventListener("message", handler);
        resolve(msg[2]);
      }
    };
    ws.addEventListener("message", handler);
  });
}

// ===== コア関数 =====

/**
 * タイムラインを取得する
 *
 * kind:1 のイベントを取得し、created_at 降順でソートして返す。
 */
export async function timeline(
  ws: WebSocket,
  options?: { limit?: number },
): Promise<NostrEvent[]> {
  const subId = "timeline-" + randomHex(4);
  const filter: NostrFilter = { kinds: [1] };
  if (options?.limit !== undefined) {
    filter.limit = options.limit;
  }

  const collecting = collectUntilEOSE(ws, subId);
  ws.send(JSON.stringify(["REQ", subId, filter]));
  const events = await collecting;

  // CLOSE 送信
  ws.send(JSON.stringify(["CLOSE", subId]));

  // created_at 降順ソート
  return events.sort((a, b) => b.created_at - a.created_at);
}

/**
 * テキスト投稿 (kind:1)
 *
 * @returns 投稿したイベントの ID
 */
export async function post(
  ws: WebSocket,
  content: string,
  pubkey: string,
): Promise<string> {
  const event = buildEvent(1, content, pubkey);
  const okPromise = waitOK(ws, event.id);
  ws.send(JSON.stringify(["EVENT", event]));
  const accepted = await okPromise;
  if (!accepted) {
    throw new Error("Relay rejected the event");
  }
  return event.id;
}

/**
 * リプライ (kind:1 + e/p タグ)
 *
 * @returns 投稿したイベントの ID
 */
export async function reply(
  ws: WebSocket,
  targetEventId: string,
  targetPubkey: string,
  content: string,
  pubkey: string,
): Promise<string> {
  const event = buildEvent(1, content, pubkey, [
    ["e", targetEventId, "", "reply"],
    ["p", targetPubkey],
  ]);
  const okPromise = waitOK(ws, event.id);
  ws.send(JSON.stringify(["EVENT", event]));
  const accepted = await okPromise;
  if (!accepted) {
    throw new Error("Relay rejected the event");
  }
  return event.id;
}

/**
 * リポスト (kind:6)
 *
 * @returns 投稿したイベントの ID
 */
export async function repost(
  ws: WebSocket,
  targetEvent: NostrEvent,
  pubkey: string,
): Promise<string> {
  const event = buildEvent(6, JSON.stringify(targetEvent), pubkey, [
    ["e", targetEvent.id, ""],
    ["p", targetEvent.pubkey],
  ]);
  const okPromise = waitOK(ws, event.id);
  ws.send(JSON.stringify(["EVENT", event]));
  const accepted = await okPromise;
  if (!accepted) {
    throw new Error("Relay rejected the event");
  }
  return event.id;
}

/**
 * リアクション (kind:7)
 *
 * @returns 投稿したイベントの ID
 */
export async function like(
  ws: WebSocket,
  targetEventId: string,
  targetPubkey: string,
  pubkey: string,
): Promise<string> {
  const event = buildEvent(7, "+", pubkey, [
    ["e", targetEventId],
    ["p", targetPubkey],
  ]);
  const okPromise = waitOK(ws, event.id);
  ws.send(JSON.stringify(["EVENT", event]));
  const accepted = await okPromise;
  if (!accepted) {
    throw new Error("Relay rejected the event");
  }
  return event.id;
}

/**
 * 削除リクエスト (kind:5, NIP-09)
 *
 * @returns 投稿したイベントの ID
 */
export async function deleteEvent(
  ws: WebSocket,
  targetEventId: string,
  pubkey: string,
): Promise<string> {
  const event = buildEvent(5, "", pubkey, [
    ["e", targetEventId],
  ]);
  const okPromise = waitOK(ws, event.id);
  ws.send(JSON.stringify(["EVENT", event]));
  const accepted = await okPromise;
  if (!accepted) {
    throw new Error("Relay rejected the event");
  }
  return event.id;
}

/**
 * 検索 (NIP-50)
 *
 * search フィルターでイベントを取得する。
 */
export async function search(
  ws: WebSocket,
  keyword: string,
): Promise<NostrEvent[]> {
  const subId = "search-" + randomHex(4);
  const filter: NostrFilter = { search: keyword };

  const collecting = collectUntilEOSE(ws, subId);
  ws.send(JSON.stringify(["REQ", subId, filter]));
  const events = await collecting;

  ws.send(JSON.stringify(["CLOSE", subId]));
  return events;
}

/**
 * プロフィール取得 (kind:0)
 *
 * @returns パース済みの metadata オブジェクト、または undefined
 */
export async function profile(
  ws: WebSocket,
  pubkey: string,
): Promise<Record<string, unknown> | undefined> {
  const subId = "profile-" + randomHex(4);
  const filter: NostrFilter = { kinds: [0], authors: [pubkey] };

  const collecting = collectUntilEOSE(ws, subId);
  ws.send(JSON.stringify(["REQ", subId, filter]));
  const events = await collecting;

  ws.send(JSON.stringify(["CLOSE", subId]));

  if (events.length === 0) return undefined;

  // 最新のものを使う
  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
  return JSON.parse(latest.content) as Record<string, unknown>;
}

/**
 * リアルタイムストリーム
 *
 * kind:1 のサブスクリプションを開き、イベントをコールバックに渡す。
 * stop 関数で停止。
 */
export function stream(
  ws: WebSocket,
  onEvent: (event: NostrEvent) => void,
): { subId: string; stop: () => void } {
  const subId = "stream-" + randomHex(4);
  const filter: NostrFilter = { kinds: [1] };

  const handler = (ev: MessageEvent) => {
    const msg = JSON.parse(ev.data as string) as RelayMessage;
    if (msg[0] === "EVENT" && msg[1] === subId) {
      onEvent(msg[2]);
    }
  };
  ws.addEventListener("message", handler);
  ws.send(JSON.stringify(["REQ", subId, filter]));

  return {
    subId,
    stop() {
      ws.removeEventListener("message", handler);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(["CLOSE", subId]));
      }
    },
  };
}

/**
 * DM 送信 (kind:4)
 *
 * content はモック暗号化（実際の暗号化は行わない）。
 * @returns 投稿したイベントの ID
 */
export async function dmPost(
  ws: WebSocket,
  recipientPubkey: string,
  content: string,
  pubkey: string,
): Promise<string> {
  const event = buildEvent(4, "mock-encrypted:" + content, pubkey, [
    ["p", recipientPubkey],
  ]);
  const okPromise = waitOK(ws, event.id);
  ws.send(JSON.stringify(["EVENT", event]));
  const accepted = await okPromise;
  if (!accepted) {
    throw new Error("Relay rejected the event");
  }
  return event.id;
}

/**
 * ぽわ〜 投稿
 *
 * @returns 投稿したイベントの ID
 */
export async function powa(
  ws: WebSocket,
  pubkey: string,
): Promise<string> {
  return await post(ws, "ぽわ〜", pubkey);
}

/**
 * ぷる 投稿
 *
 * @returns 投稿したイベントの ID
 */
export async function puru(
  ws: WebSocket,
  pubkey: string,
): Promise<string> {
  return await post(ws, "ぷる", pubkey);
}

// ===== CLI エントリポイント =====

/** コマンドライン引数をパースする */
function parseArgs(
  args: string[],
): { command: string; rest: string[]; relay: string; verbose: boolean } {
  let relay = "wss://relay.damus.test";
  let verbose = false;
  const rest: string[] = [];

  let i = 0;
  while (i < args.length) {
    if (args[i] === "--relay" && i + 1 < args.length) {
      relay = args[i + 1];
      i += 2;
      continue;
    }
    if (args[i] === "--verbose" || args[i] === "-V") {
      verbose = true;
      i++;
      continue;
    }
    rest.push(args[i]);
    i++;
  }

  const command = rest.shift() ?? "timeline";
  return { command, rest, relay, verbose };
}

/** メイン処理 */
async function main(): Promise<void> {
  const { command, rest, relay, verbose } = parseArgs(Deno.args);

  if (verbose) {
    console.log(`Connecting to ${relay}...`);
  }

  const ws = new WebSocket(relay);
  await waitOpen(ws);

  const myPubkey = randomHex(32);

  try {
    switch (command) {
      case "timeline": {
        const events = await timeline(ws);
        for (const ev of events) {
          console.log(
            `[${new Date(ev.created_at * 1000).toISOString()}] ${
              ev.pubkey.slice(0, 8)
            }: ${ev.content}`,
          );
        }
        break;
      }
      case "post": {
        const content = rest[0] ?? "";
        const id = await post(ws, content, myPubkey);
        console.log(`Posted: ${id}`);
        break;
      }
      case "reply": {
        const targetId = rest[0] ?? "";
        const content = rest[1] ?? "";
        const id = await reply(ws, targetId, randomHex(32), content, myPubkey);
        console.log(`Replied: ${id}`);
        break;
      }
      case "repost": {
        const targetId = rest[0] ?? "";
        // 簡易: 実際にはイベントを取得する必要があるが、ここではダミーを使う
        const targetEvent = buildEvent(1, "", randomHex(32));
        targetEvent.id = targetId;
        const id = await repost(ws, targetEvent, myPubkey);
        console.log(`Reposted: ${id}`);
        break;
      }
      case "like": {
        const targetId = rest[0] ?? "";
        const id = await like(ws, targetId, randomHex(32), myPubkey);
        console.log(`Liked: ${id}`);
        break;
      }
      case "delete": {
        const targetId = rest[0] ?? "";
        const id = await deleteEvent(ws, targetId, myPubkey);
        console.log(`Deleted: ${id}`);
        break;
      }
      case "search": {
        const keyword = rest[0] ?? "";
        const events = await search(ws, keyword);
        for (const ev of events) {
          console.log(`[${ev.id.slice(0, 8)}] ${ev.content}`);
        }
        break;
      }
      case "profile": {
        const pubkey = rest[0] ?? myPubkey;
        const meta = await profile(ws, pubkey);
        if (meta) {
          console.log(JSON.stringify(meta, null, 2));
        } else {
          console.log("Profile not found");
        }
        break;
      }
      case "stream": {
        const handle = stream(ws, (ev) => {
          console.log(`[stream] ${ev.pubkey.slice(0, 8)}: ${ev.content}`);
        });
        console.log(`Streaming (sub: ${handle.subId})... Press Ctrl+C to stop`);
        // Ctrl+C で停止
        await new Promise<void>((resolve) => {
          Deno.addSignalListener("SIGINT", () => {
            handle.stop();
            resolve();
          });
        });
        break;
      }
      case "dm-post": {
        const recipientPk = rest[0] ?? "";
        const content = rest[1] ?? "";
        const id = await dmPost(ws, recipientPk, content, myPubkey);
        console.log(`DM sent: ${id}`);
        break;
      }
      case "powa": {
        const id = await powa(ws, myPubkey);
        console.log(`ぽわ〜: ${id}`);
        break;
      }
      case "puru": {
        const id = await puru(ws, myPubkey);
        console.log(`ぷる: ${id}`);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        Deno.exit(1);
    }
  } finally {
    ws.close();
  }
}

// CLI として実行された場合のみ main を呼ぶ
if (import.meta.main) {
  await main();
}
