/**
 * Relay internal modules barrel export.
 *
 * 内部モジュール専用。公開 API (`src/mod.ts`) からは re-export しない。
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
  eventContentExceedsMax,
  eventTagsExceedMax,
  filterCountExceedsLimit,
  filterLimitExceedsMax,
  filterMustBeObject,
  internalProcessingError,
  INVALID_BAD_SIGNATURE,
  invalidJson,
  invalidMessageFormat,
  malformedMessage,
  messageExceedsMaxLength,
  relayRuntimeError,
  requiresAtLeastOneFilter,
  SIMULATED_ERROR,
  subscriptionIdExceedsMaxLength,
  unsupportedMessageType,
} from "./error_messages.ts";
export { EventStore } from "./event_store.ts";
export type {
  EventStoreQueryProfile,
  EventStoreSnapshot,
  PublishEventResult,
  PublishEventStatus,
} from "./event_store.ts";
export {
  collectMatchingEvents,
  collectMatchingEventsFromOrderedEvents,
  collectMatchingIdsForCount,
  collectMatchingIdsForCountFromOrderedEvents,
  compareOrderedEvents,
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
  ParseClientMessageError,
  ParseClientMessageResult,
  ParseClientMessageSuccess,
  ParsedClientMessage,
} from "./message_codec.ts";
export { RelayInspector } from "./relay_inspector.ts";
export type { AuthResultRecord } from "./relay_inspector.ts";
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
