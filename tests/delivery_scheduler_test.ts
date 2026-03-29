import { assertEquals } from "@std/assert";

import { DeliveryScheduler } from "../src/relay/delivery_scheduler.ts";
import type { RandomSource } from "../src/types.ts";
import { waitFor } from "../src/testing/wait.ts";

function makeFixedRandom(value: number): RandomSource {
  return {
    next: () => value,
    fill: (bytes: Uint8Array) => bytes.fill(0),
  };
}

function createSocket() {
  const received: string[] = [];
  return {
    socket: {
      _receiveMessage(payload: string) {
        received.push(payload);
      },
    },
    received,
  };
}

Deno.test("DeliveryScheduler - zero-delay delivery uses microtasks without timers", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();

  scheduler.deliver(target.socket as never, "payload", 0);

  assertEquals(scheduler.profile(), {
    scheduledTimerCount: 0,
    immediateDeliveryCount: 1,
    delayedDeliveryCount: 0,
    activeTimerCount: 0,
    peakActiveTimerCount: 0,
  });

  await waitFor(() => target.received.length === 1);
  assertEquals(target.received, ["payload"]);
  assertEquals(scheduler.profile().activeTimerCount, 0);
});

Deno.test("DeliveryScheduler - delayed fanout batch-flushes through one relay timer", async () => {
  const scheduler = new DeliveryScheduler();
  const targets = Array.from({ length: 8 }, () => createSocket());

  for (const [index, target] of targets.entries()) {
    scheduler.deliver(target.socket as never, `payload-${index}`, 20);
  }

  assertEquals(scheduler.profile(), {
    scheduledTimerCount: 1,
    immediateDeliveryCount: 0,
    delayedDeliveryCount: 8,
    activeTimerCount: 1,
    peakActiveTimerCount: 1,
  });

  await waitFor(
    () => targets.every((target) => target.received.length === 1),
    { timeout: 2000 },
  );

  assertEquals(scheduler.profile().activeTimerCount, 0);
  assertEquals(
    targets.map((target) => target.received[0]),
    Array.from({ length: 8 }, (_, index) => `payload-${index}`),
  );
});

Deno.test("DeliveryScheduler - delayed deliveries to one socket preserve enqueue order", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();

  scheduler.deliver(target.socket as never, "payload-1", 20);
  scheduler.deliver(target.socket as never, "payload-2", 20);
  scheduler.deliver(target.socket as never, "payload-3", 20);

  assertEquals(scheduler.profile(), {
    scheduledTimerCount: 1,
    immediateDeliveryCount: 0,
    delayedDeliveryCount: 3,
    activeTimerCount: 1,
    peakActiveTimerCount: 1,
  });

  await waitFor(() => target.received.length === 3, { timeout: 2000 });
  assertEquals(target.received, ["payload-1", "payload-2", "payload-3"]);
});

Deno.test("DeliveryScheduler - cancelSocket drops pending deliveries and clears timer", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();

  scheduler.deliver(target.socket as never, "payload", 30);
  assertEquals(scheduler.profile().activeTimerCount, 1);

  scheduler.cancelSocket(target.socket as never);
  assertEquals(scheduler.profile().activeTimerCount, 0);

  await new Promise<void>((resolve) => setTimeout(resolve, 60));
  assertEquals(target.received, []);
});

Deno.test("DeliveryScheduler - schedule and delayed fanout share one relay timer", async () => {
  const scheduler = new DeliveryScheduler();
  const targets = Array.from({ length: 4 }, () => createSocket());
  let disconnectCount = 0;

  for (const [index, target] of targets.entries()) {
    scheduler.deliver(target.socket as never, `delayed-${index}`, 30);
  }
  scheduler.schedule(30, () => {
    disconnectCount += 1;
  });

  assertEquals(scheduler.profile(), {
    scheduledTimerCount: 1,
    immediateDeliveryCount: 0,
    delayedDeliveryCount: 4,
    activeTimerCount: 1,
    peakActiveTimerCount: 1,
  });

  await waitFor(
    () =>
      disconnectCount === 1 &&
      targets.every((target) => target.received.length === 1),
    { timeout: 2000 },
  );

  assertEquals(scheduler.profile().activeTimerCount, 0);
  assertEquals(disconnectCount, 1);
});

// ===== deliverWithJitter =====

Deno.test("DeliveryScheduler - deliverWithJitter applies jitter to delay", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();
  const random = makeFixedRandom(0.75); // jitter = (0.75*2-1)*10 = +5

  scheduler.deliverWithJitter(target.socket as never, "msg1", {
    baseDelay: 20,
    jitter: 10,
    random,
  });

  assertEquals(target.received.length, 0);
  await waitFor(() => target.received.length === 1, { timeout: 200 });
  assertEquals(target.received, ["msg1"]);
  scheduler.clear();
});

Deno.test("DeliveryScheduler - deliverWithJitter clamps negative delay to immediate", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();
  const random = makeFixedRandom(0.0); // jitter = (0*2-1)*100 = -100

  scheduler.deliverWithJitter(target.socket as never, "msg1", {
    baseDelay: 10,
    jitter: 100,
    random,
  });

  // Clamped to 0 → immediate via queueMicrotask
  assertEquals(scheduler.profile().immediateDeliveryCount, 1);
  await waitFor(() => target.received.length === 1);
  assertEquals(target.received, ["msg1"]);
  scheduler.clear();
});

Deno.test("DeliveryScheduler - deliverWithJitter with zero jitter", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();
  const random = makeFixedRandom(0.5);

  scheduler.deliverWithJitter(target.socket as never, "msg1", {
    baseDelay: 15,
    jitter: 0,
    random,
  });

  assertEquals(scheduler.profile().delayedDeliveryCount, 1);
  await waitFor(() => target.received.length === 1, { timeout: 200 });
  assertEquals(target.received, ["msg1"]);
  scheduler.clear();
});

// ===== Out-of-order delivery =====

Deno.test("DeliveryScheduler - outOfOrderRate 0 preserves FIFO order", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();
  const random = makeFixedRandom(0.5);

  for (const label of ["A", "B", "C"]) {
    scheduler.deliverWithJitter(target.socket as never, label, {
      baseDelay: 15,
      jitter: 0,
      random,
      outOfOrderRate: 0,
    });
  }

  await waitFor(() => target.received.length === 3, { timeout: 200 });
  assertEquals(target.received, ["A", "B", "C"]);
  scheduler.clear();
});

Deno.test("DeliveryScheduler - outOfOrderRate > 0 shuffles deliveries", async () => {
  const scheduler = new DeliveryScheduler();
  const target = createSocket();

  // Use a random that will cause Fisher-Yates to swap entries
  let callIndex = 0;
  const randomValues = [0.5, 0.5, 0.5, 0.1, 0.9]; // for jitter + shuffle
  const shuffleRandom: RandomSource = {
    next: () => randomValues[callIndex++ % randomValues.length],
    fill: (bytes: Uint8Array) => bytes.fill(0),
  };

  for (const label of ["A", "B", "C"]) {
    scheduler.deliverWithJitter(target.socket as never, label, {
      baseDelay: 15,
      jitter: 0,
      random: shuffleRandom,
      outOfOrderRate: 1.0,
    });
  }

  await waitFor(() => target.received.length === 3, { timeout: 200 });
  // All 3 messages delivered (order may vary due to shuffle)
  assertEquals(new Set(target.received), new Set(["A", "B", "C"]));
  scheduler.clear();
});
