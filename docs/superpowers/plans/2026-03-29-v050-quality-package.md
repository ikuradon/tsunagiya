# v0.5.0 Quality Improvement Package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle relay internals refactoring with network simulation, code quality improvements, and infrastructure enhancements into v0.5.0.

**Architecture:** Extend existing `DeliveryScheduler` and `RelayConnectionRuntime` for network simulation. Add barrel export for `src/relay/`. Fill coverage gaps in `testing/stream.ts` and add unit tests for `internal/` and `platform/` modules. Add GitHub Releases and Dependabot to CI.

**Tech Stack:** Deno, TypeScript (strict), Deno.test, GitHub Actions

---

## Phase 1: Barrel Export + Dependabot

### Task 1: Create `src/relay/mod.ts` barrel export

**Files:**
- Create: `src/relay/mod.ts`
- Modify: `src/relay.ts`

- [ ] **Step 1: Create `src/relay/mod.ts`**

```typescript
// src/relay/mod.ts
/**
 * Relay internal modules barrel export.
 *
 * @module
 */

export { AuthService, generateChallenge } from "./auth_service.ts";
export type { AuthServiceOptions } from "./auth_service.ts";
export { RelayConnectionRuntime } from "./connection_runtime.ts";
export type { RelayConnectionRuntimeOptions } from "./connection_runtime.ts";
export { DeliveryScheduler } from "./delivery_scheduler.ts";
export type { DeliverySchedulerProfile } from "./delivery_scheduler.ts";
export {
  AUTH_REQUIRED_AUTHENTICATION_REQUIRED,
  AUTH_REQUIRED_CHALLENGE_MISMATCH,
  AUTH_REQUIRED_INVALID_AUTH_EVENT_KIND,
  AUTH_REQUIRED_NO_CHALLENGE_ISSUED,
  AUTH_REQUIRED_RELAY_URL_MISMATCH,
  AUTH_REQUIRED_VALIDATION_FAILED,
  BLOCKED_EVENT_WAS_DELETED,
  DUPLICATE_ALREADY_HAVE_NEWER_EVENT,
  internalProcessingError,
  INVALID_BAD_SIGNATURE,
  SIMULATED_ERROR,
  unsupportedMessageType,
} from "./error_messages.ts";
export { EventStore } from "./event_store.ts";
export {
  collectMatchingEvents,
  compileFilter,
} from "./filter_compiler.ts";
export type {
  CompiledFilter,
  CompiledTagFilter,
  OrderedEvent,
} from "./filter_compiler.ts";
export {
  DEFAULT_MESSAGE_VALIDATION_LIMITS,
  parseClientMessage,
} from "./message_codec.ts";
export type {
  MessageValidationLimits,
  ParsedClientMessage,
} from "./message_codec.ts";
export { RelayInspector } from "./relay_inspector.ts";
export {
  closedMessage,
  countMessage,
  eoseMessage,
  eventMessage,
  noticeMessage,
  okMessage,
} from "./response_builders.ts";
export { routeClientMessage } from "./router.ts";
export type { RelayRouterHandlers } from "./router.ts";
export { SubscriptionRegistry } from "./subscription_registry.ts";
```

- [ ] **Step 2: Update `src/relay.ts` to import from barrel**

Replace the 8 individual import blocks (lines 26–46 of `src/relay.ts`):

```typescript
import {
  AuthService,
  BLOCKED_EVENT_WAS_DELETED,
  DEFAULT_MESSAGE_VALIDATION_LIMITS,
  DUPLICATE_ALREADY_HAVE_NEWER_EVENT,
  eoseMessage,
  eventMessage,
  EventStore,
  countMessage,
  internalProcessingError,
  INVALID_BAD_SIGNATURE,
  type MessageValidationLimits,
  okMessage,
  RelayConnectionRuntime,
  RelayInspector,
  SubscriptionRegistry,
} from "./relay/mod.ts";
```

- [ ] **Step 3: Run format and check**

Run: `deno task fmt && deno task check`
Expected: No errors.

- [ ] **Step 4: Run tests**

Run: `deno task test`
Expected: All tests pass. No behavioral change.

- [ ] **Step 5: Commit**

```bash
git add src/relay/mod.ts src/relay.ts
git commit -m "refactor: add barrel export for src/relay/ modules"
```

---

### Task 2: Add Dependabot configuration

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  # GitHub Actions — weekly, grouped into single PR
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    commit-message:
      prefix: "ci"
    groups:
      actions:
        patterns: ["*"]

  # examples/ npm deps — weekly, grouped
  - package-ecosystem: "npm"
    directory: "/examples"
    schedule:
      interval: "weekly"
      day: "monday"
    commit-message:
      prefix: "chore"
    groups:
      npm-dependencies:
        patterns: ["*"]

  # docs/ npm deps (VitePress etc.) — monthly
  - package-ecosystem: "npm"
    directory: "/docs"
    schedule:
      interval: "monthly"
    commit-message:
      prefix: "docs"
```

- [ ] **Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add Dependabot for GitHub Actions and npm dependencies"
```

---

## Phase 2: Network Simulation + Coverage + Unit Tests

### Task 3: Add `NetworkConditions` type

**Files:**
- Modify: `src/types/relay.ts`
- Modify: `src/types.ts`
- Modify: `src/mod.ts`

- [ ] **Step 1: Add `NetworkConditions` interface to `src/types/relay.ts`**

Add before the `MockRelayOptions` interface:

