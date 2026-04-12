---
title: "Claude Codeでインフルエンサー分析→自動ツイート生成のフィードバックループを作る"
emoji: "🔄"
type: "tech"
topics: ["claudecode", "twitter", "ai", "automation"]
publish_order: 22
published: false
---

## この記事でわかること

- IT系インフルエンサーのツイートをX APIで取得し、Claude Haikuでエンゲージメントパターンを分析する方法
- 分析結果をJSON形式で保存し、日次のツイート生成プロンプトに自動注入する仕組み
- 週1回の分析が翌週のツイート品質を改善する「フィードバックループ」の実装全体像

実際に自分のX運用で稼働しているコードをベースに解説します。

## フィードバックループの全体像

```
毎週月曜 10:00（GitHub Actions cron）
    │
    ▼
analyze-influencers.js
    │ X API検索: from:kensuu OR from:masason ...
    │ Claude Haikuで高/低エンゲージメントを分析
    │
    ▼
influencer-patterns.json（直近5回分保持）
    │
    ▼ 日次で参照
casual-tweet.js / trend-tweet.js
    │ プロンプト末尾に分析結果を注入
    │
    ▼
生成ツイートの質が週ごとに改善される
```

ポイントは「分析」と「生成」が別スクリプトで、JSONファイルを介して疎結合に繋がっていることです。分析が失敗してもツイート生成は止まらないし、分析結果がなければ注入をスキップするだけです。

## 1. インフルエンサー分析の実装

### 対象アカウントの定義

まず、参考にしたいIT系インフルエンサーをリストアップします。

```javascript
const INFLUENCERS = [
  // IT経営者・起業家
  "kensuu",          // けんすう（アル代表）
  "masason",         // 孫正義
  // エンジニア・テック系
  "mizchi",          // mizchi（フロントエンド）
  "and_and_and",     // shi3z（AI系）
  "curry_and_naan",  // からあげ（AI系）
  // AI・開発ツール系
  "saboriman_kabu",  // AI系
  "ai_and_and",      // AI系
];
```

この配列は運用しながら入れ替えます。フォロワー数が多いだけでなく、エンゲージメント率が高いアカウントを選ぶのがコツです。

### X APIでのツイート取得

X APIの検索エンドポイントで `from:username` を使い、直近7日分のツイートを取得します。API呼び出しを減らすため、5アカウントずつ `OR` で結合して1クエリにまとめます。

```javascript
async function fetchInfluencerTweets() {
  const allTweets = [];

  // 5人ずつバッチにして検索（クエリ長制限対策）
  for (let i = 0; i < UNIQUE_INFLUENCERS.length; i += 5) {
    const batch = UNIQUE_INFLUENCERS.slice(i, i + 5);
    const fromQuery = batch.map((u) => `from:${u}`).join(" OR ");
    const query = `(${fromQuery}) -is:retweet`;

    const result = await twitter.v2.search(query, {
      max_results: 50,
      "tweet.fields": "author_id,public_metrics,created_at",
      expansions: "author_id",
      "user.fields": "id,name,username,public_metrics",
    });

    if (result.data?.data) {
      const userMap = {};
      if (result.includes?.users) {
        for (const u of result.includes.users) {
          userMap[u.id] = u;
        }
      }

      for (const tweet of result.data.data) {
        const author = userMap[tweet.author_id];
        allTweets.push({
          text: tweet.text,
          likes: tweet.public_metrics?.like_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          replies: tweet.public_metrics?.reply_count || 0,
          author: author?.username || "unknown",
          authorFollowers: author?.public_metrics?.followers_count || 0,
          createdAt: tweet.created_at,
        });
      }
    }

    // レートリミット回避
    await new Promise((r) => setTimeout(r, 2000));
  }

  return allTweets;
}
```

`-is:retweet` でリツイートを除外しているのは、本人のオリジナルツイートだけを分析対象にしたいからです。

### エンゲージメント率の計算とソート

取得したツイートにエンゲージメント率を計算し、高い順にソートします。

```javascript
const scored = tweets
  .filter((t) => t.authorFollowers > 0)
  .map((t) => ({
    ...t,
    engagementRate:
      ((t.likes + t.retweets * 2) / t.authorFollowers) * 100,
  }))
  .sort((a, b) => b.engagementRate - a.engagementRate);

const topTweets = scored.slice(0, 30);    // 高エンゲージメント上位30件
const bottomTweets = scored.slice(-10);   // 低エンゲージメント下位10件
```

リツイートはいいねの2倍の重みを付けています。拡散につながるアクションをより評価する意図です。

上位30件と下位10件を抽出する理由は、「何がウケるか」だけでなく「何がウケないか」も学習させたいからです。

