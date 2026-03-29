/**
 * Shared relay response builders.
 *
 * @module
 */

import type { NostrEvent } from "../types.ts";

export function noticeMessage(message: string): ["NOTICE", string] {
  return ["NOTICE", message];
}

export function okMessage(
  eventId: string,
  accepted: boolean,
  message: string,
): ["OK", string, boolean, string] {
  return ["OK", eventId, accepted, message];
}

export function closedMessage(
  subId: string,
  message: string,
): ["CLOSED", string, string] {
  return ["CLOSED", subId, message];
}

export function eventMessage(
  subId: string,
  event: NostrEvent,
): ["EVENT", string, NostrEvent] {
  return ["EVENT", subId, event];
}

export function eoseMessage(subId: string): ["EOSE", string] {
  return ["EOSE", subId];
}

export function countMessage(
  subId: string,
  result: { count: number },
): ["COUNT", string, { count: number }] {
  return ["COUNT", subId, result];
}
