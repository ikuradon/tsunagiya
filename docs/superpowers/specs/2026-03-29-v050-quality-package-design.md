# v0.5.0 Quality Improvement Package — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Version:** 0.5.0
**Breaking Changes:** None

## Overview

Bundle the completed relay internals refactoring (d48701d) with network
simulation features, code quality improvements, and infrastructure
enhancements into a single v0.5.0 release.

### Included Changes

| # | Category | Item |
|---|----------|------|
| 1 | Refactoring | Relay internal module extraction (done) |
| 2 | Feature | Network condition simulation |
| 3 | Quality | Barrel export for `src/relay/mod.ts` |
| 4 | Quality | `testing/stream.ts` coverage fix (79.4% -> 80%+) |
| 5 | Quality | Unit tests for `src/internal/` and `src/platform/` |
| 6 | Infra | GitHub Releases auto-creation |
| 7 | Infra | Dependabot configuration |

## 1. Network Condition Simulation

### New Types

```typescript
interface NetworkConditions {
  /** Connection establishment delay (ms) */
  connectDelay?: number;
  /** Base message delivery delay (ms) */
  messageDelay?: number;
  /** Jitter range (ms). Actual delay = delay +/- random(jitter) */
  jitter?: number;
  /** Probability of out-of-order delivery (0.0-1.0) */
  outOfOrderRate?: number;
  /** Transient disconnect simulation */
  transientDisconnect?: {
    /** Probability of disconnect per message delivery (0.0-1.0) */
    probability: number;
    /** Duration until reconnection is accepted (ms) */
    duration: number;
  };
}

interface MockRelayOptions {
  // ...existing fields
  network?: NetworkConditions;
}
```

### Implementation

**`src/relay/delivery_scheduler.ts`** — Extend with:

- Jitter calculation using injected `RandomSource` for deterministic tests
- Out-of-order: shuffle sort order of messages sharing the same due time
- All calculations use existing `Clock` and `RandomSource` abstractions

**`src/relay/connection_runtime.ts`** — Extend with:

- `connectDelay`: delay WebSocket `open` event firing by the specified ms
- `transientDisconnect`: on each message delivery, roll against `probability`;
  if triggered, fire `close` event (code: 1001) and reject new connections
  for `duration` ms. Designed for testing client reconnection logic.

### Design Constraints

- All fields optional. Omitting `network` preserves current behavior (immediate
  delivery).
- `outOfOrderRate` only affects batches of messages delivered at the same time.
  Single messages are unaffected.
- `transientDisconnect.duration` uses the injected `Clock` for testability.

## 2. Barrel Export (`src/relay/mod.ts`)

Create `src/relay/mod.ts` to re-export all internal relay module symbols:

```typescript
// src/relay/mod.ts
export { AuthService } from "./auth_service.ts";
export { RelayConnectionRuntime } from "./connection_runtime.ts";
export { DeliveryScheduler } from "./delivery_scheduler.ts";
export { EventStore } from "./event_store.ts";
export type { MessageValidationLimits } from "./message_codec.ts";
// ...all other public symbols from the 11 modules
```

Update `src/relay.ts` to import from `./relay/mod.ts` instead of individual
files.

**Scope limits:**

- `src/relay/mod.ts` is internal only. NOT re-exported from `src/mod.ts`.
- `deno.json` `exports` unchanged. Public API surface is `src/mod.ts` and
  `src/testing/mod.ts` only.
- `src/internal/` and `src/platform/` remain without barrel exports (too few
  consumers to justify).

## 3. Coverage Fix: `testing/stream.ts`

Target: 79.4% -> 80%+

Add test cases to `tests/testing/stream_test.ts` for uncovered paths:

- `stop()` called mid-stream (in-flight events are not delivered after stop)
- Jitter clamping (jitter does not exceed interval)
- `startStream` with `count` limit reaching automatic stop
- Edge case: `streamEvents` with empty event array

No new test files. Additions go into the existing test file.

## 4. Unit Tests for `src/internal/` and `src/platform/`

### `tests/internal/`

