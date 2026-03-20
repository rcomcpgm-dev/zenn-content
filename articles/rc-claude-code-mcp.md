---
title: "Claude CodeのMCPサーバー連携ガイド｜外部ツールとAIをつなぐ方法"
emoji: "🔌"
type: "tech"
topics: ["claudecode", "mcp", "api", "devtools"]
published: true
---

MCP（Model Context Protocol）を使えば、Claude Codeからブラウザ操作、データベース接続、外部API呼び出しが可能になります。設定方法と実用例を解説します。

## MCPとは

**MCP（Model Context Protocol）** は、AIと外部ツールをつなぐための仕組みです。

Claude Code単体でもファイル操作やコマンド実行はできますが、MCPサーバーを接続すると：

- **ブラウザの操作**（Puppeteer）
- **データベースの読み書き**（PostgreSQL, Supabase）
- **外部APIの呼び出し**（GitHub, Slack, Notion）
- **Web検索**

などが可能になります。

## イメージ

```
Claude Code（AI）
    ↕ MCP Protocol
MCPサーバー（ブラウザ操作、DB接続、API呼び出し...）
```

MCPサーバーは「AIの手足を増やすプラグイン」だと思ってください。

## MCPサーバーの設定方法

Claude Codeの設定ファイルにMCPサーバーを追加します。

### 設定ファイルの場所

```
~/.claude/settings.json      ← グローバル設定
プロジェクト/.claude/settings.json  ← プロジェクト固有
```

### 設定例：ファイルシステムMCPサーバー

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@anthropic-ai/mcp-filesystem",
        "/path/to/allowed/directory"
      ]
    }
  }
}
```

## 便利なMCPサーバー

### 1. Puppeteer（ブラウザ操作）

Webスクレイピングやブラウザテストに使えます。

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-puppeteer"]
    }
  }
}
```

使用例：
```
localhostの画面をスクリーンショット撮って
```

### 2. GitHub

GitHub上のIssueやPRを操作できます。

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxx"
      }
    }
  }
}
```

使用例：
```
このリポジトリのIssue一覧を見せて
新しいPRを作成して
```

### 3. PostgreSQL / Supabase

データベースに直接クエリを実行できます。

使用例：
```
usersテーブルの構造を見せて
直近1週間の登録ユーザー数を教えて
```

## MCPサーバーを使う上での注意点

### セキュリティ

- MCPサーバーには**必要最小限の権限**だけ与える
- APIトークンは `.env` ファイルで管理し、gitにコミットしない
- 本番DBへの書き込み権限は与えない（読み取り専用にする）

### パフォーマンス

- MCPサーバーを多く接続しすぎるとClaude Codeの起動が遅くなる
- 使わないサーバーは設定から外しておく

## 自作MCPサーバー

MCPサーバーは自分で作ることもできます。Anthropic公式のSDKを使えば、TypeScriptやPythonで開発可能です。

```
社内のAPIをMCPサーバー化すれば、
Claude Codeから「今日の売上を教えて」で
社内データにアクセスできるようになる
```

## まとめ

- MCPは **AIと外部ツールをつなぐプロトコル**
- ブラウザ操作、DB接続、API呼び出しなどが可能になる
- 設定ファイルにサーバー情報を書くだけで使える
- セキュリティに注意（最小権限の原則）

---

:::message
「Claude Code 超入門」シリーズ第8回です。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
