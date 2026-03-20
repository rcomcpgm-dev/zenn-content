---
title: "Claude Code × Git入門｜バージョン管理で安全にAI開発する方法"
emoji: "🔒"
type: "tech"
topics: ["claudecode", "git", "github", "beginners"]
published: true
---

Claude CodeとGitを組み合わせれば、AIの変更をいつでも元に戻せる安全な開発環境が手に入ります。Git未経験でもわかるように基本から解説します。

## なぜGitが必要なのか

Claude Codeはファイルを直接編集します。つまり、AIが間違った変更をすると**元に戻せなくなる**リスクがあります。

Gitを使えば：
- いつでも前の状態に戻せる
- 変更内容を確認してから確定できる
- チーム開発でも安全に作業できる

## Gitの基本（3分で理解）

Gitは「セーブポイント」を作るツールだと思ってください。

```
作業する → セーブ（コミット） → 作業する → セーブ → ...
```

何か問題が起きたら、いつでもセーブポイントに戻れます。

### 最低限覚えるコマンド

```bash
# 今の状態を確認
git status

# 変更をセーブ準備に追加
git add .

# セーブ（コミット）する
git commit -m "ヘッダーを追加"

# 変更履歴を見る
git log --oneline

# 前の状態に戻す
git checkout -- ファイル名
```

## Claude CodeとGitの連携

### Claude Codeにコミットしてもらう

```
今の変更をgitにコミットして
```

Claude Codeが適切なコミットメッセージを考えて、コミットまで実行してくれます。

### 変更前にブランチを切る

大きな変更をする前は、ブランチを作っておくと安全です：

```
新しいブランチ「feature/header」を作って、そこでヘッダーコンポーネントを作って
```

Claude Codeがブランチの作成からコーディングまで一気にやってくれます。

### 差分を確認する

```
今の変更内容を見せて
```

Claude Codeが `git diff` の結果を見て、変更内容をわかりやすく説明してくれます。

## 安全に使うためのルール

### 1. 作業前に必ずコミット

```bash
git add .
git commit -m "作業開始前のセーブ"
```

こうしておけば、AIの変更が気に入らなくても `git checkout .` で一瞬で戻せます。

### 2. こまめにコミット

1つの機能が完成するたびにコミットしましょう。「ヘッダー追加」「フッター追加」「ログイン機能追加」のように細かく区切ります。

### 3. mainブランチを直接触らない

```bash
# 新しいブランチで作業
git checkout -b feature/新機能名

# 作業が完了したらmainにマージ
git checkout main
git merge feature/新機能名
```

## GitHubとの連携

ローカルのGitリポジトリをGitHubにpushすれば、クラウドにバックアップできます：

```bash
# GitHubにリポジトリを作成（GitHub CLI使用）
gh repo create my-project --public

# pushする
git push -u origin main
```

Claude Codeに頼むこともできます：

```
このプロジェクトをGitHubにpushして
```

## よくあるトラブル

| 症状 | 対処 |
|------|------|
| コミットを忘れてAIに壊された | `git reflog` で履歴を探して復元 |
| マージで衝突（コンフリクト）した | Claude Codeに「コンフリクトを解消して」と頼む |
| 間違えてpushした | `git revert` で打ち消しコミットを作る |

## まとめ

- Gitは「セーブポイント」を作る仕組み
- **作業前のコミット**が最大の安全策
- Claude Codeにgit操作も任せられる
- GitHubにpushしてバックアップ

---

:::message
「Claude Code 超入門」シリーズ第6回です。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
