---
title: "Stripe SDK v21+をVercelで動かす時のハマりポイント｜createFetchHttpClient必須の話"
emoji: "💳"
type: "tech"
topics: ["stripe", "vercel", "nextjs", "serverless"]
publish_order: 26
published: false
---

## この記事でわかること

- Stripe SDK v21以降でVercelサーバーレス環境で決済が動かない現象
- `createFetchHttpClient()` が必須になった背景
- サーバーサイドセッション検証の推奨構成
- Webhookの署名検証で詰まらないためのチェックリスト

---

## 問題：Vercelで決済が通らない

自分の退去費用チェッカー（taikyocheck.com）は Stripe で単発決済（¥1,980）を扱っています。Stripe SDK を v20から v21 に上げた直後、ローカルでは動くのにVercel本番で決済セッション作成が落ちるという現象に遭遇しました。

エラーは曖昧で、Stripe API 側にはリクエストすら届いていないログが残る。Vercelの Function Logs には `FetchError: connect ECONNREFUSED` みたいなやつ。Node.js の `http` モジュール依存のStripeデフォルト実装が、Vercelのエッジ寄り実行環境では使えないケースがある、というのが原因でした。

---

## 解決策：createFetchHttpClient()

Stripe SDK v21+ は `createFetchHttpClient()` を明示的に渡すことで、HTTP通信を fetch ベースに切り替えられます。

```typescript
// lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
  httpClient: Stripe.createFetchHttpClient(),
  typescript: true,
});
```

これだけで Vercel サーバーレス関数でも動きます。

### なぜ必要か

- Stripe SDK のデフォルトは Node.js の `http`/`https` モジュール
- Vercelのエッジランタイム・一部のサーバーレス環境では `http` が制限される
- `fetch` ベースに切り替えることで Web標準APIとして動く

Vercelを使うなら問答無用で `createFetchHttpClient()` を付けるのが安全。

---

## サーバーサイドセッション検証

セキュリティ上重要なのは、クライアントサイドで `success=true` みたいなクエリ判定で購入完了扱いにしないこと。

### Bad（クライアントで判定）

```typescript
// ❌ URLクエリを信じる → 書き換え可能で課金バイパスされる
if (searchParams.get('success') === 'true') {
  markAsPaid();
}
```

### Good（サーバーで検証）

```typescript
// app/api/verify-session/route.ts
export async function POST(req: Request) {
  const { sessionId } = await req.json();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    return Response.json({ ok: false }, { status: 402 });
  }

  // DBに課金済み記録
  await supabase
    .from('payments')
    .insert({ session_id: sessionId, user_id: session.client_reference_id });

  return Response.json({ ok: true });
}
```

フロントエンドは `session_id` をサーバーに渡して検証結果を受け取るだけ。URLクエリ偽装されても課金済み判定は通らない。

---

## Webhookで詰まるポイント

Stripe Webhookを使う場合、署名検証が必須です。ここで毎回ハマるポイントが2つ。

### 1. `raw body` が必要

Next.js App Router では、Webhook ハンドラで `req.text()` で取得。`req.json()` で先にパースすると署名検証が失敗します。

```typescript
// app/api/stripe-webhook/route.ts
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const body = await req.text(); // JSONじゃなくtext

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // イベント処理...
}
```

### 2. DBへの書き込みは service_role key で

Webhookから Supabase のRLS付きテーブルに書き込むとき、anon key だと認証がなくて書けません。service_role key を使ってサーバーサイド完結にします。

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // anon key ではない
  { auth: { persistSession: false } }
);
```

**絶対にクライアントサイドにservice_role keyを露出させないこと**。これが漏れると全テーブルが読み書きし放題になります。

---

## 決済復元フォールバック

ユーザーが決済完了後に画面遷移でページを閉じた、ネットワーク切断で戻ってこなかった、みたいなケースがあります。その時のために復元ロジックを入れる。

```typescript
// クライアント側：sessionIdをlocalStorageに保存
localStorage.setItem('stripe-session-id', sessionId);

// 起動時：未確認のセッションがあれば再検証
const pendingSession = localStorage.getItem('stripe-session-id');
if (pendingSession) {
  const result = await fetch('/api/verify-session', {
    method: 'POST',
    body: JSON.stringify({ sessionId: pendingSession }),
  });
  if (result.ok) {
    localStorage.removeItem('stripe-session-id');
    // 購入済み状態を復元
  }
}
```

サービスワーカーが消されようが、ブラウザ閉じられようが、次回起動時に必ず決済状態を同期できます。

---

## チェックリスト

Stripe × Vercel × Next.js 環境で事故らないために：

- [x] `httpClient: Stripe.createFetchHttpClient()` を必ず指定
- [x] セッション検証はサーバーサイドAPIで実施
- [x] Webhookハンドラは `req.text()` で raw body取得
- [x] WebhookからのDB書き込みは service_role key
- [x] service_role keyは `NEXT_PUBLIC_` プレフィックス厳禁
- [x] `.env.local` は `.gitignore` 確認
- [x] 決済復元用にセッションIDをlocalStorageに保持
- [x] Apple Pay / Google Pay対応するなら Stripe Checkout のデフォルトでOK

---

## まとめ

- Vercel × Stripe v21+ は `createFetchHttpClient()` が必須
- 課金判定はサーバーサイドで必ず検証、クライアント信用しない
- Webhook署名検証は raw body 必須、DB書き込みは service_role key
- 決済復元フォールバックで「ネットワーク切断→課金失敗」を防ぐ

個人開発でStripe導入する人向けに、実際に本番稼働中のサービスで踏んだ地雷をまとめました。