### Claude Haikuによるパターン分析

抽出したツイートをClaude Haikuに投げて、パターンを分析させます。

```javascript
const prompt = `以下はIT系インフルエンサーの直近ツイートデータ。
エンゲージメント率が高い順にソートされている。

## 高エンゲージメントツイート（上位）
${topTexts}

## 低エンゲージメントツイート（下位）
${bottomTexts}

## 分析してほしいこと
上記データを分析して、以下をJSON形式で出力して：

{
  "高エンゲージメントの共通パターン": [
    "パターン1（具体例付き）",
    "パターン2（具体例付き）"
  ],
  "低エンゲージメントの特徴": [
    "特徴1"
  ],
  "文体の特徴": {
    "平均文字数": "○○文字前後",
    "よく使う語尾": ["〜だな", "〜よね"],
    "句読点の使い方": "...",
    "改行の使い方": "..."
  },
  "話題選びのコツ": ["コツ1"],
  "REONのX運用への具体的アドバイス": [
    "30歳フリーランスITコンサル（高卒12年）が参考にすべきポイント"
  ],
  "真似すべき構文テンプレート": [
    "○○って△△だよな（共感型）",
    "○○やってみたけど△△（体験報告型）"
  ]
}

注意：
- 具体的なツイート例を引用しながら分析する
- 抽象的なアドバイスではなく、すぐ使えるレベルで書く
- JSONのみ出力。説明文不要`;
```

プロンプトの設計で重要なのは、出力フォーマットをJSON構造で明示的に指定していること。そして「JSONのみ出力。説明文不要」と念押しすることで、余計なテキストが混入するのを防いでいます。

## 2. 分析結果のJSON構造と保存

Claude Haikuの応答からJSONを正規表現で抽出します。

```javascript
const text = response.content[0].text.trim();

// JSONを抽出
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.log("Failed to extract JSON from response");
  return text;
}

try {
  return JSON.parse(jsonMatch[0]);
} catch {
  console.log("JSON parse failed, saving raw text");
  return text;
}
```

`/\{[\s\S]*\}/` で応答全体から最初の `{` から最後の `}` までを切り出しています。Claudeが「以下がJSON出力です:」のような前置きを付けてしまっても、JSONだけを取り出せます。

実際に保存される `influencer-patterns.json` の構造はこうなります。

```json
{
  "analyses": [
    {
      "analyzedAt": "2026-03-24T01:00:12.345Z",
      "tweetCount": 87,
      "analysis": {
        "高エンゲージメントの共通パターン": [
          "短い断言型（例: けんすうの「〜は○○」30文字以内）",
          "体験ベースの気づき（例: mizchiの「〜やってみたら○○だった」）",
          "逆張り・意外性（例: 「みんな○○って言うけど、実は△△」）"
        ],
        "低エンゲージメントの特徴": [
          "ニュースの単純なシェア（自分の意見なし）",
          "長文で結論が見えにくい"
        ],
        "文体の特徴": {
          "平均文字数": "40〜80文字前後",
          "よく使う語尾": ["〜だな", "〜よね", "〜だと思う"],
          "句読点の使い方": "読点少なめ、体言止め多用",
          "改行の使い方": "1ツイート1文が主流"
        },
        "話題選びのコツ": [
          "「みんなが薄々思っているけど言語化していないこと」を先に言う",
          "新しいツールの第一印象を素早く発信する"
        ],
        "REONのX運用への具体的アドバイス": [
          "Claude Codeの具体的な使い方を短文で発信すると刺さる",
          "フリーランスのリアルな数字（単価・稼働時間）は反応が良い"
        ],
        "真似すべき構文テンプレート": [
          "○○って△△だよな（共感型）",
          "○○やってみたけど△△（体験報告型）",
          "○○、マジで□□（感嘆型）"
        ]
      }
    }
  ],
  "lastUpdated": "2026-03-24T01:00:12.345Z"
}
```

直近5回分を保持するローリング方式にしています。

```javascript
const data = getExistingPatterns();
data.analyses.push({
  analyzedAt: new Date().toISOString(),
  tweetCount: tweets.length,
  analysis,
});

// 直近5回分だけ保持
if (data.analyses.length > 5) {
  data.analyses = data.analyses.slice(-5);
}
```

5回分保持する理由は、直近1回だけだとその週のトレンドに引っ張られすぎるからです。5週分の傾向を参照することで、一時的なバズに左右されない安定した分析結果が得られます。

## 3. ツイート生成への注入方法

### casual-tweet.js での注入

日常系ツイートを生成する `casual-tweet.js` では、プロンプト末尾にインフルエンサー分析の「構文テンプレート」と「運用のコツ」を注入しています。

