require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "tweet-history.txt");
const QUEUE_FILE = path.join(__dirname, "scheduled-queue.json");

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

async function postTweet(text) {
  const { data } = await client.v2.tweet(text);
  const url = `https://x.com/adlei_builds/status/${data.id}`;
  console.log(`投稿完了: ${url}`);
  appendHistory(text);
  return data;
}

async function scheduleToQueue(text, scheduledAt) {
  const queue = loadQueue();
  const id = Date.now().toString(36);
  queue.push({ id, text, scheduledAt, createdAt: new Date().toISOString() });
  saveQueue(queue);
  console.log(`予約追加: ID=${id}`);
  console.log(`投稿予定: ${scheduledAt}`);
  console.log(`内容: ${text}`);
}

function listQueue() {
  const queue = loadQueue();
  if (queue.length === 0) {
    console.log("予約キューは空です");
    return;
  }
  console.log(`予約キュー (${queue.length}件):\n`);
  queue.forEach((item, i) => {
    const dt = new Date(item.scheduledAt);
    const jst = dt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    console.log(`${i + 1}. [${item.id}] ${jst}`);
    console.log(`   ${item.text}\n`);
  });
}

function removeFromQueue(id) {
  const queue = loadQueue();
  const filtered = queue.filter((item) => item.id !== id);
  if (filtered.length === queue.length) {
    console.log(`ID=${id} が見つかりません`);
    return;
  }
  saveQueue(filtered);
  console.log(`ID=${id} を削除しました`);
}

// --- CLI ---
const args = process.argv.slice(2);
const command = args[0];

(async () => {
  try {
    switch (command) {
      case "post": {
        const text = args[1];
        if (!text) {
          console.error("使い方: node manual-tweet.js post \"ツイート内容\"");
          process.exit(1);
        }
        if (text.length > 280) {
          console.error(`文字数オーバー: ${text.length}/280`);
          process.exit(1);
        }
        await postTweet(text);
        break;
      }
      case "schedule": {
        const text = args[1];
        const datetime = args[2];
        if (!text || !datetime) {
          console.error(
            '使い方: node manual-tweet.js schedule "ツイート内容" "2026-04-14T12:00"'
          );
          process.exit(1);
        }
        if (text.length > 280) {
          console.error(`文字数オーバー: ${text.length}/280`);
          process.exit(1);
        }
        // datetimeをJST→UTCに変換（入力はJST想定）
        const jstDate = new Date(datetime + "+09:00");
        if (isNaN(jstDate.getTime())) {
          console.error(`日時が不正: ${datetime}`);
          process.exit(1);
        }
        if (jstDate <= new Date()) {
          console.error("過去の日時は指定できません");
          process.exit(1);
        }
        await scheduleToQueue(text, jstDate.toISOString());
        break;
      }
      case "queue":
        listQueue();
        break;
      case "remove": {
        const id = args[1];
        if (!id) {
          console.error("使い方: node manual-tweet.js remove <id>");
          process.exit(1);
        }
        removeFromQueue(id);
        break;
      }
      default:
        console.log(`manual-tweet.js — X投稿 & 予約管理

コマンド:
  post "テキスト"                    即時投稿
  schedule "テキスト" "YYYY-MM-DDTHH:MM"  予約追加（JST）
  queue                              予約一覧
  remove <id>                        予約削除
`);
    }
  } catch (err) {
    console.error("エラー:", err.data || err.message);
    process.exit(1);
  }
})();
