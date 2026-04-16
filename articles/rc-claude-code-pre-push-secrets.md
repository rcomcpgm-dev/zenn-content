---
title: "Claude Codeでpre-pushフックを作る｜APIキー漏洩を防ぐ自動チェック"
emoji: "🔐"
type: "tech"
topics: ["claudecode", "git", "security", "devtools"]
publish_order: 14
published: false
---

GitHubにAPIキーをpushしてしまった経験、ありませんか？この記事では、**push前に秘密情報を自動検出してブロックするpre-pushフック**をClaude Codeで作る方法を紹介します。5分で設定できて、一生安心です。

## この記事でわかること

- pre-pushフックでAPIキー漏洩を防ぐ仕組み
- 実際のフックコード（コピペで使える）
- Claude Codeに作らせるプロンプト例

## なぜpre-pushフックが必要か

`.env`を`.gitignore`に入れていても、事故は起きます。

- デバッグ中にAPIキーをコード内にハードコードして、そのままコミット
- 環境変数名じゃなく**値そのもの**をconfigファイルに書いてしまう
- `.env.example`に本物のキーを入れてしまう

**一度GitHubにpushしたら、force pushで消してもgit履歴に残ります。** キーを再発行するしかありません。

実際に漏洩しやすいキーの例：

- `sk-ant-...`（Anthropic API Key）
- `sk_live_...`（Stripe Secret Key）
- `sbp_...`（Supabase Access Token）
- `eyJhbGciOi...`（JWT / Supabase Service Role Key）

## pre-pushフックの仕組み

Gitには「フック」という仕組みがあり、特定のGit操作の前後にスクリプトを自動実行できます。

`.git/hooks/pre-push`にシェルスクリプトを配置すると：

1. `git push`実行時に自動で起動
2. スクリプトが**終了コード0**を返せばpush続行
3. **終了コード1**を返せばpushをブロック

誤検知でどうしてもpushしたい場合は`--no-verify`で回避できます。

```bash
git push --no-verify
```

## 実装コード

以下のスクリプトを`.git/hooks/pre-push`として保存します。

```bash
#!/bin/bash

echo "🔍 秘密情報チェック実行中..."

# チェック対象の正規表現パターン
PATTERNS=(
    # API Keys / Tokens
    'sk-ant-[a-zA-Z0-9_-]{20,}'          # Anthropic API Key
    'sk_live_[a-zA-Z0-9]{20,}'           # Stripe Live Secret Key
    'sk_test_[a-zA-Z0-9]{20,}'           # Stripe Test Secret Key
    'sbp_[a-zA-Z0-9]{20,}'              # Supabase Access Token
    'eyJhbGciOi[a-zA-Z0-9_-]{50,}'      # JWT Token (Supabase等)

    # 環境変数にキーの値が直書きされているパターン
    'ANTHROPIC_API_KEY\s*[:=]\s*["\x27]?sk-'
    'SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["\x27]?ey'
    'X_API_KEY\s*[:=]\s*["\x27][a-zA-Z0-9]{15,}'
    'X_ACCESS_TOKEN\s*[:=]\s*["\x27][a-zA-Z0-9]{15,}'
    'X_API_SECRET\s*[:=]\s*["\x27][a-zA-Z0-9]{15,}'
    'X_ACCESS_SECRET\s*[:=]\s*["\x27][a-zA-Z0-9]{15,}'
    'STRIPE_SECRET_KEY\s*[:=]\s*["\x27]?sk_'
    'QIITA_TOKEN\s*[:=]\s*["\x27][a-zA-Z0-9]{15,}'

    # パスワード直書き
    'password\s*[:=]\s*["\x27][^"\x27]{8,}'

    # AWS
    'AKIA[0-9A-Z]{16}'                   # AWS Access Key ID

    # GitHub
    'ghp_[a-zA-Z0-9]{36}'               # GitHub Personal Access Token
    'gho_[a-zA-Z0-9]{36}'               # GitHub OAuth Token

    # Generic
    'private_key\s*[:=]\s*["\x27]'
    'secret\s*[:=]\s*["\x27][a-zA-Z0-9]{20,}'
)

# チェック対象外のファイルパターン
EXCLUDE_PATTERNS="\.md$|\.lock$|node_modules|\.git/|package-lock\.json|yarn\.lock|pre-push"

# プッシュ対象のコミット範囲を取得
while read local_ref local_sha remote_ref remote_sha; do
    if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
        # 新しいブランチの場合、全コミットをチェック
        COMMITS=$(git rev-list "$local_sha" --not --remotes)
    else
        # 既存ブランチの場合、差分コミットをチェック
        COMMITS=$(git rev-list "$remote_sha..$local_sha")
    fi

    if [ -z "$COMMITS" ]; then
        continue
    fi

    FOUND=0

    for COMMIT in $COMMITS; do
        # コミット内の差分を取得（追加行のみ）
        DIFF=$(git diff-tree -p "$COMMIT" | grep "^+" | grep -v "^+++" | grep -vE "$EXCLUDE_PATTERNS")

        for PATTERN in "${PATTERNS[@]}"; do
            MATCHES=$(echo "$DIFF" | grep -nE "$PATTERN" 2>/dev/null)
            if [ -n "$MATCHES" ]; then
                if [ "$FOUND" -eq 0 ]; then
                    echo ""
                    echo "❌ 秘密情報の可能性があるパターンを検出しました！"
                    echo "================================================"
                fi
                FOUND=1
                SHORT_SHA=$(git rev-parse --short "$COMMIT")
                echo ""
                echo "📌 コミット: $SHORT_SHA"
                echo "   パターン: $PATTERN"
                echo "   該当行:"
                echo "$MATCHES" | head -3 | while read -r line; do
                    echo "     $line"
                done
            fi
        done
    done

    if [ "$FOUND" -ne 0 ]; then
        echo ""
        echo "================================================"
        echo "⛔ プッシュを中断しました"
        echo ""
        echo "対処方法："
        echo "  1. 秘密情報を環境変数に移す"
        echo "  2. git rebase -i で該当コミットを修正"
        echo "  3. 誤検知の場合: git push --no-verify"
        echo ""
        exit 1
    fi
done

echo "✅ 秘密情報チェック完了 - 問題なし"
exit 0
```

