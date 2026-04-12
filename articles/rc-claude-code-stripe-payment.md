---
title: "Claude CodeでStripe決済を実装する｜SaaS月額課金の実践ガイド"
emoji: "💳"
type: "tech"
topics: ["claudecode", "stripe", "nextjs", "saas"]
publish_order: 18
published: false
---

## この記事でわかること

Next.js SaaSにStripe月額課金を実装する方法を、コード付きで解説します。

- Stripe Checkout Sessionで決済画面を作る
- Webhookで決済イベントを受信する
- JWTトークンでサブスク状態を管理する
- カスタマーポータルでユーザー自身が解約・カード変更できるようにする

DBにサブスク情報を持たない**ステートレス設計**で、最小構成のSaaS課金を実現します。

## アーキテクチャ概要

この設計の特徴は、**Stripeが課金の真のデータソース**であること。自前のDBにサブスク状態を持たず、毎回Stripe APIに問い合わせます。

### APIエンドポイント構成

| エンドポイント | 役割 |
|--------------|------|
| `/api/checkout` | Stripe Checkout Sessionを作成 |
| `/api/subscription/status` | サブスク状態を確認してJWT発行 |
| `/api/portal` | カスタマーポータルへリダイレクト |
| `/api/webhooks/stripe` | Stripeからのイベント受信 |

### 決済フロー

```
クライアント
  │
  ├─① POST /api/checkout
  │    └─→ Stripe Checkout画面（Stripeがホスト）
  │         └─→ 決済完了
  │              └─→ /checkout-success にリダイレクト
  │
  ├─② GET /api/subscription/status?session_id=xxx
  │    └─→ StripeからSubscription取得
  │         └─→ JWTトークン発行
  │              └─→ クライアントがlocalStorageに保存
  │
  ├─③ POST /api/portal
  │    └─→ Stripeカスタマーポータル画面
  │
  └─④ POST /api/webhooks/stripe（Stripeが直接叩く）
       └─→ 署名検証 → イベント処理
```

## 事前準備

### パッケージのインストール

```bash
npm install stripe jose
```

- `stripe` — Stripe Node.js SDK
- `jose` — JWTの署名・検証（軽量でEdge Runtime対応）

### 環境変数の設定

`.env.local` に以下を追加します。

```env
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_PRICE_ID=price_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
JWT_SECRET=your-random-secret-at-least-32-chars
```

| 変数 | 取得場所 |
|------|---------|
| `STRIPE_SECRET_KEY` | Stripeダッシュボード > 開発者 > APIキー |
| `STRIPE_PRICE_ID` | Stripeダッシュボード > 商品 > 価格ID |
| `STRIPE_WEBHOOK_SECRET` | Stripeダッシュボード > 開発者 > Webhook > 署名シークレット |
| `JWT_SECRET` | 自分で生成（`openssl rand -base64 32`） |

## Stripe Checkoutの実装

