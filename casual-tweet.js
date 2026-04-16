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

const LOG_FILE = path.join(__dirname, "casual-tweet-log.json");
const HISTORY_FILE = path.join(__dirname, "tweet-history.txt");
const INFLUENCER_FILE = path.join(__dirname, "influencer-patterns.json");

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

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return { tweets: [], topicIndex: 0 };
  }
}

function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

// 時間帯に依存しないトピックプール
const TOPICS = [
  // 仕事・案件系
  "案件・面談の愚痴",
  "フリーランスあるある",
  "フリーランスの働き方・単価",
  "SES・業務委託の闇",
  "ITコンサルの現場あるある",
  "面談の緊張・準備・失敗",
  "案件の技術選定で揉めた話",
  "コードレビューで指摘されたこと",
  "フリーランスの確定申告・経費",
  "エンジニアの転職市場",
  // 技術・開発系
  "開発ツール・Claude Codeの話",
  "ChatGPT vs Claude 使い分け",
  "VS CodeとCursor、結局どっち使うか問題",
  "新しいライブラリ・フレームワーク触った感想",
  "技術スタックの流行り廃り",
  "Dockerで環境壊した話",
  "GitHub Actionsやるか手動か迷う話",
  "ドキュメント書くのめんどくさい話",
  "テスト書かずに本番出した話",
  "デプロイ後のヒヤヒヤ",
  "バグの原因がtypoだった話",
  "GitHubの草を見て虚無",
  // 個人開発・副業系
  "個人開発のモチベーション",
  "副業・個人開発の収益化",
  "個人開発のアイデアが降ってきた",
  "リファクタ始めたら止まらない",
  // 生活・趣味系
  "体調・健康（尿酸値等）",
  "酒・家飲み・外飲み",
  "アニメ・漫画の感想",
  "F1・スーパーフォーミュラの話",
  "釣りに行きたい話",
  "友達と飯行った話",
  "友達との予定",
  "引っ越し検討",
  "リモートワークの集中力",
  "技術書読もうとして積んでる話",
  "来月の案件どうしよう",
];

