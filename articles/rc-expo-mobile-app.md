---
title: "Claude Codeでスマホアプリ（Expo）を作る入門ガイド"
emoji: "📱"
type: "tech"
topics: ["claudecode", "expo", "reactnative", "mobile"]
published: false
---

## この記事でやること

Claude Codeを使って、**iOSとAndroid両対応のスマホアプリ**を作ります。使うのはExpo（React Native）です。

## Expoとは

- React Nativeベースのスマホアプリ開発フレームワーク
- **1つのコードでiOS/Android両方のアプリが作れる**
- JavaScript/TypeScriptで書ける
- Expo Goアプリで即テスト（XcodeやAndroid Studio不要）

## 準備

スマホに **Expo Go** アプリをインストール（App Store / Google Playで検索）。

## 作るもの：メモアプリ

- メモの追加・編集・削除
- ローカルストレージに保存
- 検索機能

## ステップ1：プロジェクト作成

```bash
npx create-expo-app memo-app --template blank-typescript
cd memo-app
claude
```

### ステップ2：メイン画面を作る

```
メモアプリのメイン画面を作って。

機能：
- 上部に検索バー
- メモ一覧をFlatListで表示（タイトルと作成日時）
- 右下にメモ追加のFAB（Floating Action Button）
- メモを左スワイプで削除

スタイリングはStyleSheet。白ベースでシンプルに。
```

### ステップ3：メモ追加画面

```
メモ追加画面を作って。
- タイトル入力欄
- 本文入力欄（複数行）
- 保存ボタン
- React Navigationで遷移
- AsyncStorageでローカル保存
```

### ステップ4：動作確認

```bash
npx expo start
```

QRコードをスマホのExpo Goで読み取ると、**実機でアプリが動きます**。

### ステップ5：機能追加

```
メモの編集機能を追加。一覧タップで編集画面に遷移。

カテゴリ機能も追加。「仕事」「プライベート」「アイデア」の
3カテゴリをタグとして選択可能に。フィルタリングも。
```

## スマホアプリで作れるもの

| アプリ | 指示の例 |
|--------|---------|
| 家計簿 | 「収支を記録する家計簿アプリを作って」 |
| 習慣トラッカー | 「毎日の習慣を記録・可視化するアプリ」 |
| タイマー | 「ポモドーロタイマーアプリを作って」 |
| 天気アプリ | 「現在地の天気を表示するアプリ」 |
| レシピ管理 | 「レシピを保存・検索できるアプリ」 |

## アプリを公開するには

```bash
npm install -g eas-cli
eas build --platform all
eas submit
```

- Apple Developer Program: 年間$99
- Google Play Developer: 初回$25
- 審査に1〜7日

## まとめ

- Expoなら1つのコードでiOS/Android両対応
- Claude Codeで日本語指示だけでアプリが作れる
- Expo Goで即座に実機テスト
- EASで公式ストアに公開も可能

---

:::message
Claude Code実践シリーズ第5回。
:::
