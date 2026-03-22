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
    "朝のルーティン・コーヒー",
    "朝ごはん・朝食",
    "寝坊・二度寝",
    "今日の案件・面談",
    "体調・健康（尿酸値、禁酒等）",
  ],
  lunch: [
    "ランチ・昼メシ",
    "リモートワークあるある",
    "案件・面談の愚痴",
    "フリーランスあるある",
    "最近見たアニメ",
  ],
  afternoon: [
    "フリーランスの働き方・単価",
    "開発ツール・Claude Codeの話",
    "買い物・散歩",
    "引っ越し検討",
    "友達との予定",
  ],
  evening: [
    "晩ごはん・外食・出前",
    "夜のコーディング・個人開発",
    "酒・家飲み・禁酒",
    "アニメ・漫画の感想",
    "週末の予定",
  ],
  night: [
    "深夜の酒・1人飲み",
    "深夜コーディング",
    "アニメ一気見",
    "明日の面談・案件の話",
    "寝れない・夜更かし",
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

  const prompt = `REONっていう30歳フリーランスITコンサルのツイートを1つ書いて。

## REONはこういう人間（実際の本人のツイートから抽出）
- 高卒IT12年の叩き上げ。フリーランスコンサル
- Claude Codeで個人開発してる
- 酒好き（禁酒と解禁を繰り返す）。尿酸値やばい
- アニメ見る（まどマギ、嘆きの亡霊、メダリストなど）
- F1/スーパーフォーミュラ見る
- 面談愚痴、案件の話をリアルに呟く
- 友達と飯行ったり釣り行ったりする
- 1人で家飲みする
- 引っ越し検討を繰り返す
- 口調：メインアカウントより少しだけ硬め。ビジネス垢なので
- 「〜かもです」「〜だなー」「〜ないね」「〜してえ」「草」くらいの柔らかさ
- 「〜アカンのや」「〜やん」みたいな強い方言は控える
- 「です・ます」の丁寧語は使わないけど、「〜かもです」くらいのゆるい敬語はOK

## テーマ
${topic}（${timeSlot}の時間帯）

## 絶対に守ること
- 140文字以内。短いほどいい。10〜50文字がベスト
- ハッシュタグ禁止
- 絵文字は0〜1個。なくていい
- 薄い独り言。考察・教訓・まとめ禁止
- 「でさ、〜だと思うんだよね」みたいに無理やりビジネスに繋げるの禁止
- IT・ビジネスの話とプライベートの話を1ツイートで混ぜない
- 宣伝禁止。リンク禁止
- 天気の話禁止
- クライアント・仕事の話は平日のみ。土日は趣味・個人開発の話
- 本文だけ出力

## ダメな例（禁止）
「朝のコーヒーを飲みながら、今日の開発計画を立てています。」→ AIっぽい
「でさ、結局AIを使いこなせる奴が勝つんだよ」→ わざとらしい考察。禁止
「外注さんとの打ち合わせ〜でさ、空いたリソースで次のマネタイズ考える方がマジで効率いい。」→ 無理やりビジネスに転換。禁止

## いい例（この温度感。メインより少しだけ硬い）
「何食べようかなー」
「トンカツは出前で頼むもんじゃないね」
「1人で家飲みしてると酒が進まない」
「面談で結構やらかしたけど通った。2次かー」
「案件の打ち合わせ、時給換算すると地獄かもです」
「GithubAction便利だなー」
「フルリモートでフルフレックスらしい。行きたい」
「禁酒3日目。尿酸値のために頑張る」
「嘆きの亡霊、毎回特殊OPEDやってくれるからすこ」
「アプリ公開したけどアカウント育たないと拡散できないね」

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
