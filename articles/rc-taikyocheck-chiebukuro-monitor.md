---
title: "Yahoo!知恵袋の新着質問をDiscordに通知するモニターを作った話"
emoji: "🔔"
type: "tech"
topics: ["nodejs", "discord", "automation", "scraping"]
publish_order: 24
published: false
---

## この記事でわかること

- Yahoo!知恵袋の検索結果をスクレイピングして新着質問を拾う実装
- Discord Webhookで通知するセットアップ
- 24時間以内の質問だけを通知するフィルタリング
- GitHub Actionsで定期実行する構成

---

## なぜ作ったか

個人開発でサービスを公開すると、次の課題は「ユーザーの困りごとを拾うこと」です。SNSは網羅性が低いし、SEOでは既に悩みが解決している人しか来ない。

一番リアルに困っている人が集まるのは **Yahoo!知恵袋** です。「退去費用 請求 高い」みたいなクエリで検索すれば、まさに今困っている人が毎日質問を投げている。ここにサービスの存在を知らせる導線を自分に通知する仕組みを作ることにしました。

実際に自分の退去費用チェッカー（taikyocheck.com）でも、このモニターを回して毎日2〜3件の新着質問を拾っています。

---

## アーキテクチャ

```
GitHub Actions (cron)
  ↓ 5分毎
  ↓
知恵袋検索URLをfetch
  ↓
HTMLパース（cheerio）
  ↓
24時間以内の質問を抽出
  ↓
Discord Webhook送信
```

サーバー不要、完全無料で動きます。

---

## 知恵袋の検索URL構造

```
https://chiebukuro.yahoo.co.jp/search?p={キーワード}&flg=&sort=20
```

- `p`: 検索クエリ
- `sort=20`: 質問日時の新しい順
- `flg`: フィルタ（未指定で全質問、3で解決済みのみ、など）

「未解決の新着質問のみ欲しい」ので `flg` は指定せず、コード側で `sort=20` の結果から24時間以内だけ抽出します。

---

## スクレイピング実装

```javascript
import * as cheerio from 'cheerio';

async function fetchNewQuestions(keyword) {
  const url = `https://chiebukuro.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}&sort=20`;
  const html = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.text());

  const $ = cheerio.load(html);
  const questions = [];

  $('.SearchResult_SearchResult_item__').each((_, el) => {
    const $el = $(el);
    const title = $el.find('a').first().text().trim();
    const link = $el.find('a').first().attr('href');
    const timeText = $el.find('.time').text(); // "2時間前" など

    if (isWithin24Hours(timeText)) {
      questions.push({ title, link, timeText });
    }
  });

  return questions;
}
```

`isWithin24Hours` は「○時間前」「○分前」「今日」みたいな相対時刻表記を判定する自作関数。

---

## 重複通知の排除

同じ質問を何度も通知すると鬱陶しいので、質問URLを `notified-ids.json` に保存して重複排除します。

```javascript
import fs from 'fs/promises';

async function loadNotifiedIds() {
  try {
    const data = await fs.readFile('notified-ids.json', 'utf-8');
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

async function saveNotifiedIds(ids) {
  await fs.writeFile('notified-ids.json', JSON.stringify([...ids].slice(-500)));
}
```

直近500件だけ保持すればメモリも肥大化しない。

---

## Discord Webhookで通知

```javascript
async function notifyDiscord(questions) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL.trim(); // 改行混入に注意

  for (const q of questions) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `📩 新着質問\n**${q.title}**\n${q.link}`,
      }),
    });
    await sleep(1000); // レート制限対策
  }
}
```

**注意**: GitHub Actions の `secrets` は改行が混入することがあるので、必ず `.trim()` してください。これで一度ハマりました。

---

## GitHub Actions 設定

```yaml
name: Chiebukuro Monitor

on:
  schedule:
    - cron: '7/10 * * * *' # 7,17,27分に実行（他のワークフローとズラす）
  workflow_dispatch:

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: node chiebukuro-monitor.js
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      - name: Commit notified-ids
        run: |
          git config user.email "bot@users.noreply.github.com"
          git config user.name "bot"
          git add notified-ids.json
          git diff --staged --quiet || git commit -m "Update notified ids"
          git push
```

通知IDをリポジトリにcommitすることで状態を永続化。ファイルDB的な使い方です。

---

## 運用してわかったこと

### 通知頻度は10〜15分に1回が丁度いい

5分毎だと高頻度すぎて知恵袋側にも悪いし、自分の通知疲れが強い。10分毎で十分。

### 夜間は通知を止める

23時〜7時は人類の質問が減るし、自分の睡眠も守りたい。cronで絞っても良いし、スクリプト側で時刻チェックしても良い。

### キーワードは広めに

「退去費用」「敷金 返還」「原状回復」など複数キーワードを配列で回す。ドメインに近いキーワードを全部カバーしておくと取りこぼしが減ります。

---

## まとめ

- 知恵袋の検索結果をcheerioでスクレイピング
- 24時間以内の質問のみ抽出してDiscord通知
- `notified-ids.json` で重複排除、リポジトリにcommitで永続化
- GitHub Actions cronで5〜10分毎に実行、サーバー費用ゼロ

個人開発のグロースは「困っている人を見つける」が半分です。受動的にSEOで待つより、能動的にクエリを監視する方が初期の導線づくりには効きます。
