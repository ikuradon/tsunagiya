import { defineConfig } from "vitepress";

export default defineConfig({
  title: "繋ぎ屋",
  description: "Nostr relay mock library for testing",
  base: "/tsunagiya/",
  lastUpdated: true,
  srcExclude: ["_shared/**"],
  markdown: {
    lineNumbers: true,
  },
  head: [
    ["link", {
      rel: "icon",
      type: "image/svg+xml",
      href: "/tsunagiya/favicon.svg",
    }],
    ["link", {
      rel: "icon",
      type: "image/png",
      href: "/tsunagiya/favicon.png",
    }],
  ],
  locales: {
    root: {
      label: "日本語",
      lang: "ja",
      themeConfig: {
        nav: [
          { text: "ガイド", link: "/guide/getting-started" },
          { text: "リファレンス", link: "/reference/api" },
          { text: "応用", link: "/advanced/best-practices" },
          { text: "ヘルプ", link: "/help/troubleshooting" },
        ],
        sidebar: {
          "/guide/": [
            {
              text: "ガイド",
              items: [
                { text: "はじめに", link: "/guide/getting-started" },
                { text: "チュートリアル", link: "/guide/tutorial" },
                { text: "実践例集", link: "/guide/examples" },
                { text: "テストパターン集", link: "/guide/test-patterns" },
              ],
            },
          ],
          "/reference/": [
            {
              text: "リファレンス",
              items: [
                { text: "API リファレンス", link: "/reference/api" },
                { text: "NIP 対応状況", link: "/reference/nip-support" },
              ],
            },
          ],
          "/advanced/": [
            {
              text: "応用",
              items: [
                {
                  text: "ベストプラクティス",
                  link: "/advanced/best-practices",
                },
                { text: "パフォーマンス", link: "/advanced/performance" },
              ],
            },
          ],
          "/help/": [
            {
              text: "ヘルプ",
              items: [
                {
                  text: "トラブルシューティング",
                  link: "/help/troubleshooting",
                },
                { text: "FAQ", link: "/help/faq" },
              ],
            },
          ],
        },
        outline: {
          label: "このページの目次",
        },
        docFooter: {
          prev: "前のページ",
          next: "次のページ",
        },
        lastUpdated: {
          text: "最終更新",
        },
        returnToTopLabel: "トップに戻る",
        sidebarMenuLabel: "メニュー",
        darkModeSwitchLabel: "テーマ切替",
        editLink: {
          pattern: "https://github.com/ikuradon/tsunagiya/edit/main/site/:path",
          text: "このページを編集する",
        },
      },
    },
    en: {
      label: "English",
      lang: "en",
      title: "tsunagiya",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/en/guide/getting-started" },
          { text: "Reference", link: "/en/reference/api" },
          { text: "Advanced", link: "/en/advanced/best-practices" },
          { text: "Help", link: "/en/help/troubleshooting" },
        ],
        sidebar: {
          "/en/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Getting Started", link: "/en/guide/getting-started" },
                { text: "Tutorial", link: "/en/guide/tutorial" },
                { text: "Examples", link: "/en/guide/examples" },
                { text: "Test Patterns", link: "/en/guide/test-patterns" },
              ],
            },
          ],
          "/en/reference/": [
            {
              text: "Reference",
              items: [
                { text: "API Reference", link: "/en/reference/api" },
                { text: "NIP Support", link: "/en/reference/nip-support" },
              ],
            },
          ],
          "/en/advanced/": [
            {
              text: "Advanced",
              items: [
                { text: "Best Practices", link: "/en/advanced/best-practices" },
                { text: "Performance", link: "/en/advanced/performance" },
              ],
            },
          ],
          "/en/help/": [
            {
              text: "Help",
              items: [
                { text: "Troubleshooting", link: "/en/help/troubleshooting" },
                { text: "FAQ", link: "/en/help/faq" },
              ],
            },
          ],
        },
        editLink: {
          pattern: "https://github.com/ikuradon/tsunagiya/edit/main/site/:path",
          text: "Edit this page on GitHub",
        },
      },
    },
  },
  themeConfig: {
    socialLinks: [
      { icon: "github", link: "https://github.com/ikuradon/tsunagiya" },
    ],
    search: {
      provider: "local",
    },
    footer: {
      message: "MIT License",
      copyright: "Copyright © 2024-2026 ikuradon",
    },
  },
});
