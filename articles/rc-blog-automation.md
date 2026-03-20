---
title: "Claude Codeでブログ自動化システムを構築する"
emoji: "🤖"
type: "tech"
topics: ["claudecode", "automation", "github", "zenn"]
published: false
---

## この記事でやること

**ブログ記事の生成から公開までを自動化するシステム**を構築します。実際にこの記事シリーズの運用に使っている仕組みです。

## 自動化の全体像

```
記事をClaude Codeでまとめて書き溜める（published: false）
    ↓
GitHub Actions（毎日定時に実行）
    ↓
1本ずつ published: true に変更してpush
    ↓
Zenn（GitHub連携で自動反映）
```

## ステップ1：記事を書き溜める

Claude Codeで記事を一気に生成します：

```
Claude Codeの使い方について記事を5本書いて。
Zennのフォーマットで、articles/ディレクトリに保存して。
published: false で作成して。
```

記事はリポジトリにあるけどZennには公開されない「ストック状態」になります。

## ステップ2：GitHub Actionsで自動公開

`.github/workflows/auto-publish.yml` を作成：

```yaml
name: Auto Publish Articles

on:
  schedule:
    # 毎日日本時間10:00（UTC 01:00）に実行
    - cron: '0 1 * * *'
  workflow_dispatch: # 手動実行も可能

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Find and publish one unpublished article
        run: |
          FILE=$(grep -rl 'published: false' articles/ | head -1)

          if [ -z "$FILE" ]; then
            echo "No unpublished articles found."
            exit 0
          fi

          echo "Publishing: $FILE"
          sed -i 's/published: false/published: true/' "$FILE"

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add "$FILE"
          git commit -m "Auto-publish: $(basename $FILE .md)"
          git push
```

### ポイント

- **毎日1本ずつ**公開（Zennのレート制限を回避）
- 未公開記事がなくなれば何もしない
- 手動実行も可能（GitHub Actionsの画面から「Run workflow」）

## ステップ3：公開順序を制御する

ファイル名にプレフィックスをつけると公開順序を制御できます：

```
articles/
├── 01-first-article.md     # 最初に公開
├── 02-second-article.md    # 2番目
├── 03-third-article.md     # 3番目
```

## 応用：X（Twitter）への自動投稿

記事公開と同時にXに宣伝投稿を出すステップも追加できます。X APIのキーをGitHub Secretsに登録して、ワークフローに投稿ステップを追加するだけ。

## コスト

| サービス | 費用 |
|----------|------|
| GitHub Actions | 無料（月2000分まで） |
| Zenn | 無料 |

**完全無料で運用できます。**

## まとめ

- 記事をClaude Codeでまとめて書き溜める
- GitHub Actionsで毎日1本ずつ自動公開
- Zenn × GitHub連携で手動作業ゼロ
- 全部無料で運用可能

---

:::message
Claude Code実践シリーズ第2回。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
