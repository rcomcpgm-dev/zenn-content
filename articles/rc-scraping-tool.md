---
title: "Claude CodeでWebスクレイピングツールを作る方法｜Node.js実用例"
emoji: "🕷"
type: "tech"
topics: ["claudecode", "nodejs", "scraping", "automation"]
publish_order: 9
published: true
---

Claude Codeを使えば、Webスクレイピングツールを日本語の指示だけで作れます。cheerio・axios・Puppeteerを使ったNode.jsの実用例を紹介します。

## この記事でやること

Claude Codeを使えば、Webサイトから情報を自動収集するスクレイピングツールを日本語の指示だけで作れます。cheerio/axios/Puppeteerを使った実用例を紹介します。

## スクレイピングとは

Webサイトの情報をプログラムで自動取得すること。手作業でコピペしていた作業を自動化できます。

### 活用例
- 競合サイトの価格調査
- ニュース記事の自動収集
- 求人情報のまとめ
- SNSのトレンド分析

## 注意事項

:::message alert
スクレイピングには法的・倫理的な注意が必要です：
- 利用規約でスクレイピングを禁止しているサイトはNG
- robots.txtを確認する
- サーバーに負荷をかけない（リクエスト間隔を空ける）
- 個人情報の収集は法律に抵触する可能性あり
:::

## 実践1：ニュースサイトの見出し取得

```bash
mkdir scraping-tool
cd scraping-tool
claude
```

```
Node.jsでスクレイピングツールを作って。

機能：指定したURLのWebページからh1, h2タグのテキストを抽出する。
使用ライブラリ：cheerio + axios
結果はJSON形式でコンソールに出力。

サンプルURLはhttps://example.comで。
```

Claude Codeが以下を自動で行います：
1. `npm init` でプロジェクト初期化
2. `cheerio` と `axios` をインストール
3. スクレイピングスクリプトを作成

## 実践2：商品価格の定期監視

```
商品ページのURLを引数で受け取り、
ページ内の価格（数字 + 円）を抽出するスクリプト。

結果をCSVファイルに日時とともに追記して。
毎回実行するたびに1行追加される形式。
```

```bash
node price-check.js "https://example.com/product/123"
```

実行するたびに `prices.csv` に記録が追加されます：

```csv
日時,URL,価格
2025-03-20 10:00,https://example.com/product/123,¥3980
2025-03-21 10:00,https://example.com/product/123,¥3480
```

## 実践3：複数ページの一括取得

```
URLのリスト（urls.txt）を読み込んで、
各ページのタイトルと本文の最初の200文字を取得。
結果をresults.jsonに保存。

リクエスト間隔は2秒空けて。
エラーが出ても止まらずスキップして。
```

## 動的サイト対応（Puppeteer）

JavaScriptで描画されるサイトはcheerioでは取得できません。その場合はPuppeteerを使います：

```
Puppeteerを使って、JavaScriptで動的に描画されるページの
内容を取得するスクレイピングツールを作って。
ヘッドレスモードで。スクリーンショットも保存して。
```

## 定期実行の自動化

### cron（Mac/Linux）
```bash
# 毎日朝9時に実行
0 9 * * * cd /path/to/scraping-tool && node price-check.js
```

### GitHub Actions
```yaml
on:
  schedule:
    - cron: '0 0 * * *'  # 毎日UTC 0:00
```

## まとめ

- cheerio + axiosで静的サイトのスクレイピング
- Puppeteerで動的サイト対応
- CSVやJSONで結果を保存
- cronやGitHub Actionsで定期実行
- **利用規約とマナーを必ず守ること**

---

:::message
Claude Code実践シリーズ第6回。
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
