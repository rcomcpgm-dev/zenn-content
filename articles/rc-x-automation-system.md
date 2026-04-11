---
title: "Claude CodeでX（Twitter）完全自動運用システムを作った話"
emoji: "🤖"
type: "tech"
topics: ["claudecode", "twitter", "automation", "ai"]
publish_order: 21
published: true
---

## この記事でわかること

- GitHub Actions + Claude API + X API v2 で **X（Twitter）の運用を完全自動化** するシステムの全体像
- AIツイート生成でペルソナを破綻させないプロンプト設計
- インフルエンサー分析をツイート生成に自動フィードバックする仕組み
- フォロバ率スコアリングによる効率的なフォロー戦略
- JSONファイル + git commit でデータベース不要の状態管理パターン

実際に稼働中のシステムなので、全て実体験ベースの内容になっている。

## システム全体像

Node.jsスクリプト12本、GitHub Actionsワークフロー10本で構成されている。1日のタイムラインはこんな感じ。

```
07:30  パターン投稿（tips/learning系）
08:00  AIカジュアルツイート
10:00  Zenn記事公開 + X告知
12:00  いいね + フォロー（1回目）
12:15  パターン投稿（article/industry系）
12:30  AIカジュアルツイート
13:00  トレンド反応ツイート
14:00  Qiitaクロスポスト
19:00  パターン投稿（mindset/devlog系）
20:00  記事スレッド投稿（水・土のみ）
20:30  AIカジュアルツイート
21:00  いいね + フォロー（2回目）
22:00  トレンド反応ツイート
```

週次タスクとして、月曜にインフルエンサー分析、日曜にアカウント成長分析が走る。

全体のアーキテクチャはこうなっている。

```
GitHub Actions (cron)
  ├── ツイート投稿（1日最大8回）
  │   ├── casual-tweet.js    … AI生成の日常ツイート
  │   ├── scheduled-post.js  … 事前作成パターン投稿
  │   └── trend-tweet.js     … トレンド反応ツイート
  ├── エンゲージメント（1日2回）
  │   └── auto-reply.js      … いいね + フォロー
  ├── 記事連携（1日1回ずつ）
  │   ├── auto-publish.yml   … Zenn記事の自動公開 + X告知
  │   ├── qiita-crosspost.js … Qiitaへのリライト投稿
  │   └── thread-post.js     … 記事をスレッドに変換
  └── 分析（週1回ずつ）
      ├── analyze-influencers.js … インフルエンサー分析
      └── weekly-analytics.js    … アカウント成長分析
```

## ペルソナ設定の技術

AIでツイートを生成すると、放っておくと「AIっぽさ」が出る。「朝のコーヒーを飲みながら、今日の開発計画を立てています。」みたいなやつ。これを防ぐために、プロンプト設計にかなり力を入れた。

### 人格定義をプロンプトに注入する

`casual-tweet.js` のプロンプトでは、ペルソナを具体的に書いている。

```javascript
const prompt = `REONっていう30歳フリーランスITコンサルのツイートを1つ書いて。

## REONはこういう人間
- 高卒IT12年の叩き上げ。フリーランスコンサル
- Claude Codeで個人開発してる
- 酒好き（禁酒と解禁を繰り返す）。尿酸値やばい
- アニメ見る（まどマギ、嘆きの亡霊、メダリストなど）
- 口調：「〜かもです」「〜だなー」「〜ないね」「草」くらいの柔らかさ
...`;
```

ポイントは「こういう人間」という **属性の羅列** だけでなく、**具体的なエピソード** を入れること。「酒好き」じゃなくて「禁酒と解禁を繰り返す。尿酸値やばい」まで書く。これだけでAIの出力が一気にリアルになる。

### 時間帯別トピックプール

朝に酒の話をしたり、深夜に案件の話をしたりすると違和感がある。時間帯ごとにトピックプールを分けている。

```javascript
const TOPIC_POOLS = {
  morning: [
    "朝のルーティン・コーヒー",
    "寝坊・二度寝",
    "今日の案件・面談",
  ],
  evening: [
    "晩ごはん・外食・出前",
    "夜のコーディング・個人開発",
    "酒・家飲み・禁酒",
    "アニメ・漫画の感想",
  ],
  night: [
    "深夜の酒・1人飲み",
    "深夜コーディング",
    "アニメ一気見",
  ],
  // ...
};
```

### 「ダメな例」を明示する

AIに「こうしろ」と言うだけだと、微妙にズレた出力が出る。**「これはダメ」を具体的に見せる** のが効果的だった。

