# Changelog

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
