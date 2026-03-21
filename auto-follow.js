require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { TwitterApi } = require("twitter-api-v2");

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const FOLLOWED_FILE = path.join(__dirname, "followed-users.json");
const MAX_FOLLOW_PER_RUN = 10;

// Claude Code / AI開発系の検索クエリ（ローテーション）
const SEARCH_QUERIES = [
  "Claude Code lang:ja -is:retweet",
  "Claude Code 開発 lang:ja -is:retweet",
  "AI コーディング lang:ja -is:retweet",
  "Cursor AI 開発 lang:ja -is:retweet",
  "Zenn Claude lang:ja -is:retweet",
  "AI エージェント 開発 lang:ja -is:retweet",
  "Supabase lang:ja -is:retweet",
  "React Native AI lang:ja -is:retweet",
  "プログラミング AI活用 lang:ja -is:retweet",
  "Claude API lang:ja -is:retweet",
];

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

async function getMyId() {
  const me = await client.v2.me();
  return me.data.id;
}

async function searchAndFollow() {
  const data = getFollowedUsers();
  const alreadyFollowed = new Set(data.users.map((u) => u.id));

  // クエリをローテーション
  const queryIndex = data.lastQueryIndex % SEARCH_QUERIES.length;
  const query = SEARCH_QUERIES[queryIndex];
  console.log(`Search query: "${query}" (index: ${queryIndex})`);

  const myId = await getMyId();
  console.log(`My user ID: ${myId}`);

  // ツイート検索（最大50件取得）
  const searchResult = await client.v2.search(query, {
    max_results: 50,
    "tweet.fields": "author_id,public_metrics",
    expansions: "author_id",
    "user.fields": "id,name,username,description,public_metrics",
  });

  if (!searchResult.includes?.users) {
    console.log("No users found in search results.");
    data.lastQueryIndex = queryIndex + 1;
    saveFollowedUsers(data);
    return;
  }

  // ユニークユーザーをフォロワー数でソート（影響力のある順）
  const seen = new Set();
  const candidates = searchResult.includes.users
    .filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      // 自分自身、既にフォロー済み、フォロワー0はスキップ
      if (u.id === myId) return false;
      if (alreadyFollowed.has(u.id)) return false;
      if (u.public_metrics.followers_count < 10) return false;
      return true;
    })
    .sort(
      (a, b) =>
        b.public_metrics.followers_count - a.public_metrics.followers_count
    );

  console.log(`Found ${candidates.length} new candidates`);

  let followed = 0;
  for (const user of candidates) {
    if (followed >= MAX_FOLLOW_PER_RUN) break;

    try {
      await client.v2.follow(myId, user.id);
      console.log(
        `Followed: @${user.username} (${user.name}) - ${user.public_metrics.followers_count} followers`
      );
      data.users.push({
        id: user.id,
        username: user.username,
        name: user.name,
        followers: user.public_metrics.followers_count,
        followedAt: new Date().toISOString(),
        query: query,
      });
      followed++;
      // レートリミット回避
      // 3〜5分のランダム間隔（凍結対策）
      const delay = (180 + Math.floor(Math.random() * 120)) * 1000;
      console.log(`  Waiting ${Math.round(delay/1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      // 既にフォロー済み等のエラーは無視して続行
      const msg = err.data?.detail || err.message || String(err);
      console.log(`Skip @${user.username}: ${msg}`);
      // 既フォローの場合は記録だけしておく
      data.users.push({
        id: user.id,
        username: user.username,
        name: user.name,
        followers: user.public_metrics.followers_count,
        followedAt: new Date().toISOString(),
        query: query,
        skipped: true,
      });
    }
  }

  data.lastQueryIndex = queryIndex + 1;
  saveFollowedUsers(data);
  console.log(
    `\nDone. Followed ${followed} users. Total tracked: ${data.users.length}`
  );
}

searchAndFollow().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
