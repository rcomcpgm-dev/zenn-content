---
title: "Claude Codeのインストール方法｜初心者向けセットアップ完全ガイド【2025年】"
emoji: "🚀"
type: "tech"
topics: ["claudecode", "nodejs", "setup", "beginners"]
published: true
---

Claude CodeはAnthropicが提供するCLI型AIコーディングアシスタントです。この記事では、インストールから初回起動、動作確認までを初心者向けにステップバイステップで解説します。

## Claude Codeとは

**Claude Code**はAnthropicが提供するCLIベースのAIコーディングアシスタントです。ターミナルで日本語を打つだけで、AIがコードを書いてくれます。

GitHub CopilotやCursorと違い、**エディタに依存しない**のが最大の特徴。ターミナルさえあればどこでも使えます。

## 必要なもの

- Node.js（v18以上）→ [前回の記事でインストール済み](https://zenn.dev/rcomcpgm/articles/nodejs-npm-install)
- Anthropicのアカウント（Claudeのアカウント）

## インストール手順

### 1. npmでインストール

ターミナルを開いて以下を実行します：

```bash
npm install -g @anthropic-ai/claude-code
```

:::message alert
Macの場合、権限エラーが出たら先頭に `sudo` をつけてください：
`sudo npm install -g @anthropic-ai/claude-code`
:::

### 2. インストール確認

```bash
claude --version
```

バージョン番号が表示されればインストール完了です。

### 3. 初回起動

任意のフォルダで以下を実行します：

```bash
claude
```

初回起動時にAnthropicアカウントへのログインが求められます。ブラウザが自動で開くので、ログインして認証を完了してください。

## 料金プラン

Claude Codeを使うには以下のいずれかが必要です：

| プラン | 料金 | 特徴 |
|--------|------|------|
| Claude Pro | $20/月 | Claude Codeの利用制限あり |
| Claude Max 5x | $100/月 | たっぷり使える |
| Claude Max 20x | $200/月 | ヘビーユーザー向け |
| API従量課金 | 使った分だけ | 自動化向き |

おすすめは **Claude Max 5x（$100/月）** です。プログラミングに使うなら十分な量が使えます。

## 起動してみよう

適当なフォルダを作って、Claude Codeを起動してみましょう：

```bash
mkdir my-first-project
cd my-first-project
claude
```

起動すると入力待ちの状態になります。試しにこう打ってみてください：

```
Hello World を表示するHTMLファイルを作って
```

AIがHTMLファイルを生成してくれます。**これだけです。** コードを1行も書かずにファイルが完成しました。

## トラブルシューティング

| 症状 | 対処法 |
|------|--------|
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code` を再実行 |
| ログイン画面が出ない | `claude logout` してから `claude` で再起動 |
| 動作が遅い | インターネット接続を確認。VPNを切ってみる |

## まとめ

- `npm install -g @anthropic-ai/claude-code` でインストール
- `claude` で起動、初回はブラウザでログイン
- 日本語で指示するだけでコードを生成してくれる

次回は **Claude Codeの基本的な使い方** を詳しく解説します。

---

:::message
「Claude Code 超入門」シリーズ第3回です。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
