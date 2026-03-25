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
const FOLLOWED_FILE = path.join(__dirname, "followed-users.json");
const MAX_LIKES_PER_RUN = 10;
const MY_ID = "2034683226716057600";

const SEARCH_QUERIES = [
  // エンジニア系
  "エンジニア 個人開発 lang:ja -is:retweet",
  "エンジニア フリーランス lang:ja -is:retweet",
  "フロントエンド エンジニア lang:ja -is:retweet",
  "バックエンド エンジニア lang:ja -is:retweet",
  "Webエンジニア 転職 lang:ja -is:retweet",
  // AI・開発ツール系
  "Claude Code lang:ja -is:retweet",
  "Cursor AI 開発 lang:ja -is:retweet",
  "AI コーディング lang:ja -is:retweet",
  "AIでアプリ開発 lang:ja -is:retweet",
  "AI エージェント 開発 lang:ja -is:retweet",
  // コンサル・IT業界系
  "ITコンサル lang:ja -is:retweet",
  "フリーランス エンジニア 案件 lang:ja -is:retweet",
  "SES エンジニア lang:ja -is:retweet",
  // 技術コミュニティ系
  "Zenn 記事書いた lang:ja -is:retweet",
  "Qiita 投稿 lang:ja -is:retweet",
  "個人開発 リリース lang:ja -is:retweet",
  "React Next.js lang:ja -is:retweet",
  "TypeScript 開発 lang:ja -is:retweet",
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

function getFollowedUsers() {
  try {
    return JSON.parse(fs.readFileSync(FOLLOWED_FILE, "utf-8"));
  } catch {
    return { users: [], lastQueryIndex: 0 };
  }
}

function saveFollowedUsers(data) {
  fs.writeFileSync(FOLLOWED_FILE, JSON.stringify(data, null, 2));
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
    "user.fields": "id,name,username,public_metrics,description",
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

  // フォロー済みユーザーを読み込み
  const followedData = getFollowedUsers();
  const alreadyFollowed = new Set(followedData.users.map((u) => u.id));

  // エンジニア判定用キーワード（bio内）
  const ENGINEER_KEYWORDS = [
    "エンジニア", "engineer", "開発", "developer", "プログラマ", "programmer",
    "フロントエンド", "バックエンド", "frontend", "backend", "fullstack",
    "コンサル", "consultant", "SES", "フリーランス", "freelance",
    "個人開発", "indie", "Web", "React", "TypeScript", "Python", "Go",
    "Next.js", "Vue", "Rails", "Laravel", "AWS", "GCP", "Azure",
    "インフラ", "DevOps", "SRE", "PM", "CTO", "CEO", "技術",
    "Zenn", "Qiita", "テック", "tech", "AI", "機械学習", "データ",
  ];

  function isLikelyEngineer(author) {
    if (!author?.description) return false;
    const bio = author.description.toLowerCase();
    return ENGINEER_KEYWORDS.some((kw) => bio.toLowerCase().includes(kw.toLowerCase()));
  }

  // フォロワー数の上下限
  const MIN_FOLLOWERS = 100;
  const MAX_FOLLOWERS = 10000;

  // 候補をフィルタ＆フォロバ率でソート
  const seenAuthors = new Set();
  const candidates = searchResult.data.data
    .filter((t) => {
      if (t.author_id === MY_ID) return false;
      if (likedTweetIds.has(t.id)) return false;
      return true;
    })
    .map((t) => ({ tweet: t, author: userMap[t.author_id] }))
    .filter(({ author }) => {
      if (!author) return false;
      if (seenAuthors.has(author.id)) return false;
      seenAuthors.add(author.id);
      const followers = author.public_metrics.followers_count;
      const following = author.public_metrics.following_count;
      // フォロワー数の上下限チェック
      if (followers < MIN_FOLLOWERS || followers > MAX_FOLLOWERS) return false;
      // フォロー/フォロワー比が0.3〜3.0の範囲外は除外
      if (following > 0) {
        const ratio = followers / following;
        if (ratio < 0.3 || ratio > 3.0) return false;
      }
      return true;
    })
    .map(({ tweet, author }) => {
      const followers = author.public_metrics.followers_count;
      const following = author.public_metrics.following_count;
      const ratio = following > 0 ? followers / following : 999;
      // フォロバ率スコア（1.0に近いほど良い）
      let followBackScore = Math.abs(1 - ratio);
      // エンジニア系bioならスコアを大幅に優遇（-0.5）
      if (isLikelyEngineer(author)) {
        followBackScore -= 0.5;
        console.log(`  [Engineer] @${author.username}: "${author.description?.substring(0, 50)}..."`);
      }
      return { tweet, author, followBackScore };
    })
    .sort((a, b) => a.followBackScore - b.followBackScore);

  console.log(`Found ${candidates.length} candidates (sorted by follow-back score)`);

  let liked = 0;
  for (const { tweet, author } of candidates) {
    if (liked >= MAX_LIKES_PER_RUN) break;

    try {
      // いいね
      await twitter.v2.like(MY_ID, tweet.id);
      const name = author ? `@${author.username}` : tweet.author_id;
      console.log(`Liked ${name}: "${tweet.text.substring(0, 60)}..."`);

      log.likes.push({
        tweetId: tweet.id,
        author: author?.username || tweet.author_id,
        likedAt: new Date().toISOString(),
      });

      // 2秒後にフォロー
      if (author && !alreadyFollowed.has(author.id)) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await twitter.v2.follow(MY_ID, author.id);
          console.log(`  -> Followed @${author.username}`);
          followedData.users.push({
            id: author.id,
            username: author.username,
            name: author.name,
            followers: author.public_metrics.followers_count,
            followedAt: new Date().toISOString(),
            query: query,
          });
          alreadyFollowed.add(author.id);
        } catch (followErr) {
          const msg = followErr.data?.detail || followErr.message || String(followErr);
          console.log(`  -> Follow skip @${author.username}: ${msg}`);
        }
      }

      liked++;
      // レートリミット回避（10秒間隔）
      await new Promise((r) => setTimeout(r, 10000));
    } catch (err) {
      const msg = err.data?.detail || err.message || String(err);
      console.log(`Error: ${msg}`);
    }
  }

  // フォロー済みリストを保存
  saveFollowedUsers(followedData);

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
