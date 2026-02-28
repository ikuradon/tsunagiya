/**
 * NDK algia風CUIクライアント
 *
 * @nostr-dev-kit/ndk を使用した algia 風のコマンドラインクライアント。
 * tsunagiya MockRelay と組み合わせてテスト可能な設計。
 *
 * コア関数はすべて export しており、テストから直接呼び出せる。
 * NDK インスタンスを引数に取るため、モック環境での利用が容易。
 *
 * 注意: NDK は WebSocket 参照をモジュールロード時に捕捉するため、
 * テスト時は MockPool.install() 後に dynamic import でこのモジュールを読み込むこと。
 *
 * @module
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

// NDK のトップレベル dynamic import
// テスト時は bootstrap パターンにより MockWebSocket が使われる
const ndkMod = await import("@nostr-dev-kit/ndk");
const NDK = ndkMod.default;
type NDK = InstanceType<typeof NDK>;
const NDKEvent = ndkMod.NDKEvent;
type NDKEvent = InstanceType<typeof NDKEvent>;
const NDKPrivateKeySigner = ndkMod.NDKPrivateKeySigner;

/** NDK インスタンスを生成する */
export function createNDK(
  relayUrls: string[],
  hexSk?: string,
): NDK {
  const opts: Record<string, unknown> = {
    explicitRelayUrls: relayUrls,
    autoConnectUserRelays: false,
    enableOutboxModel: false,
  };
  if (hexSk) {
    opts.signer = new NDKPrivateKeySigner(hexSk);
  }
  return new NDK(opts);
}

/** NDK を安全にクリーンアップする */
export function cleanupNDK(ndk: NDK): void {
  try {
    for (const r of ndk.pool.relays.values()) {
      try {
        r.disconnect();
      } catch {
        // ignore individual relay disconnect errors
      }
    }
  } catch {
    // cleanup errors are expected during test teardown
  }
}

/** コマンド実行のオプション */
export interface CommandOptions {
  /** リレーURL一覧 */
  relays: string[];
  /** 秘密鍵 (hex) */
  sk?: Uint8Array;
  /** verbose モード */
  verbose?: boolean;
  /** タイムアウト (ms) */
  timeout?: number;
}

/** verbose ログ出力 */
function log(opts: CommandOptions, ...args: unknown[]): void {
  if (opts.verbose) {
    console.error("[ndk]", ...args);
  }
}

// ===== コマンド実装 =====

/**
 * timeline — タイムラインを取得する
 *
 * kind:1 のイベントを購読し、EOSE まで受信したイベントを返す。
 */
export async function timeline(
  ndk: NDK,
  opts: CommandOptions,
): Promise<NDKEvent[]> {
  log(opts, "timeline: subscribing...");
  const received: NDKEvent[] = [];
  const timeout = opts.timeout ?? 5000;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for EOSE")),
      timeout,
    );
    const sub = ndk.subscribe({ kinds: [1] });
    sub.on("event", (ev: NDKEvent) => {
      log(opts, "timeline: received event", ev.id);
      received.push(ev);
    });
    sub.on("eose", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  log(opts, `timeline: received ${received.length} events`);
  return received;
}

/**
 * post — テキストノートを投稿する
 *
 * kind:1 の NDKEvent を作成して publish する。
 */
export async function post(
  ndk: NDK,
  content: string,
  opts: CommandOptions,
): Promise<NDKEvent> {
  log(opts, "post:", content);
  await new Promise((r) => setTimeout(r, 50));

  const ev = new NDKEvent(ndk);
  ev.kind = 1;
  ev.content = content;
  ev.tags = [];
  await ev.publish();

  log(opts, "post: published", ev.id);
  return ev;
}

/**
 * reply — イベントに返信する
 *
 * 指定イベントIDへの返信として kind:1 + e タグを付与して publish する。
 */
export async function reply(
  ndk: NDK,
  eventId: string,
  content: string,
  opts: CommandOptions,
): Promise<NDKEvent> {
  log(opts, "reply:", eventId, content);
  await new Promise((r) => setTimeout(r, 50));

  const ev = new NDKEvent(ndk);
  ev.kind = 1;
  ev.content = content;
  ev.tags = [
    ["e", eventId, "", "reply"],
  ];
  await ev.publish();

  log(opts, "reply: published", ev.id);
  return ev;
}

/**
 * repost — イベントをリポストする
 *
 * kind:6 の NDKEvent を作成して publish する。
 */