```typescript
/** ネットワーク条件シミュレーション設定 */
export interface NetworkConditions {
  /** 接続確立までの遅延 (ms) */
  connectDelay?: number;
  /** メッセージ配信の基本遅延 (ms) */
  messageDelay?: number;
  /** 遅延のジッター幅 (ms)。実際の遅延は delay ± random(jitter) */
  jitter?: number;
  /** メッセージ順序のシャッフル確率 (0.0–1.0) */
  outOfOrderRate?: number;
  /** 一時的な接続断のシミュレーション設定 */
  transientDisconnect?: {
    /** 切断が発生する確率 (0.0–1.0)。メッセージ配信ごとに判定 */
    probability: number;
    /** 切断から再接続可能になるまでの時間 (ms) */
    duration: number;
  };
}
```

Add `network?: NetworkConditions;` field to `MockRelayOptions`:

```typescript
export interface MockRelayOptions {
  // ...existing fields...
  /** ネットワーク条件シミュレーション */
  network?: NetworkConditions;
}
```

- [ ] **Step 2: Re-export `NetworkConditions` from `src/types.ts`**

Add to the relay.ts re-exports:

```typescript
export type {
  AuthContext,
  AuthValidator,
  COUNTHandler,
  EVENTHandler,
  MockRelayOptions,
  NetworkConditions,
  RelayInformation,
  RelayLimitation,
  RelaySnapshot,
  REQHandler,
} from "./types/relay.ts";
```

- [ ] **Step 3: Re-export `NetworkConditions` from `src/mod.ts`**

Add `NetworkConditions` to the type exports in `src/mod.ts`:

```typescript
export type {
  AuthContext,
  AuthValidator,
  ClientMessage,
  Clock,
  COUNTHandler,
  EVENTHandler,
  EventSigner,
  EventVerifier,
  LogEntry,
  LogHandler,
  LogLevel,
  MockRelayOptions,
  NetworkConditions,
  NostrEvent,
  NostrFilter,
  RandomSource,
  RelayInformation,
  RelayLimitation,
  RelayMessage,
  RelaySnapshot,
  REQHandler,
  StartStreamOptions,
  StreamHandle,
  StreamOptions,
  UnsignedEvent,
} from "./types.ts";
```

- [ ] **Step 4: Run format and type check**

Run: `deno task fmt && deno task check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/relay.ts src/types.ts src/mod.ts
git commit -m "feat: add NetworkConditions type for network simulation"
```

---

### Task 4: Extend `DeliveryScheduler` with jitter and out-of-order

**Files:**
- Modify: `src/relay/delivery_scheduler.ts`
- Modify: `src/relay/mod.ts`
- Test: `tests/delivery_scheduler_test.ts`

- [ ] **Step 1: Write failing tests for jitter delivery**

Add to `tests/delivery_scheduler_test.ts`:

```typescript
import { assertEquals } from "@std/assert";
import { DeliveryScheduler } from "../src/relay/delivery_scheduler.ts";
import type { MockWebSocket } from "../src/websocket.ts";
import type { RandomSource } from "../src/types.ts";

function makeFakeSocket(): MockWebSocket {
  const received: string[] = [];
  return {
    _receiveMessage(data: string): void {
      received.push(data);
    },
    get _received(): string[] {
      return received;
    },
  } as unknown as MockWebSocket;
}

function makeFixedRandom(value: number): RandomSource {
  return {
    next: () => value,
    fill: (bytes: Uint8Array) => bytes.fill(0),
  };
}

Deno.test("DeliveryScheduler - deliverWithJitter applies jitter to delay", async () => {
  const scheduler = new DeliveryScheduler();
  const socket = makeFakeSocket();
  const random = makeFixedRandom(0.75); // jitter = (0.75 * 2 - 1) * 10 = +5

  scheduler.deliverWithJitter(socket, "msg1", {
    baseDelay: 20,
    jitter: 10,
    random,
  });

  // Should be delayed by 20 + 5 = 25ms
  assertEquals((socket as unknown as { _received: string[] })._received.length, 0);

  await new Promise<void>((resolve) => setTimeout(resolve, 40));
  assertEquals((socket as unknown as { _received: string[] })._received, ["msg1"]);

  scheduler.clear();
});

Deno.test("DeliveryScheduler - deliverWithJitter clamps negative delay to 0", async () => {
  const scheduler = new DeliveryScheduler();
  const socket = makeFakeSocket();
  const random = makeFixedRandom(0.0); // jitter = (0.0 * 2 - 1) * 100 = -100

  scheduler.deliverWithJitter(socket, "msg1", {
    baseDelay: 10,
    jitter: 100,
    random,
  });

  // Delay clamped to 0 — delivered via queueMicrotask
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assertEquals((socket as unknown as { _received: string[] })._received, ["msg1"]);

  scheduler.clear();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test tests/delivery_scheduler_test.ts`
Expected: FAIL — `deliverWithJitter` is not a function.

- [ ] **Step 3: Write failing tests for out-of-order delivery**

Add to `tests/delivery_scheduler_test.ts`:

