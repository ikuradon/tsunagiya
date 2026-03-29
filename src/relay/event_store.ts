/**
 * Event storage and NIP-specific mutation rules.
 *
 * @module
 */

import { cloneEvent } from "../internal/clone.ts";
import { tokenizeSearchText } from "../internal/search.ts";
import {
  classifyEvent,
  getParameterizedId,
  isParameterizedReplaceable,
  isReplaceable,
} from "../event_kind.ts";
import {
  collectMatchingEvents,
  collectMatchingEventsFromOrderedEvents,
  collectMatchingIdsForCount,
  collectMatchingIdsForCountFromOrderedEvents,
  compareOrderedEvents,
  type CompiledFilter,
  type CompiledTagFilter,
  compileFilter,
  type OrderedEvent,
} from "./filter_compiler.ts";
import type { NostrEvent, NostrFilter } from "../types.ts";

type EventSetIndex<K> = Map<K, Set<NostrEvent>>;
type TagIndex = Map<string, EventSetIndex<string>>;

function getOrCreateEventSet<K>(
  index: EventSetIndex<K>,
  key: K,
): Set<NostrEvent> {
  const existing = index.get(key);
  if (existing) {
    return existing;
  }

  const created = new Set<NostrEvent>();
  index.set(key, created);
  return created;
}

function getReplaceableKey(kind: number, pubkey: string): string {
  return `${kind}:${pubkey}`;
}

function isPreferredLatest(
  candidate: NostrEvent,
  current: NostrEvent,
): boolean {
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }
  return candidate.id < current.id;
}

export interface EventStoreSnapshot {
  store: NostrEvent[];
  deletedIds: string[];
}

export type PublishEventStatus =
  | "stored"
  | "ephemeral"
  | "duplicate"
  | "blocked";

export interface PublishEventResult {
  status: PublishEventStatus;
}

export interface EventStoreQueryProfile {
  totalEvents: number;
  candidateSourceCount: number;
  selectionSizes: number[];
  narrowedCandidateSize: number | null;
  usedFastPath: boolean;
  usedIntersection: boolean;
  appliedIntersectionCount: number;
  intersectionStopSize: number;
  searchTokenCount: number;
  searchTokenSelectionSizes: number[];
  searchIndexTokenCount: number;
  searchIndexPostingCount: number;
  limit: number | null;
}

interface CandidateSelectionPlan {
  selections: OrderedEvent[][];
  searchTokenSelections: OrderedEvent[][];
  narrowed: OrderedEvent[] | null;
  usedIntersection: boolean;
  appliedIntersectionCount: number;
  intersectionStopSize: number;
}

interface SearchCandidateSelectionPlan {
  tokenSelections: OrderedEvent[][];
  combinedSelection: OrderedEvent[] | null;
}

export class EventStore {
  #events: NostrEvent[] = [];
  #deletedIds: Set<string> = new Set();
  #idIndex: EventSetIndex<string> = new Map();
  #kindIndex: EventSetIndex<number> = new Map();
  #pubkeyIndex: EventSetIndex<string> = new Map();
  #tagIndex: TagIndex = new Map();
  #searchIndex: EventSetIndex<string> = new Map();
  #replaceableIndex: Map<string, NostrEvent> = new Map();
  #parameterizedIndex: Map<string, NostrEvent> = new Map();
  #orderByEvent: WeakMap<NostrEvent, number> = new WeakMap();
  #searchIndexPostingCount = 0;
  #nextOrder = 0;

  get deletedIds(): ReadonlySet<string> {
    return this.#deletedIds;
  }

  get size(): number {
    return this.#events.length;
  }

  store(event: NostrEvent): boolean {
    if (event.kind === 5) {
      this.#handleDeletion(event);
      this.#appendEvent(event);
      return true;
    }

    const { stored } = this.#classifyAndStore(event);
    return stored;
  }

