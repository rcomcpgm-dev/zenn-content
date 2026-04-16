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
const HISTORY_FILE = path.join(__dirname, "tweet-history.txt");
const INFLUENCER_FILE = path.join(__dirname, "influencer-patterns.json");

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

function getHistory() {
  try {
    return fs.readFileSync(HISTORY_FILE, "utf-8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function appendHistory(text) {
  fs.appendFileSync(HISTORY_FILE, text + "\n");
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

  // インフルエンサー分析結果を読み込み
  let influencerTips = "";
  try {
    const patterns = JSON.parse(fs.readFileSync(INFLUENCER_FILE, "utf-8"));
    const latest = patterns.analyses[patterns.analyses.length - 1]?.analysis;
    if (latest) {
      const templates = latest["真似すべき構文テンプレート"] || [];
      const tips = latest["話題選びのコツ"] || [];
      influencerTips = `
## インフルエンサー分析から学んだこと（参考にして）
- 構文テンプレート: ${templates.slice(0, 3).join(" / ")}
- 話題選びのコツ: ${tips.slice(0, 3).join(" / ")}`;
    }
  } catch {}

  const prompt = `IT業界12年の30歳フリーランスコンサル「REON」が、以下のトレンドを見て「自分の実体験に紐づけて」思ったことをツイートする。

## REONの人物像
- 高卒IT12年の叩き上げフリーランスコンサル
- Claude Codeで個人開発してる（Next.js, Expo, Supabase, Stripe）
- フリーランス歴あり、SES・業務委託の現場経験豊富
- 口調：「〜だな」「〜やん」「草」「〜してえ」「〜かもです」
- 「です・ます」絶対使わない（「〜かもです」くらいのゆるい敬語はOK）

## 最重要：トレンドを「自分の話」に変換する
- トレンドのニュースをただ見て「へー」と思った感想はダメ
- そのトレンドが「自分の仕事・開発・生活にどう影響するか」を1行で書く
- 「使ったことある」「移行した」「迷ってる」「影響受ける」など、自分事として語る
- 評論家っぽい分析は禁止。あくまで現場の開発者の実感

## 今Xで話題のトピック
${trendingContent}

## 絶対に守ること
- 200文字以内。短いほどいい
- ニュースの要約・紹介にしない。自分の経験・意見だけ
- 「〜だと思います」「〜ではないでしょうか」禁止。断言するか雑に言い切る
- 「〜なんよ」「〜だわ」「草」「正直」とかの口語を使う。「マジで」は多用しない
- ハッシュタグ禁止
- 絵文字は0〜1個
- 天気・気候の話禁止
- 時間帯の表現を入れるな（「朝の〜」「深夜に〜」「夜中の〜」等）
- 自作サービスの名前を出すな（「献立ガチャ」「Local Friend」「そだてる」等）。言いたいなら「作ってるサービスの〜」「個人開発の〜」で濁す
- AIをヨイショするな。「AIすごい」「AI時代は〜」「AIのおかげで〜」系の意識高いポエム禁止。AIは道具。便利だけど不満もある、くらいの温度感
- 「AI時代のエンジニアは〜」「AIを使いこなせる人が勝つ」みたいな啓蒙・説教も禁止
- 本文だけ出力

## いい例（トレンド×自分の経験。この温度感で）
「Claude 4.5出たらしい。正直3.5から使ってるけど毎回アプデで使い方変わるのだるい」
「Cursor値上げか。Claude Codeに移行した自分は勝ち組かもです」
「GPT-5の噂出てるけど結局使い慣れたやつが最強なんだよな」
「Next.js 16のRC出てた。個人開発のやつ上げるかどうか迷う」
「フリーランスでAI使えない人、正直もう厳しくないか」
「NVIDIAの株上がってんなぁ〜。買うか」
「OpenAI何出してんだ。もう追うのやめようかな」

## ダメな例（こういうの禁止）
「NVIDIAの新チップに注目です。AI業界の発展に大きく寄与するでしょう。」→ ニュースサイトか
「でさ、結局〜だと思うんだよね」→ わざとらしい考察。禁止
「〜は本質的に〜である」→ 評論家っぽい。禁止
「これは興味深いですね」→ 他人事すぎ。自分に関係ない人の感想
「AI技術の進歩は目覚ましい」→ ニュースキャスターか
「〜について考えさせられます」→ 感想文。小学生の読書感想文
「また新しいAIツール出てて草」→ 薄すぎ。自分の経験に繋げろ

## 最近のツイート（被り回避）
${recentTexts || "なし"}
${influencerTips}`;

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

  // 全履歴と重複チェック（完全一致 or 8割以上一致）
  const history = getHistory();
  const isDuplicate = history.some((past) => {
    if (past === tweetText) return true;
    const shorter = Math.min(past.length, tweetText.length);
    if (shorter === 0) return false;
    let match = 0;
    for (let i = 0; i < shorter; i++) {
      if (past[i] === tweetText[i]) match++;
    }
    return match / shorter > 0.8;
  });

  if (isDuplicate) {
    console.log("Duplicate tweet detected, skipping:", tweetText);
    return;
  }

  console.log(`Tweet: ${tweetText}`);

  const { data } = await twitter.v2.tweet(tweetText);
  console.log(`Posted: https://x.com/adlei_builds/status/${data.id}`);

  // 全履歴に追記（重複防止用、削除しない）
  appendHistory(tweetText);

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