```typescript
Deno.test("DeliveryScheduler - flushDueEntries shuffles with outOfOrderRate", async () => {
  const scheduler = new DeliveryScheduler();
  const socket = makeFakeSocket();

  // Random value < outOfOrderRate triggers shuffle
  // Fisher-Yates with fixed random will reverse order for 3 elements
  let callIndex = 0;
  const shuffleRandom: RandomSource = {
    next: () => {
      // Return values that cause predictable shuffle
      return [0.1, 0.99, 0.99][callIndex++] ?? 0.5;
    },
    fill: (bytes: Uint8Array) => bytes.fill(0),
  };

  // Schedule 3 messages all at the same time (delay=10)
  scheduler.deliverWithJitter(socket, "A", {
    baseDelay: 10,
    jitter: 0,
    random: shuffleRandom,
    outOfOrderRate: 0.5,
  });
  scheduler.deliverWithJitter(socket, "B", {
    baseDelay: 10,
    jitter: 0,
    random: shuffleRandom,
    outOfOrderRate: 0.5,
  });
  scheduler.deliverWithJitter(socket, "C", {
    baseDelay: 10,
    jitter: 0,
    random: shuffleRandom,
    outOfOrderRate: 0.5,
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 30));

  const received = (socket as unknown as { _received: string[] })._received;
  assertEquals(received.length, 3);
  // With outOfOrderRate and our random values, order should differ from A,B,C
  // Exact order depends on Fisher-Yates implementation — just verify all delivered
  assertEquals(new Set(received), new Set(["A", "B", "C"]));

  scheduler.clear();
});

Deno.test("DeliveryScheduler - outOfOrderRate 0 preserves FIFO order", async () => {
  const scheduler = new DeliveryScheduler();
  const socket = makeFakeSocket();
  const random = makeFixedRandom(0.5);

  scheduler.deliverWithJitter(socket, "A", {
    baseDelay: 10,
    jitter: 0,
    random,
    outOfOrderRate: 0,
  });
  scheduler.deliverWithJitter(socket, "B", {
    baseDelay: 10,
    jitter: 0,
    random,
    outOfOrderRate: 0,
  });
  scheduler.deliverWithJitter(socket, "C", {
    baseDelay: 10,
    jitter: 0,
    random,
    outOfOrderRate: 0,
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 30));

  const received = (socket as unknown as { _received: string[] })._received;
  assertEquals(received, ["A", "B", "C"]);

  scheduler.clear();
});
```

- [ ] **Step 4: Implement `deliverWithJitter` in `DeliveryScheduler`**

Modify `src/relay/delivery_scheduler.ts`. Add the new method and update `#flushDueEntries`:

```typescript
import type { RandomSource } from "../types.ts";

// Add to ScheduledDeliveryEntry:
interface ScheduledDeliveryEntry {
  kind: "delivery";
  dueAt: number;
  sequence: number;
  socket: MockWebSocket;
  payload: string;
  outOfOrderRate: number;
}

export interface JitterOptions {
  baseDelay: number;
  jitter: number;
  random: RandomSource;
  outOfOrderRate?: number;
}
```

Add the method to the class:

```typescript
deliverWithJitter(
  socket: MockWebSocket,
  payload: string,
  options: JitterOptions,
): void {
  const jitterOffset = options.jitter > 0
    ? Math.round((options.random.next() * 2 - 1) * options.jitter)
    : 0;
  const delay = Math.max(0, options.baseDelay + jitterOffset);

  if (delay <= 0) {
    this.#immediateDeliveryCount += 1;
    queueMicrotask(() => socket._receiveMessage(payload));
    return;
  }

  this.#delayedDeliveryCount += 1;
  const dueAt = wallClockNow() + delay;
  this.#entries.push({
    kind: "delivery",
    dueAt,
    sequence: this.#nextSequence++,
    socket,
    payload,
    outOfOrderRate: options.outOfOrderRate ?? 0,
  } as ScheduledEntry);

  if (this.#timer === undefined) {
    this.#scheduleNextTimer();
    return;
  }
  if (this.#nextDueAt === undefined || dueAt < this.#nextDueAt) {
    this.#rescheduleNextTimer();
  }
}
```

Update `#flushDueEntries` to shuffle delivery entries when `outOfOrderRate > 0`:

```typescript
#flushDueEntries(): void {
  this.#timer = undefined;
  this.#nextDueAt = undefined;

  const now = wallClockNow();
  const dueEntries: ScheduledEntry[] = [];
  const futureEntries: ScheduledEntry[] = [];

  for (const entry of this.#entries) {
    if (entry.dueAt <= now) {
      dueEntries.push(entry);
    } else {
      futureEntries.push(entry);
    }
  }

  this.#entries = futureEntries;
  dueEntries.sort((a, b) => {
    if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
    return a.sequence - b.sequence;
  });

  // Check if any delivery entry requests out-of-order
  const shouldShuffle = dueEntries.some(
    (e) =>
      e.kind === "delivery" &&
      (e as ScheduledDeliveryEntry).outOfOrderRate > 0,
  );
  if (shouldShuffle) {
    this.#shuffleDeliveries(dueEntries);
  }

  for (const entry of dueEntries) {
    if (entry.kind === "task") {
      entry.task();
      continue;
    }
    entry.socket._receiveMessage(entry.payload);
  }

  if (this.#timer === undefined && this.#entries.length > 0) {
    this.#scheduleNextTimer();
  }
}

#shuffleDeliveries(entries: ScheduledEntry[]): void {
  // Fisher-Yates shuffle only on delivery entries, preserving task order
  const deliveryIndices: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].kind === "delivery") {
      const entry = entries[i] as ScheduledDeliveryEntry;
      if (entry.outOfOrderRate > 0) {
        deliveryIndices.push(i);
      }
    }
  }

  // Shuffle using first entry's outOfOrderRate as probability gate
  // (all entries in a batch share the same rate from NetworkConditions)
  if (deliveryIndices.length < 2) return;

  for (let i = deliveryIndices.length - 1; i > 0; i--) {
    const j = Math.floor(
      Math.random() * (i + 1),
    );
    const idxA = deliveryIndices[i];
    const idxB = deliveryIndices[j];
    [entries[idxA], entries[idxB]] = [entries[idxB], entries[idxA]];
  }
}
```

Note: The `#shuffleDeliveries` method uses `Math.random()` which is acceptable here since the shuffle randomness doesn't need to be deterministic (the `outOfOrderRate` probability gate is the deterministic part). However, to pass the `guard_runtime_access.ts` check, we need to use the injected random source. Store a reference to a `RandomSource` on the scheduler:

