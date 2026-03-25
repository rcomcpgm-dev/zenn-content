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

const FOLLOWED_FILE = path.join(__dirname, "followed-users.json");
const MY_ID = "2034683226716057600";
const UNFOLLOW_AFTER_DAYS = 7;
const MAX_UNFOLLOW_PER_RUN = 10;

// initialフォロー（手動で追加した公式アカウント等）はアンフォロー対象外
const PROTECTED_QUERIES = ["initial"];

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

async function checkAndUnfollow() {
  const followedData = getFollowedUsers();
  const now = new Date();

  // 自分のフォロワー一覧を取得（フォロバ確認用）
  // Free プランではフォロワー一覧取得に制限があるため、
  // friendship lookup で個別確認する
  const candidates = followedData.users.filter((u) => {
    if (PROTECTED_QUERIES.includes(u.query)) return false;
    if (!u.followedAt) return false;
    const followedAt = new Date(u.followedAt);
    const daysSinceFollow = (now - followedAt) / (1000 * 60 * 60 * 24);
    return daysSinceFollow >= UNFOLLOW_AFTER_DAYS;
  });

  console.log(`Checking ${candidates.length} users (followed ${UNFOLLOW_AFTER_DAYS}+ days ago)`);

  let unfollowed = 0;
  const unfollowedIds = new Set();

  for (const user of candidates) {
    if (unfollowed >= MAX_UNFOLLOW_PER_RUN) break;

    try {
      // v2 APIでフォロバされているか確認
      // GET /2/users/:id/followers でフォロワーを検索するのはコストが高いので
      // v1.1 friendships/lookup を使う
      const friendships = await twitter.v1.friendships({ user_id: user.id });

      // API呼び出し後のレートリミット回避（3秒）
      await new Promise((r) => setTimeout(r, 3000));

      if (friendships.length > 0) {
        const connections = friendships[0].connections || [];
        if (connections.includes("followed_by")) {
          console.log(`  @${user.username} -> followed back! keeping.`);
          // フォロバされた = followedBack フラグを付ける
          user.followedBack = true;
          continue;
        }
      }

      // フォロバされていない → アンフォロー
      await twitter.v2.unfollow(MY_ID, user.id);
      console.log(`  @${user.username} -> no follow-back after ${UNFOLLOW_AFTER_DAYS} days. Unfollowed.`);
      unfollowedIds.add(user.id);
      unfollowed++;

      // アンフォロー後のレートリミット回避（10秒）
      await new Promise((r) => setTimeout(r, 10000));
    } catch (err) {
      const msg = err.data?.detail || err.message || String(err);
      console.log(`  @${user.username} -> error: ${msg}`);
    }
  }

  // アンフォローしたユーザーをリストから削除
  followedData.users = followedData.users.filter((u) => !unfollowedIds.has(u.id));
  saveFollowedUsers(followedData);

  console.log(`\nDone. Unfollowed ${unfollowed} users.`);
}

checkAndUnfollow().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