```
## ダメな例（禁止）
「朝のコーヒーを飲みながら、今日の開発計画を立てています。」→ AIっぽい
「でさ、結局AIを使いこなせる奴が勝つんだよ」→ わざとらしい考察。禁止

## いい例（この温度感）
「何食べようかなー」
「トンカツは出前で頼むもんじゃないね」
「面談で結構やらかしたけど通った。2次かー」
```

ダメな例に **なぜダメかの理由** を1行添えるのが重要。「AIっぽい」「無理やりビジネスに転換」など、NGの方向性を伝えることで、AIが自分で判断できるようになる。

## インフルエンサー分析のフィードバックループ

このシステムで一番面白いのがこの仕組み。週1回、IT系インフルエンサーのツイートを自動分析して、その結果を日常ツイート生成のプロンプトに注入している。

### 分析フロー

```
毎週月曜 10:00（GitHub Actions）
  ↓
from:kensuu OR from:masason OR ... で検索
  ↓
エンゲージメント率でソート（いいね+RT*2 / フォロワー数）
  ↓
上位30件と下位10件をClaude APIに投げて分析
  ↓
influencer-patterns.json に保存（直近5回分保持）
```

分析プロンプトでは「高エンゲージメントのパターン」「低エンゲージメントのパターン」の両方を渡している。

```javascript
const scored = tweets
  .filter((t) => t.authorFollowers > 0)
  .map((t) => ({
    ...t,
    engagementRate:
      ((t.likes + t.retweets * 2) / t.authorFollowers) * 100,
  }))
  .sort((a, b) => b.engagementRate - a.engagementRate);

const topTweets = scored.slice(0, 30);  // 高エンゲージメント
const bottomTweets = scored.slice(-10); // 低エンゲージメント
```

### ツイート生成への自動注入

`casual-tweet.js` と `trend-tweet.js` は、起動時に `influencer-patterns.json` を読み込んで、最新の分析結果をプロンプトに追加する。

```javascript
let influencerTips = "";
try {
  const patterns = JSON.parse(fs.readFileSync(INFLUENCER_FILE, "utf-8"));
  const latest = patterns.analyses[patterns.analyses.length - 1]?.analysis;
  if (latest) {
    const templates = latest["真似すべき構文テンプレート"] || [];
    const tips = latest["REONのX運用への具体的アドバイス"] || [];
    influencerTips = `
## インフルエンサー分析から学んだこと（参考にして）
- 構文テンプレート: ${templates.slice(0, 3).join(" / ")}
- 運用のコツ: ${tips.slice(0, 3).join(" / ")}`;
  }
} catch {}
```

こうすることで、ツイートの質が週ごとに改善されていく。「短文のほうがエンゲージメントが高い」「問いかけ形式が伸びる」といった知見が自動的にプロンプトに反映される。

## フォロバ率スコアリング

いいね+フォローを闇雲にやっても効率が悪い。フォローバックしてくれそうな人を優先的にフォローする仕組みを入れている。

### スコアリングのロジック

```javascript
// フォロワー/フォロー比が1.0に近い = 相互フォロー傾向
let followBackScore = Math.abs(1 - (followers / following));

// エンジニア系bioならスコアを大幅に優遇
if (isLikelyEngineer(author)) {
  followBackScore -= 0.5;
}
```

考え方はシンプルで、フォロワー数とフォロー数が近い人（比率が1.0に近い）は相互フォローの傾向が強い。さらに、bioにエンジニア系キーワード（「エンジニア」「developer」「React」「フリーランス」等）が含まれていればスコアを優遇する。

### フィルタリング条件

```javascript
const MIN_FOLLOWERS = 100;   // bot除外
const MAX_FOLLOWERS = 10000; // 有名人除外

// フォロー/フォロワー比が0.3〜3.0の範囲外は除外
const ratio = followers / following;
if (ratio < 0.3 || ratio > 3.0) return false;
```

フォロワー100未満はbot率が高く、10,000超はフォロバしてくれないので除外。比率が極端な人（フォロワー買い or 大量フォロー）も除外している。

### レート制限への対策

X APIのレート制限に引っかからないよう、間隔を空けている。

```
いいね → 2秒待機 → フォロー → 10秒待機 → 次の候補へ
```

1回の実行で最大10件。1日2回実行なので、日あたり最大20いいね・20フォロー。この程度ならレート制限に引っかかったことはない。

## 状態管理をgitで行うパターン

このシステムではデータベースを一切使っていない。全ての状態をJSONファイルで管理し、GitHub Actions上でgit commitすることで永続化している。