Actually, let's revise: the shuffle should use the `RandomSource` from the entry's `JitterOptions`. Since all entries in a batch come from the same relay and share a `RandomSource`, we can extract it from the first delivery entry.

```typescript
#shuffleDeliveries(entries: ScheduledEntry[]): void {
  const deliveryIndices: number[] = [];
  let random: RandomSource | null = null;

  for (let i = 0; i < entries.length; i++) {
    if (entries[i].kind === "delivery") {
      const entry = entries[i] as ScheduledDeliveryEntry;
      if (entry.outOfOrderRate > 0) {
        deliveryIndices.push(i);
        if (!random) random = entry.random;
      }
    }
  }

  if (deliveryIndices.length < 2 || !random) return;

  for (let i = deliveryIndices.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    const idxA = deliveryIndices[i];
    const idxB = deliveryIndices[j];
    [entries[idxA], entries[idxB]] = [entries[idxB], entries[idxA]];
  }
}
```

This means `ScheduledDeliveryEntry` also needs a `random` field and `outOfOrderRate` field:

```typescript
interface ScheduledDeliveryEntry {
  kind: "delivery";
  dueAt: number;
  sequence: number;
  socket: MockWebSocket;
  payload: string;
  outOfOrderRate: number;
  random: RandomSource | null;
}
```

Update the existing `deliver()` method to include defaults for the new fields:

```typescript
deliver(socket: MockWebSocket, payload: string, delayMs: number): void {
  if (delayMs > 0) {
    this.#delayedDeliveryCount += 1;
    this.#enqueue(
      { kind: "delivery", socket, payload, outOfOrderRate: 0, random: null },
      delayMs,
    );
    return;
  }
  this.#immediateDeliveryCount += 1;
  queueMicrotask(() => socket._receiveMessage(payload));
}
```

- [ ] **Step 5: Update `src/relay/mod.ts` barrel to export new types**

Add to `src/relay/mod.ts`:

```typescript
export type { JitterOptions } from "./delivery_scheduler.ts";
```

- [ ] **Step 6: Run tests**

