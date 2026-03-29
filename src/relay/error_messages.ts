/**
 * Shared relay error messages.
 *
 * @module
 */

export const SIMULATED_ERROR = "error: simulated error";
export const INVALID_BAD_SIGNATURE = "invalid: bad signature";
export const BLOCKED_EVENT_WAS_DELETED = "blocked: event was deleted";
export const DUPLICATE_ALREADY_HAVE_NEWER_EVENT =
  "duplicate: already have a newer event";
export const AUTH_REQUIRED_AUTHENTICATION_REQUIRED =
  "auth-required: authentication required";
export const AUTH_REQUIRED_NO_CHALLENGE_ISSUED =
  "auth-required: no challenge issued";
export const AUTH_REQUIRED_INVALID_AUTH_EVENT_KIND =
  "auth-required: invalid auth event kind";
export const AUTH_REQUIRED_CHALLENGE_MISMATCH =
  "auth-required: challenge mismatch";
export const AUTH_REQUIRED_VALIDATION_FAILED =
  "auth-required: validation failed";
export const AUTH_REQUIRED_RELAY_URL_MISMATCH =
  "auth-required: relay URL mismatch";

export function invalidJson(detail: string): string {
  return `error: invalid JSON (${detail})`;
}

export function invalidMessageFormat(): string {
  return "error: invalid message format";
}

export function malformedMessage(
  type: "EVENT" | "REQ" | "COUNT" | "CLOSE" | "AUTH",
): string {
  return `error: malformed ${type} message`;
}

export function requiresAtLeastOneFilter(type: "REQ" | "COUNT"): string {
  return `error: ${type} requires at least one filter`;
}

export function filterMustBeObject(
  type: "REQ" | "COUNT",
  index: number,
): string {
  return `error: ${type} filter[${index}] must be an object`;
}

export function filterCountExceedsLimit(type: "REQ" | "COUNT"): string {
  return `error: ${type} exceeds filter count limit`;
}

export function filterLimitExceedsMax(
  type: "REQ" | "COUNT",
  index: number,
): string {
  return `error: ${type} filter[${index}] limit exceeds max_limit`;
}

export function subscriptionIdExceedsMaxLength(
  type: "REQ" | "COUNT" | "CLOSE",
): string {
  return `error: ${type} subscription id exceeds max_subid_length`;
}

export function eventTagsExceedMax(
  type: "EVENT" | "AUTH",
): string {
  return `error: ${type} tags exceed max_event_tags`;
}

export function eventContentExceedsMax(
  type: "EVENT" | "AUTH",
): string {
  return `error: ${type} content exceeds max_content_length`;
}

export function messageExceedsMaxLength(): string {
  return "error: message exceeds max_message_length";
}

export function unsupportedMessageType(type: unknown): string {
  return `error: unsupported message type: ${String(type)}`;
}

export function internalProcessingError(
  operation: "EVENT" | "REQ" | "AUTH" | "COUNT",
  detail: string,
): string {
  return `error: internal error processing ${operation} (${detail})`;
}

export function relayRuntimeError(detail: string): string {
  return `error: ${detail}`;
}