  publish(event: NostrEvent): PublishEventResult {
    if (this.#deletedIds.has(event.id)) {
      return { status: "blocked" };
    }

    if (event.kind === 5) {
      this.#handleDeletion(event);
      this.#appendEvent(event);
      return { status: "stored" };
    }

    const { stored, ephemeral } = this.#classifyAndStore(event);
    if (stored) {
      return { status: "stored" };
    }
    if (ephemeral) {
      return { status: "ephemeral" };
    }

    return { status: "duplicate" };
  }

  query(filter: NostrFilter): NostrEvent[] {
    return this.#queryCompiled(compileFilter(filter));
  }

  profile(filter: NostrFilter): EventStoreQueryProfile {
    const compiled = compileFilter(filter);
    const plan = this.#buildCandidateSelectionPlan(compiled);
    return {
      totalEvents: this.#events.length,
      candidateSourceCount: plan.selections.length,
      selectionSizes: plan.selections.map((selection) => selection.length),
      narrowedCandidateSize: plan.narrowed ? plan.narrowed.length : null,
      usedFastPath: plan.narrowed !== null,
      usedIntersection: plan.usedIntersection,
      appliedIntersectionCount: plan.appliedIntersectionCount,
      intersectionStopSize: plan.intersectionStopSize,
      searchTokenCount: compiled.searchTokens.length,
      searchTokenSelectionSizes: plan.searchTokenSelections.map((selection) =>
        selection.length
      ),
      searchIndexTokenCount: this.#searchIndex.size,
      searchIndexPostingCount: this.#searchIndexPostingCount,
      limit: compiled.limit,
    };
  }

  queryMany(filters: NostrFilter[]): NostrEvent[] {
    const events: NostrEvent[] = [];
    const seen = new Set<string>();

    for (const compiled of filters.map(compileFilter)) {
      const matched = this.#queryCompiled(compiled);
      for (const event of matched) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      }
    }