Run: `deno task fmt && deno test tests/delivery_scheduler_test.ts`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/relay/delivery_scheduler.ts src/relay/mod.ts tests/delivery_scheduler_test.ts
git commit -m "feat: add jitter and out-of-order delivery to DeliveryScheduler"
```

---

### Task 5: Add `connectDelay` and `transientDisconnect` to `RelayConnectionRuntime`

**Files:**
- Modify: `src/relay/connection_runtime.ts`
- Modify: `src/websocket.ts`
- Test: `tests/relay_test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/relay_test.ts`:

```typescript
Deno.test("MockRelay - network.connectDelay delays WebSocket open event", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    network: { connectDelay: 50 },
  });
  pool.install();
  try {
    const start = Date.now();
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    const elapsed = Date.now() - start;
    assertEquals(elapsed >= 40, true, `Expected >= 40ms delay, got ${elapsed}ms`);
    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - network.messageDelay + jitter delays responses", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    network: { messageDelay: 30, jitter: 5 },
    random: { next: () => 0.5, fill: (b: Uint8Array) => b.fill(0) },
  });
  relay.store({
    id: "ev1", pubkey: "pk1", kind: 1, content: "hi",
    created_at: 1700000000, tags: [], sig: "sig1",
  });
  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => { ws.onopen = () => resolve(); });

    const start = Date.now();
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await new Promise<void>((resolve) => {
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg[0] === "EVENT") resolve();
      };
    });
    const elapsed = Date.now() - start;
    assertEquals(elapsed >= 20, true, `Expected >= 20ms delay, got ${elapsed}ms`);

    ws.close();
    await new Promise<void>((resolve) => { ws.onclose = () => resolve(); });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - network.transientDisconnect triggers close", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    network: {
      transientDisconnect: { probability: 1.0, duration: 100 },
    },
    random: { next: () => 0.0, fill: (b: Uint8Array) => b.fill(0) },
  });
  relay.store({
    id: "ev1", pubkey: "pk1", kind: 1, content: "hi",
    created_at: 1700000000, tags: [], sig: "sig1",
  });
  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => { ws.onopen = () => resolve(); });

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1001);
  } finally {
    pool.uninstall();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test tests/relay_test.ts --filter "network"`
Expected: FAIL — `network` option not recognized / no delay behavior.

- [ ] **Step 3: Implement `connectDelay` in `MockWebSocket`**

Modify `src/websocket.ts` — update `#scheduleOpen()` to read `network.connectDelay` in addition to existing `connectionDelay`:

```typescript
#scheduleOpen(): void {
  const legacyDelay = this.#relay?.options.connectionDelay ?? 0;
  const networkDelay = this.#relay?.options.network?.connectDelay ?? 0;
  const delay = Math.max(legacyDelay, networkDelay);
  // ...rest unchanged
}
```

- [ ] **Step 4: Implement network-aware message delivery in `RelayConnectionRuntime`**

Modify `src/relay/connection_runtime.ts`.

Update `sendMessage` to use `deliverWithJitter` when `NetworkConditions` is set:

```typescript
sendMessage(socket: MockWebSocket, message: RelayMessage): void {
  this.#log("send", message);

  const network = this.#relayOptions.network;
  if (network && (network.messageDelay || network.jitter)) {
    this.#deliveryScheduler.deliverWithJitter(
      socket,
      JSON.stringify(message),
      {
        baseDelay: (network.messageDelay ?? 0) + this.#getLatency(),
        jitter: network.jitter ?? 0,
        random: this.#random,
        outOfOrderRate: network.outOfOrderRate ?? 0,
      },
    );
    return;
  }

  const latency = this.#getLatency();
  this.#deliveryScheduler.deliver(socket, JSON.stringify(message), latency);
}
```

Add transient disconnect check in `handleMessage`:

```typescript
handleMessage(socket: MockWebSocket, data: string): void {
  // ...existing parse + log code...

  // Transient disconnect check (before routing)
  if (this.#shouldTransientDisconnect()) {
    socket._forceClose(1001, "Transient disconnect");
    this.#startDisconnectCooldown();
    return;
  }

  // ...rest of existing handleMessage...
}

#shouldTransientDisconnect(): boolean {
  const td = this.#relayOptions.network?.transientDisconnect;
  if (!td || td.probability <= 0) return false;
  return this.#random.next() < td.probability;
}

#disconnectCooldownUntil = 0;

#startDisconnectCooldown(): void {
  const td = this.#relayOptions.network?.transientDisconnect;
  if (!td) return;
  this.#disconnectCooldownUntil = this.#clock.now() + td.duration;
}
```

Update `registerConnection` to reject during cooldown:

```typescript
registerConnection(socket: MockWebSocket): void {
  if (this.#disconnectCooldownUntil > this.#clock.now()) {
    // Still in cooldown — reject connection
    queueMicrotask(() => socket._forceClose(1001, "Relay temporarily unavailable"));
    return;
  }
  this.#connections.add(socket);
}
```

Also add to `reset()`:

```typescript
reset(): void {
  this.#refused = false;
  this.#disconnectCooldownUntil = 0;
  this.#deliveryScheduler.clear();
}
```

- [ ] **Step 5: Run format and tests**

Run: `deno task fmt && deno test tests/relay_test.ts --filter "network"`
Expected: All 3 new tests pass.

- [ ] **Step 6: Run full test suite**

Run: `deno task test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/relay/connection_runtime.ts src/websocket.ts tests/relay_test.ts
git commit -m "feat: add network condition simulation (connectDelay, messageDelay, jitter, transientDisconnect)"
```

---

### Task 6: Fix `testing/stream.ts` branch coverage

**Files:**
- Modify: `tests/testing/stream_test.ts`

Uncovered branches (from LCOV):
- Line 35: `streamEvents` called with empty array (first `scheduleNext` returns immediately)
- Line 90: `startStream` stopped before first timer fires
- Lines 110-111, 118: `startStream` auto-stop when `maxCount` reached inside timer

- [ ] **Step 1: Write test for empty events array**

Add to `tests/testing/stream_test.ts`:

```typescript
Deno.test("streamEvents - empty events array completes immediately", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const handle = streamEvents(relay, [], { interval: 10 });

    // Empty array — scheduleNext returns on first call, no timer created
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    assertEquals(handle.stopped, false);
    handle.stop();
    assertEquals(handle.stopped, true);
  } finally {
    pool.uninstall();
  }
});
```

- [ ] **Step 2: Write test for `startStream` immediate stop**

```typescript
Deno.test("startStream - stop() before first event fires", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  let generated = 0;

  pool.install();
  try {
    const handle = startStream(relay, {
      eventGenerator: () => {
        generated++;
        return EventBuilder.random({ kind: 1 });
      },
      interval: 100,
    });

    // Stop immediately — before first timer fires
    handle.stop();
    assertEquals(handle.stopped, true);

    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    assertEquals(generated, 0);
  } finally {
    pool.uninstall();
  }
});
```

- [ ] **Step 3: Write test for `startStream` count=0**

```typescript
Deno.test("startStream - count: 0 stops immediately", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  let generated = 0;

  pool.install();
  try {
    const handle = startStream(relay, {
      eventGenerator: () => {
        generated++;
        return EventBuilder.random({ kind: 1 });
      },
      interval: 10,
      count: 0,
    });

    // count=0 causes scheduleNext to set stopped=true immediately
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    assertEquals(handle.stopped, true);
    assertEquals(generated, 0);
  } finally {
    pool.uninstall();
  }
});
```

- [ ] **Step 4: Run tests and verify coverage**

Run: `deno task fmt && deno test tests/testing/stream_test.ts`
Expected: All pass.

Run: `deno task coverage`
Expected: `testing/stream.ts` branch coverage >= 80%.

- [ ] **Step 5: Commit**

```bash
git add tests/testing/stream_test.ts
git commit -m "test: improve stream.ts branch coverage to 80%+"
```

---

### Task 7: Unit tests for `src/internal/`

**Files:**
- Create: `tests/internal/clone_test.ts`
- Create: `tests/internal/url_test.ts`
- Create: `tests/internal/validation_test.ts`
- Create: `tests/internal/runtime_test.ts`
- Create: `tests/internal/search_test.ts`

- [ ] **Step 1: Create `tests/internal/clone_test.ts`**

```typescript
import { assertEquals, assertNotStrictEquals } from "@std/assert";
import {
  cloneClientMessage,
  cloneEvent,
  cloneFilter,
  cloneRelayInformation,
} from "../../src/internal/clone.ts";
import type { NostrEvent, NostrFilter } from "../../src/types.ts";

Deno.test("cloneEvent - returns deep copy", () => {
  const original: NostrEvent = {
    id: "abc",
    pubkey: "pk1",
    kind: 1,
    content: "hello",
    created_at: 1700000000,
    tags: [["e", "ref1"], ["p", "pk2"]],
    sig: "sig1",
  };

  const clone = cloneEvent(original);

  assertEquals(clone, original);
  assertNotStrictEquals(clone, original);
  assertNotStrictEquals(clone.tags, original.tags);
  assertNotStrictEquals(clone.tags[0], original.tags[0]);

  // Mutating clone does not affect original
  clone.tags[0].push("modified");
  assertEquals(original.tags[0].length, 2);
});

Deno.test("cloneFilter - returns deep copy", () => {
  const original: NostrFilter = {
    kinds: [1, 2],
    authors: ["pk1"],
    "#e": ["ref1"],
  };

  const clone = cloneFilter(original);
  assertEquals(clone, original);

  clone.kinds!.push(3);
  assertEquals(original.kinds!.length, 2);
});

Deno.test("cloneClientMessage - EVENT message", () => {
  const event: NostrEvent = {
    id: "abc",
    pubkey: "pk1",
    kind: 1,
    content: "hello",
    created_at: 1700000000,
    tags: [["e", "ref1"]],
    sig: "sig1",
  };
  const original: ["EVENT", NostrEvent] = ["EVENT", event];

  const clone = cloneClientMessage(original);
  assertEquals(clone[0], "EVENT");
  assertEquals(clone[1], event);

  // Mutation isolation
  (clone[1] as NostrEvent).tags[0].push("modified");
  assertEquals(event.tags[0].length, 2);
});

Deno.test("cloneClientMessage - REQ message", () => {
  const original: ["REQ", string, NostrFilter] = [
    "REQ",
    "sub1",
    { kinds: [1] },
  ];
  const clone = cloneClientMessage(original);
  assertEquals(clone, original);

  (clone as ["REQ", string, NostrFilter])[2].kinds!.push(2);
  assertEquals(original[2].kinds!.length, 1);
});

Deno.test("cloneClientMessage - CLOSE message", () => {
  const original: ["CLOSE", string] = ["CLOSE", "sub1"];
  const clone = cloneClientMessage(original);
  assertEquals(clone, original);
  assertNotStrictEquals(clone, original);
});

Deno.test("cloneRelayInformation - returns deep copy", () => {
  const original = {
    name: "test relay",
    limitation: { max_message_length: 1024 },
  };

  const clone = cloneRelayInformation(original);
  assertEquals(clone, original);

  clone.limitation!.max_message_length = 2048;
  assertEquals(original.limitation!.max_message_length, 1024);
});
```

- [ ] **Step 2: Create `tests/internal/url_test.ts`**

```typescript
import { assertEquals } from "@std/assert";
import {
  getHeaderValue,
  getRequestUrl,
  httpToWsUrl,
  isNip11Request,
  normalizeUrl,
} from "../../src/internal/url.ts";

Deno.test("normalizeUrl - removes trailing slashes", () => {
  assertEquals(normalizeUrl("wss://relay.example.com/"), "wss://relay.example.com");
  assertEquals(normalizeUrl("wss://relay.example.com///"), "wss://relay.example.com");
  assertEquals(normalizeUrl("wss://relay.example.com"), "wss://relay.example.com");
});

Deno.test("httpToWsUrl - converts HTTP to WS", () => {
  assertEquals(httpToWsUrl("https://relay.example.com"), "wss://relay.example.com");
  assertEquals(httpToWsUrl("http://relay.example.com"), "ws://relay.example.com");
  assertEquals(httpToWsUrl("wss://relay.example.com"), "wss://relay.example.com");
});

Deno.test("getRequestUrl - from string", () => {
  assertEquals(getRequestUrl("https://example.com"), "https://example.com");
});

Deno.test("getRequestUrl - from URL", () => {
  assertEquals(
    getRequestUrl(new URL("https://example.com/path")),
    "https://example.com/path",
  );
});

Deno.test("getRequestUrl - from Request", () => {
  const req = new Request("https://example.com/api");
  assertEquals(getRequestUrl(req), "https://example.com/api");
});

Deno.test("getHeaderValue - from Headers object", () => {
  const headers = new Headers({ Accept: "application/json" });
  assertEquals(getHeaderValue(headers, "accept"), "application/json");
  assertEquals(getHeaderValue(headers, "missing"), null);
});

Deno.test("getHeaderValue - from array of tuples", () => {
  const headers: [string, string][] = [["Accept", "text/html"]];
  assertEquals(getHeaderValue(headers, "accept"), "text/html");
});

Deno.test("getHeaderValue - from plain object", () => {
  const headers = { "Content-Type": "application/json" };
  assertEquals(getHeaderValue(headers, "content-type"), "application/json");
});

Deno.test("getHeaderValue - undefined headers", () => {
  assertEquals(getHeaderValue(undefined, "accept"), null);
});

Deno.test("isNip11Request - with nostr+json accept header via init", () => {
  assertEquals(
    isNip11Request("https://relay.example.com", {
      headers: { Accept: "application/nostr+json" },
    }),
    true,
  );
});

Deno.test("isNip11Request - with nostr+json accept header via Request", () => {
  const req = new Request("https://relay.example.com", {
    headers: { Accept: "application/nostr+json" },
  });
  assertEquals(isNip11Request(req), true);
});

Deno.test("isNip11Request - without nostr+json header", () => {
  assertEquals(
    isNip11Request("https://relay.example.com", {
      headers: { Accept: "text/html" },
    }),
    false,
  );
});

Deno.test("isNip11Request - plain URL without headers", () => {
  assertEquals(isNip11Request("https://relay.example.com"), false);
});
```

- [ ] **Step 3: Create `tests/internal/validation_test.ts`**

```typescript
import { assertEquals } from "@std/assert";
import {
  isEventShape,
  isFilterShape,
  isRecord,
} from "../../src/internal/validation.ts";

Deno.test("isRecord - object returns true", () => {
  assertEquals(isRecord({}), true);
  assertEquals(isRecord({ a: 1 }), true);
});

Deno.test("isRecord - non-objects return false", () => {
  assertEquals(isRecord(null), false);
  assertEquals(isRecord(undefined), false);
  assertEquals(isRecord([1, 2]), false);
  assertEquals(isRecord("string"), false);
  assertEquals(isRecord(42), false);
});

Deno.test("isFilterShape - valid object", () => {
  assertEquals(isFilterShape({}), true);
  assertEquals(isFilterShape({ kinds: [1] }), true);
});

Deno.test("isFilterShape - rejects non-objects", () => {
  assertEquals(isFilterShape(null), false);
  assertEquals(isFilterShape([]), false);
});

Deno.test("isEventShape - valid event", () => {
  assertEquals(
    isEventShape({
      id: "abc",
      pubkey: "pk1",
      created_at: 1700000000,
      kind: 1,
      tags: [["e", "ref"]],
      content: "hello",
      sig: "sig1",
    }),
    true,
  );
});

Deno.test("isEventShape - missing fields", () => {
  assertEquals(isEventShape({}), false);
  assertEquals(isEventShape({ id: "abc" }), false);
});

Deno.test("isEventShape - wrong types", () => {
  assertEquals(
    isEventShape({
      id: 123, // should be string
      pubkey: "pk1",
      created_at: 1700000000,
      kind: 1,
      tags: [],
      content: "hello",
      sig: "sig1",
    }),
    false,
  );
});

Deno.test("isEventShape - invalid tags structure", () => {
  assertEquals(
    isEventShape({
      id: "abc",
      pubkey: "pk1",
      created_at: 1700000000,
      kind: 1,
      tags: [["e", 123]], // tag values must be strings
      content: "hello",
      sig: "sig1",
    }),
    false,
  );
});

Deno.test("isEventShape - rejects non-objects", () => {
  assertEquals(isEventShape(null), false);
  assertEquals(isEventShape([]), false);
  assertEquals(isEventShape("string"), false);
});
```

- [ ] **Step 4: Create `tests/internal/runtime_test.ts`**

```typescript
import { assertEquals } from "@std/assert";
import {
  systemClock,
  systemRandomSource,
  wallClockNow,
} from "../../src/internal/runtime.ts";

Deno.test("wallClockNow - returns a number close to Date.now()", () => {
  const before = Date.now();
  const result = wallClockNow();
  const after = Date.now();
  assertEquals(result >= before, true);
  assertEquals(result <= after, true);
});

Deno.test("systemClock.now - returns a number", () => {
  const result = systemClock.now();
  assertEquals(typeof result, "number");
  assertEquals(result > 0, true);
});

Deno.test("systemRandomSource.next - returns value in [0, 1)", () => {
  for (let i = 0; i < 10; i++) {
    const value = systemRandomSource.next();
    assertEquals(value >= 0 && value < 1, true);
  }
});

Deno.test("systemRandomSource.fill - fills bytes", () => {
  const bytes = new Uint8Array(16);
  systemRandomSource.fill(bytes);
  // At least some bytes should be non-zero (probabilistically)
  const hasNonZero = bytes.some((b) => b !== 0);
  assertEquals(hasNonZero, true);
});
```

- [ ] **Step 5: Create `tests/internal/search_test.ts`**

```typescript
import { assertEquals } from "@std/assert";
import {
  normalizeSearchText,
  tokenizeSearchText,
} from "../../src/internal/search.ts";

Deno.test("normalizeSearchText - lowercases and normalizes", () => {
  assertEquals(normalizeSearchText("Hello World"), "hello world");
});

Deno.test("normalizeSearchText - NFKC normalization", () => {
  // ﬁ → fi
  assertEquals(normalizeSearchText("ﬁnd"), "find");
});

Deno.test("normalizeSearchText - collapses separators", () => {
  assertEquals(normalizeSearchText("hello---world"), "hello world");
  assertEquals(normalizeSearchText("  hello  world  "), "hello world");
});

Deno.test("normalizeSearchText - empty string", () => {
  assertEquals(normalizeSearchText(""), "");
  assertEquals(normalizeSearchText("   "), "");
});

Deno.test("tokenizeSearchText - splits into unique tokens", () => {
  assertEquals(tokenizeSearchText("hello world"), ["hello", "world"]);
});

Deno.test("tokenizeSearchText - deduplicates", () => {
  assertEquals(tokenizeSearchText("hello hello world"), ["hello", "world"]);
});

Deno.test("tokenizeSearchText - empty string returns empty array", () => {
  assertEquals(tokenizeSearchText(""), []);
  assertEquals(tokenizeSearchText("   "), []);
});
```

- [ ] **Step 6: Run format and tests**

Run: `deno task fmt && deno test tests/internal/`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add tests/internal/
git commit -m "test: add unit tests for src/internal/ modules"
```

---

### Task 8: Unit tests for `src/platform/`

**Files:**
- Create: `tests/platform/global_hooks_test.ts`
- Create: `tests/platform/nip11_fetch_test.ts`
- Create: `tests/platform/pool_hooks_test.ts`

- [ ] **Step 1: Create `tests/platform/global_hooks_test.ts`**

```typescript
import { assertEquals } from "@std/assert";
import {
  captureGlobalHookSnapshot,
  installGlobalFetch,
  installGlobalWebSocket,
  restoreGlobalHookSnapshot,
} from "../../src/platform/global_hooks.ts";

Deno.test("global hooks - capture and restore cycle", () => {
  const snapshot = captureGlobalHookSnapshot();
  const originalWs = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;

  // Install replacements
  const fakeWs = class FakeWs {} as unknown as typeof WebSocket;
  installGlobalWebSocket(fakeWs);
  assertEquals(globalThis.WebSocket, fakeWs);

  const fakeFetch = (() => {}) as unknown as typeof fetch;
  installGlobalFetch(fakeFetch);
  assertEquals(globalThis.fetch, fakeFetch);

  // Restore
  restoreGlobalHookSnapshot(snapshot);
  assertEquals(globalThis.WebSocket, originalWs);
  assertEquals(globalThis.fetch, originalFetch);
});
```

- [ ] **Step 2: Create `tests/platform/nip11_fetch_test.ts`**

```typescript
import { assertEquals } from "@std/assert";
import {
  createNip11FetchHandler,
  createNip11Response,
} from "../../src/platform/nip11_fetch.ts";
import type { RelayInformation } from "../../src/types.ts";

Deno.test("createNip11Response - returns correct JSON response", async () => {
  const info: RelayInformation = { name: "test relay", version: "1.0" };
  const response = createNip11Response(info);

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Content-Type"),
    "application/nostr+json",
  );
  const body = await response.json();
  assertEquals(body, info);
});

