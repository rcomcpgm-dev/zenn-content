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

  const prompt = `REONっていう30歳のフリーランスITコンサルがXに投稿するツイートを1つ書いて。

## REONの人物像
- 高卒からIT12年。運用→エンジニア→フリーランス→コンサルの叩き上げ
- 今は月単価110万で安定してるけど、面白いこと探し中
- Claude Codeで個人開発してる。技術オタクではないけど実務は強い
- 口が悪い時もある。「マジで」「〜だわ」「草」「しんどい」とか普通に使う
- 薄っぺらい独り言でいい。深い考察とか教訓とかいらない
- 「です・ます」は使わない。独り言テンション

## テーマ
${topic}（${timeSlot}の時間帯）

## 絶対に守ること
- 140文字以内。短いほどいい。10〜50文字がベスト
- ハッシュタグ禁止
- 絵文字は0〜1個。なくていい
- AIが書いたっぽい「整った文章」にしない
- 「〜ですよね」「〜しましょう」「〜が大事です」禁止。説教くさいの禁止
- ストーリーを作らない。「〜したら〜だった。〜って思った」みたいな起承転結禁止
- 感想文にしない。ただの独り言。落ちもオチもいらない
- 宣伝禁止。リンク禁止
- 本文だけ出力

## ダメな例（こういうの禁止）
「朝のコーヒーを飲みながら、今日の開発計画を立てています。」→ AIっぽい
「隣のカフェのおっさんが起業してて面白かった。意外なところに面白い人はいるものだ」→ まとめすぎ。教訓っぽい
「でさ、〜だと思うんだよね」→ わざとらしい。考察っぽくしない

## いい例（この温度感。薄くていい）
「腹減った。昼何食おう」
「コーヒー3杯目。飲みすぎか」
「雨だるい」
「カレーにしようと思ったけどラーメンにした」
「眠い。けど納期ある」
「今日のランチ当たりだった」
「隣の席のやつがCursor使っててちょっと気になった。話しかけられんかったけどｗ」
「帰りにコンビニ寄る以外の予定がない」
「ようやく金曜か。長かった」
「風呂入ってから仕事するか、仕事してから風呂入るか。永遠の課題」

## 最近のツイート（被り回避）
${recentTexts || "なし"}`;

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
