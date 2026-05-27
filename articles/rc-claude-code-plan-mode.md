---
title: "Claude CodeのPlan Mode活用術｜AIの精度を上げる計画モードとは"
emoji: "📋"
type: "tech"
topics: ["claudecode", "ai", "productivity", "programming"]
published: true
---

Claude CodeのPlan Modeを使えば、AIが作業前に計画を提示し、確認してから実行に移れます。複雑なタスクでの精度が劇的に向上します。

## Plan Modeとは

Claude Codeには2つのモードがあります：

- **通常モード** — 指示を受けたらすぐにコードを書き始める
- **Plan Mode** — まず計画を立ててから実行する

Plan Modeでは、AIが「何をするか」を先に提案し、あなたが確認してから実行に移ります。

## なぜPlan Modeが必要なのか

通常モードだと、AIは指示を受けた瞬間にコードを書き始めます。シンプルなタスクならそれでOKですが、複雑な作業だと：

- 想定と違う方向に進んでしまう
- 余計なファイルを作られる
- 既存のコードを壊される

Plan Modeを使えば、**実行前に計画を確認・修正できる**ので、これらの問題を防げます。

## 使い方

### Plan Modeに切り替える

Claude Codeの中で **Shift + Tab** を押すとPlan Modeに切り替わります。

もしくは、プロンプトに明示的に書くこともできます：

```
まず計画を立てて。実行はしないで。
```

### 計画を確認して実行

Plan Modeで指示を出すと、AIが以下のような計画を返します：

```
計画：
1. src/components/Header.tsx を新規作成
2. ナビゲーションリンク（Home, About, Contact）を含める
3. src/App.tsx の先頭に Header を import して配置
4. Tailwind CSSでスタイリング

この計画で進めてよいですか？
```

OKなら「進めて」と返すだけ。修正したければ：

```
Contactページはまだないから、リンクはHomeとAboutだけにして
```

と指示を追加できます。

## Plan Modeが効果的な場面

### 1. 複数ファイルにまたがる変更

```
ユーザー認証機能を追加して
```

→ Plan Modeなら「どのファイルを作成・変更するか」を事前に確認できる

### 2. リファクタリング

```
コンポーネントの構成を整理して
```

→ 既存コードの削除や移動が伴うので、事前確認が重要

### 3. よくわからない技術を使うとき

```
WebSocketでリアルタイムチャットを実装して
```

→ AIの実装方針を確認してから進められる

## Plan Modeが不要な場面

- ファイル1つの簡単な修正
- タイポの修正
- コメントの追加
- `console.log` の削除

シンプルなタスクは通常モードの方が速いです。

## 実践例

### 例：ブログ機能の追加

**通常モード**だと：
```
ブログ機能を追加して
→ AIが勝手に10個くらいファイルを作成
→ 「いや、そういう構成じゃなくて...」
→ やり直し
```

**Plan Mode**だと：
```
ブログ機能を追加して（Plan Modeで）

AI: 以下の計画で進めます：
1. src/types/blog.ts — 型定義
2. src/services/blogService.ts — API呼び出し
3. src/components/BlogList.tsx — 記事一覧
4. src/components/BlogPost.tsx — 記事詳細
5. src/pages/blog/index.tsx — ブログページ
6. ナビゲーションにブログへのリンクを追加

あなた: BlogListとBlogPostは1つのファイルにまとめて。
       ページはApp Routerの規約に従って。

AI: 了解。計画を修正して実行します。
```

**1回で正しい方向に進める**のがPlan Modeの価値です。

## まとめ

- **Shift + Tab** でPlan Modeに切り替え
- 複雑なタスクは **計画 → 確認 → 実行** の流れで進める
- シンプルなタスクは通常モードでOK
- 「まず計画を立てて」と日本語で言うだけでもOK

---

:::message
「Claude Code 超入門」シリーズ第7回です。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