Deno.test("createNip11FetchHandler - intercepts NIP-11 requests", async () => {
  const info: RelayInformation = { name: "mock relay" };

  const handler = createNip11FetchHandler(
    (url) =>
      url === "wss://relay.example.com"
        ? { getInfo: () => info }
        : undefined,
    () => Promise.resolve(new Response("fallback")),
  );

  const response = await handler("https://relay.example.com", {
    headers: { Accept: "application/nostr+json" },
  });

  const body = await response.json();
  assertEquals(body.name, "mock relay");
});

Deno.test("createNip11FetchHandler - passes through non-NIP-11 requests", async () => {
  const handler = createNip11FetchHandler(
    () => undefined,
    () => Promise.resolve(new Response("original")),
  );

  const response = await handler("https://example.com", {
    headers: { Accept: "text/html" },
  });

  assertEquals(await response.text(), "original");
});

Deno.test("createNip11FetchHandler - passes through unknown relays", async () => {
  const handler = createNip11FetchHandler(
    () => undefined,
    () => Promise.resolve(new Response("fallback")),
  );

  const response = await handler("https://unknown.relay.com", {
    headers: { Accept: "application/nostr+json" },
  });

  assertEquals(await response.text(), "fallback");
});
```

- [ ] **Step 3: Create `tests/platform/pool_hooks_test.ts`**

```typescript
import { assertEquals, assertThrows } from "@std/assert";
import { installPoolHooks } from "../../src/platform/pool_hooks.ts";
import { MockWebSocket } from "../../src/websocket.ts";