保存したら実行権限を付与します。

```bash
chmod +x .git/hooks/pre-push
```

## Claude Codeに作らせる方法

自分のプロジェクトに合わせたフックが欲しい場合、Claude Codeに以下のように指示します。

```
pre-pushフックを作って。
以下のAPIキーやトークンがコミットに含まれていたらpushをブロックして：
- Supabase（sbp_, JWT）
- Stripe（sk_live_, sk_test_）
- Anthropic（sk-ant-）
- X API関連のキー
- パスワードの直書き

.git/hooks/pre-push に保存して実行権限もつけて。
```

プロジェクトで使っているサービスに合わせてパターンを追加・変更すれば、自分専用のセキュリティチェックが完成します。

## 動作確認

### 問題なしの場合

```bash
$ git push origin main
🔍 秘密情報チェック実行中...
✅ 秘密情報チェック完了 - 問題なし
Enumerating objects: 5, done.
...
```

### 検出された場合

```bash
$ git push origin main
🔍 秘密情報チェック実行中...

❌ 秘密情報の可能性があるパターンを検出しました！
================================================

📌 コミット: a1b2c3d
   パターン: sk_live_[a-zA-Z0-9]{20,}
   該当行:
     +const stripeKey = "sk_live_1234567890abcdefghij"

================================================
⛔ プッシュを中断しました

対処方法：
  1. 秘密情報を環境変数に移す
  2. git rebase -i で該当コミットを修正
  3. 誤検知の場合: git push --no-verify
```

## 補足

**GitHub側のSecret Scanningとの違い**

GitHub側にもSecret Scanning機能がありますが、これは**pushされた後**に検出する仕組みです。pre-pushフックなら**pushする前にブロック**できるので、キーの再発行が不要になります。

**チーム開発の場合**

`.git/hooks/`はGit管理外のため、チームメンバーに共有できません。チーム開発では以下のツールを検討してください：

- **Husky** - package.jsonでGitフックを管理
- **pre-commit** - 言語非依存のフック管理ツール
- **gitleaks** - 専用の秘密情報検出ツール

**個人開発なら直接`.git/hooks/`に置くのが最速です。** セットアップ不要、依存関係なし。

## まとめ

- `.git/hooks/pre-push`にスクリプトを置くだけで、push前に秘密情報を自動チェックできる
- 正規表現パターンを自分のプロジェクトに合わせてカスタマイズする
- Claude Codeに「pre-pushフック作って」で一発生成できる
- 個人開発なら5分で設定完了、一生安心

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
