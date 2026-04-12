require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");
const path = require("path");

const QUEUE_FILE = path.join(__dirname, "scheduled-queue.json");
const HISTORY_FILE = path.join(__dirname, "tweet-history.txt");

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf-8");
}

function appendHistory(text) {
  fs.appendFileSync(HISTORY_FILE, text + "\n", "utf-8");
}

async function processQueue() {
  const queue = loadQueue();
  if (queue.length === 0) {
    console.log("キューは空です");
    return;
  }

  const now = new Date();
  const due = queue.filter((item) => new Date(item.scheduledAt) <= now);
  const remaining = queue.filter((item) => new Date(item.scheduledAt) > now);

  if (due.length === 0) {
    console.log(
      `投稿予定なし（残り${remaining.length}件、次: ${new Date(remaining[0].scheduledAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）`
    );
    return;
  }

  console.log(`${due.length}件の予約投稿を処理します`);

  for (const item of due) {
    try {
      const params = item.replyToId
        ? { text: item.text, reply: { in_reply_to_tweet_id: item.replyToId } }
        : item.text;
      const { data } = await client.v2.tweet(params);
      const url = `https://x.com/adlei_builds/status/${data.id}`;
      console.log(`投稿完了 [${item.id}]: ${url}`);
      appendHistory(item.text);

      // 連続投稿時は2秒待機
      if (due.indexOf(item) < due.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(
        `投稿失敗 [${item.id}]:`,
        err.data || err.message
      );
      // 失敗したものはキューに残す
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  console.log(`処理完了。残りキュー: ${remaining.length}件`);
}

processQueue();