Deno.test("installPoolHooks - installs and uninstalls correctly", () => {
  const originalWs = globalThis.WebSocket;

  const installation = installPoolHooks(() => undefined);

  assertEquals(installation.installed, true);
  assertEquals(globalThis.WebSocket, MockWebSocket);

  installation.uninstall();

  assertEquals(installation.installed, false);
  assertEquals(globalThis.WebSocket, originalWs);
});

Deno.test("installPoolHooks - double install throws", () => {
  const installation = installPoolHooks(() => undefined);

  try {
    assertThrows(
      () => installPoolHooks(() => undefined),
      Error,
      "Another MockPool instance is already installed",
    );
  } finally {
    installation.uninstall();
  }
});

Deno.test("installPoolHooks - double uninstall throws", () => {
  const installation = installPoolHooks(() => undefined);
  installation.uninstall();

  assertThrows(
    () => installation.uninstall(),
    Error,
    "MockPool is not installed",
  );
});
```

- [ ] **Step 4: Run format and tests**

Run: `deno task fmt && deno test tests/platform/`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/platform/
git commit -m "test: add unit tests for src/platform/ modules"
```

---

## Phase 3: Infrastructure + Version Bump

### Task 9: Add GitHub Releases auto-creation

**Files:**
- Create: `.github/release.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/release.yml`**

