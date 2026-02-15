/**
 * tsunagiya サンプルCLIクライアント
 *
 * Deno / Node.js (tsx) / Bun で動作するクロスランタイムCLI。
 *
 * @example
 * ```bash
 * # Deno
 * deno run --allow-net examples/client/cli.ts timeline --relay wss://relay.damus.io --limit 5
 *
 * # Node.js
 * npx tsx examples/client/cli.ts timeline --relay wss://relay.damus.io --limit 5
 *
 * # Bun
 * bun run examples/client/cli.ts timeline --relay wss://relay.damus.io --limit 5
 * ```
 *
 * @module
 */

import type { NostrEvent } from "../../src/types.ts";
import { NostrClient } from "./mod.ts";

/** クロスランタイムでCLI引数を取得する */
function getArgs(): string[] {
  const g = globalThis as Record<string, unknown>;
  if (g.Deno != null) {
    return (g.Deno as { args: string[] }).args;
  }
  if (g.process != null) {
    return (g.process as { argv: string[] }).argv.slice(2);
  }
  return [];
}

/** 名前付き引数の値を取得する */
function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

/** ランダムな16進数文字列を生成する */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** イベントをフォーマットして出力する */
function printEvent(event: NostrEvent, relay: string): void {
  const host = relay.replace(/^wss?:\/\//, "");
  const idPrefix = event.id.slice(0, 8);
  const pubkeyPrefix = event.pubkey.slice(0, 8);
  const date = new Date(event.created_at * 1000).toISOString();

  console.log(`[${host}] ${idPrefix} kind:${event.kind} by ${pubkeyPrefix}`);
  if (event.content) {
    console.log(`  ${event.content.slice(0, 200)}`);
  }
  console.log(`  ${date}`);
}

function printUsage(): void {
  console.log(`Usage:
  cli.ts <command> [options]

Commands:
  timeline    Fetch recent notes
  publish     Publish a note
  subscribe   Subscribe to events

Options:
  --relay <url>     Relay URL (default: wss://relay.damus.io)
  --limit <n>       Number of events (default: 20)
  --pubkey <hex>    Public key for publishing
  --content <text>  Content to publish
  --kind <n>        Event kind to subscribe (default: 1)`);
}

async function main(): Promise<void> {
  const args = getArgs();
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  const relayUrl = getArg(args, "relay") ?? "wss://relay.damus.io";
  const client = new NostrClient([relayUrl], { timeout: 10000 });

  client.onError((error, relay) => {
    console.error(`Error [${relay}]: ${error}`);
  });

  switch (command) {
    case "timeline": {
      const limit = parseInt(getArg(args, "limit") ?? "20", 10);
      await client.connect();
      console.log(`Connected to ${relayUrl}`);

      const events: NostrEvent[] = [];
      await new Promise<void>((resolve) => {
        client.onEvent((ev) => events.push(ev));
        client.onEose(() => resolve());
        client.subscribe([{ kinds: [1], limit }]);
      });

      for (const ev of events.slice(0, limit)) {
        printEvent(ev, relayUrl);
        console.log();
      }

      console.log(`${events.length} event(s) received`);
      client.disconnect();
      break;
    }

    case "publish": {
      const pubkey = getArg(args, "pubkey") ?? randomHex(32);
      const content = getArg(args, "content") ??
        "Hello from tsunagiya client!";

      await client.connect();
      console.log(`Connected to ${relayUrl}`);

      await new Promise<void>((resolve) => {
        client.onOk((eventId, accepted, msg) => {
          if (accepted) {
            console.log(`Published: ${eventId.slice(0, 16)}...`);
          } else {
            console.error(`Rejected: ${msg}`);
          }
          resolve();
        });
        const event = client.publishNote(content, pubkey);
        console.log(`Sending event ${event.id.slice(0, 16)}...`);
      });

      client.disconnect();
      break;
    }

    case "subscribe": {
      const kind = parseInt(getArg(args, "kind") ?? "1", 10);

      await client.connect();
      console.log(`Connected to ${relayUrl}`);
      console.log(`Subscribing to kind:${kind}...`);

      client.onEvent((ev, relay) => {
        printEvent(ev, relay);
        console.log();
      });

      client.onEose((subId) => {
        console.log(`--- EOSE (${subId}) ---`);
      });

      client.onNotice((msg, relay) => {
        console.log(`NOTICE [${relay}]: ${msg}`);
      });

      client.subscribe([{ kinds: [kind] }]);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  const g = globalThis as Record<string, unknown>;
  if (g.process != null) {
    (g.process as { exit: (code: number) => void }).exit(1);
  }
});
