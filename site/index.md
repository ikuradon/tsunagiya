---
layout: home
hero:
  name: 繋ぎ屋
  text: Nostr リレーモックライブラリ
  tagline: WebSocket を差し替えて、既存クライアントをそのままテスト
  actions:
    - theme: brand
      text: クイックスタート
      link: /guide/getting-started
    - theme: alt
      text: API リファレンス
      link: /reference/api
    - theme: alt
      text: GitHub
      link: https://github.com/ikuradon/tsunagiya
features:
  - icon: 🔌
    title: ゼロ変更テスト
    details: globalThis.WebSocket を差し替え、既存のクライアントコードをそのままテスト可能
  - icon: 🌐
    title: 複数リレー対応
    details: MockPool で複数のリレーを同時にモック。各リレーは独立して動作
  - icon: 📋
    title: NIP 準拠
    details: NIP-01 完全実装、NIP-42 AUTH、NIP-09 削除、NIP-45 COUNT 等に対応
  - icon: 🛠️
    title: テスト支援ヘルパー
    details: EventBuilder, FilterBuilder, アサーション関数で効率的なテスト作成
  - icon: 🏃
    title: マルチランタイム
    details: Deno, Node.js, Bun で動作。主要 Nostr ライブラリとの E2E テスト済み
  - icon: 📦
    title: 外部依存ゼロ
    details: 純粋 TypeScript 実装。追加パッケージ不要
---
