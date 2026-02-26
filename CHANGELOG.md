# Changelog

## v0.2.5 (2026-02-26)

### Test Helpers

- NIP-52 Calendar Events full support:
  - `EventBuilder.calendarDateEvent()` (kind:31922)
  - `EventBuilder.calendarTimeEvent()` (kind:31923)
  - `EventBuilder.calendarCollection()` (kind:31924)
  - `EventBuilder.calendarRsvp()` (kind:31925)
  - `FilterBuilder.calendarDateEvents()`, `calendarTimeEvents()`,
    `calendarEvents()`, `calendarCollections()`, `rsvps()`

### Documentation

- Update NIP support table to reflect upstream NIP spec changes:
  - NIP-16 (Event Treatment) and NIP-33 (Parameterized Replaceable Events) are
    now part of NIP-01; removed as separate entries and expanded NIP-01
    description
  - NIP-04 (Encrypted DM): added deprecation notice (superseded by NIP-17)
  - NIP-52: corrected description from "Geohash" to "Calendar Events" (`g` tag
    only)
  - NIP-29: corrected description to "Relay-based Groups"
  - NIP-57: corrected description to "Lightning Zaps"
  - Renamed "Parameterized Replaceable" to "Addressable" in event type tables
- Add NIP-17 (Private Direct Messages) and NIP-40 (Expiration Timestamp) to
  planned NIPs roadmap
- Update version references in documentation pages (v0.2.3 → v0.2.4)

## v0.2.3 (2026-02-26)

### Bug Fixes

- Fix subId collision across multiple WebSocket connections (per-connection
  subscription management)
- Fix crash on malformed client messages (EVENT, REQ, CLOSE without required
  fields)
- Fix `store(kind:5)` not processing deletion (NIP-09)
- Fix NIP-11 Accept header case-insensitive matching and `init.headers` override

### Tests

- Add 8 regression tests for the above bug fixes

### Improvements

- Fix NDK CLI `stream` command not terminating on SIGINT
- Fix `nostr-fetch` E2E assertion that was always true
- Fix NIP-16 documentation to correctly list kind 0/3 as replaceable

## v0.2.2 (2026-02-26)

### Documentation

- VitePress bilingual documentation site (Japanese/English)
- Fixed documentation consistency (NIP-11, version numbers, E2E commands)
- Single Source of Truth pattern: shared code/tables for both languages

## v0.2.0 (2026-02-20)

### New Features

- NIP-09: Event Deletion (kind:5 deletion request processing)
- NIP-11: Relay Information Document (`setInfo()`/`getInfo()` + fetch intercept)
- NIP-16: Event Treatment (Regular/Replaceable/Ephemeral auto-processing)
- NIP-25: Reactions (`EventBuilder.withReactions()`)
- NIP-33: Parameterized Replaceable Events (kind+pubkey+d-tag replacement)
- NIP-45: COUNT message support
- NIP-50: Search filter support (content partial match)

### Test Helpers

- `EventBuilder` NIP templates: `dm()`, `groupMessage()`, `zapRequest()`,
  `nip07Request()`, `deletion()`, `deletionByAddress()`
- `EventBuilder` common tags: `geohash()`, `emoji()`
- `FilterBuilder`: `search()` pattern
- Assertion helpers: `assertReceivedREQ`, `assertEventPublished`,
  `assertNoErrors`, `assertAuthCompleted`, `assertClosed`, `assertReceived`
- Snapshot/restore with NIP-11 info support

### Improvements

- Cross-runtime compatibility layer for E2E tests (Node.js/Bun)
- Reorganized examples into per-library directories
- `nostr-fetch` E2E test suite

## v0.1.0 (2026-02-15)

Initial release.

### Core

- `MockPool` - WebSocket interception and relay management
- `MockRelay` - Virtual Nostr relay with event store, custom handlers, and
  verification helpers
- `MockWebSocket` - WebSocket API compatible mock with URL routing
- NIP-01 filter matching (`matchFilter`, `matchFilters`, `filterEvents`)

### Error Simulation

- Latency simulation (fixed or range)
- Error rate and random disconnect rate
- Connection timeout
- `refuse()`, `disconnect()`, `disconnectAfter()`, `close()`, `sendRaw()`,
  `sendNotice()`

### NIP-42 AUTH

- Challenge/response authentication
- `requireAuth()` with custom validator
- `AuthState` for connection-level auth management

### Test Helpers (`@ikuradon/tsunagiya/testing`)

- `EventBuilder` - Builder pattern for Nostr events
  - Static factories: `kind0()` - `kind7()`, `kind(n)`
  - Builder methods: `content()`, `tag()`, `pubkey()`, `id()`, `createdAt()`,
    `sign()`, `corrupt()`
  - Common tags: `geohash()`, `emoji()`
  - Bulk generation: `random()`, `bulk()`, `timeline()`, `thread()`,
    `withReactions()`
  - NIP templates: `metadata()`, `contacts()`, `dm()`, `groupMessage()`,
    `zapRequest()`, `nip07Request()`
- `FilterBuilder` - Common filter patterns (`timeline`, `profile`, `mentions`,
  `reactions`)
- Assertion helpers: `assertReceivedREQ`, `assertEventPublished`,
  `assertNoErrors`, `assertAuthCompleted`, `assertClosed`, `assertReceived`

### Advanced Features

- Real-time stream simulation: `streamEvents()`, `startStream()`
- Snapshot/restore: `relay.snapshot()`, `relay.restore()`
- Logging with levels (silent/error/info/debug) and custom handlers
