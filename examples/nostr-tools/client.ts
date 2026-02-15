/**
 * nostr-tools を使用した algia 風 CUI クライアント
 *
 * nostr-tools v2 の SimplePool + finalizeEvent + BIP-340 署名を使用する。
 * 各コア関数は export され、テストから直接呼び出せる設計。
 *
 * サポートするコマンド:
 * - timeline — タイムライン取得
 * - post "content" — テキスト投稿
 * - reply <event-id> "content" — リプライ
 * - repost <event-id> — リポスト (kind:6)
 * - like <event-id> — いいね (kind:7)
 * - delete <event-id> — 削除リクエスト (kind:5)
 * - search "keyword" — NIP-50 検索
 * - profile [pubkey] — プロフィール取得 (kind:0)
 * - stream — リアルタイム購読
 * - dm-post <pubkey> "message" — DM (kind:4)
 * - powa — 「ぽわ〜」投稿
 * - puru — 「ぷる」投稿
 *
 * @module
 */

import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import type { SimplePool as SimplePoolType } from "nostr-tools/pool";
import type { NostrEvent } from "../../src/types.ts";

/** コマンド実行結果 */
export interface CommandResult {
  /** 成功したか */
  ok: boolean;
  /** 受信イベント一覧（取得系コマンドの場合） */
  events?: NostrEvent[];
  /** 公開したイベント（投稿系コマンドの場合） */
  published?: NostrEvent;
  /** メッセージ */
  message?: string;
}

/** クライアントオプション */
export interface ClientOptions {
  /** SimplePool インスタンス */
  pool: SimplePoolType;
  /** リレーURL一覧 */
  relays: string[];
  /** 秘密鍵 */
  sk: Uint8Array;
  /** verbose モード */
  verbose?: boolean;
}

/** 公開鍵を秘密鍵から導出する */
export function getPubkey(sk: Uint8Array): string {
  return getPublicKey(sk);
}

/** イベントに署名する */
export function sign(
  sk: Uint8Array,
  kind: number,
  content: string,
  tags: string[][] = [],
): NostrEvent {
  return finalizeEvent(
    {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    },
    sk,
  ) as unknown as NostrEvent;
}

/**
 * タイムライン取得
 *
 * SimplePool.subscribe で kind:1 イベントを取得する。
 */
export async function timeline(opts: ClientOptions): Promise<CommandResult> {
  const received: NostrEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for timeline")),
      5000,
    );
    opts.pool.subscribe(
      opts.relays,
      { kinds: [1], limit: 20 },
      {
        onevent(ev) {
          received.push(ev as unknown as NostrEvent);
        },
        oneose() {
          clearTimeout(timeout);
          resolve();
        },
      },
    );
  });
  if (opts.verbose) {
    for (const ev of received) {
      console.log(`[${ev.pubkey.slice(0, 8)}] ${ev.content}`);
    }
  }
  return { ok: true, events: received };
}

/**
 * テキスト投稿
 *
 * finalizeEvent → publish で kind:1 テキストノートを投稿する。
 */
export async function post(
  opts: ClientOptions,
  content: string,
): Promise<CommandResult> {
  const event = sign(opts.sk, 1, content);
  await Promise.any(opts.pool.publish(opts.relays, event as never));
  if (opts.verbose) {
    console.log(`Published: ${event.id}`);
  }
  return { ok: true, published: event, message: `Published: ${event.id}` };
}

/**
 * リプライ
 *
 * e/p タグ付きの kind:1 イベントを投稿する。
 */
export async function reply(
  opts: ClientOptions,
  targetId: string,
  targetPubkey: string,
  content: string,
): Promise<CommandResult> {
  const tags: string[][] = [
    ["e", targetId, "", "reply"],
    ["p", targetPubkey],
  ];
  const event = sign(opts.sk, 1, content, tags);
  await Promise.any(opts.pool.publish(opts.relays, event as never));
  if (opts.verbose) {
    console.log(`Replied to ${targetId}: ${event.id}`);
  }
  return { ok: true, published: event };
}

/**
 * リポスト (kind:6)
 *
 * 元イベントの JSON を content に含め、e/p タグ付きで投稿する。
 */
export async function repost(
  opts: ClientOptions,
  targetId: string,
  targetPubkey: string,
): Promise<CommandResult> {
  const tags: string[][] = [
    ["e", targetId],
    ["p", targetPubkey],
  ];
  const event = sign(opts.sk, 6, "", tags);
  await Promise.any(opts.pool.publish(opts.relays, event as never));
  if (opts.verbose) {
    console.log(`Reposted: ${targetId}`);
  }
  return { ok: true, published: event };
}

/**
 * いいね (kind:7)
 *
 * "+" リアクションを e/p タグ付きで投稿する。
 */
export async function like(
  opts: ClientOptions,
  targetId: string,
  targetPubkey: string,
): Promise<CommandResult> {
  const tags: string[][] = [
    ["e", targetId],
    ["p", targetPubkey],
  ];
  const event = sign(opts.sk, 7, "+", tags);
  await Promise.any(opts.pool.publish(opts.relays, event as never));
  if (opts.verbose) {
    console.log(`Liked: ${targetId}`);
  }
  return { ok: true, published: event };
}

/**
 * 削除リクエスト (kind:5)
 *
 * NIP-09 削除リクエストを投稿する。
 */
export async function deleteEvent(
  opts: ClientOptions,
  targetId: string,
): Promise<CommandResult> {
  const tags: string[][] = [["e", targetId]];
  const event = sign(opts.sk, 5, "", tags);
  await Promise.any(opts.pool.publish(opts.relays, event as never));
  if (opts.verbose) {
    console.log(`Delete request: ${targetId}`);
  }
  return { ok: true, published: event };
}

