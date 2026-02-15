# ドキュメント構成 - tsunagiya v0.1.0

## 概要

tsunagiya のドキュメントは以下の9つのファイルで構成される。初心者から上級者まで段階的に学習できる構成とする。

## ドキュメント一覧

| ファイル | 対象読者 | 概要 |
|---------|---------|------|
| [API_REFERENCE.md](./API_REFERENCE.md) | 全員 | 全クラス・関数・型の詳細リファレンス |
| [TUTORIAL.md](./TUTORIAL.md) | 初心者 | ステップバイステップのチュートリアル |
| [EXAMPLES.md](./EXAMPLES.md) | 初〜中級者 | 実践的な使用例集 |
| [TEST_PATTERNS.md](./TEST_PATTERNS.md) | 中級者 | よくあるテストシナリオとパターン |
| [BEST_PRACTICES.md](./BEST_PRACTICES.md) | 中〜上級者 | テスト設計のベストプラクティス |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 全員 | よくあるエラーと解決方法 |
| [FAQ.md](./FAQ.md) | 全員 | よくある質問と回答 |
| [NIP_SUPPORT.md](./NIP_SUPPORT.md) | Nostr開発者 | NIP対応状況と使用例 |
| [PERFORMANCE.md](./PERFORMANCE.md) | 上級者 | パフォーマンス最適化ガイド |

## 推奨読書順

```
README.md → TUTORIAL.md → EXAMPLES.md → API_REFERENCE.md
                                      → TEST_PATTERNS.md → BEST_PRACTICES.md
                                      → NIP_SUPPORT.md
                                      → PERFORMANCE.md
問題が起きたら → TROUBLESHOOTING.md / FAQ.md
```

## 相互リンク構成

- **TUTORIAL.md** → API_REFERENCE.md（詳細参照）、EXAMPLES.md（発展例）
- **EXAMPLES.md** → API_REFERENCE.md（API詳細）、TEST_PATTERNS.md（パターン）
- **TEST_PATTERNS.md** → EXAMPLES.md（具体例）、BEST_PRACTICES.md（設計指針）
- **BEST_PRACTICES.md** → PERFORMANCE.md（速度最適化）、TEST_PATTERNS.md（パターン）
- **TROUBLESHOOTING.md** → FAQ.md（関連質問）、API_REFERENCE.md（正しい使い方）
- **FAQ.md** → TUTORIAL.md（基本）、TROUBLESHOOTING.md（エラー解決）
- **NIP_SUPPORT.md** → API_REFERENCE.md（API詳細）、EXAMPLES.md（使用例）
- **PERFORMANCE.md** → BEST_PRACTICES.md（設計指針）、API_REFERENCE.md（API詳細）
