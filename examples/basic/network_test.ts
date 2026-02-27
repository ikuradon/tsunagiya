/**
 * ネットワークシナリオ E2E テスト
 *
 * F1: 複数リレーフォールバック（遅いリレー → 速いリレーに切替）
 * F2: オフライン/再接続シミュレーション（disconnect → 再接続 → データ再取得）
 * F3: 部分的 AUTH 失敗（リレーA成功 + リレーB失敗の混合）
 *
 * @module
 */

import { assertEquals, assertExists, test } from "../_compat/mod.ts";
import { MockPool } from "../../src/mod.ts";
import { EventBuilder } from "../../src/testing/mod.ts";
import type { RelayMessage } from "../../src/types.ts";
import { timeline } from "./client.ts";

const TEST_PUBKEY =
  "aaaa000000000000000000000000000000000000000000000000000000000000";

/** WebSocket を開いて返す */
async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

/** WebSocket を閉じて close イベントを待つ */
async function closeWs(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return;
  const p = new Promise<void>((resolve) => {
    ws.onclose = () => resolve();
  });
  ws.close();
  await p;
}

// ===== F1: 複数リレーフォールバック =====

test(
  "network: F1 - 複数リレーフォールバック（遅いリレー→速いリレーに切替）",
  async () => {
    const pool = new MockPool();
    // 遅いリレー: latency 1000ms
    const slowRelay = pool.relay("wss://slow.test", {
      latency: { min: 1000, max: 1000 },
    });
    // 速いリレー: latency 0ms
    const fastRelay = pool.relay("wss://fast.test", {
      latency: { min: 0, max: 0 },
    });

    const event = EventBuilder.kind1().content("fallback event").build();
    slowRelay.store(event);
    fastRelay.store(event);

    pool.install();
    try {
      // 両リレーに接続
      const wsSlow = await openWs("wss://slow.test");
      const wsFast = await openWs("wss://fast.test");

      try {
        // Promise.race で速い方からレスポンスを取得
        const result = await Promise.race([
          timeline(wsSlow).then((events) => ({ relay: "slow", events })),
          timeline(wsFast).then((events) => ({ relay: "fast", events })),
        ]);

        // 速いリレーが先に応答する
        assertEquals(result.relay, "fast");
        assertEquals(result.events.length, 1);
        assertEquals(result.events[0].content, "fallback event");
      } finally {
        await closeWs(wsSlow);
        await closeWs(wsFast);
        // 遅いリレーの保留中のlatencyタイマーをクリアする
        slowRelay.reset();
      }
    } finally {
      pool.uninstall();
    }
  },
);

// ===== F2: オフライン/再接続シミュレーション =====

test(
  "network: F2 - オフライン/再接続シミュレーション（disconnect → 再接続 → データ再取得）",
  async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://reconnect.test");

    const event = EventBuilder.kind1().content("persisted event").build();
    relay.store(event);

    pool.install();
    try {
      // 最初の接続
      const ws1 = await openWs("wss://reconnect.test");

      // 切断イベントを待つ準備
      const closePromise = new Promise<CloseEvent>((resolve) => {
        ws1.onclose = (ev: CloseEvent) => resolve(ev);
      });

      // リレー側からサーバー再起動を模した切断
      relay.disconnect(1001, "server restart");
      const closeEvent = await closePromise;

      assertEquals(closeEvent.code, 1001);

      // 再接続
      const ws2 = await openWs("wss://reconnect.test");
      try {
        // データを再取得できることを確認
        const events = await timeline(ws2);
        assertEquals(events.length, 1);
        assertEquals(events[0].content, "persisted event");
        assertEquals(events[0].id, event.id);
      } finally {
        await closeWs(ws2);
      }
    } finally {
      pool.uninstall();
    }
  },
);

// ===== F3: 部分的 AUTH 失敗 =====

test(
  "network: F3 - 部分的 AUTH 失敗（リレーA成功 + リレーB失敗の混合）",
  async () => {
    const pool = new MockPool();

    // リレーA: AUTH 常に成功
    const relayA = pool.relay("wss://relay-a.test", { requiresAuth: true });
    relayA.requireAuth((_event) => true);

    // リレーB: AUTH 常に失敗
    const relayB = pool.relay("wss://relay-b.test", { requiresAuth: true });
    relayB.requireAuth((_event) => false);

    pool.install();
    try {
      const wsA = await openWs("wss://relay-a.test");
      const wsB = await openWs("wss://relay-b.test");

      try {
        const receivedA: RelayMessage[] = [];
        const receivedB: RelayMessage[] = [];

        wsA.addEventListener("message", (ev: MessageEvent) => {
          receivedA.push(JSON.parse(ev.data as string) as RelayMessage);
        });
        wsB.addEventListener("message", (ev: MessageEvent) => {
          receivedB.push(JSON.parse(ev.data as string) as RelayMessage);
        });

        // AUTH チャレンジを待つ
        await new Promise<void>((resolve) => setTimeout(resolve, 20));

        const authChallengeA = receivedA.find((m) => m[0] === "AUTH");
        const authChallengeB = receivedB.find((m) => m[0] === "AUTH");
        assertExists(authChallengeA);
        assertExists(authChallengeB);

        // リレーA に AUTH レスポンス送信
        const authEventA = EventBuilder.kind(22242)
          .content("")
          .pubkey(TEST_PUBKEY)
          .tag("relay", "wss://relay-a.test")
          .tag("challenge", authChallengeA[1] as string)
          .build();
        wsA.send(JSON.stringify(["AUTH", authEventA]));

        // リレーB に AUTH レスポンス送信
        const authEventB = EventBuilder.kind(22242)
          .content("")
          .pubkey(TEST_PUBKEY)
          .tag("relay", "wss://relay-b.test")
          .tag("challenge", authChallengeB[1] as string)
          .build();
        wsB.send(JSON.stringify(["AUTH", authEventB]));

        await new Promise<void>((resolve) => setTimeout(resolve, 20));

        // リレーA: OK true（認証成功）
        const okA = receivedA.find(
          (m) => m[0] === "OK" && m[1] === authEventA.id,
        );
        assertExists(okA);
        assertEquals(okA[2], true);

        // リレーB: OK false（認証失敗）
        const okB = receivedB.find(
          (m) => m[0] === "OK" && m[1] === authEventB.id,
        );
        assertExists(okB);
        assertEquals(okB[2], false);
      } finally {
        await closeWs(wsA);
        await closeWs(wsB);
      }
    } finally {
      pool.uninstall();
    }
  },
);
