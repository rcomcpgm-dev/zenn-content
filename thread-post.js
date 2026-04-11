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

const LOG_FILE = path.join(__dirname, "thread-log.json");
const ARTICLES_DIR = path.join(__dirname, "articles");

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return { threads: [] };
  }
}

function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

function getPublishedArticles() {
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md"));
  const articles = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
    if (content.includes("published: true")) {
      const titleMatch = content.match(/title:\s*"(.+?)"/);
      articles.push({
        file,
        title: titleMatch ? titleMatch[1] : file,
        content,
      });
    }
  }
  return articles;
}

async function generateThread(article) {
  const prompt = `IT12年のフリーランスコンサル「REON」が、自分のZenn記事をスレッドで紹介する。友達に「これ読んでみ」って勧める感じで。

## REONの喋り方
- 「です・ます」使わない。タメ口
- 「マジで」「〜なんよ」「〜だわ」「正直」とか使う
- 教える口調にならない。体験談として語る
- 完璧にまとめない。雑でいい

## 記事タイトル
${article.title}

## 記事本文
${article.content.substring(0, 3000)}

## スレッドのルール
- 1ツイート目: 自分の実体験からの導入。「〜で困ってたんだけど」「〜やってみたら世界変わった」みたいな
- 2〜4ツイート目: 記事の要点を「俺はこうやった」「ここがポイント」的に
- 最後のツイート: 記事リンク。「詳しくはZennに書いた」くらいの軽さで
- 各ツイート250文字以内
- ツイート間は「---」で区切る
- 合計4〜6ツイート
- ハッシュタグ禁止
- 絵文字は0〜1個/ツイート
- 「〜しましょう」「〜がおすすめです」「〜してみてください」禁止
- 記事URL: https://zenn.dev/rcn_article/articles/${article.file.replace(".md", "")}
- 本文だけ出力`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].text.trim();
  const tweets = raw
    .split("---")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 280);

  return tweets;
}

async function postThread(tweets) {
  let previousTweetId = null;
  const postedIds = [];

  for (const text of tweets) {
    const params = previousTweetId
      ? { reply: { in_reply_to_tweet_id: previousTweetId } }
      : {};

    const { data } = await twitter.v2.tweet(text, params);
    postedIds.push(data.id);
    previousTweetId = data.id;
    console.log(`  Posted: ${text.substring(0, 60)}...`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  return postedIds;
}

async function main() {
  const log = getLog();
  const threadedFiles = new Set(log.threads.map((t) => t.file));
  const articles = getPublishedArticles();

  // まだスレッド化してない記事を1つ選ぶ
  const candidates = articles.filter((a) => !threadedFiles.has(a.file));

  if (candidates.length === 0) {
    console.log("All published articles already have threads.");
    return;
  }

  // ランダムに1つ選択
  const article = candidates[Math.floor(Math.random() * candidates.length)];
  console.log(`Generating thread for: ${article.title}`);

  const tweets = await generateThread(article);
  console.log(`Generated ${tweets.length} tweets`);

  if (tweets.length < 3) {
    console.log("Too few tweets generated, skipping.");
    return;
  }

  const tweetIds = await postThread(tweets);

  log.threads.push({
    file: article.file,
    title: article.title,
    tweetCount: tweetIds.length,
    firstTweetId: tweetIds[0],
    postedAt: new Date().toISOString(),
  });

  saveLog(log);
  console.log(
    `\nThread posted: https://x.com/adlei_builds/status/${tweetIds[0]}`
  );
}

main().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
