/**
 * Timer-backed delivery scheduling for relay responses.
 *
 * Delayed deliveries are batch-flushed through a single relay-level timer so
 * fanout does not allocate one timer per payload.
 *
 * @module
 */

import { wallClockNow } from "../internal/runtime.ts";
import type { MockWebSocket } from "../websocket.ts";

interface ScheduledTaskEntry {
  kind: "task";
  dueAt: number;
  sequence: number;
  task: () => void;
}

interface ScheduledDeliveryEntry {
  kind: "delivery";
  dueAt: number;
  sequence: number;
  socket: MockWebSocket;
  payload: string;
}

type ScheduledEntry = ScheduledTaskEntry | ScheduledDeliveryEntry;

export interface DeliverySchedulerProfile {
  scheduledTimerCount: number;
  immediateDeliveryCount: number;
  delayedDeliveryCount: number;
  activeTimerCount: number;
  peakActiveTimerCount: number;
}

export class DeliveryScheduler {
  #entries: ScheduledEntry[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #nextDueAt: number | undefined;
  #nextSequence = 0;
  #scheduledTimerCount = 0;
  #immediateDeliveryCount = 0;
  #delayedDeliveryCount = 0;
  #peakActiveTimerCount = 0;

  schedule(delayMs: number, task: () => void): void {
    this.#enqueue({ kind: "task", task }, Math.max(0, delayMs));
  }

  deliver(socket: MockWebSocket, payload: string, delayMs: number): void {
    if (delayMs > 0) {
      this.#delayedDeliveryCount += 1;
      this.#enqueue(
        { kind: "delivery", socket, payload },
        delayMs,
      );
      return;
    }

    this.#immediateDeliveryCount += 1;
    queueMicrotask(() => socket._receiveMessage(payload));
  }

  cancelSocket(socket: MockWebSocket): void {
    const remaining = this.#entries.filter((entry) => {
      return entry.kind !== "delivery" || entry.socket !== socket;
    });
    if (remaining.length === this.#entries.length) {
      return;
    }

    this.#entries = remaining;
    if (this.#entries.length === 0) {
      this.#clearTimer();
      return;
    }

    this.#rescheduleNextTimer();
  }

  profile(): DeliverySchedulerProfile {
    return {
      scheduledTimerCount: this.#scheduledTimerCount,
      immediateDeliveryCount: this.#immediateDeliveryCount,
      delayedDeliveryCount: this.#delayedDeliveryCount,
      activeTimerCount: this.#timer === undefined ? 0 : 1,
      peakActiveTimerCount: this.#peakActiveTimerCount,
    };
  }

  clear(): void {
    this.#entries = [];
    this.#clearTimer();
  }

  #enqueue(
    entry:
      | Omit<ScheduledTaskEntry, "dueAt" | "sequence">
      | Omit<ScheduledDeliveryEntry, "dueAt" | "sequence">,
    delayMs: number,
  ): void {
    const dueAt = wallClockNow() + delayMs;
    this.#entries.push({
      ...entry,
      dueAt,
      sequence: this.#nextSequence++,
    } as ScheduledEntry);

    if (this.#timer === undefined) {
      this.#scheduleNextTimer();
      return;
    }

    if (this.#nextDueAt === undefined || dueAt < this.#nextDueAt) {
      this.#rescheduleNextTimer();
    }
  }

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
      if (a.dueAt !== b.dueAt) {
        return a.dueAt - b.dueAt;
      }
      return a.sequence - b.sequence;
    });

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

  #rescheduleNextTimer(): void {
    this.#clearTimer();
    this.#scheduleNextTimer();
  }

  #scheduleNextTimer(): void {
    const dueAt = this.#findEarliestDueAt();
    if (dueAt === undefined) {
      return;
    }

    this.#nextDueAt = dueAt;
    this.#scheduledTimerCount += 1;
    this.#timer = setTimeout(
      () => this.#flushDueEntries(),
      Math.max(0, dueAt - wallClockNow()),
    );
    this.#peakActiveTimerCount = Math.max(this.#peakActiveTimerCount, 1);
  }

  #findEarliestDueAt(): number | undefined {
    if (this.#entries.length === 0) {
      return undefined;
    }

    let earliest = this.#entries[0]!.dueAt;
    for (const entry of this.#entries) {
      if (entry.dueAt < earliest) {
        earliest = entry.dueAt;
      }
    }
    return earliest;
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#nextDueAt = undefined;
  }
}
