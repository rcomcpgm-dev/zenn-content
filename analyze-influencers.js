require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { TwitterApi } = require("twitter-api-v2");

const anthropic = new Anthropic();
const twitter = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const PATTERNS_FILE = path.join(__dirname, "influencer-patterns.json");

// 拡散力のあるIT系エンジニア・経営者アカウント
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

// 重複除去
const UNIQUE_INFLUENCERS = [...new Set(INFLUENCERS)];

function getExistingPatterns() {
  try {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf-8"));
  } catch {
    return { analyses: [], lastUpdated: null };
  }
}

function savePatterns(data) {
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

// from:user1 OR from:user2 ... でまとめて検索（API呼び出し節約）
async function fetchInfluencerTweets() {
  const allTweets = [];

  // 5人ずつバッチにして検索（クエリ長制限対策）
  for (let i = 0; i < UNIQUE_INFLUENCERS.length; i += 5) {
    const batch = UNIQUE_INFLUENCERS.slice(i, i + 5);
    const fromQuery = batch.map((u) => `from:${u}`).join(" OR ");
    const query = `(${fromQuery}) -is:retweet`;

    console.log(`Searching: ${query}`);

    try {
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
    } catch (err) {
      console.log(`Search error: ${err.message || err}`);
    }

    // レートリミット回避
    await new Promise((r) => setTimeout(r, 2000));
  }

  return allTweets;
}

async function analyzePatterns(tweets) {
  // エンゲージメント率でソート（いいね+RT / フォロワー数）
  const scored = tweets
    .filter((t) => t.authorFollowers > 0)
    .map((t) => ({
      ...t,
      engagementRate:
        ((t.likes + t.retweets * 2) / t.authorFollowers) * 100,
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate);

  const topTweets = scored.slice(0, 30);
  const bottomTweets = scored.slice(-10);

  if (topTweets.length === 0) {
    console.log("No tweets to analyze.");
    return null;
  }

  const topTexts = topTweets
    .map(
      (t, i) =>
        `${i + 1}. @${t.author}（フォロワー${t.authorFollowers}）\n「${t.text}」\nいいね:${t.likes} RT:${t.retweets} エンゲージメント率:${t.engagementRate.toFixed(3)}%`
    )
    .join("\n\n");

  const bottomTexts = bottomTweets
    .map(
      (t, i) =>
        `${i + 1}. @${t.author}\n「${t.text}」\nいいね:${t.likes} RT:${t.retweets}`
    )
    .join("\n\n");

  const prompt = `以下はIT系インフルエンサーの直近ツイートデータ。エンゲージメント率が高い順にソートされている。

## 高エンゲージメントツイート（上位）
${topTexts}

## 低エンゲージメントツイート（下位）
${bottomTexts}

## 分析してほしいこと
上記データを分析して、以下をJSON形式で出力して：

{
  "高エンゲージメントの共通パターン": [
    "パターン1（具体例付き）",
    "パターン2（具体例付き）",
    ...
  ],
  "低エンゲージメントの特徴": [
    "特徴1",
    ...
  ],
  "文体の特徴": {
    "平均文字数": "○○文字前後",
    "よく使う語尾": ["〜だな", "〜よね", ...],
    "句読点の使い方": "...",
    "改行の使い方": "..."
  },
  "話題選びのコツ": [
    "コツ1",
    ...
  ],
  "REONのX運用への具体的アドバイス": [
    "30歳フリーランスITコンサル（高卒12年）が参考にすべきポイント",
    ...
  ],
  "真似すべき構文テンプレート": [
    "○○って△△だよな（共感型）",
    "○○やってみたけど△△（体験報告型）",
    ...
  ]
}

注意：
- 具体的なツイート例を引用しながら分析する
- 抽象的なアドバイスではなく、すぐ使えるレベルで書く
- JSONのみ出力。説明文不要`;

  console.log("Analyzing patterns with Claude...");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();

  // JSONを抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log("Failed to extract JSON from response");
    console.log(text);
    return text;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.log("JSON parse failed, saving raw text");
    return text;
  }
}

async function main() {
  console.log("=== Influencer Tweet Analysis ===\n");

  console.log("Fetching tweets from influencers...");
  const tweets = await fetchInfluencerTweets();
  console.log(`Fetched ${tweets.length} tweets total\n`);

  if (tweets.length === 0) {
    console.log("No tweets found. Check API access or influencer usernames.");
    return;
  }

  // エンゲージメント上位をプレビュー
  const preview = tweets
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5);
  console.log("Top 5 by likes:");
  for (const t of preview) {
    console.log(`  @${t.author} (${t.likes} likes): ${t.text.substring(0, 50)}...`);
  }
  console.log();

  const analysis = await analyzePatterns(tweets);

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

  data.lastUpdated = new Date().toISOString();
  savePatterns(data);

  console.log("\nAnalysis saved to influencer-patterns.json");
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
