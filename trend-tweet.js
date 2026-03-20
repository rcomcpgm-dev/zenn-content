require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const Anthropic = require("@anthropic-ai/sdk");
const { TwitterApi } = require("twitter-api-v2");

const anthropic = new Anthropic();
const twitter = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const LOG_FILE = path.join(__dirname, "trend-tweet-log.json");

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return { tweets: [] };
  }
}

function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

// X APIで今話題のAI/tech系ツイートを検索
async function findTrendingTopics() {
  const queries = [
    "(ChatGPT OR Claude OR Gemini OR OpenAI OR Anthropic) lang:ja -is:retweet",
    "(AI OR 生成AI OR LLM) (リリース OR 発表 OR アップデート OR 新機能) lang:ja -is:retweet",
    "(Cursor OR Copilot OR Claude Code OR Devin) lang:ja -is:retweet",
  ];

  const allTweets = [];
  for (const query of queries) {
    try {
      const result = await twitter.v2.search(query, {
        max_results: 20,
        "tweet.fields": "public_metrics,created_at,text",
      });
      if (result.data?.data) {
        allTweets.push(...result.data.data);
      }
    } catch (e) {
      console.log(`Search error for query: ${e.message || e}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // いいね数で並び替え、上位5件のテキストをまとめる
  const sorted = allTweets
    .sort(
      (a, b) =>
        (b.public_metrics?.like_count || 0) -
        (a.public_metrics?.like_count || 0)
    )
    .slice(0, 10);

  return sorted.map((t) => t.text).join("\n\n---\n\n");
}

async function generateTrendTweet(trendingContent) {
  const log = getLog();
  const recentTexts = log.tweets
    .slice(-10)
    .map((t) => t.text)
    .join("\n---\n");

  const prompt = `IT業界12年の30歳フリーランスコンサル「REON」が、以下のトレンドを見て思ったことをツイートする。

## REONの人物像
- 高卒の叩き上げ。運用→開発→フリーランス→コンサル
- 現場12年の肌感覚で語る。理論じゃなくて経験ベース
- 「です・ます」使わない。友達と飲んでる時のテンション
- 毒舌もある。「それ意味なくね？」とか平気で言う
- でも根は真面目で、いいものはちゃんと褒める

## 今Xで話題のトピック
${trendingContent}

## 絶対に守ること
- 200文字以内。短いほどいい
- ニュースの要約・紹介にしない。自分の意見や感想だけ
- 「〜だと思います」「〜ではないでしょうか」禁止。断言するか雑に言い切る
- 「〜なんよ」「〜だわ」「マジで」「正直」とかの口語を使う
- ハッシュタグ禁止
- 絵文字は0〜1個
- 本文だけ出力

## ダメな例（こういうの禁止）
「NVIDIAの新チップに注目です。AI業界の発展に大きく寄与するでしょう。」→ ニュースサイトか
「でさ、結局〜だと思うんだよね」→ わざとらしい考察。禁止
「〜は本質的に〜である」→ 評論家っぽい。禁止

## いい例（この温度感）
「NVIDIAの株上がってんなぁ〜。買うか」
「また新しいAIツール出てて草。追えるわけないだろ」
「AI系ってこれ関係あるんかなぁ…あるよなぁ…」
「OpenAI何出してんだ。もう追うのやめようかな」
「Cursorのアプデ来てたけどまだ試してない。誰か教えて」

## 最近のツイート（被り回避）
${recentTexts || "なし"}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text.trim().replace(/^[「『]|[」』]$/g, "");
}

async function main() {
  console.log("Searching for trending AI/IT topics...");
  const trendingContent = await findTrendingTopics();

  if (!trendingContent || trendingContent.trim().length < 20) {
    console.log("No trending content found, skipping.");
    return;
  }

  console.log("Generating trend tweet...");
  const tweetText = await generateTrendTweet(trendingContent);

  if (tweetText.length > 280) {
    console.log("Tweet too long, skipping:", tweetText);
    return;
  }

  console.log(`Tweet: ${tweetText}`);

  const { data } = await twitter.v2.tweet(tweetText);
  console.log(`Posted: https://x.com/adlei_builds/status/${data.id}`);

  const log = getLog();
  log.tweets.push({
    id: data.id,
    text: tweetText,
    postedAt: new Date().toISOString(),
  });

  if (log.tweets.length > 100) {
    log.tweets = log.tweets.slice(-100);
  }

  saveLog(log);
}

main().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
