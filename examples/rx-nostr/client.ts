/**
 * algia 風 CUI クライアント (rx-nostr 版)
 *
 * rx-nostr を使って Nostr リレーと通信する CLI。
 * 各コマンドのコア関数は export され、テストから直接呼び出せる。
 *
 * @module
 */

import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { MockPool } from "../../src/mod.ts";
import type { NostrEvent } from "../../src/types.ts";

// rx-nostr は WebSocket をロード時に捕捉するため bootstrap パターンで動的 import
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

const rxNostrMod = await import("rx-nostr");
const cryptoMod = await import("@rx-nostr/crypto");

_bootstrap.uninstall();

const {
  createRxNostr,
  createRxBackwardReq,
  createRxForwardReq,
} = rxNostrMod;
const { verifier, seckeySigner } = cryptoMod;

// 型エイリアス（rx-nostr の内部型を参照するため）
type RxNostr = ReturnType<typeof createRxNostr>;

// ===== 鍵生成ユーティリティ =====

/** 秘密鍵を生成する */
function generateKey(): {
  sk: Uint8Array;
  pk: string;
  hexSk: string;
} {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const hexSk = Array.from(sk).map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { sk, pk, hexSk };
}

let _ts = Math.floor(Date.now() / 1000);

/** 正規署名付きイベントを生成する */
function signEvent(
  sk: Uint8Array,
  content: string,
  kind = 1,
  tags: string[][] = [],
): NostrEvent {
  return finalizeEvent(
    { kind, created_at: _ts++, tags, content },
    sk,
  ) as unknown as NostrEvent;
}

// ===== コア関数 =====

/**
 * タイムラインを取得する
 *
 * createRxBackwardReq で kind:1 イベントを取得し、created_at 降順で返す。
 */
export async function timeline(
  rxNostr: RxNostr,
  options?: { authors?: string[]; limit?: number },
): Promise<NostrEvent[]> {
  const rxReq = createRxBackwardReq();
  const received: NostrEvent[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for timeline")),
      5000,
    );
    rxNostr.use(rxReq).subscribe({
      next: (packet) => {
        received.push(packet.event as unknown as NostrEvent);
      },
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
    });

    const filter: { kinds: number[]; authors?: string[]; limit?: number } = {
      kinds: [1],
    };
    if (options?.authors) filter.authors = options.authors;
    if (options?.limit !== undefined) filter.limit = options.limit;
    rxReq.emit(filter);
    rxReq.over();
  });

  return received.sort((a, b) => b.created_at - a.created_at);
}

/**
 * テキスト投稿 (kind:1)
 *
 * rxNostr.send で kind:1 イベントを送信する。
 */
