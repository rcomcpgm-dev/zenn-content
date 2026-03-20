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

const LOG_FILE = path.join(__dirname, "casual-tweet-log.json");

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return { tweets: [], topicIndex: 0 };
  }
}

function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

// 時間帯ごとのトピックプール
const TOPIC_POOLS = {
  morning: [
    "朝のルーティン・カフェ・コーヒー",
    "今日やること・仕事のモチベ",
    "朝ごはん・朝食の話",
    "早起きあるある・朝型vs夜型",
    "天気と仕事のテンション",
  ],
  lunch: [
    "ランチ・昼メシの話",
    "午前中の仕事の振り返り",
    "最近気になったITニュース・AI関連の動向",
    "リモートワークあるある",
    "エンジニアの昼休み",
  ],
  afternoon: [
    "最近のAI業界の動き・新サービス",
    "フリーランスあるある・働き方",
    "技術選定・ツールの感想",
    "クライアントワークの話（ぼかし）",
    "プログラミング学習・スキルアップ",
  ],
  evening: [
    "晩ごはん・自炊or外食",
    "今日の振り返り・学び",
    "夜のコーディング・個人開発",
    "IT業界のキャリア・将来の話",
    "週末の予定・趣味",
  ],
  night: [
    "深夜作業のお供（音楽・飲み物）",
    "ふと考えたこと・ポエム系",
    "明日やりたいこと",
    "最近ハマってるもの",
    "エンジニアの夜更かし事情",
  ],
};

function getTimeSlot() {
  const hour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  ).getHours();
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 10 && hour < 13) return "lunch";
  if (hour >= 13 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

async function generateAndPost() {
  const log = getLog();
  const timeSlot = getTimeSlot();
  const topics = TOPIC_POOLS[timeSlot];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  // 直近の投稿を取得して被りを避ける
  const recentTexts = log.tweets
    .slice(-20)
    .map((t) => t.text)
    .join("\n---\n");

  const prompt = `あなたは「REON」というXアカウントの中の人です。以下のプロフィールに基づいて、自然なツイートを1つ生成してください。

## プロフィール
- 高卒でIT業界12年目のフリーランスITコンサル
- Claude Codeを使って個人開発もしている
- 日本在住、日本語ネイティブ
- 気さくでカジュアルな口調。でも知識はしっかりある
- たまに毒舌。でも基本ポジティブ

## 今回のテーマ
時間帯: ${timeSlot}
トピック: ${topic}

## ルール
- 140文字以内（短いほど良い。50〜100文字くらいがベスト）
- ハッシュタグは使わないか、使っても1個まで
- 絵文字は0〜2個まで
- 宣伝っぽくしない。普通の人の日常ツイートに見えること
- 「〜なんだよね」「〜だわ」「〜かも」みたいな自然な語尾
- ツイート本文だけを出力。説明や前置きは不要

## 最近の投稿（被らないようにする）
${recentTexts || "（まだなし）"}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const tweetText = response.content[0].text.trim().replace(/^[「『]|[」』]$/g, "");

  if (tweetText.length > 280) {
    console.log("Generated tweet too long, skipping:", tweetText);
    return;
  }

  console.log(`[${timeSlot}] Topic: ${topic}`);
  console.log(`Tweet: ${tweetText}`);

  const { data } = await twitter.v2.tweet(tweetText);
  console.log(`Posted: https://x.com/adlei_builds/status/${data.id}`);

  log.tweets.push({
    id: data.id,
    text: tweetText,
    topic,
    timeSlot,
    postedAt: new Date().toISOString(),
  });

  // ログは直近100件だけ保持
  if (log.tweets.length > 100) {
    log.tweets = log.tweets.slice(-100);
  }

  saveLog(log);
}

generateAndPost().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
