/**
 * Compiles filters into reusable matchers and collection strategies.
 *
 * @module
 */

import { normalizeSearchText, tokenizeSearchText } from "../internal/search.ts";
import type { NostrEvent, NostrFilter } from "../types.ts";

export interface CompiledTagFilter {
  readonly tagName: string;
  readonly values: ReadonlySet<string>;
}

export interface OrderedEvent {
  readonly event: NostrEvent;
  readonly order: number;
}

export interface CompiledFilter {
  readonly filter: NostrFilter;
  readonly ids: readonly string[] | null;
  readonly authors: readonly string[] | null;
  readonly kinds: readonly number[] | null;
  readonly tagFilters: readonly CompiledTagFilter[];
  readonly normalizedSearch: string | null;
  readonly searchTokens: readonly string[];
  readonly limit: number | null;
  matches(event: NostrEvent): boolean;
}

export function compareOrderedEvents(a: OrderedEvent, b: OrderedEvent): number {
  if (a.event.created_at !== b.event.created_at) {
    return b.event.created_at - a.event.created_at;
  }
  return a.order - b.order;
}

function matchesTagFilter(
  event: NostrEvent,
  tagFilter: CompiledTagFilter,
): boolean {
  for (const tag of event.tags) {
    if (tag[0] === tagFilter.tagName && tagFilter.values.has(tag[1] ?? "")) {
      return true;
    }
  }
  return false;
}

export function compileFilter(filter: NostrFilter): CompiledFilter {
  const ids = filter.ids?.length ? [...filter.ids] : null;
  const authors = filter.authors?.length ? [...filter.authors] : null;
  const kinds = filter.kinds?.length ? [...new Set(filter.kinds)] : null;
  const kindSet = kinds ? new Set(kinds) : null;
  const since = filter.since;
  const until = filter.until;
  const normalizedSearch = filter.search !== undefined
    ? normalizeSearchText(filter.search)
    : null;
  const searchTokens = filter.search !== undefined
    ? tokenizeSearchText(filter.search)
    : [];
  const limit = filter.limit !== undefined && filter.limit >= 0
    ? filter.limit
    : null;

  const tagFilters: CompiledTagFilter[] = [];
  for (const [key, values] of Object.entries(filter)) {
    if (
      key.startsWith("#") && key.length >= 2 && values !== undefined &&
      values.length > 0
    ) {
      tagFilters.push({
        tagName: key.slice(1),
        values: new Set(values),
      });
    }
  }

  return {
    filter,
    ids,
    authors,
    kinds,
    tagFilters,
    normalizedSearch,
    searchTokens,
    limit,
    matches(event: NostrEvent): boolean {
      if (ids && !ids.some((prefix) => event.id.startsWith(prefix))) {
        return false;
      }

      if (
        authors && !authors.some((prefix) => event.pubkey.startsWith(prefix))
      ) {
        return false;
      }

      if (kindSet && !kindSet.has(event.kind)) {
        return false;
      }

      if (since !== undefined && event.created_at < since) {
        return false;
      }

      if (until !== undefined && event.created_at > until) {
        return false;
      }

      if (
        normalizedSearch !== null && normalizedSearch !== "" &&
        !normalizeSearchText(event.content).includes(normalizedSearch)
      ) {
        return false;
      }

      for (const tagFilter of tagFilters) {
        if (!matchesTagFilter(event, tagFilter)) {
          return false;
        }
      }

      return true;
    },
  };
}

export function collectMatchingEventsFromOrderedEvents(
  orderedEvents: Iterable<OrderedEvent>,
  compiled: CompiledFilter,
  orderedCandidatesAreSorted = false,
): NostrEvent[] {
  if (compiled.limit === 0) {
    return [];
  }

  if (orderedCandidatesAreSorted) {
    const matched: NostrEvent[] = [];
    for (const candidate of orderedEvents) {
      if (!compiled.matches(candidate.event)) {
        continue;
      }

      matched.push(candidate.event);
      if (compiled.limit !== null && matched.length >= compiled.limit) {
        break;
      }
    }
    return matched;
  }

  if (compiled.limit === null) {
    const matched: OrderedEvent[] = [];
    for (const candidate of orderedEvents) {
      if (compiled.matches(candidate.event)) {
        matched.push(candidate);
      }
    }
    matched.sort(compareOrderedEvents);
    return matched.map(({ event }) => event);
  }

  const top: OrderedEvent[] = [];
  for (const candidate of orderedEvents) {
    if (!compiled.matches(candidate.event)) {
      continue;
    }

    if (
      top.length === compiled.limit &&
      compareOrderedEvents(candidate, top[top.length - 1]) >= 0
    ) {
      continue;
    }

    let insertIndex = top.length;
    for (let i = 0; i < top.length; i++) {
      if (compareOrderedEvents(candidate, top[i]) < 0) {
        insertIndex = i;
        break;
      }
    }

    top.splice(insertIndex, 0, candidate);
    if (top.length > compiled.limit) {
      top.pop();
    }
  }

  return top.map(({ event }) => event);
}

export function collectMatchingEvents(
  events: NostrEvent[],
  compiled: CompiledFilter,
): NostrEvent[] {
  return collectMatchingEventsFromOrderedEvents(
    events.map((event, order) => ({ event, order })),
    compiled,
  );
}

export function collectMatchingIdsForCountFromOrderedEvents(
  orderedEvents: Iterable<OrderedEvent>,
  compiled: CompiledFilter,
  orderedCandidatesAreSorted = false,
): string[] {
  if (compiled.limit === 0) {
    return [];
  }

  if (orderedCandidatesAreSorted) {
    const ids: string[] = [];
    for (const candidate of orderedEvents) {
      if (!compiled.matches(candidate.event)) {
        continue;
      }

      ids.push(candidate.event.id);
      if (compiled.limit !== null && ids.length >= compiled.limit) {
        break;
      }
    }
    return ids;
  }

  if (compiled.limit === null) {
    const ids: string[] = [];
    for (const candidate of orderedEvents) {
      if (compiled.matches(candidate.event)) {
        ids.push(candidate.event.id);
      }
    }
    return ids;
  }

  return collectMatchingEventsFromOrderedEvents(orderedEvents, compiled).map((
    event,
  ) => event.id);
}

export function collectMatchingIdsForCount(
  events: NostrEvent[],
  compiled: CompiledFilter,
): string[] {
  return collectMatchingIdsForCountFromOrderedEvents(
    events.map((event, order) => ({ event, order })),
    compiled,
  );
}
