---
title: "Claude Codeで退去費用チェッカーを作った話｜国交省ガイドライン×Stripe決済の実装記録"
emoji: "🏠"
type: "tech"
topics: ["claudecode", "nextjs", "stripe", "supabase"]
publish_order: 7
published: false
---

## この記事でわかること

- 退去費用の過払い診断サービスをClaude Codeで作った実体験
- Next.js 16 + Supabase + Stripeの構成でWebサービスを立ち上げる流れ
- 国交省ガイドラインの計算ロジックをコードに落とし込む方法
- 特約・耐用年数・残存価値など、法律系の業務ロジック実装のコツ

---

## 「退去費用チェッカー」とは

賃貸の退去時に届く原状回復費用の請求書。「壁紙全面張替え15万円」「ハウスクリーニング8万円」と書いてあって、本当にそれが適正なのかわからない。

このサービスは、請求項目と金額を入力すると、**国交省「原状回復をめぐるトラブルとガイドライン」の基準と比較して過払いの可能性を診断する**というもの。

**URL:** https://taikyocheck.com

### ユーザーフロー

```
STEP 1 (無料)  請求項目・金額・入居年数を入力（25カテゴリ対応）
     ↓
STEP 2 (無料)  「ガイドライン基準と異なる項目がN件あります」
     ↓          差額が少額 → 無料でレポート表示
     ↓          差額が大きい → 有料レポートへ
STEP 3 (有料)  Stripe決済 → 詳細レポート
               - 各項目のガイドライン基準額（計算式付き）
               - 耐用年数・残存価値の詳細計算
               - 管理会社への確認メール文例集
```

**ポイントは「差額が少ないなら課金しない」設計。** ユーザーにとって元が取れない場合は無料で結果を見せる。

---

## 技術スタック

| 技術 | 用途 |
|------|------|
| Next.js 16 + TypeScript | フロントエンド + APIルート |
| Tailwind CSS 4 | スタイリング |
| Supabase | 認証（メール/パスワード） + DB（PostgreSQL + RLS） |
| Stripe | 買い切り決済（Checkout Session） |
| Vercel | ホスティング + サーバーレス |
| Claude Code | 開発全般 |

---

## Claude Codeでどう作ったか

### 1. ガイドライン計算ロジックの実装

一番大変だったのが、国交省ガイドラインの計算ロジック。25カテゴリの原状回復項目それぞれに「耐用年数」「残存価値」「経過年数による負担割合」がある。

例えば壁紙の場合：

```typescript
// 耐用年数6年、残存価値1円のクロス
const usefulLife = 6;
const residualRate = 1 / purchasePrice;
const depreciationRate = (1 - residualRate) / usefulLife;
const tenantBurden = Math.max(residualRate, 1 - depreciationRate * yearsLived);
```

Claude Codeに「国交省ガイドラインのPDFの内容をもとに計算ロジックを書いて」と指示したら、耐用年数テーブルまで含めて一発で出てきた。もちろん手動でガイドラインと突き合わせて検証したけど、8割方合ってた。

### 2. 特約の扱い

退去費用のトラブルで厄介なのが「特約」。契約書に「退去時のハウスクリーニング代は借主負担」と書いてあると、ガイドラインより契約が優先される場合がある。

```typescript
// 特約チェック: あり → ガイドライン基準は参考値として表示
// なし/わからない → ガイドライン基準で判定
if (specialClause === "yes") {
  return { status: "ok", note: "特約により借主負担の可能性あり" };
}
```

「はい / いいえ / わからない」の3択にしたのがポイント。「わからない」の場合はガイドライン基準で判定して、「特約がある場合は結果が異なる可能性があります」と注記を出す。

### 3. Stripe決済の実装

Stripe Checkoutを使った買い切り決済。Webhook でpayment成功を受け取ったらSupabaseにレコードを作る流れ。

```typescript
// Vercelサーバーレス環境での注意点
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-03-25.dahlia",
  httpClient: Stripe.createFetchHttpClient(), // これが必須
});
```

**ハマりポイント：** Stripe SDK v21+をVercelで使う場合、`httpClient: Stripe.createFetchHttpClient()` を指定しないとタイムアウトする。デフォルトのNode.js httpクライアントがサーバーレス環境と相性が悪い。これ、公式ドキュメントにもあまり書いてなくて2時間溶かした。

### 4. 「課金しない」ロジック

差額が価格以下の場合は課金せずに無料でレポートを表示する。これはフロントの判定だけじゃなく、APIサイドでも二重チェックしてる。

```typescript
// サーバーサイドでも差額チェック
const totalDifference = items.reduce((sum, item) => sum + item.difference, 0);
if (totalDifference <= NORMAL_PRICE) {
  // 無料で詳細レポートを返す（Stripe Checkoutに飛ばさない）
  return NextResponse.json({ report, free: true });
}
```

ユーザー体験としても「このサービスは元が取れない場合は課金しない」というのが信頼感につながると思ってこの設計にした。

---

## Supabase + RLSでのデータ設計

Row Level Security（RLS）で「自分のレポートだけ見える」を実現。

```sql
-- レポートは本人のみ閲覧可能
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = user_id);

-- レポートの作成は認証ユーザーのみ
CREATE POLICY "Authenticated users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

管理者は全レポートを見れるようにadminロールのポリシーも別途設定。

---

## E2Eテスト

Playwrightで32テスト。トップページ表示、無料診断フロー、入力バリデーション、特約機能、購入フロー、認証ページ、法的ページ、SEOメタタグを網羅。

```bash
npx playwright test
# 32 passed (21.1s)
```

Claude Codeに「このサービスのE2Eテストを書いて」と頼むと、ユーザーフローに沿ったテストを一気に生成してくれる。手動で書くよりカバレッジが高くなった。

---

## スマホ対応で気をつけたこと

退去費用で困ってる人はスマホから検索してくることが多い。スマホUIの最適化は特に力を入れた。

- **タッチターゲット44px以上** — 指で確実に押せるサイズ
- **iOSズーム防止** — input要素のfontSizeを16pxに統一
- **CTAボタン固定** — 「診断する」ボタンをスマホではsticky bottomに
- **入力項目のグリッド** — スマホでは1列、PCでは2列

---

## 収益モデル

| 収益源 | 単価 |
|--------|------|
| 診断レポート | 1,980円（クーポン適用で1,500円） |
| 弁護士掲載料 | 9,800円〜29,800円/月 |
| アフィリエイト | 新生活準備商品の紹介 |

「怒り駆動」のビジネスモデル。退去費用に納得いかない → 検索 → 診断 → 過払いだとわかる → 怒りでSNSに共有 → バイラル。NHK受信料を払いたくなくてチューナーレスTV買う人と同じ構造。

---

## まとめ

Claude Codeで作ったWebサービスの中で一番「実用性が高い」と思ってるプロダクト。法律系のロジックは正確さが命なので、ガイドラインとの突き合わせ検証には時間をかけた。

技術的には Next.js + Supabase + Stripe の王道構成だけど、「課金しない判定」や「特約の3択」など、業務ドメインに寄り添った設計がキモだった。

退去費用で悩んでる人がいたら試してみてほしい。

**退去費用チェッカー:** https://taikyocheck.com
