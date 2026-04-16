---
title: "CLAUDE.mdを育てる技術｜4プロジェクト運用で学んだメモリ設計"
emoji: "📝"
type: "tech"
topics: ["claudecode", "ai", "productivity", "devtools"]
publish_order: 13
published: false
---

## この記事でわかること

- 複数プロジェクトをClaude Codeで運用するときのCLAUDE.md設計パターン
- `~/.claude/projects/` 配下のメモリシステムの構築方法
- AIが同じミスを繰り返さなくなる「feedbackメモリ」の実践例
- メモリに「保存すべきもの」と「保存すべきでないもの」の判断基準

筆者は4つのプロジェクト（Expoアプリ / Next.js SaaS / Zenn記事+SNS自動化 / ポートフォリオLP）を1つのワークスペースでClaude Codeを使って運用している。その中で試行錯誤した結果をまとめた。

---

## 1. CLAUDE.mdだけでは足りない問題

Claude Codeはプロジェクトルートの `CLAUDE.md` を自動で読み込み、コンテキストとして利用する。1プロジェクトならこれで十分だ。

しかし、複数プロジェクトを1つのワークスペースで管理し始めると破綻する。

筆者のワークスペースには4つのプロジェクトが同居している。

```markdown
# CLAUDE.md（実際の構成から抜粋）

## リポジトリ概要

| プロジェクト | ディレクトリ | 技術スタック |
|-------------|-------------|-------------|
| 献立ガチャ   | kondate/    | Expo 55 · TypeScript · Stripe · Claude API |
| サイトメーカー | sitemaker/  | Next.js 16 · TypeScript · Tailwind |
| Zenn記事+SNS自動化 | zenn-content/ | Zenn CLI · Claude API · X API |
| 個人LP      | lp/         | Next.js 16 · TypeScript · Tailwind |
```

これだけなら問題ない。問題はプロジェクト固有のルールが増えたときだ。

たとえば `kondate/` にはセキュリティチェックリストがある。`zenn-content/` にはX自動化のアーキテクチャ図、スケジュール一覧、データファイル一覧がある。それぞれのプロジェクトに固有の制約やルールがあり、これを全部1つの `CLAUDE.md` に書くと200行を軽く超える。

ここで重要なのが **「ワークスペース共通のルール」と「プロジェクト固有のルール」を分離する** ことだ。

CLAUDE.mdのトップレベルには共通ルールだけを書く。

```markdown
## 共通ルール

- **コミットメッセージは日本語で書くこと**
```

その下にプロジェクトごとのセクションを設ける。Claude Codeはファイル全体を読むが、どのディレクトリの作業かを判別して関連セクションを重視してくれる。

ただし、CLAUDE.mdはあくまで「プロジェクトの構造とルール」を伝えるためのものだ。「ユーザーの好み」「過去の失敗から学んだこと」「セッションを跨いで覚えておくべきこと」は別の仕組みが必要になる。

それがメモリシステムである。

---

## 2. メモリシステムの設計

Claude Codeには `~/.claude/projects/` 配下にプロジェクト単位でメモリを保存する仕組みがある。ディレクトリ構造はこうなる。

```
~/.claude/projects/
  └── E--Code/          # ワークスペースのパスに対応
      └── memory/
          ├── MEMORY.md                    # インデックス（目次）
          ├── user_profile.md              # ユーザー情報
          ├── feedback_no_sycophancy.md     # フィードバック
          ├── feedback_commit_japanese.md   # フィードバック
          ├── feedback_verify_before_answering.md
          ├── project_sitemaker_todo.md     # プロジェクト状態
          ├── project_x_api_cost.md         # プロジェクト状態
          └── reference_github_repos.md     # リファレンス
```

### MEMORY.md（インデックス）

`MEMORY.md` はメモリ全体の目次だ。個別ファイルへのリンクと1行の説明を持つ。

```markdown
# Memory Index

## Feedback
- [No sycophancy](feedback_no_sycophancy.md) — Always give honest opinions
- [Verify before answering](feedback_verify_before_answering.md) — Check source code first
- [Commit messages in Japanese](feedback_commit_japanese.md) — 日本語でコミット

## User
- [User profile](user_profile.md) — Freelance IT consultant, uses Claude Code

## Projects
- [SiteMaker TODO](project_sitemaker_todo.md) — 未実装タスクと保留事項
- [X API cost](project_x_api_cost.md) — Pay-per-use credits, monitor weekly

## Reference
- [gh CLI path](reference_gh_cli_path.md) — gh not in bash PATH
```

### 4つのメモリタイプ

メモリファイルは命名規則でタイプを分けている。