```javascript
// インフルエンサー分析結果を読み込み
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

`try-catch` で囲んでいるので、`influencer-patterns.json` が存在しない場合や読み込みに失敗した場合は単にスキップされます。ツイート生成の本体には影響しません。

### trend-tweet.js での注入

トレンド反応ツイートでは、「構文テンプレート」と「話題選びのコツ」を注入しています。

```javascript
const templates = latest["真似すべき構文テンプレート"] || [];
const tips = latest["話題選びのコツ"] || [];
influencerTips = `
## インフルエンサー分析から学んだこと（参考にして）
- 構文テンプレート: ${templates.slice(0, 3).join(" / ")}
- 話題選びのコツ: ${tips.slice(0, 3).join(" / ")}`;
```

casual-tweet.js と trend-tweet.js で注入する項目を変えている点がポイントです。

| スクリプト | 注入する項目 | 理由 |
|-----------|------------|------|
| casual-tweet.js | 構文テンプレート + 運用のコツ | 日常ツイートは文体とペルソナの最適化が重要 |
| trend-tweet.js | 構文テンプレート + 話題選びのコツ | トレンド反応は話題の切り口が重要 |

## 4. GitHub Actionsでの自動実行

分析スクリプトは毎週月曜の朝に自動実行します。

```yaml
name: Analyze Influencers

on:
  schedule:
    - cron: '0 1 * * 1'  # 毎週月曜 10:00 JST（UTC 01:00）
  workflow_dispatch:

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: node analyze-influencers.js
        env:
          X_API_KEY: ${{ secrets.X_API_KEY }}
          X_API_SECRET: ${{ secrets.X_API_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_SECRET: ${{ secrets.X_ACCESS_SECRET }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "update influencer patterns"
          file_pattern: "influencer-patterns.json"
```

`git-auto-commit-action` で分析結果のJSONをリポジトリに自動コミットしています。これにより、翌日以降のツイート生成ワークフローが `checkout` した時点で最新の分析結果を参照できます。

## 5. 実装のポイントまとめ

### バッチ検索でAPI呼び出しを削減

7アカウントを1つずつ検索すると7回のAPI呼び出しが必要ですが、5アカウントずつ `OR` でまとめることで2回に削減できます。

```javascript
// 5人ずつバッチにして検索
for (let i = 0; i < UNIQUE_INFLUENCERS.length; i += 5) {
  const batch = UNIQUE_INFLUENCERS.slice(i, i + 5);
  const fromQuery = batch.map((u) => `from:${u}`).join(" OR ");
  const query = `(${fromQuery}) -is:retweet`;
  // ...
}
```

X APIの検索クエリは長さ制限があるため、5アカウントずつに分割しています。

### 正規表現によるJSON抽出

Claude Haikuの応答は常にJSONだけとは限りません。前置きや補足が付くことがあるので、正規表現で確実に抽出します。

```javascript
const jsonMatch = text.match(/\{[\s\S]*\}/);
```

### エラーに強い設計

分析結果の読み込みは常に `try-catch` で囲み、失敗時はスキップ。フィードバックループが壊れても本体のツイート生成には影響しません。

```javascript
let influencerTips = "";
try {
  // 読み込みと注入
} catch {}
// influencerTips が空文字のままプロンプトに入るだけ
```

## 効果と注意点

### 実感している効果

- 「何となく」のツイート生成から「データに基づく」ツイート生成に変わった
- 構文テンプレートが注入されることで、AIが生成するツイートの文体が自然になった
- 週ごとに分析結果が更新されるため、トレンドの変化にも追従できる

### 注意点

- AIの分析結果を鵜呑みにしない。「これは自分のアカウントに合わないな」と思ったら、分析対象のインフルエンサーリストを見直す
- エンゲージメント率はフォロワー数に依存するので、フォロワー1万人のアカウントと100万人のアカウントを同列に比較しない方がいい
- 分析結果はあくまで「参考情報」としてプロンプトに注入している。最終的なツイート生成はClaudeの判断に委ねている

## まとめ

インフルエンサー分析からツイート生成への自動フィードバックループを構成するのは、3つのパーツだけです。

1. **分析スクリプト** -- X APIでツイートを取得し、Claude Haikuでパターン分析してJSONに保存
2. **JSONファイル** -- 分析スクリプトと生成スクリプトを疎結合に繋ぐインターフェース
3. **生成スクリプト** -- JSONからTipsを読み込み、プロンプト末尾に注入

この仕組みは「X運用」に限らず、コンテンツ生成全般に応用できます。「うまくいっている事例を分析して、次の生成に反映する」というフィードバックループのパターンとして参考にしてもらえれば。

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
