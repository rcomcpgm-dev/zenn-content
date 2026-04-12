---
title: "Claude Code × Supabaseでフルスタックアプリを作る方法｜認証・DB・リアルタイム"
emoji: "⚡"
type: "tech"
topics: ["claudecode", "supabase", "nextjs", "fullstack"]
publish_order: 11
published: false
---

Claude CodeとSupabaseを組み合わせれば、認証・データベース・リアルタイム通信を備えた本格的なWebアプリを構築できます。チャットアプリを例に手順を解説します。

## この記事でやること

Claude CodeとSupabaseを組み合わせれば、認証・データベース・リアルタイム通信を備えた本格的なWebアプリを日本語の指示だけで構築できます。チャットアプリを例に解説します。

## なぜSupabase？

| 特徴 | 説明 |
|------|------|
| 無料枠が充実 | 個人開発なら十分な容量 |
| PostgreSQL | 本格的なリレーショナルDB |
| 認証機能内蔵 | メール、Google、GitHub認証がすぐ使える |
| リアルタイム | DBの変更をリアルタイムで配信 |
| ストレージ | ファイルアップロード機能 |

Firebaseの代替として人気が急上昇中。**SQLが使える**のが最大の強みです。

## 作るもの：リアルタイムチャットアプリ

- ユーザー登録・ログイン
- チャットルーム作成
- リアルタイムメッセージ送受信
- メッセージ履歴の保存

## セットアップ

### 1. Supabaseプロジェクト作成

1. https://supabase.com でアカウント作成
2. 「New Project」で新規プロジェクト作成
3. プロジェクトURLとAPIキーをメモ

### 2. フロントエンド作成

```bash
npx create-next-app@latest chat-app --typescript --tailwind
cd chat-app
claude
```

```
Supabaseと連携するチャットアプリを作って。

.env.localにSupabase設定を入れる形で。
NEXT_PUBLIC_SUPABASE_URL=（ここにURL）
NEXT_PUBLIC_SUPABASE_ANON_KEY=（ここにキー）

必要なパッケージをインストールして。
```

## ステップ1：認証機能

```
Supabase Authでメール/パスワード認証を実装して。

画面：
- サインアップ画面
- ログイン画面
- ログアウトボタン

認証状態をZustandで管理。
未ログインなら自動でログイン画面にリダイレクト。
```

## ステップ2：データベース設計

```
Supabaseに以下のテーブルを作るSQLを生成して：

rooms（チャットルーム）:
- id (uuid, PK)
- name (text)
- created_by (uuid, FK → auth.users)
- created_at (timestamptz)

messages（メッセージ）:
- id (uuid, PK)
- room_id (uuid, FK → rooms)
- user_id (uuid, FK → auth.users)
- content (text)
- created_at (timestamptz)

RLS（Row Level Security）ポリシーもつけて。
ログインユーザーのみ読み書き可能に。
```

生成されたSQLをSupabaseのSQL Editorで実行します。

## ステップ3：チャット画面

```
チャット画面を作って。

機能：
- 左サイドバーにルーム一覧
- メインエリアにメッセージ表示
- 下部にメッセージ入力欄
- 送信ボタン or Enterで送信
- 自分のメッセージは右寄せ、相手は左寄せ

Supabase Realtimeで新しいメッセージをリアルタイム受信。
スクロールは最新メッセージに自動移動。
```

## ステップ4：リアルタイム機能

```
Supabase Realtimeを使って、messagesテーブルの変更を
リアルタイムで受信する機能を実装して。

新しいメッセージが追加されたら即座に画面に表示。
チャンネルはroom_idでフィルタリング。
```

## ステップ5：デプロイ

```
Vercelにデプロイする設定をして。
環境変数の設定方法も教えて。
```

Vercelの管理画面で環境変数を設定すれば完了。

## Supabaseの便利な機能

### ストレージ（画像アップロード）

```
チャットに画像を添付できる機能を追加して。
Supabase Storageを使って。
プレビュー付きで。
```

### Edge Functions（サーバーサイド処理）

```
新しいメッセージが投稿されたら
Supabase Edge Functionで通知を送る仕組みを作って。
```

## Supabase × Claude Codeで作れるもの

| アプリ | 使う機能 |
|--------|---------|
| ブログ | Auth + Database + Storage |
| ECサイト | Auth + Database + Stripe |
| SNS | Auth + Database + Realtime + Storage |
| ダッシュボード | Auth + Database + Row Level Security |
| 予約システム | Auth + Database + Edge Functions |

## まとめ

- Supabaseは**無料で使える本格的なバックエンド**
- 認証、DB、リアルタイム、ストレージが全部入り
- Claude Codeで**フロントもバックも日本語指示で構築**
- 個人開発の最強スタックの一つ

---

:::message
Claude Code実践シリーズ最終回。入門編から実践編まで読んでいただきありがとうございました！
:::

---

:::message
**この記事が役に立ったら「いいね」お願いします！**
他の記事も発信中です。AI×開発の相談はXのDMからどうぞ。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
- LP: [reon-it.vercel.app](https://lp-murex-chi.vercel.app)
:::