| タイプ | プレフィックス | 用途 | 例 |
|-------|-------------|------|-----|
| **user** | `user_` | ユーザーの属性・スキル・好み | `user_profile.md` |
| **feedback** | `feedback_` | AIへの矯正指示 | `feedback_no_sycophancy.md` |
| **project** | `project_` | プロジェクトの状態・TODO | `project_sitemaker_todo.md` |
| **reference** | `reference_` | 環境固有の情報 | `reference_gh_cli_path.md` |

この分類が重要な理由は、メモリの **寿命** が違うからだ。

- `user` — ほぼ不変。キャリアが変わったら更新する程度
- `feedback` — 蓄積型。基本的に増えていく一方
- `project` — 頻繁に更新。タスクが完了したらチェックを入れる
- `reference` — 環境が変わったら更新

---

## 3. feedbackメモリが一番重要

4つのタイプの中で、最も価値が高いのは `feedback` だ。

AIは同じミスを何度も繰り返す。セッションが変わればリセットされるからだ。feedbackメモリはそれを防ぐ。

筆者が実際に運用しているfeedbackメモリをいくつか紹介する。

### 「ソースコードを確認してから回答しろ」

```markdown
# feedback_verify_before_answering.md

Never give instructions based on assumptions.
Always read the relevant source code first to confirm exact values
before telling the user what to do.

**Why:** User was given wrong localStorage key to clear
because code wasn't checked first. Wasted their time.
```

これを入れる前は「localStorageのキーは多分 `user_data` だと思うので削除してください」のような推測回答が頻発していた。実際のキーは違っていた。ユーザーの時間を無駄にした。

このメモリを入れてからは、回答前に必ずソースコードを読むようになった。

### 「Vercelはgit pushだけじゃダメ」

```markdown
# feedback_vercel_force_deploy.md

After pushing code changes to kondate,
always run `npx vercel --prod --force`.
Git push triggers auto-deploy but Vercel may reuse
a stale build cache.

**Why:** Changes weren't showing on deployed site
even though code was pushed.
```

Vercelのキャッシュ問題に何度もハマった。毎回「デプロイしたのに反映されない」と報告され、`--force` で解決する、というやりとりを繰り返していた。メモリに保存してからは一発で正しいコマンドを実行するようになった。

### 「ユーザーに確認する前に自分で検証しろ」

```markdown
# feedback_verify_before_user.md

Before asking the user to check something,
first verify everything that can be verified programmatically.
Only involve the user when there's genuinely
no way to check from the CLI side.

**Why:** User was asked to check deployed changes
multiple times when the issue could have been caught
by checking build output first.
```

デプロイ後に「ブラウザで確認してください」と言ってくるのをやめさせた。ビルド出力やデプロイログで確認できることは先にやれ、という指示だ。無駄な往復が激減した。

### 「X APIはFreeプランじゃない」

```markdown
# feedback_not_free_plan.md

X APIはFreeプランではなく、Pay-per-use（$25ずつ課金）。

**Why:** ユーザーが「何度も言ってる」と指摘。
CLAUDE.mdに「Free」と記載があるが実態と異なる。
```

CLAUDE.mdに古い情報が残っていても、feedbackメモリで上書きできる。これは意外と重要で、CLAUDE.mdの記載とfeedbackメモリが矛盾する場合、Claude Codeはfeedbackメモリ（ユーザーの直接指示）を優先する。

### feedbackメモリのフォーマット

どのfeedbackメモリにも共通して **Why（なぜこのルールが必要か）** を書いている。理由がないルールはAIにとって「従うべき優先度」が曖昧になる。「ユーザーの時間を無駄にした」「何度も同じことを言わされた」という具体的な被害を書くことで、AIがルールを重視するようになる。

---

## 4. CLAUDE.mdにエージェント振り分けルールを書く

Claude Codeでサブエージェントを使い分ける場合、CLAUDE.mdに振り分けルールを書いておくと効率が上がる。

筆者の `zenn-content/` セクションにはこう書いてある。

```markdown
### エージェント振り分けルール

| 作業内容 | 担当エージェント |
|---------|----------------|
| スクリプト修正・新規作成 | zenn-sns |
| ツイート文面・プロンプト調整 | zenn-sns |
| Zenn記事の執筆・リライト | zenn-writer |
| セキュリティ（APIキー漏洩等） | kondate-security |
| ワークフロー・デプロイ確認 | deployer |
```

これにより「Zenn記事を書いて」と言えば `zenn-writer` エージェントに、「ツイートのプロンプトを調整して」と言えば `zenn-sns` エージェントに自動で振り分けられる。エージェントごとにペルソナと専門知識が異なるので、精度が上がる。

