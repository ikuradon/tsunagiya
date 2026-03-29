/**
 * Default runtime dependencies.
 *
 * @module
 */

import type { Clock, RandomSource } from "../types.ts";

export function wallClockNow(): number {
  return Date.now();
}

export const systemClock: Clock = {
  now(): number {
    return wallClockNow();
  },
};

export const systemRandomSource: RandomSource = {
  next(): number {
    return Math.random();
  },
  fill(bytes: Uint8Array): void {
    crypto.getRandomValues(bytes);
  },
};
