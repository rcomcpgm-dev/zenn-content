require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { TwitterApi } = require("twitter-api-v2");

const twitter = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const LOG_FILE = path.join(__dirname, "auto-reply-log.json");
const MAX_LIKES_PER_RUN = 10;
const MY_ID = "2034683226716057600";

const SEARCH_QUERIES = [
  "Claude Code lang:ja -is:retweet",
  "Claude Code 開発 lang:ja -is:retweet",
  "Claude Code 使い方 lang:ja -is:retweet",
  "AI コーディング lang:ja -is:retweet",
  "Claude Code おすすめ lang:ja -is:retweet",
  "Cursor AI 開発 lang:ja -is:retweet",
  "AIでアプリ開発 lang:ja -is:retweet",
  "Claude Code 個人開発 lang:ja -is:retweet",
  "AI エージェント 開発 lang:ja -is:retweet",
  "Zenn Claude lang:ja -is:retweet",
];

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return { likes: [], queryIndex: 0 };
  }
}

function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

async function searchAndLike() {
  const log = getLog();
  if (!log.likes) log.likes = [];
  const likedTweetIds = new Set(log.likes.map((l) => l.tweetId));

  const queryIndex = (log.queryIndex || 0) % SEARCH_QUERIES.length;
  const query = SEARCH_QUERIES[queryIndex];
  console.log(`Search: "${query}" (index: ${queryIndex})`);

  const searchResult = await twitter.v2.search(query, {
    max_results: 50,
    "tweet.fields": "author_id,public_metrics",
    expansions: "author_id",
    "user.fields": "id,name,username,public_metrics",
  });

  if (!searchResult.data?.data) {
    console.log("No tweets found.");
    log.queryIndex = queryIndex + 1;
    saveLog(log);
    return;
  }

  const userMap = {};
  if (searchResult.includes?.users) {
    for (const u of searchResult.includes.users) {
      userMap[u.id] = u;
    }
  }

  const candidates = searchResult.data.data.filter((t) => {
    if (t.author_id === MY_ID) return false;
    if (likedTweetIds.has(t.id)) return false;
    return true;
  });

  console.log(`Found ${candidates.length} candidates`);

  let liked = 0;
  for (const tweet of candidates) {
    if (liked >= MAX_LIKES_PER_RUN) break;

    const author = userMap[tweet.author_id];

    try {
      await twitter.v2.like(MY_ID, tweet.id);
      const name = author ? `@${author.username}` : tweet.author_id;
      console.log(`Liked ${name}: "${tweet.text.substring(0, 60)}..."`);

      log.likes.push({
        tweetId: tweet.id,
        author: author?.username || tweet.author_id,
        likedAt: new Date().toISOString(),
      });

      liked++;
      // レートリミット回避
      // 2〜3分のランダム間隔（凍結対策）
      const delay = (120 + Math.floor(Math.random() * 60)) * 1000;
      console.log(`  Waiting ${Math.round(delay/1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      const msg = err.data?.detail || err.message || String(err);
      console.log(`Error: ${msg}`);
    }
  }

  // ログは直近500件だけ保持
  if (log.likes.length > 500) {
    log.likes = log.likes.slice(-500);
  }

  log.queryIndex = queryIndex + 1;
  saveLog(log);
  console.log(`\nDone. Liked ${liked} tweets.`);
}

searchAndLike().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