もう1つの例は `kondate/` のセキュリティチェックリストだ。

```markdown
### セキュリティチェック（必須）

**タスクを1つ完了するたびに、以下を確認すること：**

1. APIキーがクライアントサイドコードに露出していないか
2. サーバーサイドでのみ保持すべきシークレットがバンドルに含まれていないか
3. .envファイルが.gitignoreに含まれているか
4. 課金・認証のバイパスが不可能か
5. 新しいAPIエンドポイントにはレート制限があるか
```

「タスクを1つ完了するたびに」という条件を明記することで、毎回自動でチェックが走る。これをCLAUDE.mdに書かず口頭で依頼していたら、3回に1回は忘れる。

---

## 5. 「メモリに保存しないもの」が重要

メモリは何でも保存すればいいわけではない。むしろ **保存しないもの** の判断が重要だ。

### 保存しないもの

| 情報 | 理由 |
|------|------|
| コードのパターン・構造 | コードを読めばわかる。メモリに書くと古くなる |
| git履歴 | `git log` で見れる。メモリに複製する意味がない |
| デバッグの解決策 | コミットに入っている。必要なら差分を見ればいい |
| 一時的なタスク状態 | Claude Codeのタスクツールで管理すべき |
| 自明な設定値 | `package.json` や `tsconfig.json` を読めばわかる |

### 保存すべきもの

| 情報 | 理由 |
|------|------|
| ユーザーの好み・スタイル | コードからは読み取れない |
| AIが繰り返すミスへの矯正 | セッションを跨いで持続させる必要がある |
| プロジェクトのTODOリスト | セッションが切れても引き継ぎたい |
| 環境固有のパス・設定 | CLIのパスなど、コードに書かれていない情報 |

判断基準はシンプルだ。 **「コードやgitから復元できる情報か？」** を考える。復元できるならメモリに入れない。復元できないならメモリに入れる。

---

## 6. 運用のコツ

### インデックスは簡潔に

`MEMORY.md`（インデックス）が長くなりすぎると、Claude Codeが全体を把握しきれなくなる。各エントリは1行の説明に留める。

```markdown
# 良い例
- [No sycophancy](feedback_no_sycophancy.md) — Always give honest opinions

# 悪い例
- [No sycophancy](feedback_no_sycophancy.md) — ユーザーに同調するだけの返答をしない。
  自分の意見があるなら率直に言う。無理に合わせない。アイデア評価、コードレビュー、
  意思決定すべてにおいて正直な意見を述べる。
```

詳細は個別ファイルに書く。インデックスはあくまで目次だ。

### 相対日付は使わない

メモリに「来週やる」「昨日のバグ」と書くと、1週間後に読んだときに意味がわからなくなる。必ず絶対日付に変換する。

```markdown
# 悪い例
X APIに$25チャージした（昨日）

# 良い例
X APIに$25チャージした（2026-03-22）
```

### 古いメモリは更新・削除する

プロジェクトの状態は変わる。価格が変わった、業種が追加された、タスクが完了した。そのたびにメモリを更新する。

筆者の `project_sitemaker_todo.md` は実装が進むたびにチェックマークを入れ、新しいタスクが増えたら追記している。古い完了タスクは定期的に削除する。

### user_profileの効果は地味だが大きい

```markdown
# user_profile.md（抜粋）

フリーランスITコンサルタント。高卒からIT業界12年目。
コードは書ける（エンジニアスキルあり）が、
効率化のためにClaude Codeを活用。
```

この情報があるだけで、AIの回答レベルが変わる。「初心者向けの丁寧な説明」ではなく「エンジニア同士の会話」になる。逆に、これがないと毎回「変数とは...」レベルの説明が混じることがある。

---

## まとめ

CLAUDE.mdとメモリシステムの設計をまとめると、こうなる。

1. **CLAUDE.md** はプロジェクトの構造・ルール・制約を書く場所。共通ルールとプロジェクト固有ルールを分離する
2. **メモリシステム** はユーザーの好み・AIへの矯正・セッション跨ぎの状態を保存する場所
3. **feedbackメモリ** が最も価値が高い。AIが繰り返すミスを矯正する唯一の手段
4. **保存しないもの** の判断が重要。コードやgitから復元できる情報はメモリに入れない
5. **メモリは育てるもの** だ。使いながらフィードバックを追加し、古い情報を更新し、不要なものを削除する

Claude Codeを「毎回初対面のAI」として使うか、「自分の開発スタイルを理解したパートナー」として使うか。その差を生むのがCLAUDE.mdとメモリシステムの設計である。

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
