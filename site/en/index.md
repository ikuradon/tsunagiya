---
layout: home
hero:
  name: tsunagiya
  text: Nostr Relay Mock Library
  tagline: Intercept WebSocket to test existing clients without code changes
  actions:
    - theme: brand
      text: Quick Start
      link: /en/guide/getting-started
    - theme: alt
      text: API Reference
      link: /en/reference/api
    - theme: alt
      text: GitHub
      link: https://github.com/ikuradon/tsunagiya
features:
  - icon: 🔌
    title: Zero-Change Testing
    details: Replaces globalThis.WebSocket to test existing client code as-is
  - icon: 🌐
    title: Multi-Relay Support
    details: Mock multiple relays simultaneously with MockPool, each operating independently
  - icon: 📋
    title: NIP Compliant
    details: Full NIP-01 implementation, NIP-42 AUTH, NIP-09 deletion, NIP-45 COUNT support
  - icon: 🛠️
    title: Test Helpers
    details: EventBuilder, FilterBuilder, and assertion functions for efficient test creation
  - icon: 🏃
    title: Multi-Runtime
    details: Works on Deno, Node.js, and Bun. E2E tested with major Nostr libraries
  - icon: 📦
    title: Zero Dependencies
    details: Pure TypeScript implementation. No additional packages required
---
