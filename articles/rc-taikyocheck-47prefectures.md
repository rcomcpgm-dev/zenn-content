---
title: "47都道府県×実在判例でローカルSEOを張る設計｜pSEOに「一次情報」を混ぜる"
emoji: "🗾"
type: "tech"
topics: ["seo", "pseo", "nextjs", "typescript"]
publish_order: 25
published: false
---

## この記事でわかること

- 「都道府県×サービス」のローカルSEO設計でロングテールを拾う
- 判例・地方の賃貸慣習という「一次情報」でThin Content判定を回避
- データをTypeScriptの型安全なJSONとして管理するコツ
- 重複コンテンツにしないための地域固有ロジックの入れ方

---

## 「47都道府県ページ」は使い古された戦術か？

SEO界隈では「都道府県ページ量産」は古典的な手法です。でも多くのサイトは「テンプレ+地名差し替え」だけで作るので中身がスカスカ。Google側の重複判定ロジックも洗練されてきて、雑な量産はインデックスすらされません。

逆に言うと、**一次情報を混ぜた都道府県ページは今でも強い**ということです。自分の退去費用チェッカー（taikyocheck.com）では、47都道府県ページに「実在の判例」「地域固有の賃貸慣習」「地元の消費生活センター情報」を手動で調べて入れました。

---

## データ構造の設計

TypeScriptで型を切って、JSONで47件分管理します。

```typescript
// data/prefectures.ts
export type Prefecture = {
  slug: string;           // "tokyo"
  name: string;           // "東京都"
  precedents: Precedent[];
  localRules: string[];
  consumerCenter: {
    name: string;
    tel: string;
    url: string;
  };
  averageRent: number;    // 平均家賃
};

export type Precedent = {
  court: string;          // "東京地裁 平成○年(ワ)第○号"
  year: number;
  summary: string;
  outcome: 'landlord' | 'tenant' | 'partial';
};

export const PREFECTURES: Prefecture[] = [
  {
    slug: 'tokyo',
    name: '東京都',
    precedents: [
      {
        court: '東京地裁',
        year: 2018,
        summary: 'クロス張替費用について、経過年数6年超過につき借主負担ゼロと判示',
        outcome: 'tenant',
      },
      // ...
    ],
    localRules: [
      '更新料2ヶ月が慣例（関東圏の特徴）',
      '敷金2ヶ月・礼金1ヶ月が標準',
    ],
    consumerCenter: {
      name: '東京都消費生活総合センター',
      tel: '03-3235-1155',
      url: 'https://www.shouhiseikatu.metro.tokyo.lg.jp/',
    },
    averageRent: 125000,
  },
  // ...47件
];
```

型で縛っておくと、データの抜け漏れがコンパイル時にわかります。

---

## ページ生成

```typescript
// app/prefecture/[slug]/page.tsx
import { PREFECTURES } from '@/data/prefectures';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  return PREFECTURES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = PREFECTURES.find((p) => p.slug === slug);
  if (!data) return {};
  return {
    title: `${data.name}の退去費用相場と判例｜平均家賃${data.averageRent.toLocaleString()}円`,
    description: `${data.name}の退去費用相場、実在判例${data.precedents.length}件、消費生活センター情報を網羅。借主が知っておくべき地域特有のルールを解説。`,
    alternates: { canonical: `/prefecture/${slug}` },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = PREFECTURES.find((p) => p.slug === slug);
  if (!data) notFound();

  return (
    <article>
      <h1>{data.name}の退去費用ガイド</h1>
      <section>
        <h2>{data.name}の実在判例</h2>
        {data.precedents.map((p, i) => (
          <PrecedentCard key={i} precedent={p} />
        ))}
      </section>
      <section>
        <h2>地域固有のルール</h2>
        <ul>
          {data.localRules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>
      <LocalCenterCard center={data.consumerCenter} />
    </article>
  );
}
```

---

## 判例データはどう集めたか

一番工数がかかったのはここです。CourtsデータベースやLexisNexisのようなプロ用DBは高額なので、以下を組み合わせました。

1. **裁判所公式 裁判例検索**：https://www.courts.go.jp/app/hanrei_jp/search1
2. **消費生活センターの紛争処理事例集**（PDF公開されているケース）
3. **弁護士ドットコムなどの判例紹介記事**

重要：判例を引用するときは必ず「事件番号・判決年月日・判示事項」まで明記すること。これが一次情報の証拠になるし、Google的にも「エビデンス付きの固有コンテンツ」として評価されます。

1都道府県あたり2〜5件の判例があれば十分。47都道府県なら最低94件、コミット数本分の労力で整えられます。

---

## 地域固有ルールで差別化

賃貸慣習は地域差が大きいので、ここに踏み込むと差別化できます。

- **関西圏**：敷金の代わりに「敷引き」慣習（◯ヶ月分は返還されない契約）
- **関東圏**：更新料2ヶ月が標準、礼金慣習が強い
- **北海道**：冬季の暖房費・水抜き義務の有無が退去時争点になりやすい
- **沖縄**：シロアリ被害の扱い、塩害による設備劣化の判定

この手の情報は地元の宅建業協会の資料や、地域ポータルサイトで拾えます。

---

## 重複コンテンツ判定の回避

「47件同じ構成」だとGoogleは重複と判定します。以下で分散させました。

### 1. 判例セクションの順序と件数を変える

判例が多い都道府県は先頭に。少ない都道府県は地域ルール中心に展開。同じテンプレでも可変部分で印象が変わる。

### 2. 地域固有の見出しを1つ入れる

「沖縄の塩害対応について」「北海道の暖房費トラブル」みたいに、その都道府県にしかない見出しを必ず1つ入れる。構造だけでも差別化できる。

### 3. 関連地域への内部リンク

関東7都県は相互リンク、関西6府県も相互リンク、みたいにクラスター化。単体ページじゃなく「地域ハブ」として評価させる。

---

## 成果とSEO効果

リリースから4〜6週間で、「○○県 退去費用 判例」みたいなクエリがじわじわインデックスされ始めました。3ヶ月目には月間オーガニック流入が都道府県ページだけで数百PV上乗せされる手応え。

決して爆発的ではありません。でも個人開発でこの規模のローカルSEOを張れるのは大きい。ドメイン単位でみた時の「権威性」にも効くので、本記事群はサイト全体のSEOにプラスに働きます。

---

## まとめ

- 47都道府県×一次情報で pSEO × ローカルSEO を融合
- 判例・地域慣習は裁判所DB・宅建協会資料から手動収集
- TypeScriptで型安全なデータ管理、重複回避のための可変構成
- 個人開発でもドメイン権威性を底上げできる

ローカルSEOは「データ集めが9割、実装が1割」です。データ整備に2〜3週間かける覚悟があれば、個人開発の武器になります。