```
GitHub Actions実行
  ↓
JSONファイルを読み込み → 処理 → JSONファイルに書き込み
  ↓
git add → git commit → git push
  ↓
次回実行時に最新のJSONが取得される
```

### ローリングウィンドウ

履歴が無限に膨らまないよう、ファイルごとに保持件数を設定している。

| ファイル | 用途 | 保持件数 |
|---------|------|---------|
| auto-reply-log.json | いいね履歴 | 500件 |
| casual-tweet-log.json | ツイート履歴 | 100件 |
| analytics-log.json | 週次分析 | 12週分 |
| influencer-patterns.json | 分析結果 | 5回分 |

このパターンの利点は3つある。

1. **データベースのセットアップが不要** - JSONとgitだけで完結
2. **履歴がgit logで追える** - いつ何が起きたか全部わかる
3. **GitHub Actionsだけで完結** - 外部サービスへの依存がない

欠点は、同時実行でコンフリクトする可能性があること。ワークフローのスケジュールを15分以上ずらすことで回避している。

## 記事の多面展開

1つのZenn記事から、3つのコンテンツを自動生成している。

```
Zenn記事（published: true で書き溜め）
  ├── auto-publish.yml → published: true に変更 + X告知ツイート
  ├── qiita-crosspost.js → Claude APIでQiita向けにリライト + 投稿
  └── thread-post.js → 記事を3〜6ツイートのスレッドに変換
```

### Zenn記事の自動公開

GitHub Actionsが毎日10:00に実行され、`published: true` の記事を1つ見つけて `published: true` に書き換えてpushする。Zennは GitHub連携で自動反映されるので、これだけで公開完了。

```yaml
- name: Find and publish one unpublished article
  run: |
    FILE=$(grep -rl 'published: true' articles/ | head -1)
    if [ -z "$FILE" ]; then
      echo "No unpublished articles found."
      exit 0
    fi
    sed -i 's/published: true/published: true/' "$FILE"
    git add "$FILE"
    git commit -m "Auto-publish: $(basename $FILE .md)"
    git push
```

### Qiitaクロスポスト

Zennの記事をそのまま投稿するのではなく、Claude APIでQiita向けにリライトしている。Zennとは読者層が微妙に違うので、導入部を変えたり、Zenn固有の記法（`:::message` など）をQiita向けに変換したりする。

トピックのマッピングも自動でやっている。

```javascript
const TAG_MAP = {
  claudecode: "ClaudeCode",
  ai: "AI",
  nextjs: "Next.js",
  typescript: "TypeScript",
  // ...
};
```

### スレッド変換

公開済みの記事を3〜6ツイートのスレッドに変換して投稿する。水曜と土曜の20:00に実行。1つの記事を複数回タイムラインに出すことで、リーチを広げている。

## 注意点と学び

### X APIの制限

X APIは検索API（`v2.search`）は使えるが、ユーザータイムラインの直接取得はプランによっては制限される。インフルエンサー分析では `from:username` の検索クエリで代替しているが、直近7日分しか取れない点は注意。

### AIツイートの品質管理

生成されたツイートが280文字を超えた場合は自動破棄している。「短ければ短いほどいい。10〜50文字がベスト」とプロンプトに書いても、たまに長文が出てくるので、安全弁として文字数チェックは必須。

### 重複排除

直近のツイート履歴をプロンプトに注入して、被りを防いでいる。

```javascript
const recentTexts = log.tweets
  .slice(-20)
  .map((t) => t.text)
  .join("\n---\n");
```

「最近のツイート」として直近20件を見せることで、同じ話題を繰り返さなくなる。

### GitHub Actionsのcron精度

GitHub Actionsのcronは正確ではない。5〜15分のズレは普通にある。「12:00に投稿」と言っても12:10になることはザラ。ただ、SNS運用においてはこの程度の誤差は問題にならない。

## まとめ

- GitHub Actions + Claude API + X API v2 の組み合わせで、X運用を完全自動化できる
- ペルソナ設計は「属性」だけでなく「具体的エピソード」と「ダメな例」をプロンプトに入れるのが効果的
- インフルエンサー分析 → プロンプト注入のフィードバックループで、ツイート品質が自動改善される
- JSONファイル + git commit でデータベース不要の状態管理ができる
- 1つの記事から3つのコンテンツ（Zenn / Qiita / Xスレッド）を自動生成するのは費用対効果が高い

全てのスクリプトは100〜200行程度のNode.jsで、複雑なことは何もしていない。仕組みを作る部分にClaude Codeを使えば、半日もあれば同じものが作れると思う。

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
