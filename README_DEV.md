# tsunagiya - 開発者向けガイド

## クイックスタート

### 1. 必要なファイルを読む

- **CLAUDE.md** - 開発ガイド（技術スタック、コーディング規約、注意点）
- **REQUIREMENTS.md** - 要件定義書（API設計、使用例）
- **ROADMAP.md** - 実装タスクリスト（Phase 1-5）
- **.clinerules** - Claude Code用ルール

### 2. 開発環境確認

```bash
deno --version  # v1.40以上推奨
deno task check # 型チェック + lint + format
```

### 3. 実装の進め方

**Phase 1から順番に進める:**

1. ROADMAP.mdのPhase 1タスクを1つずつ実装
2. 実装と同時にテストを書く
3. モジュール完成後に自己チェック:
   - `deno task test` - テスト実行
   - `deno task check` - 品質確認（lint + 型チェック）
   - エラーがあれば自分で修正
4. 全チェックパス後にcommit
5. Phase完了時にsupervisor（かにこ）に報告

### 4. コマンド一覧

```bash
deno task test        # テスト実行
deno task check       # 型チェック + lint + format確認
deno task fmt         # フォーマット
deno publish --dry-run  # JSR公開プレビュー
```

### 5. Git コミット

```bash
git add .
git commit -m "feat: implement MockPool class

Co-authored-by: kaniko (claude-code) <kaniko@openclaw.local>"
```

## 重要な制約

- ✅ ゼロ外部依存（Deno標準ライブラリのみ）
- ✅ Node.js互換性を維持
- ✅ TypeScript strict mode
- ✅ `any` 禁止、`unknown` を使う
- ✅ テストで必ず `pool.uninstall()` を呼ぶ（finally使用）

## ディレクトリ構造

```
src/
├── mod.ts              # メインエントリポイント
├── pool.ts             # MockPool
├── relay.ts            # MockRelay
├── websocket.ts        # MockWebSocket
├── filter.ts           # フィルターマッチング
├── auth.ts             # NIP-42 AUTH
├── types.ts            # 型定義
├── logger.ts           # ログ機能
└── testing/
    ├── mod.ts          # テスト支援エントリポイント
    ├── event_builder.ts
    ├── filter_builder.ts
    ├── assertions.ts
    ├── stream.ts
    └── snapshot.ts

tests/
├── pool_test.ts
├── relay_test.ts
├── websocket_test.ts
├── filter_test.ts
├── auth_test.ts
├── integration_test.ts
└── testing/
    ├── event_builder_test.ts
    ├── filter_builder_test.ts
    ├── assertions_test.ts
    ├── stream_test.ts
    └── snapshot_test.ts
```

## 役割分担

### Claude Code（実装チーム）

- ✅ コード実装
- ✅ テスト作成
- ✅ 品質チェック（`deno task check`）
- ✅ エラー修正
- ✅ Git commit
- ✅ Phase完了報告（supervisor へ）

### かにこ（supervisor）

- ✅ Phase管理
- ✅ Discordスレッドへの進捗報告
- ✅ 最終判断（大きな方針変更時）

**基本方針**: Claude Codeが自律的に開発、かにこは監督に専念

---

## 困ったら

1. CLAUDE.md / REQUIREMENTS.md を再確認
2. 自分で解決を試みる（lint/型エラー等）
3. ブロックされたらsupervisor（かにこ）に報告
