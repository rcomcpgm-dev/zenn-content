require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic();
const QIITA_TOKEN = process.env.QIITA_TOKEN;
const LOG_FILE = path.join(__dirname, "qiita-crosspost-log.json");
const ARTICLES_DIR = path.join(__dirname, "articles");

// Zenn topics → Qiita tags マッピング
const TAG_MAP = {
  claudecode: "ClaudeCode",
  ai: "AI",
  programming: "プログラミング",
  beginners: "初心者",
  cli: "CLI",
  git: "Git",
  productivity: "生産性向上",
  tips: "Tips",
  react: "React",
  reactnative: "ReactNative",
  expo: "Expo",
  supabase: "Supabase",
  firebase: "Firebase",
  nextjs: "Next.js",
  nodejs: "Node.js",
  typescript: "TypeScript",
  javascript: "JavaScript",
  web: "Web",
  scraping: "スクレイピング",
  debug: "デバッグ",
  vscode: "VSCode",
  mcp: "MCP",
};

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return { posted: [] };
  }
}

function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

function parseArticle(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();

  const titleMatch = frontmatter.match(/title:\s*"(.+?)"/);
  const topicsMatch = frontmatter.match(/topics:\s*\[(.+?)\]/);
  const publishedMatch = frontmatter.match(/published:\s*(true|false)/);

  const title = titleMatch ? titleMatch[1] : null;
  const published = publishedMatch ? publishedMatch[1] === "true" : false;
  const topics = topicsMatch
    ? topicsMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/"/g, ""))
    : [];

  return { title, body, topics, published };
}

function mapTags(topics) {
  const tags = topics
    .map((t) => TAG_MAP[t.toLowerCase()] || t)
    .slice(0, 5)
    .map((name) => ({ name, versions: [] }));
  return tags;
}

async function rewriteForQiita(title, body) {
  const prompt = `以下のZenn記事をQiita向けに軽く書き換えてください。

## ルール
- タイトルは少し変える（完全コピーを避ける）
- 本文の冒頭に「この記事はZennにも投稿しています」等は書かない
- 内容は同じだが、言い回しを少し変える程度でOK
- 記事の最後に以下を追加:
  ---
  この記事が参考になったらLGTMお願いします！
  Zennでも技術記事を発信中です → https://zenn.dev/and_and_and
- Markdown形式で出力
- タイトルと本文を「===TITLE===」「===BODY===」で区切って出力

## 元タイトル
${title}

## 元本文
${body.substring(0, 4000)}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const result = response.content[0].text;
  const titleMatch = result.match(/===TITLE===\s*\n?([\s\S]*?)===BODY===/);
  const bodyMatch = result.match(/===BODY===\s*\n?([\s\S]*)/);

  return {
    title: titleMatch ? titleMatch[1].trim() : title + "【実践ガイド】",
    body: bodyMatch ? bodyMatch[1].trim() : body,
  };
}

function postToQiita(title, body, tags) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      title,
      body,
      tags,
      private: false,
      tweet: false,
    });

    const options = {
      hostname: "qiita.com",
      path: "/api/v2/items",
      method: "POST",
      headers: {
        Authorization: `Bearer ${QIITA_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode === 201) {
            resolve(parsed);
          } else {
            reject(new Error(`${res.statusCode}: ${parsed.message || body}`));
          }
        } catch (e) {
          reject(new Error(`${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const log = getLog();
  const postedFiles = new Set(log.posted.map((p) => p.file));

  // 公開済みZenn記事を取得
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md"));
  const candidates = [];

  for (const file of files) {
    if (postedFiles.has(file)) continue;
    const article = parseArticle(path.join(ARTICLES_DIR, file));
    if (article && article.published && article.title) {
      candidates.push({ file, ...article });
    }
  }

  if (candidates.length === 0) {
    console.log("No new articles to crosspost.");
    return;
  }

  // 1記事だけ投稿
  const article = candidates[0];
  console.log(`Crossposting: ${article.title} (${article.file})`);

  const rewritten = await rewriteForQiita(article.title, article.body);
  const tags = mapTags(article.topics);

  console.log(`Qiita title: ${rewritten.title}`);
  console.log(`Tags: ${tags.map((t) => t.name).join(", ")}`);

  const result = await postToQiita(rewritten.title, rewritten.body, tags);
  console.log(`Posted: ${result.url}`);

  log.posted.push({
    file: article.file,
    zennTitle: article.title,
    qiitaTitle: rewritten.title,
    qiitaUrl: result.url,
    qiitaId: result.id,
    postedAt: new Date().toISOString(),
  });

  saveLog(log);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