export async function repost(
  ndk: NDK,
  eventId: string,
  opts: CommandOptions,
): Promise<NDKEvent> {
  log(opts, "repost:", eventId);
  await new Promise((r) => setTimeout(r, 50));

  const ev = new NDKEvent(ndk);
  ev.kind = 6;
  ev.content = "";
  ev.tags = [["e", eventId]];
  await ev.publish();

  log(opts, "repost: published", ev.id);
  return ev;
}

/**
 * like — イベントにリアクションする
 *
 * kind:7 の NDKEvent を作成して publish する。
 */
export async function like(
  ndk: NDK,
  eventId: string,
  opts: CommandOptions,
): Promise<NDKEvent> {
  log(opts, "like:", eventId);
  await new Promise((r) => setTimeout(r, 50));

  const ev = new NDKEvent(ndk);
  ev.kind = 7;
  ev.content = "+";
  ev.tags = [["e", eventId]];
  await ev.publish();

  log(opts, "like: published", ev.id);
  return ev;
}

/**
 * deleteEvent — イベントを削除する
 *
 * kind:5 の NDKEvent を作成して publish する (NIP-09)。
 */
export async function deleteEvent(
  ndk: NDK,
  eventId: string,
  opts: CommandOptions,
): Promise<NDKEvent> {
  log(opts, "delete:", eventId);
  await new Promise((r) => setTimeout(r, 50));

  const ev = new NDKEvent(ndk);
  ev.kind = 5;
  ev.content = "";
  ev.tags = [["e", eventId]];
  await ev.publish();

  log(opts, "delete: published", ev.id);
  return ev;
}

/**
 * search — NIP-50 検索
 *
 * search フィルターを使ってイベントを検索する。
 */
export async function search(
  ndk: NDK,
  keyword: string,
  opts: CommandOptions,
): Promise<NDKEvent[]> {
  log(opts, "search:", keyword);
  const received: NDKEvent[] = [];
  const timeout = opts.timeout ?? 5000;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for EOSE")),
      timeout,
    );
    // NIP-50: search フィルターを直接構築
    // deno-lint-ignore no-explicit-any
    const sub = ndk.subscribe({ kinds: [1], search: keyword } as any);
    sub.on("event", (ev: NDKEvent) => received.push(ev));
    sub.on("eose", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  log(opts, `search: found ${received.length} events`);
  return received;
}

/**
 * profile — ユーザーメタデータを取得する
 *
 * kind:0 のイベントを購読して返す。
 */
export async function profile(
  ndk: NDK,
  pubkey: string,
  opts: CommandOptions,
): Promise<NDKEvent | undefined> {
  log(opts, "profile:", pubkey);
  const received: NDKEvent[] = [];
  const timeout = opts.timeout ?? 5000;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for EOSE")),
      timeout,
    );
    const sub = ndk.subscribe({ kinds: [0], authors: [pubkey] });
    sub.on("event", (ev: NDKEvent) => received.push(ev));
    sub.on("eose", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  log(opts, "profile:", received.length > 0 ? "found" : "not found");
  return received[0];
}

/**
 * stream — リアルタイム購読
 *
 * kind:1 のイベントを継続的に受信する。
 * コールバックで各イベントを処理する。AbortSignal で停止可能。
 */
export function stream(
  ndk: NDK,
  onEvent: (ev: NDKEvent) => void,
  opts: CommandOptions,
  signal?: AbortSignal,
): { stop: () => void } {
  log(opts, "stream: starting...");
  const sub = ndk.subscribe({ kinds: [1] }, { closeOnEose: false });
  sub.on("event", (ev: NDKEvent) => {
    log(opts, "stream: received event", ev.id);
    onEvent(ev);
  });

  const stop = () => {
    log(opts, "stream: stopping...");
    sub.stop();
  };

  if (signal) {
    signal.addEventListener("abort", stop, { once: true });
  }

  return { stop };
}

/**
 * dmPost — ダイレクトメッセージを送信する
 *
 * kind:4 の NDKEvent を作成して publish する。
 */
export async function dmPost(
  ndk: NDK,
  recipientPubkey: string,
  message: string,
  opts: CommandOptions,
): Promise<NDKEvent> {
  log(opts, "dm-post:", recipientPubkey, message);
  await new Promise((r) => setTimeout(r, 50));

  const ev = new NDKEvent(ndk);
  ev.kind = 4;
  ev.content = message;
  ev.tags = [["p", recipientPubkey]];
  await ev.publish();

  log(opts, "dm-post: published", ev.id);
  return ev;
}

/**
 * powa — 「ぽわ〜」を投稿する
 */
export async function powa(
  ndk: NDK,
  opts: CommandOptions,
): Promise<NDKEvent> {
  return await post(ndk, "ぽわ〜", opts);
}

/**
 * puru — 「ぷる」を投稿する
 */
