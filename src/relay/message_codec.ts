/**
 * Client message parsing and validation.
 *
 * @module
 */

import type { ClientMessage } from "../types.ts";
import { isEventShape, isFilterShape } from "../internal/validation.ts";
import {
  eventContentExceedsMax,
  eventTagsExceedMax,
  filterCountExceedsLimit,
  filterLimitExceedsMax,
  filterMustBeObject,
  invalidJson,
  invalidMessageFormat,
  malformedMessage,
  messageExceedsMaxLength,
  requiresAtLeastOneFilter,
  subscriptionIdExceedsMaxLength,
} from "./error_messages.ts";

export type ParsedClientMessage = ClientMessage | [unknown, ...unknown[]];

export interface MessageValidationLimits {
  maxMessageLength?: number;
  maxFilterCount?: number;
  maxSubIdLength?: number;
  maxLimitValue?: number;
  maxEventTags?: number;
  maxContentLength?: number;
}

export const DEFAULT_MESSAGE_VALIDATION_LIMITS: Required<
  MessageValidationLimits
> = {
  maxMessageLength: 1024 * 1024,
  maxFilterCount: 32,
  maxSubIdLength: 256,
  maxLimitValue: 10_000,
  maxEventTags: 2048,
  maxContentLength: 256 * 1024,
};

export interface ParseClientMessageSuccess {
  ok: true;
  message: ParsedClientMessage;
}

export interface ParseClientMessageError {
  ok: false;
  error: string;
  logRawInput: boolean;
}

export type ParseClientMessageResult =
  | ParseClientMessageSuccess
  | ParseClientMessageError;

const TEXT_ENCODER = new TextEncoder();

function byteLength(value: string): number {
  return TEXT_ENCODER.encode(value).byteLength;
}

function getLimit(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function resolveLimits(
  limits: MessageValidationLimits | undefined,
): Required<MessageValidationLimits> {
  return {
    maxMessageLength: getLimit(
      limits?.maxMessageLength,
      DEFAULT_MESSAGE_VALIDATION_LIMITS.maxMessageLength,
    ),
    maxFilterCount: getLimit(
      limits?.maxFilterCount,
      DEFAULT_MESSAGE_VALIDATION_LIMITS.maxFilterCount,
    ),
    maxSubIdLength: getLimit(
      limits?.maxSubIdLength,
      DEFAULT_MESSAGE_VALIDATION_LIMITS.maxSubIdLength,
    ),
    maxLimitValue: getLimit(
      limits?.maxLimitValue,
      DEFAULT_MESSAGE_VALIDATION_LIMITS.maxLimitValue,
    ),
    maxEventTags: getLimit(
      limits?.maxEventTags,
      DEFAULT_MESSAGE_VALIDATION_LIMITS.maxEventTags,
    ),
    maxContentLength: getLimit(
      limits?.maxContentLength,
      DEFAULT_MESSAGE_VALIDATION_LIMITS.maxContentLength,
    ),
  };
}

function validateEventLimits(
  type: "EVENT" | "AUTH",
  event: unknown,
  limits: Required<MessageValidationLimits>,
): ParseClientMessageError | null {
  if (!isEventShape(event)) {
    return {
      ok: false,
      error: malformedMessage(type),
      logRawInput: false,
    };
  }

  const validEvent = event as { tags: string[][]; content: string };

  if (validEvent.tags.length > limits.maxEventTags) {
    return {
      ok: false,
      error: eventTagsExceedMax(type),
      logRawInput: false,
    };
  }

  if (byteLength(validEvent.content) > limits.maxContentLength) {
    return {
      ok: false,
      error: eventContentExceedsMax(type),
      logRawInput: false,
    };
  }

  return null;
}

function validateFilterLimit(
  type: "REQ" | "COUNT",
  filter: Record<string, unknown>,
  index: number,
  limits: Required<MessageValidationLimits>,
): ParseClientMessageError | null {
  const limitValue = filter.limit;
  if (
    typeof limitValue === "number" && Number.isFinite(limitValue) &&
    limitValue > limits.maxLimitValue
  ) {
    return {
      ok: false,
      error: filterLimitExceedsMax(type, index),
      logRawInput: false,
    };
  }

  return null;
}

export function parseClientMessage(
  data: string,
  limits?: MessageValidationLimits,
): ParseClientMessageResult {
  const resolvedLimits = resolveLimits(limits);

  if (byteLength(data) > resolvedLimits.maxMessageLength) {
    return {
      ok: false,
      error: messageExceedsMaxLength(),
      logRawInput: false,
    };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(data);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: invalidJson(detail),
      logRawInput: true,
    };
  }

  if (!Array.isArray(raw) || raw.length < 1) {
    return {
      ok: false,
      error: invalidMessageFormat(),
      logRawInput: true,
    };
  }

  const type = raw[0];

  if (type === "EVENT") {
    if (raw.length < 2) {
      return {
        ok: false,
        error: malformedMessage("EVENT"),
        logRawInput: false,
      };
    }

    const error = validateEventLimits("EVENT", raw[1], resolvedLimits);
    if (error) {
      return error;
    }
  } else if (type === "REQ" || type === "COUNT") {
    if (raw.length < 2 || typeof raw[1] !== "string") {
      return {
        ok: false,
        error: malformedMessage(type),
        logRawInput: false,
      };
    }

    if (byteLength(raw[1]) > resolvedLimits.maxSubIdLength) {
      return {
        ok: false,
        error: subscriptionIdExceedsMaxLength(type),
        logRawInput: false,
      };
    }

    if (raw.length < 3) {
      return {
        ok: false,
        error: requiresAtLeastOneFilter(type),
        logRawInput: false,
      };
    }

    if (raw.length - 2 > resolvedLimits.maxFilterCount) {
      return {
        ok: false,
        error: filterCountExceedsLimit(type),
        logRawInput: false,
      };
    }

    for (let i = 2; i < raw.length; i++) {
      if (!isFilterShape(raw[i])) {
        return {
          ok: false,
          error: filterMustBeObject(type, i - 2),
          logRawInput: false,
        };
      }

      const error = validateFilterLimit(
        type,
        raw[i],
        i - 2,
        resolvedLimits,
      );
      if (error) {
        return error;
      }
    }
  } else if (type === "CLOSE") {
    if (raw.length < 2 || typeof raw[1] !== "string") {
      return {
        ok: false,
        error: malformedMessage("CLOSE"),
        logRawInput: false,
      };
    }

    if (byteLength(raw[1]) > resolvedLimits.maxSubIdLength) {
      return {
        ok: false,
        error: subscriptionIdExceedsMaxLength("CLOSE"),
        logRawInput: false,
      };
    }
  } else if (type === "AUTH") {
    if (raw.length < 2) {
      return {
        ok: false,
        error: malformedMessage("AUTH"),
        logRawInput: false,
      };
    }

    const error = validateEventLimits("AUTH", raw[1], resolvedLimits);
    if (error) {
      return error;
    }
  }

  return {
    ok: true,
    message: raw as ParsedClientMessage,
  };
}