/**
 * NIP-50 検索
 *
 * search フィルターでイベントを取得する。
 */
export async function search(
  opts: ClientOptions,
  keyword: string,
): Promise<CommandResult> {
  const received: NostrEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for search")),
      5000,
    );
    opts.pool.subscribe(
      opts.relays,
      { kinds: [1], search: keyword, limit: 20 },
      {
        onevent(ev) {
          received.push(ev as unknown as NostrEvent);
        },
        oneose() {
          clearTimeout(timeout);
          resolve();
        },
      },
    );
  });
  if (opts.verbose) {
    for (const ev of received) {
      console.log(`[search] ${ev.content}`);
    }
  }
  return { ok: true, events: received };
}

/**
 * プロフィール取得
 *
 * kind:0 メタデータイベントを取得する。
 */
export async function profile(
  opts: ClientOptions,
  pubkey?: string,
): Promise<CommandResult> {
  const targetPk = pubkey ?? getPubkey(opts.sk);
  const received: NostrEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout waiting for profile")),
      5000,
    );
    opts.pool.subscribe(
      opts.relays,
      { kinds: [0], authors: [targetPk], limit: 1 },
      {
        onevent(ev) {
          received.push(ev as unknown as NostrEvent);
        },
        oneose() {
          clearTimeout(timeout);
          resolve();
        },
      },
    );
  });
  if (opts.verbose && received.length > 0) {
    console.log(`Profile: ${received[0].content}`);
  }
  return { ok: true, events: received };
}

/**
 * リアルタイム購読
 *
 * kind:1 イベントを継続的に受信する。
 * 指定時間後に自動停止する（テスト用）。
 */
export async function stream(
  opts: ClientOptions,
  durationMs = 3000,
): Promise<CommandResult> {
  const received: NostrEvent[] = [];
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, durationMs);
    const sub = opts.pool.subscribe(
      opts.relays,
      { kinds: [1], since: Math.floor(Date.now() / 1000) },
      {
        onevent(ev) {
          received.push(ev as unknown as NostrEvent);
          if (opts.verbose) {
            const e = ev as unknown as NostrEvent;
            console.log(`[stream] [${e.pubkey.slice(0, 8)}] ${e.content}`);
          }
        },
        oneose() {
          // ストリームモードでは EOSE 後も継続
        },
      },
    );
    // durationMs 経過後にクリーンアップ
    setTimeout(() => {
      sub.close();
      clearTimeout(timer);
      resolve();
    }, durationMs);
  });
  return { ok: true, events: received };
}

/**
 * DM投稿 (kind:4)
 *
 * kind:4 ダイレクトメッセージを投稿する。
 * （暗号化は行わない — モック用途のため平文）
 */
export async function dmPost(
  opts: ClientOptions,
  recipientPubkey: string,
  message: string,
): Promise<CommandResult> {
  const tags: string[][] = [["p", recipientPubkey]];
  const event = sign(opts.sk, 4, message, tags);
  await Promise.any(opts.pool.publish(opts.relays, event as never));
  if (opts.verbose) {
    console.log(`DM sent to ${recipientPubkey.slice(0, 8)}: ${event.id}`);
  }
  return { ok: true, published: event };
}

/**
 * 「ぽわ〜」投稿
 */
export async function powa(opts: ClientOptions): Promise<CommandResult> {
  return await post(opts, "ぽわ〜");
}

/**
 * 「ぷる」投稿
 */
export async function puru(opts: ClientOptions): Promise<CommandResult> {
  return await post(opts, "ぷる");
}

// ===== CLI エントリーポイント =====

/** CLI引数をパースして実行する */
export async function main(args: string[]): Promise<void> {
  let relayUrl = "wss://relay.damus.io";
  let verbose = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--relay" && i + 1 < args.length) {
      relayUrl = args[++i];
    } else if (args[i] === "--verbose" || args[i] === "-V") {
      verbose = true;
    } else {
      positional.push(args[i]);
    }
  }

  const command = positional[0];
  if (!command) {
    console.log(
      "Usage: client.ts <command> [args]\nCommands: timeline, post, reply, repost, like, delete, search, profile, stream, dm-post, powa, puru",
    );
    return;
  }

  // SimplePool を動的にインポート
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const sk = generateSecretKey();
  const opts: ClientOptions = {
    pool,
    relays: [relayUrl],
    sk,
    verbose,
  };

  switch (command) {
    case "timeline":
      await timeline(opts);
      break;
    case "post":
      await post(opts, positional[1] ?? "");
      break;
    case "reply":
      await reply(
        opts,
        positional[1] ?? "",
        positional[2] ?? "",
        positional[3] ?? "",
      );
      break;
    case "repost":
      await repost(opts, positional[1] ?? "", positional[2] ?? "");
      break;
    case "like":
      await like(opts, positional[1] ?? "", positional[2] ?? "");
      break;
    case "delete":
      await deleteEvent(opts, positional[1] ?? "");
      break;
    case "search":
      await search(opts, positional[1] ?? "");
      break;
    case "profile":
      await profile(opts, positional[1]);
      break;
    case "stream":
      await stream(opts);
      break;
    case "dm-post":
      await dmPost(opts, positional[1] ?? "", positional[2] ?? "");
      break;
    case "powa":
      await powa(opts);
      break;
    case "puru":
      await puru(opts);
      break;
    default:
      console.error(`Unknown command: ${command}`);
  }
}

// CLI実行
if (import.meta.main) {
  await main(Deno.args);
}