| File | Test Focus |
|------|------------|
| `clone_test.ts` | Deep copy verification: mutating clone does not affect original (event, filter, relay info) |
| `url_test.ts` | URL normalization: trailing slash, case, default port omission, edge cases |
| `validation_test.ts` | Boundary values for validation helpers |
| `runtime_test.ts` | Minimal: `systemClock.now()` returns number, `systemRandomSource` returns values in [0,1) |
| `search_test.ts` | Basic search utility behavior |

### `tests/platform/`

| File | Test Focus |
|------|------------|
| `global_hooks_test.ts` | capture/install/restore cycle for `globalThis.WebSocket` |
| `nip11_fetch_test.ts` | fetch intercept returns correct NIP-11 JSON |
| `pool_hooks_test.ts` | Pool-level hook setup and teardown |

### Guidelines

- Focus on edge cases and boundary values not covered by integration tests.
- `runtime.ts` and `search.ts` have thin logic; keep tests minimal.
- Do not duplicate scenarios already exercised in `tests/pool_test.ts`,
  `tests/nip11_test.ts`, etc.

## 5. GitHub Releases Auto-Creation

### CI Job

Add `create-release` job to `.github/workflows/ci.yml`:

```yaml
create-release:
  name: Create GitHub Release
  if: startsWith(github.ref, 'refs/tags/v')
  needs: [publish-jsr, publish-npm]
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - uses: actions/checkout@...  # pinned hash
    - name: Create release
      run: gh release create "${{ github.ref_name }}" --generate-notes
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Execution order:** Runs after both `publish-jsr` and `publish-npm` succeed.
If either publish fails, no release is created.

### Release Notes Categorization

Create `.github/release.yml`:

```yaml
changelog:
  categories:
    - title: "New Features"
      labels: ["feat", "feature", "enhancement"]
    - title: "Bug Fixes"
      labels: ["fix", "bug", "bugfix"]
    - title: "Performance"
      labels: ["perf", "performance"]
    - title: "Documentation"
      labels: ["docs", "documentation"]
    - title: "Other Changes"
      labels: ["*"]
```

PR labels (`feat`, `fix`, `docs`, `chore`, etc.) drive categorization.
Unlabeled PRs fall into "Other Changes".

## 6. Dependabot Configuration

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  # GitHub Actions — weekly, grouped into single PR
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    commit-message:
      prefix: "ci"
    groups:
      actions:
        patterns: ["*"]

  # examples/ npm deps — weekly, grouped
  - package-ecosystem: "npm"
    directory: "/examples"
    schedule:
      interval: "weekly"
      day: "monday"
    commit-message:
      prefix: "chore"
    groups:
      npm-dependencies:
        patterns: ["*"]

  # docs/ npm deps (VitePress etc.) — monthly
  - package-ecosystem: "npm"
    directory: "/docs"
    schedule:
      interval: "monthly"
    commit-message:
      prefix: "docs"
```

### Design Decisions

- **Grouping**: Actions and npm deps each grouped into one PR to reduce noise.
- **src/**: Not tracked. Zero external dependencies by policy.
- **Commit prefixes**: Aligned with conventional commits for release note
  categorization.
- **examples/ weekly**: Tracks nostr-tools, NDK, rx-nostr, nostr-fetch updates.
  E2E tests in CI automatically validate compatibility.
- **docs/ monthly**: Build tooling (VitePress) does not need frequent updates.

## Implementation Order

```
Phase 1 (parallel):
  ├─ Barrel export (src/relay/mod.ts)
  └─ Dependabot config (.github/dependabot.yml)

Phase 2 (parallel, after Phase 1):
  ├─ Network simulation (delivery_scheduler + connection_runtime)
  ├─ stream.ts coverage fix
  └─ internal/ + platform/ unit tests

Phase 3 (sequential):
  ├─ GitHub Releases CI job + release.yml
  ├─ Version bump to 0.5.0
  └─ Final: deno task check && deno task test && deno task coverage
```

**Rationale:** Phase 1 creates the barrel export that Phase 2 imports from.
Dependabot is independent and can go in Phase 1. Infrastructure (Phase 3)
goes last since it depends on all code changes being finalized.
