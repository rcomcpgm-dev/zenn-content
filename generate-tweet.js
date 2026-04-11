// 記事ファイルからXポスト用テキストを生成する
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node generate-tweet.js <article-file>");
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf-8");

// frontmatterからtitleを抽出
const titleMatch = content.match(/title:\s*"(.+?)"/);
const title = titleMatch ? titleMatch[1] : "新しい記事を公開しました";

// slug = ファイル名（拡張子なし）
const slug = path.basename(filePath, ".md");

// リード文を抽出（frontmatter直後の最初の段落）
const bodyStart = content.indexOf("---", 3) + 3;
const body = content.slice(bodyStart).trim();
const leadMatch = body.match(/^([^#\n].+)/);
const lead = leadMatch ? leadMatch[1].trim() : "";

const url = `https://zenn.dev/rcn_article/articles/${slug}`;

// ポストを組み立て
let tweet = `${title}\n\n`;
if (lead) {
  // 280文字制限を考慮してリード文を切る
  const maxLead = 100;
  tweet += (lead.length > maxLead ? lead.slice(0, maxLead) + "..." : lead) + "\n\n";
}
tweet += `${url}\n\n#ClaudeCode #AI開発`;

process.stdout.write(tweet);