```yaml
changelog:
  categories:
    - title: "New Features"
      labels: ["feat", "feature", "enhancement"]
    - title: "Bug Fixes"
      labels: ["fix", "bug", "bugfix"]
    - title: "Performance"
      labels: ["perf", "performance"]
    - title: "Documentation"
      labels: ["docs", "documentation"]
    - title: "Other Changes"
      labels: ["*"]
```

- [ ] **Step 2: Add `create-release` job to `.github/workflows/ci.yml`**

Add after the `publish-npm` job block (before the deploy-docs section):

```yaml
  create-release:
    name: Create GitHub Release
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [publish-jsr, publish-npm]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - name: Create release with auto-generated notes
        run: gh release create "${{ github.ref_name }}" --generate-notes
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/release.yml .github/workflows/ci.yml
git commit -m "ci: add automatic GitHub Release creation on tag push"
```

---

### Task 10: Version bump and final verification

**Files:**
- Modify: `deno.json`

- [ ] **Step 1: Update version in `deno.json`**

Change `"version": "0.4.0"` to `"version": "0.5.0"`.

- [ ] **Step 2: Run full quality check**

Run: `deno task fmt`
Expected: No changes needed.

Run: `deno task test`
Expected: All tests pass.

Run: `deno task check`
Expected: Clean.

Run: `deno task coverage`
Expected: All files >= 80%. Overall >= 93%.

- [ ] **Step 3: Run E2E tests**

Run: `deno task test:all`
Expected: All pass (unit + E2E).

- [ ] **Step 4: Verify JSR publish dry-run**

Run: `deno publish --dry-run --allow-dirty`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add deno.json
git commit -m "chore: bump version to 0.5.0"
```
