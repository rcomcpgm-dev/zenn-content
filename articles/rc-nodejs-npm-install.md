---
title: "Node.jsとnpmのインストール方法｜Windows/Mac対応【2025年最新】"
emoji: "📦"
type: "tech"
topics: ["nodejs", "npm", "beginners", "setup"]
publish_order: 1
published: false
---

Node.jsとnpmはClaude Codeを使うために必要な基盤ツールです。Windows・Mac両対応で、ダウンロードからインストール完了まで5分で終わる手順を解説します。

## この記事でやること

Claude Codeを使うために必要な **Node.js** と **npm** をインストールします。やることは「ダウンロードしてクリック」だけです。

## Node.jsとnpmって何？

- **Node.js** = パソコン上でJavaScriptを動かすための土台
- **npm** = Node.jsと一緒に入る「道具箱」。便利なツールをコマンド一発でインストールできる

Claude Codeはnpmを使ってインストールするので、まずこの2つが必要です。

## Windowsの場合

### 1. ダウンロード

公式サイトにアクセスします：
👉 https://nodejs.org/ja

**「LTS（推奨版）」** のボタンをクリックしてダウンロードしてください。

:::message
LTSは「Long Term Support」の略で、安定版です。「最新版」ではなく必ずLTSを選んでください。
:::

### 2. インストール

ダウンロードしたファイルをダブルクリックして、「Next」を押していくだけです。設定はデフォルトのままでOK。

### 3. 確認

コマンドプロンプトを開いて、以下を実行します：

```bash
node -v
```

`v20.xx.x` のようにバージョンが表示されればOKです。続いて：

```bash
npm -v
```

こちらも数字が出ればインストール完了です。

## Macの場合

### 1. ダウンロード＆インストール

Windowsと同じく公式サイトからLTS版をダウンロード：
👉 https://nodejs.org/ja

`.pkg` ファイルを開いて「続ける」を押していくだけです。

### 2. 確認

ターミナルを開いて（Cmd + Space → 「ターミナル」と入力）：

```bash
node -v
npm -v
```

バージョンが表示されれば完了です。

## うまくいかない場合

| 症状 | 原因 | 対処 |
|------|------|------|
| `node` コマンドが見つからない | PATHが通っていない | PCを再起動する |
| 古いバージョンが表示される | 以前のNode.jsが残っている | アンインストールしてから再インストール |
| 権限エラーが出る（Mac） | sudoが必要 | `sudo npm install` で再試行 |

## まとめ

- Node.js公式サイトから **LTS版** をダウンロード
- インストーラーを実行（デフォルト設定でOK）
- `node -v` と `npm -v` で確認

次の記事ではいよいよ **Claude Codeのインストール** に入ります。

---

:::message
「Claude Code 超入門」シリーズ第2回です。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