`/api/checkout` でStripe Checkout Sessionを作成し、決済画面のURLを返します。

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// レート制限（簡易版：IPベースで5回/時間）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  // レート制限チェック
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      locale: "ja",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${request.nextUrl.origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/dashboard`,
      metadata: {
        userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
```

### ポイント

- `mode: "subscription"` で月額課金（一括払いなら `"payment"`）
- `locale: "ja"` で決済画面が日本語になる
- `{CHECKOUT_SESSION_ID}` はStripeが自動で置換するプレースホルダー
- `metadata` にuserIdを入れておくと、後でどのユーザーの決済かわかる

## サブスクリプション状態の確認とJWT

決済完了後、クライアントは `session_id` を使ってサブスク状態を確認します。有効なサブスクがあればJWTトークンを発行します。

```typescript
// app/api/subscription/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { SignJWT } from "jose";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-secret"
);

export async function GET(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const customerId = request.nextUrl.searchParams.get("customer_id");

  if (!sessionId && !customerId) {
    return NextResponse.json(
      { error: "session_id or customer_id is required" },
      { status: 400 }
    );
  }

  try {
    let subscription: Stripe.Subscription | null = null;
    let customer: string = "";

    if (sessionId) {
      // session_id からサブスク情報を取得
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      subscription = session.subscription as Stripe.Subscription;
      customer = session.customer as string;
    } else if (customerId) {
      // customer_id から最新のサブスクを取得
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });
      subscription = subscriptions.data[0] ?? null;
      customer = customerId;
    }

    if (!subscription || subscription.status !== "active") {
      return NextResponse.json({
        subscribed: false,
        customer_id: customer || null,
      });
    }

    // JWTトークンを発行（有効期限 = サブスクの期間終了日）
    const periodEnd = subscription.current_period_end;
    const token = await new SignJWT({
      subscribed: true,
      customer_id: customer,
      subscription_id: subscription.id,
      period_end: periodEnd,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(periodEnd)
      .sign(JWT_SECRET);

    return NextResponse.json({
      subscribed: true,
      customer_id: customer,
      period_end: new Date(periodEnd * 1000).toISOString(),
      token,
    });
  } catch (error) {
    console.error("Subscription status error:", error);
    return NextResponse.json(
      { error: "Failed to check subscription" },
      { status: 500 }
    );
  }
}
```

### JWTの有効期限をサブスク期間に合わせる理由

JWTの `exp`（有効期限）をサブスクの `current_period_end` に設定することで、課金期間が終わると自動的にトークンが無効になります。次の課金サイクルで新しいトークンを取得する仕組みです。

## Stripeカスタマーポータル

ユーザー自身がカード変更・プラン変更・解約を行えるStripe提供のUIです。自前で管理画面を作る必要がありません。

```typescript
// app/api/portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  try {
    const { customerId } = await request.json();

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.nextUrl.origin}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
```

Stripeダッシュボードの「設定 > カスタマーポータル」で、ポータルに表示する項目（解約、プラン変更など）を事前に設定しておきます。

## Webhookの受信

Stripeが決済イベント（支払い成功、サブスク更新、解約など）をサーバーに通知します。

```typescript
// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  const body = await request.text(); // JSONパースしない（raw bodyが必要）
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // イベントに応じた処理
    switch (event.type) {
      case "checkout.session.completed":
        console.log("Checkout completed:", event.data.object);
        break;

      case "customer.subscription.updated":
        console.log("Subscription updated:", event.data.object);
        break;

      case "customer.subscription.deleted":
        console.log("Subscription cancelled:", event.data.object);
        break;

      case "invoice.payment_succeeded":
        console.log("Payment succeeded:", event.data.object);
        break;

      case "invoice.payment_failed":
        console.log("Payment failed:", event.data.object);
        // ここでユーザーに通知メールを送るなど
        break;

      default:
        console.log("Unhandled event type:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }
}
```

### 重要：raw bodyで受け取る

`request.text()` でリクエストボディをそのまま取得します。`request.json()` を使うと署名検証が失敗します。Stripeの署名検証は、生のリクエストボディに対して行われるためです。

## ダッシュボードへの統合

サブスク状態に応じてUIを切り替えるクライアント側の実装です。

```typescript
// app/dashboard/page.tsx（抜粋）
"use client";

import { useState, useEffect } from "react";

export default function Dashboard() {
  const [subscribed, setSubscribed] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSubscription();
  }, []);

  async function checkSubscription() {
    // 1. URLにsession_idがあれば（Checkoutからの戻り）
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    // 2. localStorageにcustomer_idがあれば（再訪問時）
    const storedCustomerId = localStorage.getItem("stripe_customer_id");

    const query = sessionId
      ? `session_id=${sessionId}`
      : storedCustomerId
        ? `customer_id=${storedCustomerId}`
        : null;

    if (!query) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/subscription/status?${query}`);
      const data = await res.json();

      if (data.subscribed) {
        setSubscribed(true);
        setCustomerId(data.customer_id);
        localStorage.setItem("stripe_customer_id", data.customer_id);
        localStorage.setItem("subscription_token", data.token);
      }
    } catch (error) {
      console.error("Subscription check failed:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout() {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "current-user-id" }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  async function handlePortal() {
    const res = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  if (loading) return <div>読み込み中...</div>;

  return (
    <div>
      <h1>ダッシュボード</h1>

      {subscribed ? (
        <div>
          <p>プレミアムプランをご利用中です</p>
          <button onClick={handlePortal}>
            サブスクリプションを管理する
          </button>
        </div>
      ) : (
        <div>
          <p>無料プランをご利用中です</p>
          <button onClick={handleCheckout}>
            プレミアムプランにアップグレード
          </button>
        </div>
      )}
    </div>
  );
}
```

## 環境変数がない場合のガード

ビルド時にStripe SDKがAPIキーを要求してエラーになる問題があります。CIやプレビュー環境では環境変数が設定されていないことがあるため、ガードが必要です。

```typescript
// 各APIルートの先頭で条件付き初期化
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// エンドポイント内でnullチェック
export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }
  // ...
}
```

`new Stripe("")` とすると初期化時にエラーになります。`null` で初期化して各エンドポイントでチェックするパターンが安全です。

## 本番デプロイ時の設定

### 1. Stripeダッシュボードでの設定

1. **商品を作成** — ダッシュボード > 商品 > 「商品を追加」
2. **価格を設定** — 月額課金を選択、金額を入力（例: 480円/月）
3. **Price IDをコピー** — `price_xxxx` の形式

### 2. Webhookエンドポイントの登録

1. ダッシュボード > 開発者 > Webhook > 「エンドポイントを追加」
2. URLを入力: `https://your-domain.com/api/webhooks/stripe`
3. 受信するイベントを選択:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. 署名シークレット（`whsec_xxxx`）をコピー

### 3. Vercelへの環境変数設定

```bash
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_PRICE_ID
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add JWT_SECRET
```

テスト環境では `sk_test_` で始まるキー、本番では `sk_live_` で始まるキーを使います。

### 4. Stripeのテストモードで動作確認

テスト用カード番号でCheckoutを試します。

| カード番号 | 動作 |
|-----------|------|
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0002` | カード拒否 |
| `4000 0000 0000 3220` | 3Dセキュア認証 |

有効期限は未来の日付、CVCは任意の3桁で通ります。

## まとめ

Stripe月額課金の実装で押さえるべきポイントをまとめます。

| 項目 | 設計判断 |
|------|---------|
| データソース | StripeをSingle Source of Truth（DBにサブスク情報を持たない） |
| 状態管理 | JWTトークン（有効期限 = サブスク期間終了日） |
| 決済UI | Stripe Checkout（自前フォーム不要、PCI DSS対応不要） |
| 管理UI | カスタマーポータル（解約・カード変更をStripeに委譲） |
| イベント受信 | Webhookで署名検証後に処理 |
| 環境変数ガード | `null` 初期化 + エンドポイント内チェック |

DBを使わないステートレス設計は、個人開発やMVPに適しています。ユーザー数が増えてきたら、Webhookでサブスク状態をDBに保存する設計に移行することを検討してください。

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
