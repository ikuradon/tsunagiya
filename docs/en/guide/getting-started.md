---
outline: deep
---

# Getting Started

tsunagiya is a Nostr relay mock library. By replacing `globalThis.WebSocket`,
you can test **existing Nostr client code without any modifications**.

## Installation

<!--@include: ../../_shared/snippets/install.md-->

## Basic Usage

<!--@include: ../../_shared/snippets/en/basic-usage.md-->

## Features

- Full WebSocket interception mock
- Multiple relay support
- NIP-01 filter auto-matching + custom handlers
- Unstable relay simulation (latency, error rate, disconnection)
- NIP-42 AUTH challenge/response
- Sent message recording and verification helpers
- NIP-01 automatic event type handling
  (Regular/Replaceable/Ephemeral/Addressable)
- NIP-09 Event Deletion Request
- NIP-45 COUNT message support
- NIP-50 search filter support
- Test helpers (EventBuilder, FilterBuilder, assertions)
- Real-time streaming and snapshots
- Logging (console / custom handler)
- Test framework agnostic
- Zero external dependencies
- E2E testing support (nostr-tools, NDK, rx-nostr, nostr-fetch)

## MockPool

The main entry point for testing. Manages multiple `MockRelay` instances and
replaces `globalThis.WebSocket`.

<!--@include: ../../_shared/tables/en/api-mockpool.md-->

<!--@include: ../../_shared/snippets/en/mockpool-usage.md-->

> **Note:** Attempting to connect to a URL not registered with `pool.relay()`
> will result in a connection failure (error event + close event code:1006).
> This matches the behavior of failing to connect to a real relay.

## MockRelay

A virtual relay that operates per URL.

### Properties

<!--@include: ../../_shared/tables/en/api-mockrelay-props.md-->

### Usage

<!--@include: ../../_shared/snippets/en/mockrelay-usage.md-->

## Test Helpers

Import from `@ikuradon/tsunagiya/testing`.

<!--@include: ../../_shared/snippets/en/testing-helpers.md-->

## Supported NIPs

<!--@include: ../../_shared/tables/en/nip-support.md-->

## E2E Testing Support

tsunagiya verifies compatibility with the following major Nostr client libraries
through E2E tests.

| Library     | Test Command                    | What is tested                                     |
| ----------- | ------------------------------- | -------------------------------------------------- |
| nostr-tools | `deno task example:nostr-tools` | REQ/EVENT processing via SimplePool                |
| NDK         | `deno task example:ndk`         | Event fetch/publish via NDK instance               |
| rx-nostr    | `deno task example:rx-nostr`    | RxNostr Reactive API (createRxNostr / use)         |
| nostr-fetch | `deno task example:nostr-fetch` | Event fetching via NostrFetcher (fetch / iterator) |

```bash
deno task example             # Run all E2E tests
deno task test:all            # Unit tests + E2E tests
```

## Next Steps

- [Tutorial](/en/guide/tutorial) — Step-by-step guide
- [Examples](/en/guide/examples) — Practical usage examples (14 examples)
- [API Reference](/en/reference/api) — Full API details