    return events;
  }

  count(filters: NostrFilter[]): number {
    const matchedIds = new Set<string>();

    for (const compiled of filters.map(compileFilter)) {
      for (const id of this.#countCompiled(compiled)) {
        matchedIds.add(id);
      }
    }

    return matchedIds.size;
  }

  snapshot(): EventStoreSnapshot {
    return {
      store: this.#events.map(cloneEvent),
      deletedIds: [...this.#deletedIds],
    };
  }

  restore(snapshot: EventStoreSnapshot): void {
    this.#events = snapshot.store.map(cloneEvent);
    this.#deletedIds = new Set(snapshot.deletedIds);
    this.#rebuildIndexes();
  }

  clearOlderThan(timestamp: number): number {
    const before = this.#events.length;
    this.#events = this.#events.filter((event) =>
      event.created_at >= timestamp
    );
    if (before !== this.#events.length) {
      this.#rebuildIndexes();
    }
    return before - this.#events.length;
  }

  reset(): void {
    this.#events = [];
    this.#deletedIds.clear();
    this.#clearIndexes();
  }

  #handleDeletion(deletionEvent: NostrEvent): void {
    const idsToDelete = new Set<string>();

    for (const tag of deletionEvent.tags) {
      if (tag[0] === "e" && tag[1]) {
        const targetId = tag[1];
        const targets = this.#idIndex.get(targetId);
        if (targets) {
          for (const target of targets) {
            if (
              target.pubkey === deletionEvent.pubkey &&
              target.created_at <= deletionEvent.created_at
            ) {
              idsToDelete.add(targetId);
              break;
            }
          }
        }
      }

      if (tag[0] === "a" && tag[1]) {
        const parts = tag[1].split(":");
        if (parts.length >= 3) {
          const aKind = parseInt(parts[0], 10);
          if (isNaN(aKind)) continue;

          const aPubkey = parts[1];
          const aDtag = parts.slice(2).join(":");

          if (aPubkey === deletionEvent.pubkey) {
            let target: NostrEvent | undefined;
            if (isParameterizedReplaceable(aKind)) {
              target = this.#parameterizedIndex.get(
                `${aKind}:${aPubkey}:${aDtag}`,
              );
            } else if (isReplaceable(aKind)) {
              target = this.#replaceableIndex.get(
                getReplaceableKey(aKind, aPubkey),
              );
            }

            if (target && target.created_at <= deletionEvent.created_at) {
              idsToDelete.add(target.id);
            }
          }
        }
      }
    }

    if (idsToDelete.size > 0) {
      for (const id of idsToDelete) {
        this.#deletedIds.add(id);
      }
      this.#events = this.#events.filter((event) => !idsToDelete.has(event.id));
      this.#rebuildIndexes();
    }
  }

  #replaceEvent(
    event: NostrEvent,
    existing: NostrEvent | undefined,
  ): { stored: boolean; ephemeral: boolean } {
    if (existing) {
      if (event.created_at < existing.created_at) {
        return { stored: false, ephemeral: false };
      }

      if (event.created_at === existing.created_at && event.id >= existing.id) {
        return { stored: false, ephemeral: false };
      }

      this.#removeEvent(existing);
    }

    this.#appendEvent(event);
    return { stored: true, ephemeral: false };
  }

  #classifyAndStore(
    event: NostrEvent,
  ): { stored: boolean; ephemeral: boolean } {
    if (this.#deletedIds.has(event.id)) {
      return { stored: false, ephemeral: false };
    }

    const kind = classifyEvent(event.kind);

    if (kind === "ephemeral") {
      return { stored: false, ephemeral: true };
    }

    if (kind === "replaceable") {
      return this.#replaceEvent(
        event,
        this.#replaceableIndex.get(getReplaceableKey(event.kind, event.pubkey)),
      );
    }

    if (kind === "parameterized_replaceable") {
      const newParamId = getParameterizedId(event);
      return this.#replaceEvent(
        event,
        newParamId ? this.#parameterizedIndex.get(newParamId) : undefined,
      );
    }

    this.#appendEvent(event);
    return { stored: true, ephemeral: false };
  }

  #queryCompiled(compiled: CompiledFilter): NostrEvent[] {
    const plan = this.#buildCandidateSelectionPlan(compiled);
    if (!plan.narrowed) {
      return collectMatchingEvents(this.#events, compiled);
    }

    return collectMatchingEventsFromOrderedEvents(
      plan.narrowed,
      compiled,
      true,
    );
  }

  #countCompiled(compiled: CompiledFilter): string[] {
    const plan = this.#buildCandidateSelectionPlan(compiled);
    if (!plan.narrowed) {
      return collectMatchingIdsForCount(this.#events, compiled);
    }

    return collectMatchingIdsForCountFromOrderedEvents(
      plan.narrowed,
      compiled,
      true,
    );
  }

  #buildCandidateSelectionPlan(
    compiled: CompiledFilter,
  ): CandidateSelectionPlan {
    const intersectionStopSize = this.#getIntersectionStopSize(compiled);
    const selections: OrderedEvent[][] = [];
    const {
      tokenSelections: searchTokenSelections,
      combinedSelection: searchCandidates,
    } = this.#lookupSearchCandidates(compiled.searchTokens);

    const idCandidates = this.#lookupIdCandidates(compiled.ids);
    if (idCandidates) {
      selections.push(idCandidates);
    }

    const authorCandidates = this.#lookupAuthorCandidates(compiled.authors);
    if (authorCandidates) {
      selections.push(authorCandidates);
    }

    const kindCandidates = this.#lookupKindCandidates(compiled.kinds);
    if (kindCandidates) {
      selections.push(kindCandidates);
    }

    for (
      const tagCandidates of this.#lookupTagCandidates(compiled.tagFilters)
    ) {
      selections.push(tagCandidates);
    }

    if (searchCandidates) {
      selections.push(searchCandidates);
    }

    if (selections.length === 0) {
      return {
        selections,
        searchTokenSelections,
        narrowed: null,
        usedIntersection: false,
        appliedIntersectionCount: 0,
        intersectionStopSize,
      };
    }

    const orderedSelections = selections.sort((a, b) => a.length - b.length);
    const [smallest, ...rest] = orderedSelections;
    if (smallest.length === 0) {
      return {
        selections: orderedSelections,
        searchTokenSelections,
        narrowed: [],
        usedIntersection: false,
        appliedIntersectionCount: 0,
        intersectionStopSize,
      };
    }

    if (smallest.length >= this.#events.length) {
      return {
        selections: orderedSelections,
        searchTokenSelections,
        narrowed: null,
        usedIntersection: false,
        appliedIntersectionCount: 0,
        intersectionStopSize,
      };
    }

    let narrowed = smallest;
    let appliedIntersectionCount = 0;
    for (const selection of rest) {
      if (narrowed.length <= intersectionStopSize) {
        break;
      }
      if (selection.length === 0) {
        return {
          selections: orderedSelections,
          searchTokenSelections,
          narrowed: [],
          usedIntersection: appliedIntersectionCount > 0,
          appliedIntersectionCount,
          intersectionStopSize,
        };
      }
      if (
        !this.#shouldIntersectFurther(
          narrowed.length,
          selection.length,
          intersectionStopSize,
        )
      ) {
        break;
      }
      narrowed = this.#intersectOrderedCandidates(narrowed, selection);
      appliedIntersectionCount += 1;
      if (narrowed.length === 0) {
        return {
          selections: orderedSelections,
          searchTokenSelections,
          narrowed,
          usedIntersection: true,
          appliedIntersectionCount,
          intersectionStopSize,
        };
      }
    }

    return {
      selections: orderedSelections,
      searchTokenSelections,
      narrowed,
      usedIntersection: appliedIntersectionCount > 0,
      appliedIntersectionCount,
      intersectionStopSize,
    };
  }

  #getIntersectionStopSize(compiled: CompiledFilter): number {
    if (compiled.limit === null) {
      return 64;
    }

    return Math.max(compiled.limit * 4, 64);
  }

  #shouldIntersectFurther(
    currentSize: number,
    selectionSize: number,
    intersectionStopSize: number,
  ): boolean {
    if (this.#events.length === 0) {
      return false;
    }

    const estimatedIntersectionSize = Math.ceil(
      (currentSize * selectionSize) / this.#events.length,
    );
    const reductionTarget = Math.floor(currentSize / 2);
    return estimatedIntersectionSize <= Math.max(
      intersectionStopSize,
      reductionTarget,
    );
  }

  #intersectOrderedCandidates(
    candidates: OrderedEvent[],
    selection: OrderedEvent[],
  ): OrderedEvent[] {
    if (candidates.length === 0 || selection.length === 0) {
      return [];
    }

    if (selection.length >= this.#events.length) {
      return candidates;
    }

    const allowed = new Set(selection.map(({ event }) => event));
    return candidates.filter(({ event }) => allowed.has(event));
  }

  #lookupIdCandidates(
    prefixes: readonly string[] | null,
  ): OrderedEvent[] | null {
    if (!prefixes || prefixes.length === 0) {
      return null;
    }

    const matched = new Set<NostrEvent>();
    for (const prefix of prefixes) {
      if (prefix.length === 64) {
        for (const event of this.#idIndex.get(prefix) ?? []) {
          matched.add(event);
        }
        continue;
      }

      for (const [id, events] of this.#idIndex) {
        if (id.startsWith(prefix)) {
          for (const event of events) {
            matched.add(event);
          }
        }
      }
    }

    return this.#toOrderedCandidates(matched);
  }

  #lookupAuthorCandidates(
    prefixes: readonly string[] | null,
  ): OrderedEvent[] | null {
    if (!prefixes || prefixes.length === 0) {
      return null;
    }

    const matched = new Set<NostrEvent>();
    for (const prefix of prefixes) {
      if (prefix.length === 64) {
        for (const event of this.#pubkeyIndex.get(prefix) ?? []) {
          matched.add(event);
        }
        continue;
      }

      for (const [pubkey, events] of this.#pubkeyIndex) {
        if (pubkey.startsWith(prefix)) {
          for (const event of events) {
            matched.add(event);
          }
        }
      }
    }

    return this.#toOrderedCandidates(matched);
  }

  #lookupKindCandidates(
    kinds: readonly number[] | null,
  ): OrderedEvent[] | null {
    if (!kinds || kinds.length === 0) {
      return null;
    }

    const matched = new Set<NostrEvent>();
    for (const kind of kinds) {
      for (const event of this.#kindIndex.get(kind) ?? []) {
        matched.add(event);
      }
    }

    return this.#toOrderedCandidates(matched);
  }

  #lookupTagCandidates(
    tagFilters: readonly CompiledTagFilter[],
  ): OrderedEvent[][] {
    if (tagFilters.length === 0) {
      return [];
    }

    const selections: OrderedEvent[][] = [];
    for (const tagFilter of tagFilters) {
      const valueIndex = this.#tagIndex.get(tagFilter.tagName);
      if (!valueIndex) {
        selections.push([]);
        continue;
      }

      const matched = new Set<NostrEvent>();
      for (const value of tagFilter.values) {
        for (const event of valueIndex.get(value) ?? []) {
          matched.add(event);
        }
      }
      selections.push(this.#toOrderedCandidates(matched));
    }

    return selections;
  }

  #lookupSearchCandidates(
    tokens: readonly string[],
  ): SearchCandidateSelectionPlan {
    if (tokens.length === 0) {
      return { tokenSelections: [], combinedSelection: null };
    }

    const tokenSelections: OrderedEvent[][] = [];
    for (const token of tokens) {
      tokenSelections.push(
        this.#toOrderedCandidates(this.#searchIndex.get(token) ?? []),
      );
    }

    const [smallest, ...rest] = [...tokenSelections].sort((a, b) =>
      a.length - b.length
    );
    let combinedSelection = smallest ?? null;
    if (!combinedSelection) {
      return { tokenSelections, combinedSelection: null };
    }

    for (const selection of rest) {
      combinedSelection = this.#intersectOrderedCandidates(
        combinedSelection,
        selection,
      );
      if (combinedSelection.length === 0) {
        break;
      }
    }

    return { tokenSelections, combinedSelection };
  }

  #toOrderedCandidates(events: Iterable<NostrEvent>): OrderedEvent[] {
    const candidates: OrderedEvent[] = [];
    for (const event of events) {
      candidates.push({ event, order: this.#getOrder(event) });
    }
    candidates.sort(compareOrderedEvents);
    return candidates;
  }

  #appendEvent(event: NostrEvent): void {
    this.#events.push(event);
    this.#orderByEvent.set(event, this.#nextOrder++);
    this.#indexEvent(event);
  }

  #removeEvent(event: NostrEvent): void {
    const index = this.#events.indexOf(event);
    if (index !== -1) {
      this.#events.splice(index, 1);
    }
    this.#unindexEvent(event);
  }

  #indexEvent(event: NostrEvent): void {
    getOrCreateEventSet(this.#idIndex, event.id).add(event);
    getOrCreateEventSet(this.#kindIndex, event.kind).add(event);
    getOrCreateEventSet(this.#pubkeyIndex, event.pubkey).add(event);
    this.#indexTags(event);
    this.#indexSearchTokens(event);

    if (isReplaceable(event.kind)) {
      const key = getReplaceableKey(event.kind, event.pubkey);
      const current = this.#replaceableIndex.get(key);
      if (!current || isPreferredLatest(event, current)) {
        this.#replaceableIndex.set(key, event);
      }
      return;
    }

    const parameterizedId = getParameterizedId(event);
    if (!parameterizedId) {
      return;
    }

    const current = this.#parameterizedIndex.get(parameterizedId);
    if (!current || isPreferredLatest(event, current)) {
      this.#parameterizedIndex.set(parameterizedId, event);
    }
  }

  #unindexEvent(event: NostrEvent): void {
    this.#removeIndexedEvent(this.#idIndex, event.id, event);
    this.#removeIndexedEvent(this.#kindIndex, event.kind, event);
    this.#removeIndexedEvent(this.#pubkeyIndex, event.pubkey, event);
    this.#unindexTags(event);
    this.#unindexSearchTokens(event);

    if (isReplaceable(event.kind)) {
      const key = getReplaceableKey(event.kind, event.pubkey);
      if (this.#replaceableIndex.get(key) === event) {
        this.#replaceableIndex.delete(key);
      }
      return;
    }

    const parameterizedId = getParameterizedId(event);
    if (
      parameterizedId &&
      this.#parameterizedIndex.get(parameterizedId) === event
    ) {
      this.#parameterizedIndex.delete(parameterizedId);
    }
  }

  #removeIndexedEvent<K>(
    index: EventSetIndex<K>,
    key: K,
    event: NostrEvent,
  ): void {
    const events = index.get(key);
    if (!events) {
      return;
    }

    events.delete(event);
    if (events.size === 0) {
      index.delete(key);
    }
  }

  #indexTags(event: NostrEvent): void {
    for (const tag of event.tags) {
      const tagName = tag[0];
      if (!tagName) {
        continue;
      }

      const valueIndex = getOrCreateTagValueIndex(this.#tagIndex, tagName);
      getOrCreateEventSet(valueIndex, tag[1] ?? "").add(event);
    }
  }

  #unindexTags(event: NostrEvent): void {
    for (const tag of event.tags) {
      const tagName = tag[0];
      if (!tagName) {
        continue;
      }

      const valueIndex = this.#tagIndex.get(tagName);
      if (!valueIndex) {
        continue;
      }

      this.#removeIndexedEvent(valueIndex, tag[1] ?? "", event);
      if (valueIndex.size === 0) {
        this.#tagIndex.delete(tagName);
      }
    }
  }

  #indexSearchTokens(event: NostrEvent): void {
    for (const token of tokenizeSearchText(event.content)) {
      const events = getOrCreateEventSet(this.#searchIndex, token);
      if (events.has(event)) {
        continue;
      }

      events.add(event);
      this.#searchIndexPostingCount += 1;
    }
  }

  #unindexSearchTokens(event: NostrEvent): void {
    for (const token of tokenizeSearchText(event.content)) {
      const events = this.#searchIndex.get(token);
      if (!events) {
        continue;
      }

      if (events.delete(event)) {
        this.#searchIndexPostingCount -= 1;
      }

      if (events.size === 0) {
        this.#searchIndex.delete(token);
      }
    }
  }

  #rebuildIndexes(): void {
    const events = this.#events;
    this.#clearIndexes();
    for (const event of events) {
      this.#orderByEvent.set(event, this.#nextOrder++);
      this.#indexEvent(event);
    }
  }

  #clearIndexes(): void {
    this.#idIndex.clear();
    this.#kindIndex.clear();
    this.#pubkeyIndex.clear();
    this.#tagIndex.clear();
    this.#searchIndex.clear();
    this.#replaceableIndex.clear();
    this.#parameterizedIndex.clear();
    this.#orderByEvent = new WeakMap();
    this.#searchIndexPostingCount = 0;
    this.#nextOrder = 0;
  }

  #getOrder(event: NostrEvent): number {
    return this.#orderByEvent.get(event) ?? Number.MAX_SAFE_INTEGER;
  }
}

function getOrCreateTagValueIndex(
  index: TagIndex,
  tagName: string,
): EventSetIndex<string> {
  const existing = index.get(tagName);
  if (existing) {
    return existing;
  }

  const created: EventSetIndex<string> = new Map();
  index.set(tagName, created);
  return created;
}
