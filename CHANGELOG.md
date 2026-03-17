# Changelog

## v0.4.0 (2026-03-18)

### New Features

- **npm publishing**: Published as `@ikuradon/tsunagiya` on npm via dnt build.
  Supports ESM with full type definitions. CI publishes to both JSR and npm on
  tag push.
- **`waitFor` helper**: Polling-based condition waiting utility in
  `@ikuradon/tsunagiya/testing`. CI-friendly alternative to fixed `setTimeout`
  waits that cause flaky tests on slow environments.

### Improvements

- Remove sanitize option workarounds from rx-nostr E2E tests by using `waitFor`
  for async cleanup
- Replace fixed-time delays in rx-nostr stream test with condition-based waiting

### Documentation

- Add npm install instructions to README and docs
- Add Vitest usage guide with setup, test examples, and environment
  recommendations (ja/en)
- Add `waitFor` helper documentation to testing helpers guide
- Update FAQ to reflect npm availability

### CI

- Add `npm-build-check` job to CI workflow
- Add `publish-npm` job to publish workflow (OIDC Trusted Publishers)
- Update all GitHub Actions to latest versions:
  - `actions/checkout` v6.0.2, `actions/cache` v5.0.3, `actions/setup-node`
    v6.3.0, `denoland/setup-deno` v2.0.3, `oven-sh/setup-bun` v2.2.0,
    `codecov/codecov-action` v5.5.2, `actions/upload-artifact` v7.0.0,
    `actions/upload-pages-artifact` v4.0.0

## Unreleased

### New Features

- **EventSigner / EventVerifier インターフェース注入**
  - `UnsignedEvent` 型: 署名前のイベント（id / sig を含まない）
  - `EventSigner` インターフェース: `getPublicKey()` / `signEvent()` で外部署名
    ロジックを注入可能
  - `EventVerifier` インターフェース: `verifyEvent()` でリレー側の署名検証を注入
    可能
  - `EventBuilder.buildWith(signer)`: signer を使って正規署名付きイベントを生成
  - `MockRelay.setVerifier(verifier)`: イベント受信時に署名検証を実行
  - `MockRelayOptions.verifier`: コンストラクタ経由でも設定可能
  - 暗号ライブラリを同梱せず、開発者が自前の実装を注入する設計

### Tests

- テストカバレッジを 87.7% → 94.0% に改善（+45 テスト）
  - relay エラーハンドリング、websocket protocol/timeout、auth エッジケース、
    logger console 出力、stream jitter/auto-stop、assertions フィルターマッチ、
    event builder テンプレート、NIP-11 fetch インターセプトの各パスを網羅
- E2E 署名テスト追加（nostr-tools / NDK / rx-nostr 各ライブラリ向け）

### Bug Fixes

- README・ドキュメント・ソース・テスト内のリレーアドレスを RFC 2606 準拠の
  `.test` TLD に統一（実在ドメインへの意図しない DNS ルックアップを防止）
- カバレッジ出力先を `coverage/` → `.cov/` に変更

### CI

- CI マトリクスから Deno v1.x を削除（deno.lock v5 形式が非対応のため）

## v0.3.0 (2026-02-28)

### Test Helpers

- NIP-17 Private Direct Messages:
  - `EventBuilder.chatMessage()` (kind:14)
  - `EventBuilder.seal()` (kind:13)
  - `EventBuilder.giftWrap()` (kind:1059)
  - `EventBuilder.dmRelayList()` (kind:10050)
  - `FilterBuilder.giftWraps()`, `FilterBuilder.dmRelayList()`
- NIP-18 Reposts:
  - `EventBuilder.repost()` (kind:6)
  - `EventBuilder.genericRepost()` (kind:16)
  - `FilterBuilder.reposts()`, `FilterBuilder.allReposts()`
- NIP-23 Long-form Content:
  - `EventBuilder.longFormContent()` (kind:30023)
  - `EventBuilder.longFormDraft()` (kind:30024)
  - `FilterBuilder.longFormContent()`, `FilterBuilder.longFormByTag()`
- NIP-25 Reactions (拡充):
  - `EventBuilder.withReactions(count, options)` — `content` / `targetKind`
    オプション追加
  - `EventBuilder.externalReaction()` (kind:17)
  - `FilterBuilder.reactionsTo()`
- NIP-51 Lists:
  - `EventBuilder.muteList()` (kind:10000)
  - `EventBuilder.pinList()` (kind:10001)
  - `EventBuilder.bookmarks()` (kind:10003)
  - `EventBuilder.followSet()` (kind:30000)
  - `EventBuilder.relaySet()` (kind:30002)
  - `EventBuilder.emojiSet()` (kind:30030)
  - `FilterBuilder.muteList()`, `FilterBuilder.pinList()`,
    `FilterBuilder.bookmarks()`, `FilterBuilder.followSets()`
- NIP-65 Relay List Metadata:
  - `EventBuilder.relayList()` (kind:10002)
  - `FilterBuilder.relayList()`

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