export async function puru(
  ndk: NDK,
  opts: CommandOptions,
): Promise<NDKEvent> {
  return await post(ndk, "ぷる", opts);
}

// ===== CLI エントリポイント =====

/** CLI 引数をパースする */
export function parseArgs(args: string[]): {
  command: string;
  args: string[];
  relays: string[];
  verbose: boolean;
} {
  const relays: string[] = [];
  let verbose = false;
  const rest: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--relay" && i + 1 < args.length) {
      relays.push(args[++i]);
    } else if (args[i] === "--verbose" || args[i] === "-V") {
      verbose = true;
    } else {
      rest.push(args[i]);
    }
  }

  if (relays.length === 0) {
    relays.push("wss://relay.damus.test");
  }

  return {
    command: rest[0] ?? "timeline",
    args: rest.slice(1),
    relays,
    verbose,
  };
}

/** メインエントリポイント */
async function main(): Promise<void> {
  const parsed = parseArgs(Deno.args);
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const hexSk = Array.from(sk).map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const ndk = createNDK(parsed.relays, hexSk);
  await ndk.connect();

  const opts: CommandOptions = {
    relays: parsed.relays,
    sk,
    verbose: parsed.verbose,
    timeout: 5000,
  };

  try {
    switch (parsed.command) {
      case "timeline": {
        const events = await timeline(ndk, opts);
        for (const ev of events) {
          console.log(`${ev.pubkey}: ${ev.content}`);
        }
        break;
      }
      case "post": {
        if (!parsed.args[0]) {
          console.error("Usage: post <content>");
          Deno.exit(1);
        }
        await post(ndk, parsed.args[0], opts);
        console.log("Posted.");
        break;
      }
      case "reply": {
        if (!parsed.args[0] || !parsed.args[1]) {
          console.error("Usage: reply <event-id> <content>");
          Deno.exit(1);
        }
        await reply(ndk, parsed.args[0], parsed.args[1], opts);
        console.log("Replied.");
        break;
      }
      case "repost": {
        if (!parsed.args[0]) {
          console.error("Usage: repost <event-id>");
          Deno.exit(1);
        }
        await repost(ndk, parsed.args[0], opts);
        console.log("Reposted.");
        break;
      }
      case "like": {
        if (!parsed.args[0]) {
          console.error("Usage: like <event-id>");
          Deno.exit(1);
        }
        await like(ndk, parsed.args[0], opts);
        console.log("Liked.");
        break;
      }
      case "delete": {
        if (!parsed.args[0]) {
          console.error("Usage: delete <event-id>");
          Deno.exit(1);
        }
        await deleteEvent(ndk, parsed.args[0], opts);
        console.log("Deleted.");
        break;
      }
      case "search": {
        if (!parsed.args[0]) {
          console.error("Usage: search <keyword>");
          Deno.exit(1);
        }
        const results = await search(ndk, parsed.args[0], opts);
        for (const ev of results) {
          console.log(`${ev.pubkey}: ${ev.content}`);
        }
        break;
      }
      case "profile": {
        const target = parsed.args[0] ?? pk;
        const prof = await profile(ndk, target, opts);
        if (prof) {
          console.log(prof.content);
        } else {
          console.log("Profile not found.");
        }
        break;
      }
      case "stream": {
        const ac = new AbortController();
        Deno.addSignalListener("SIGINT", () => ac.abort());
        console.log("Streaming... (Ctrl+C to stop)");
        stream(
          ndk,
          (ev) => {
            console.log(`${ev.pubkey}: ${ev.content}`);
          },
          opts,
          ac.signal,
        );
        // AbortSignal で待機を解除
        await new Promise<void>((resolve) => {
          ac.signal.addEventListener("abort", () => resolve());
        });
        break;
      }
      case "dm-post": {
        if (!parsed.args[0] || !parsed.args[1]) {
          console.error("Usage: dm-post <pubkey> <message>");
          Deno.exit(1);
        }
        await dmPost(ndk, parsed.args[0], parsed.args[1], opts);
        console.log("DM sent.");
        break;
      }
      case "powa": {
        await powa(ndk, opts);
        console.log("ぽわ〜");
        break;
      }
      case "puru": {
        await puru(ndk, opts);
        console.log("ぷる");
        break;
      }
      default:
        console.error(`Unknown command: ${parsed.command}`);
        console.error(
          "Available commands: timeline, post, reply, repost, like, delete, search, profile, stream, dm-post, powa, puru",
        );
        Deno.exit(1);
    }
  } finally {
    cleanupNDK(ndk);
  }
}

// CLI 実行時のみ main() を呼ぶ
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    Deno.exit(1);
  });
}
