---
title: "CLAUDE.mdの書き方ガイド｜AIに記憶を持たせて生産性を上げる方法"
emoji: "🧠"
type: "tech"
topics: ["claudecode", "ai", "productivity", "devtools"]
publish_order: 2
published: false
---

CLAUDE.mdは、プロジェクトの情報をAIに記憶させるための設定ファイルです。一度書けば毎回の説明が不要になり、開発の生産性が激変します。書き方のコツと実例を紹介します。

## CLAUDE.mdとは何か

**CLAUDE.md**は、プロジェクトのルートに置くマークダウンファイルです。Claude Codeが起動するたびに自動で読み込まれ、AIが「このプロジェクトについての記憶」を持つことができます。

ChatGPTやClaude Web版では毎回「このプロジェクトはReactで書いていて、TypeScriptで...」と説明する必要がありますよね。CLAUDE.mdがあればそれが不要になります。

## なぜ必要なのか

Claude Codeは毎回新しい会話として始まります。昨日の作業内容は覚えていません。

CLAUDE.mdを置くことで：

- **プロジェクトの技術スタック**を毎回説明しなくていい
- **コーディング規約**を守ってくれる
- **やってはいけないこと**を事前に伝えられる
- **よく使うコマンド**を教えておける

## 基本的な書き方

プロジェクトのルートに `CLAUDE.md` を作成します：

```markdown
# CLAUDE.md

## プロジェクト概要
React + TypeScriptで作るTodoアプリ。

## 技術スタック
- React 19
- TypeScript
- Tailwind CSS
- Vite

## コマンド
- `npm run dev` — 開発サーバー起動
- `npm run build` — ビルド
- `npm run test` — テスト実行

## コーディング規約
- コンポーネントはアロー関数で書く
- CSSはTailwindのユーティリティクラスを使う
- 型定義は `types/` ディレクトリにまとめる

## やらないこと
- any型は使わない
- console.logを残さない
- 日本語のコメントは書かない（英語で書く）
```

## 効果的なCLAUDE.mdの書き方

### 1. 具体的に書く

```markdown
# ❌ 悪い例
きれいなコードを書いてください

# ✅ 良い例
- 関数は30行以内に収める
- 変数名はキャメルケースで書く
- コンポーネントのpropsにはinterfaceで型を定義する
```

### 2. よく使うコマンドを書く

```markdown
## コマンド
- `npm run dev` — 開発サーバー起動（ポート3000）
- `npm run lint` — ESLintチェック
- `npm run lint:fix` — ESLint自動修正
- `npm run typecheck` — TypeScript型チェック
```

これを書いておくと、「lint通して」と言うだけで正しいコマンドを実行してくれます。

### 3. ディレクトリ構成を書く

```markdown
## ディレクトリ構成
src/
├── components/   # UIコンポーネント
├── hooks/        # カスタムフック
├── services/     # API呼び出し
├── stores/       # Zustand ストア
├── types/        # 型定義
└── utils/        # ユーティリティ関数
```

新しいファイルを作るとき、正しい場所に配置してくれるようになります。

### 4. 禁止事項を明示する

```markdown
## 禁止事項
- `.env` ファイルをgitにコミットしない
- `node_modules/` を直接編集しない
- `main` ブランチに直接pushしない
```

## 実際のCLAUDE.mdの例

実務で使えるレベルのCLAUDE.mdの例です：

```markdown
# CLAUDE.md

## 概要
ECサイトのフロントエンド。Next.js App Router使用。

## 技術スタック
- Next.js 15 (App Router)
- TypeScript (strict mode)
- Tailwind CSS + shadcn/ui
- Zustand（状態管理）
- TanStack Query（データ取得）
- Supabase（バックエンド）

## コマンド
- `npm run dev` — 開発サーバー
- `npm run build` — ビルド
- `npm run lint` — Lint
- `npm run typecheck` — 型チェック

## パスエイリアス
`@/*` → `src/*`

## コーディング規約
- Server ComponentsとClient Componentsを明確に分離する
- "use client" は必要なコンポーネントにのみ付与
- API呼び出しは `src/services/` にまとめる
- 型定義は `src/types/` に配置

## 注意事項
- 環境変数は `NEXT_PUBLIC_` プレフィックスが必要（クライアント側）
- Supabaseのキーは `.env.local` に格納（gitignore済み）
```

## CLAUDE.mdの配置場所

CLAUDE.mdは複数の場所に置けます：

| 場所 | スコープ |
|------|----------|
| プロジェクトルート | そのプロジェクト内で有効 |
| ホームディレクトリ `~/.claude/CLAUDE.md` | すべてのプロジェクトで有効 |

プロジェクト固有のルールはプロジェクトルートに、共通のルール（「返答は日本語で」など）はホームディレクトリに置くと便利です。

## まとめ

- **CLAUDE.md**はAIに「プロジェクトの記憶」を持たせるファイル
- 技術スタック、コマンド、コーディング規約を書いておく
- **具体的に書く**のがコツ
- 一度書けば毎回の説明が不要になり、生産性が激変する

---

:::message
「Claude Code 超入門」シリーズ第5回です。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
