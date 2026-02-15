/**
 * nostr-fetch を使用した algia 風 CUI クライアント（読み取り専用）
 *
 * nostr-fetch は読み取り専用ライブラリのため、取得系コマンドのみサポートする。
 * 各コア関数は export され、テストから直接呼び出せる設計。
 *
 * サポートするコマンド:
 * - timeline — fetchAllEvents でタイムライン一括取得
 * - search "keyword" — NIP-50 検索フィルター
 * - profile [pubkey] — kind:0 プロフィール取得
 * - stream — allEventsIterator でリアルタイムストリーム
 *
 * @module
 */

import type { NostrEvent } from "../../src/types.ts";

/**
 * NostrFetcher インスタンスの型
 *
 * nostr-fetch の NostrFetcher を抽象化し、テストで注入可能にする。
 */
export interface Fetcher {
  fetchAllEvents(
    relays: string[],
    filter: Record<string, unknown>,
    timeRange: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown[]>;
  fetchLastEvent(
    relays: string[],
    filter: Record<string, unknown>,
    timeRange: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown | undefined>;
  allEventsIterator(
    relays: string[],
    filter: Record<string, unknown>,
    timeRange: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): AsyncIterable<unknown>;
  shutdown(): void;
}

/** コマンド実行結果 */
export interface CommandResult {
  /** 成功したか */
  ok: boolean;
  /** 受信イベント一覧 */
  events?: NostrEvent[];
  /** メッセージ */
  message?: string;
}

/** クライアントオプション */
export interface ClientOptions {
  /** NostrFetcher インスタンス */
  fetcher: Fetcher;
  /** リレーURL一覧 */
  relays: string[];
  /** verbose モード */
  verbose?: boolean;
}

/**
 * タイムライン取得
 *
 * fetchAllEvents で kind:1 イベントを一括取得する。
 */
export async function timeline(
  opts: ClientOptions,
): Promise<CommandResult> {
  const events = await opts.fetcher.fetchAllEvents(
    opts.relays,
    { kinds: [1] },
    {},
  ) as unknown as NostrEvent[];

  if (opts.verbose) {
    for (const ev of events) {
      console.log(
        `[${new Date(ev.created_at * 1000).toISOString()}] ${
          ev.pubkey.slice(0, 8)
        }: ${ev.content}`,
      );
    }
  }

  return { ok: true, events };
}

/**
 * 最新イベント取得
 *
 * fetchLastEvent で指定フィルターの最新1件を取得する。
 */
export async function fetchLast(
  opts: ClientOptions,
  filter: Record<string, unknown>,
): Promise<CommandResult> {
  const event = await opts.fetcher.fetchLastEvent(
    opts.relays,
    filter,
    {},
  ) as unknown as NostrEvent | undefined;

  if (opts.verbose && event) {
    console.log(`[last] ${event.pubkey.slice(0, 8)}: ${event.content}`);
  }

  const events = event ? [event] : [];
  return { ok: true, events };
}

/**
 * NIP-50 検索
 *
 * fetchAllEvents に search フィルターを渡してイベントを取得する。
 */
export async function search(
  opts: ClientOptions,
  keyword: string,
): Promise<CommandResult> {
  const events = await opts.fetcher.fetchAllEvents(
    opts.relays,
    { kinds: [1], search: keyword },
    {},
  ) as unknown as NostrEvent[];

  if (opts.verbose) {
    for (const ev of events) {
      console.log(`[search] ${ev.content}`);
    }
  }

  return { ok: true, events };
}

/**
 * プロフィール取得
 *
 * fetchLastEvent で kind:0 メタデータを取得する。
 */
export async function profile(
  opts: ClientOptions,
  pubkey: string,
): Promise<CommandResult> {
  const event = await opts.fetcher.fetchLastEvent(
    opts.relays,
    { kinds: [0], authors: [pubkey] },
    {},
  ) as unknown as NostrEvent | undefined;

  if (opts.verbose && event) {
    console.log(`Profile: ${event.content}`);
  }

  const events = event ? [event] : [];
  return { ok: true, events };
}

/**
 * リアルタイムストリーム
 *
 * allEventsIterator で kind:1 イベントを順次取得する。
 * maxEvents で取得件数を制限できる（テスト用）。
 */
export async function stream(
  opts: ClientOptions,
  options?: { maxEvents?: number },
): Promise<CommandResult> {
  const received: NostrEvent[] = [];
  const maxEvents = options?.maxEvents ?? Infinity;

  const iterator = opts.fetcher.allEventsIterator(
    opts.relays,
    { kinds: [1] },
    {},
  );

  for await (const ev of iterator) {
    received.push(ev as unknown as NostrEvent);
    if (opts.verbose) {
      const e = ev as unknown as NostrEvent;
      console.log(`[stream] ${e.pubkey.slice(0, 8)}: ${e.content}`);
    }
    if (received.length >= maxEvents) break;
  }

  return { ok: true, events: received };
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
      "Usage: client.ts <command> [args]\nCommands: timeline, search, profile, stream",
    );
    return;
  }

  // NostrFetcher を動的にインポート
  const { NostrFetcher } = await import("nostr-fetch");
  const fetcher = NostrFetcher.init();
  const opts: ClientOptions = {
    fetcher: fetcher as unknown as Fetcher,
    relays: [relayUrl],
    verbose,
  };

  try {
    switch (command) {
      case "timeline":
        await timeline(opts);
        break;
      case "search":
        await search(opts, positional[1] ?? "");
        break;
      case "profile":
        await profile(opts, positional[1] ?? "");
        break;
      case "stream":
        await stream(opts);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(
          "Note: nostr-fetch is a read-only library. Only timeline, search, profile, stream are supported.",
        );
    }
  } finally {
    fetcher.shutdown();
  }
}

// CLI実行
if (import.meta.main) {
  await main(Deno.args);
}
