---
title: "Next.jsでpSEO 200ページを静的生成した話｜個人開発のオーガニック流入設計"
emoji: "🔍"
type: "tech"
topics: ["nextjs", "seo", "pseo", "typescript"]
publish_order: 23
published: false
---

## この記事でわかること

- pSEO（プログラマティックSEO）で200ページを一気に量産する設計
- Next.js 16 の `generateStaticParams` で静的生成するパターン
- カテゴリ×地域×用途の組み合わせでキーワードカバレッジを広げる考え方
- 実装コストを最小化しつつ重複判定されないコンテンツの作り方

---

## pSEOとは何か

プログラマティックSEOは、「テンプレート + データ」の掛け算で大量のページを生成してロングテール検索を拾う手法です。不動産サイトの「エリア×間取り」ページ、料理サイトの「食材×調理法」ページなどが典型例。個人開発でオーガニック流入を安く積み上げるなら最有力の手段です。

自分が運営している退去費用チェッカー（taikyocheck.com）でも、このpSEOで5カテゴリ約200ページを追加しました。「退去費用 クロス 張替」「敷金 返還 ○○市」みたいな組み合わせキーワードを静的に全部生成する作戦です。

---

## ディレクトリ設計

Next.js 16 App Router の動的ルーティングを使います。

```
app/
├── guide/
│   ├── [category]/
│   │   └── page.tsx          # カテゴリ別ガイド（30ページ）
│   ├── [region]/
│   │   └── page.tsx          # 地域別ガイド（47ページ）
│   └── [category]/[region]/
│       └── page.tsx          # 交差ページ（47×N）
```

ポイントは「単独ページ」と「交差ページ」を両方作ること。単独は既存キーワードを拾い、交差はロングテールを拾います。

---

## `generateStaticParams` で全ページ事前生成

```typescript
// app/guide/[category]/page.tsx
import { CATEGORIES } from '@/lib/categories';

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { category } = await params;
  const data = CATEGORIES.find((c) => c.slug === category);
  return {
    title: `${data.name}の費用相場と適正価格｜退去費用ガイド`,
    description: data.description,
    alternates: { canonical: `/guide/${category}` },
  };
}
```

ビルド時に全ページを静的HTML化するので、レンダリングコストはゼロ。Vercelの無料枠でも200ページ余裕で捌けます。

---

## 重複判定を避けるコツ

pSEOの最大の敵はGoogleの「Thin Content」判定です。テンプレそのままで中身がスカスカだとインデックスすらされません。

### 1. データ量で差別化

各ページに固有のデータを混ぜ込む：
- カテゴリ別：具体的な費用相場レンジ、ガイドライン引用、減価償却計算式
- 地域別：実在の判例、地方特有の賃貸慣習、消費生活センターの連絡先

### 2. 固有文章を最低300字は生成

テンプレ部分を除いた「ページ固有の本文」が最低300字以上ないと弾かれます。データ駆動で自動生成しつつ、手動編集で固有の知見を追加する運用がベスト。

### 3. 内部リンクで関連ページをつなぐ

カテゴリ間・地域間の横断リンクを必ず入れる。pSEOページは単体だと評価されづらいので、クラスター構造で権威を集約します。

---

## 構造化データを全ページに

pSEOページは検索結果で目立たせないと勝てません。JSON-LDで FAQ / BreadcrumbList / Article を必ず入れます。

```typescript
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

これで検索結果にFAQリッチリザルトが出ます。CTRが2〜3倍変わるので必須。

---

## 実装コストと成果

200ページ生成の工数は、ベーステンプレート設計（1日）+ データ整備（2〜3日）+ カテゴリ固有文章（コミット5本分）程度。1週間で土台ができ、その後は固有文章を追加する運用です。

リリース直後は検索流入ゼロですが、2〜3週間でロングテールがパラパラ拾われ始めます。勝負は3ヶ月後。その頃にはドメインパワーも蓄積されて、競合のペラサイトには勝てるようになります。

---

## まとめ

- `generateStaticParams` で静的全ページ生成
- カテゴリ×地域の交差でロングテール網を作る
- 各ページ固有データ最低300字でThin Content回避
- JSON-LD構造化データで検索結果の見栄え強化
- 結果は3ヶ月後、諦めずに運用すれば個人開発でも月数千PVは堅い

pSEOは「雑に量産すれば当たる」ものではありません。データ設計とページ間の関連性を丁寧に作れば、個人開発でもSEOで戦えます。