async function generateAndPost() {
  const log = getLog();
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];

  // 全スクリプト共通の履歴から直近30件を取得して被りを避ける
  const recentTexts = getHistory()
    .slice(-30)
    .join("\n---\n");

  // インフルエンサー分析結果を読み込み
  let influencerTips = "";
  try {
    const patterns = JSON.parse(fs.readFileSync(INFLUENCER_FILE, "utf-8"));
    const latest = patterns.analyses[patterns.analyses.length - 1]?.analysis;
    if (latest) {
      const templates = latest["真似すべき構文テンプレート"] || [];
      const tips = latest["REONのX運用への具体的アドバイス"] || [];
      influencerTips = `
## インフルエンサー分析から学んだこと（参考にして）
- 構文テンプレート: ${templates.slice(0, 3).join(" / ")}
- 運用のコツ: ${tips.slice(0, 3).join(" / ")}`;
    }
  } catch {}

  const prompt = `REONっていう30歳フリーランスITコンサルのツイートを1つ書いて。

## REONはこういう人間（実際の本人のツイートから抽出）
- 高卒IT12年の叩き上げ。フリーランスコンサル
- Claude Codeで個人開発してる
- 酒好き。家飲みも外飲みもする。尿酸値は気にしつつ普通に飲んでる
- アニメ見る（まどマギ、嘆きの亡霊、メダリストなど）
- F1/スーパーフォーミュラ見る
- 面談愚痴、案件の話をリアルに呟く
- 友達と飯行ったり釣り行ったりする
- 1人で家飲みする
- 引っ越し検討を繰り返す
- 口調：メインアカウントより少しだけ硬め。ビジネス垢なので
- 「〜かもです」「〜だなー」「〜ないね」「〜してえ」「草」くらいの柔らかさ
- 「〜アカンのや」「〜やん」みたいな強い方言は控える
- 「です・ます」の丁寧語は使わないけど、「〜かもです」くらいのゆるい敬語はOK

## テーマ
「${topic}」についてツイートして。

## 人間っぽく書くコツ
- 途中で文が切れてもいい。全部説明しなくていい
- 「〜なんだよな」「〜だわ」で終わる独り言。誰にも語りかけてない感じ
- 具体的な固有名詞・数字を入れる（「3時間」「React 19」「2次面談」など）
- たまに誤字っぽい口語（「してえ」「やべー」）を混ぜる
- 感情は1個だけ。「嬉しい」「だるい」「やばい」どれか1つ
- 文末のバリエーション：「〜だわ」「〜なんだが」「〜かもです」「〜してえ」「草」「〜だなー」

## 絶対に守ること
- ツイート本文だけを出力。前置き・説明・メタ情報は一切書くな
- 「〜のツイート：」「〜についてのツイート」のような前置きは絶対禁止
- 時間帯の表現を入れるな（「朝の〜」「深夜に〜」「夜中の〜」「昼休み」等）。いつ読んでも違和感ない内容にする
- 140文字以内。短いほどいい。10〜50文字がベスト
- ハッシュタグ禁止
- 絵文字は0〜1個。なくていい
- 考察・教訓・まとめ禁止。オチをつけるな
- 「でさ、〜だと思うんだよね」みたいに無理やりビジネスに繋げるの禁止
- AIをヨイショするな。「AIすごい」「AI時代は〜」「AIのおかげで〜」「AIがあれば〜」系の意識高いポエム禁止。AIは道具。便利だけど不満もある、くらいの温度感で
- 「AI時代のエンジニアは〜」「AIを使いこなせる人が勝つ」みたいな啓蒙・説教くさいのも禁止
- IT・ビジネスの話とプライベートの話を1ツイートで混ぜない
- 宣伝禁止。リンク禁止
- 天気の話禁止
- 自作サービスの名前を出すな（「献立ガチャ」「Local Friend」「そだてる」等）。言いたいなら「作ってるサービスの〜」「個人開発の〜」で濁す
- クライアント・仕事の話は平日のみ。土日は趣味・個人開発の話

## ダメな例（こういうのがAIっぽい。絶対やるな）
「朝のコーヒーを飲みながら、今日の開発計画を立てています。」→ 丁寧語+状況説明+時間帯言及。AIっぽすぎ
「でさ、結局AIを使いこなせる奴が勝つんだよ」→ わざとらしい考察。AIヨイショ
「AIのおかげで開発速度が3倍になった」→ AI布教。道具の感想を大げさに言うな
「AI時代のエンジニアに必要なのは〜」→ 説教くさい。評論家か
「外注さんとの打ち合わせ〜でさ、空いたリソースで次のマネタイズ考える方がマジで効率いい。」→ 無理やりビジネスに転換
「コードレビュー、やっぱり大事だなって思った。」→ 感想文。小学生の日記
「今日も1日頑張ろう！」→ botっぽい。人間はこんなこと書かない
「深夜のコーディングは集中できて最高ですね。」→ 丁寧語+時間帯言及+ポジティブまとめ。AI

## いい例（この温度感で。雑で短いほどいい）
「何食べようかなー」
「トンカツは出前で頼むもんじゃないね」
「1人で家飲みしてると酒が進まない」
「面談で結構やらかしたけど通った。2次かー」
「時給換算すると地獄かもです」
「GitHub Actions便利だなー」
「フルリモートでフルフレックスらしい。行きたい」
「家飲みで日本酒3合いった。明日の尿酸値こわい」
「嘆きの亡霊、毎回特殊OPEDやってくれるからすこ」
「アカウント育たないと拡散できないね」
「3時間溶けたけどバグの原因typoだった」
「Dockerのイメージサイズ2GBて」
「面談5分遅刻した。起きた時点で詰んでたわ」
「React 19、地味に破壊的変更多いんだが」
「確定申告まだやってない。やばい」
「Issue見たら止まらなくなった」
「eslintの設定で1時間消えた」

## 最近のツイート（被り回避）
${recentTexts || "なし"}
${influencerTips}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  let tweetText = response.content[0].text.trim();
  // 「〜のツイート：\n本文」形式で返ってきた場合、前置き部分を除去
  tweetText = tweetText.replace(/^.{0,50}(ツイート|tweet)[：:]\s*/i, "");
  tweetText = tweetText.replace(/^[「『]|[」』]$/g, "");

  if (tweetText.length > 280) {
    console.log("Generated tweet too long, skipping:", tweetText);
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

  console.log(`Topic: ${topic}`);
  console.log(`Tweet: ${tweetText}`);

  const { data } = await twitter.v2.tweet(tweetText);
  console.log(`Posted: https://x.com/adlei_builds/status/${data.id}`);

  // 全履歴に追記（重複防止用、削除しない）
  appendHistory(tweetText);

  log.tweets.push({
    id: data.id,
    text: tweetText,
    topic,
    postedAt: new Date().toISOString(),
  });

  // ログは直近100件だけ保持
  if (log.tweets.length > 100) {
    log.tweets = log.tweets.slice(-100);
  }

  saveLog(log);
}

generateAndPost().catch((err) => {
  console.error("Error:", err.data || err.message || err);
  process.exit(1);
});