export async function post(
  rxNostr: RxNostr,
  content: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for post")),
      5000,
    );
    rxNostr.send({ kind: 1, content, tags: [] }).subscribe({
      next: () => {},
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
      error: (err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * リプライ (kind:1 + e/p タグ)
 */
export async function reply(
  rxNostr: RxNostr,
  targetEventId: string,
  targetPubkey: string,
  content: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for reply")),
      5000,
    );
    rxNostr.send({
      kind: 1,
      content,
      tags: [["e", targetEventId, "", "reply"], ["p", targetPubkey]],
    }).subscribe({
      next: () => {},
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
      error: (err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * リポスト (kind:6)
 */
export async function repost(
  rxNostr: RxNostr,
  targetEvent: NostrEvent,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for repost")),
      5000,
    );
    rxNostr.send({
      kind: 6,
      content: JSON.stringify(targetEvent),
      tags: [["e", targetEvent.id, ""], ["p", targetEvent.pubkey]],
    }).subscribe({
      next: () => {},
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
      error: (err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * リアクション (kind:7)
 */
export async function like(
  rxNostr: RxNostr,
  targetEventId: string,
  targetPubkey: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for like")),
      5000,
    );
    rxNostr.send({
      kind: 7,
      content: "+",
      tags: [["e", targetEventId], ["p", targetPubkey]],
    }).subscribe({
      next: () => {},
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
      error: (err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * 削除リクエスト (kind:5, NIP-09)
 */
export async function deleteEvent(
  rxNostr: RxNostr,
  targetEventId: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for delete")),
      5000,
    );
    rxNostr.send({
      kind: 5,
      content: "",
      tags: [["e", targetEventId]],
    }).subscribe({
      next: () => {},
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
      error: (err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * 検索 (NIP-50)
 *
 * search フィルターでイベントを取得する。
 */
export async function search(
  rxNostr: RxNostr,
  keyword: string,
): Promise<NostrEvent[]> {
  const rxReq = createRxBackwardReq();
  const received: NostrEvent[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for search")),
      5000,
    );
    rxNostr.use(rxReq).subscribe({
      next: (packet) => {
        received.push(packet.event as unknown as NostrEvent);
      },
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
    });
    rxReq.emit({ search: keyword });
    rxReq.over();
  });

  return received;
}

/**
 * プロフィール取得 (kind:0)
 *
 * @returns パース済みの metadata オブジェクト、または undefined
 */
export async function profile(
  rxNostr: RxNostr,
  pubkey: string,
): Promise<Record<string, unknown> | undefined> {
  const rxReq = createRxBackwardReq();
  const received: NostrEvent[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for profile")),
      5000,
    );
    rxNostr.use(rxReq).subscribe({
      next: (packet) => {
        received.push(packet.event as unknown as NostrEvent);
      },
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
    });
    rxReq.emit({ kinds: [0], authors: [pubkey] });
    rxReq.over();
  });

  if (received.length === 0) return undefined;

  const latest = received.sort((a, b) => b.created_at - a.created_at)[0];
  return JSON.parse(latest.content) as Record<string, unknown>;
}

/**
 * リアルタイムストリーム
 *
 * createRxForwardReq で kind:1 のサブスクリプションを開き、
 * イベントをコールバックに渡す。stop 関数で停止。
 */
export function stream(
  rxNostr: RxNostr,
  onEvent: (event: NostrEvent) => void,
): { stop: () => void } {
  const rxReq = createRxForwardReq();

  const sub = rxNostr.use(rxReq).subscribe({
    next: (packet) => {
      onEvent(packet.event as unknown as NostrEvent);
    },
  });

  rxReq.emit({ kinds: [1] });

  return {
    stop() {
      sub.unsubscribe();
    },
  };
}

/**
 * ぽわ〜 投稿
 */
export async function powa(rxNostr: RxNostr): Promise<void> {
  await post(rxNostr, "ぽわ〜");
}

/**
 * ぷる 投稿
 */
export async function puru(rxNostr: RxNostr): Promise<void> {
  await post(rxNostr, "ぷる");
}

// ===== CLI エントリポイント =====

/** コマンドライン引数をパースする */
function parseArgs(
  args: string[],
): { command: string; rest: string[]; relay: string; verbose: boolean } {
  let relay = "wss://relay.damus.io";
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

/** ランダム hex 文字列を生成する */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** メイン処理 */
async function main(): Promise<void> {
  const { command, rest, relay, verbose } = parseArgs(Deno.args);

  if (verbose) {
    console.log(`Connecting to ${relay}...`);
  }

  const { sk, pk, hexSk } = generateKey();

  // signer が必要なコマンドかどうかで rxNostr の設定を分ける
  const needsSigner = [
    "post",
    "reply",
    "repost",
    "like",
    "delete",
    "powa",
    "puru",
  ].includes(command);

  const rxNostr = createRxNostr(
    needsSigner ? { verifier, signer: seckeySigner(hexSk) } : { verifier },
  );
  rxNostr.setDefaultRelays([relay]);

  try {
    switch (command) {
      case "timeline": {
        const events = await timeline(rxNostr);
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
        await post(rxNostr, content);
        console.log("Posted");
        break;
      }
      case "reply": {
        const targetId = rest[0] ?? "";
        const content = rest[1] ?? "";
        await reply(rxNostr, targetId, randomHex(32), content);
        console.log("Replied");
        break;
      }
      case "repost": {
        const targetId = rest[0] ?? "";
        // 簡易: ダミーイベントを作成
        const targetEvent = signEvent(sk, "", 1);
        (targetEvent as { id: string }).id = targetId;
        await repost(rxNostr, targetEvent);
        console.log("Reposted");
        break;
      }
      case "like": {
        const targetId = rest[0] ?? "";
        await like(rxNostr, targetId, randomHex(32));
        console.log("Liked");
        break;
      }
      case "delete": {
        const targetId = rest[0] ?? "";
        await deleteEvent(rxNostr, targetId);
        console.log("Deleted");
        break;
      }
      case "search": {
        const keyword = rest[0] ?? "";
        const events = await search(rxNostr, keyword);
        for (const ev of events) {
          console.log(`[${ev.id.slice(0, 8)}] ${ev.content}`);
        }
        break;
      }
      case "profile": {
        const pubkey = rest[0] ?? pk;
        const meta = await profile(rxNostr, pubkey);
        if (meta) {
          console.log(JSON.stringify(meta, null, 2));
        } else {
          console.log("Profile not found");
        }
        break;
      }
      case "stream": {
        const handle = stream(rxNostr, (ev) => {
          console.log(
            `[stream] ${ev.pubkey.slice(0, 8)}: ${ev.content}`,
          );
        });
        console.log("Streaming... Press Ctrl+C to stop");
        await new Promise<void>((resolve) => {
          Deno.addSignalListener("SIGINT", () => {
            handle.stop();
            resolve();
          });
        });
        break;
      }
      case "powa": {
        await powa(rxNostr);
        console.log("ぽわ〜");
        break;
      }
      case "puru": {
        await puru(rxNostr);
        console.log("ぷる");
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        Deno.exit(1);
    }
  } finally {
    rxNostr.dispose();
  }
}

// CLI として実行された場合のみ main を呼ぶ
if (import.meta.main) {
  await main();
}

// テスト用にエクスポート
export {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  generateKey,
  seckeySigner,
  signEvent,
  verifier,
};
export type { RxNostr };
