---
title: "Claude Codeでガチャアプリを作った話｜レアリティ演出からStripe課金まで"
emoji: "🎰"
type: "tech"
topics: ["claudecode", "reactnative", "expo", "ai"]
publish_order: 20
published: false
---

## この記事でわかること

- ガチャ形式のUIをExpo（React Native）で実装する方法
- Claude APIで構造化JSONを安定して出力させるプロンプト設計
- レアリティシステムのゲーミフィケーション設計
- 無料枠 + 報酬広告 + サブスクのマネタイズ設計
- Claude Codeで1000行超のアプリを効率よく作る実体験

---

## 「献立ガチャ」とは

「今日何食べる？」

この問いに毎日悩んでいる人、多いと思う。自分もその一人だった。

そこで作ったのが**献立ガチャ**。条件を選んでガチャを回すと、Claude APIが主菜・副菜・汁物の3品をまとめて提案してくれるアプリだ。

https://kondate-nu.vercel.app

技術スタックはこんな感じ。

| 要素 | 技術 |
|------|------|
| フロントエンド | Expo（React Native） + TypeScript |
| 状態管理 | Zustand + AsyncStorage |
| AI献立生成 | Claude API（Vercel API Routes経由） |
| 課金 | Stripe Checkout |
| 広告 | 忍者AdMax（報酬広告） |
| デプロイ | Vercel |

Expoで作っているのでWeb・iOS・Androidに対応できる。現状はWebメインで公開中。

---

## ガチャのレアリティシステム

「食べ物にレアリティ？」と思うかもしれないが、ここがこのアプリの肝。

日常の「献立を決める」という行為にゲーミフィケーションを持ち込むことで、毎日ガチャを回したくなる仕組みにした。

### 4段階のレアリティ

```typescript
export function rollRarity(): Rarity {
  const roll = Math.random() * 100;
  if (roll < 7) return 'SSR';   // 7%  — プロ級・映え料理
  if (roll < 25) return 'SR';   // 18% — レストラン級
  if (roll < 55) return 'R';    // 30% — ちょっと手の込んだ料理
  return 'N';                    // 45% — 定番家庭料理
}
```

| レアリティ | 確率 | 内容 | 演出 |
|-----------|------|------|------|
| N（ノーマル） | 45% | 定番家庭料理 | 茶系カラー、星1つ |
| R（レア） | 30% | ちょっと手の込んだ料理 | 青系カラー、星2つ |
| SR（スーパーレア） | 18% | レストラン級 | 金系カラー、星3つ |
| SSR（超激レア） | 7% | プロ級・映え料理 | 紫系グロー、星4つ |

各レアリティにはカラーテーマが設定されていて、カードの背景色・ボーダー・グローが全部変わる。

```typescript
export const RARITY_CONFIG: Record<Rarity, RarityConfig> = {
  N: {
    label: 'ノーマル',
    color: '#8B7355',
    bgColor: '#F5F0E8',
    borderColor: '#D4C5B5',
    glowColor: '#D4C5B5',
    stars: 1,
    emoji: '⚪',
  },
  SSR: {
    label: '超激レア',
    color: '#E040FB',
    bgColor: '#F3E5F5',
    borderColor: '#CE93D8',
    glowColor: '#AB47BC',
    stars: 4,
    emoji: '🌈',
  },
  // R, SR も同様
};
```

### ハプティックフィードバックで「引いた感」を出す

ガチャ体験で大事なのは演出。Expoの`expo-haptics`を使って、レアリティごとにバイブレーションを変えている。

```typescript
// result.tsx — ガチャ結果表示時の演出
if (rarity === 'SSR') {
  // SSR: トリプルバイブレーション
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
} else if (rarity === 'SR') {
  // SR: ダブルバイブレーション
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 200);
} else {
  // N, R: シンプルな通知
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
```

SSRが出たときのトリプルバイブレーションは「おっ!?」と思わせる効果がある。ソシャゲの虹演出みたいなもの。

さらにガチャ回転中はフラッシュアニメーションも入れていて、`react-native-reanimated`でレアリティに応じた色のフラッシュが走る。

```typescript
const RARITY_FLASH: Record<Rarity, string> = {
  N: '#D4C5B5',
  R: '#42A5F5',
  SR: '#FFD54F',
  SSR: '#E040FB',
};
```

これ、Claude Codeに「SSRのときだけ派手なハプティックフィードバック付けて」と言ったら5分で実装してくれた。

---

## AI献立生成のプロンプト設計

献立生成はClaude APIを使っている。ポイントは「構造化JSONで安定して出力させる」こと。

### システムプロンプト

```typescript
function buildSystemPrompt(): string {
  return `あなたは日本の家庭料理の専門家です。
ユーザーの希望に合わせて、主菜・副菜・汁物の3品からなる献立を提案してください。

各レシピには以下の情報を**必ず**含めてください：
- name: 料理名
- description: 簡単な説明（1文）
- ingredients: 材料リスト（{ name: string, amount: string }の配列）
- steps: 手順（文字列の配列）
- cookingTimeMinutes: 調理時間（分、数値）
- calories: おおよそのカロリー（数値）
- nutrition: 栄養成分（{ calories, protein, fat, carbs, fiber, salt }）
- rarity: レア度（"N"=定番, "R"=手の込んだ料理, "SR"=レストラン級, "SSR"=プロ級）

**必ず**以下のJSON形式のみで返答してください。説明文やmarkdownは不要です：
{
  "main": { ... },
  "side": { ... },
  "soup": { ... }
}`;
}
```

このプロンプト設計のポイントは3つ。

1. **「必ず」を2回使う** — JSON形式の遵守を強調
2. **フィールド定義を明示** — 曖昧さをなくすことでパースエラーを減らす
3. **レアリティの定義をプロンプトに含める** — AIが料理の難易度に応じて適切にレアリティを判定

### ユーザープロンプトの動的構築

ユーザーの選択条件に加えて、いくつかのコンテキストを動的に注入する。

```typescript
function buildUserPrompt(
  selection: MealSelection,
  dislikedIngredients: string[],
  recentMeals: DecidedMeal[],
): string {
  let prompt = `以下の条件で献立を考えてください：
- 食事: ${MEAL_TIME_LABELS[selection.mealTime]}
- ジャンル: ${GENRE_LABELS[selection.genre]}
- 気分: ${selection.moods.map(m => MOOD_LABELS[m]).join('、') || 'おまかせ'}
- 調理時間: ${COOKING_TIME_LABELS[selection.cookingTime]}
- 人数: ${selection.servings}人分`;

  // 特殊モードの注入
  if (selection.dietMode) {
    prompt += `\n\n【ダイエットモード】3品合計で600kcal以内に抑えてください。`;
  }
  if (selection.bingeMode) {
    prompt += `\n\n【爆食モード】ボリューム満点、カロリーは気にせず満足感重視で。`;
  }
  if (selection.beginnerMode) {
    prompt += `\n\n【初心者モード】工程は5ステップ以内、特殊な調理器具は不要。`;
  }

  // 旬食材の注入
  const season = getCurrentSeason();
  if (season) {
    prompt += `\n\n【今月の旬食材】${season.ingredients.join('、')}`;
  }

  // NG食材
  if (dislikedIngredients.length > 0) {
    prompt += `\n\n【NG食材】${dislikedIngredients.join('、')}`;
  }

  // 直近の履歴で重複防止
  if (recentMeals.length > 0) {
    const names = recentMeals.map(d => `- ${d.mealPlan.main.name}`);
    prompt += `\n\n【最近作った料理】同じものは避けてください：\n${names.join('\n')}`;
  }

  return prompt;
}
```

入力制約を整理すると以下の通り。

| 制約 | 内容 |
|------|------|
| NG食材 | ユーザーが設定した苦手な食材を除外 |
| 旬食材 | 月別DBから当月の旬食材を優先使用 |
| 履歴 | 直近の献立と重複しない |
| 特殊モード | ダイエット（600kcal以下）、爆食、初心者（5手順以下）、おだいじに |

### JSONパースのフォールバック

AIのレスポンスは基本的にJSONだが、たまにマークダウンのコードブロックで囲んでくることがある。そこでパース時にクリーニングを入れている。

```typescript
function parseMealPlanResponse(text: string): MealPlan {
  let cleaned = text.trim();
  // ```json ... ``` の囲みを除去
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  // レアリティのバリデーション
  const validRarities = ['N', 'R', 'SR', 'SSR'];
  for (const key of ['main', 'side', 'soup'] as const) {
    const recipe = parsed[key];
    if (!recipe?.name || !recipe?.ingredients || !recipe?.steps) {
      throw new Error(`Invalid recipe data for ${key}`);
    }
    if (!recipe.rarity || !validRarities.includes(recipe.rarity)) {
      recipe.rarity = 'R'; // フォールバック
    }
  }

  return { main: parsed.main, side: parsed.side, soup: parsed.soup, generatedAt: new Date().toISOString() };
}
```

レアリティが不正値の場合は `R` にフォールバックする。完全に壊れたJSONが返ってきた場合はエラーハンドリングで再試行する設計。

---

## マネタイズ設計

個人開発のマネタイズは悩むポイント。献立ガチャでは3段階の課金設計にした。

### 無料枠

- 初日：10回/日
- 2日目以降：5回/日

```typescript
const GACHA_FIRST_DAY_LIMIT = 10;
const GACHA_DAILY_LIMIT = 5;

function getGachaLimitInfo(ip: string) {
  const isFirstDay = now < entry.firstSeenAt + RATE_WINDOW_MS;
  const dailyLimit = isFirstDay ? GACHA_FIRST_DAY_LIMIT : GACHA_DAILY_LIMIT;
  // ...
}
```

初日を多めにしているのは「初回体験で十分に遊んでもらう→翌日からの制限で課金動機を作る」という設計。

### 報酬広告（忍者AdMax）

10秒の動画広告を見ると+1回（最大3回/日）。「完全にゼロになるストレス」を回避しつつ、広告収入も得られる仕組み。

```tsx
{canWatchAd && (
  <TouchableOpacity style={styles.modalRewardBtn} onPress={onWatchAd}>
    <Text style={styles.modalRewardText}>広告を見てガチャ+1回</Text>
    <Text style={styles.modalRewardSub}>無料・あと数回使えます</Text>
  </TouchableOpacity>
)}
```

### プレミアム（月額480円）

- ガチャ無制限
- 広告なし
- 週次献立プラン機能
- AI献立生成

Stripe Checkout + JWT + ステートレス設計で実装。サーバー側でJWTを検証してプレミアムユーザーはガチャ制限をバイパスする。

```typescript
async function isPremiumRequest(req: VercelRequest): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const { verifySubscriptionToken } = await import('./lib/jwt.js');
    const payload = await verifySubscriptionToken(token);
    return payload !== null;
  } catch {
    return false;
  }
}
```

ポイントは**課金チェックをサーバー側で行うこと**。クライアントサイドだけの検証だと簡単にバイパスされてしまう。API Routesでトークン検証してからAI生成を実行する流れ。

---

## コレクション機能

ガチャアプリに図鑑は必須。全100種類の献立をレアリティ別にコレクションできる。

```typescript
const RARITY_TOTALS: Record<Rarity, number> = {
  N: 50,
  R: 30,
  SR: 15,
  SSR: 5,
};
```

| レアリティ | 収録数 | 特徴 |
|-----------|--------|------|
| N | 50種 | 鶏の照り焼き、豚の生姜焼きなど定番 |
| R | 30種 | 少し凝った家庭料理 |
| SR | 15種 | レストランで出てきそうな一品 |
| SSR | 5種 | プロ級の映え料理 |

お気に入りに保存した献立がコレクションに登録される仕組みで、レアリティ別の達成率が表示される。SSR全5種コンプリートは結構大変。

---

## Claude Codeで作ってよかったこと

このアプリのホーム画面（`index.tsx`）は**1386行**ある。条件選択UI、ガチャボタン、残回数表示、アップセルモーダル、報酬広告モーダルなど全部入り。

正直、手で書いていたら心が折れていたと思う。

Claude Codeで特に助かったのは以下の3点。

### 1. 大規模コンポーネントの一括生成

「時間帯・ジャンル・気分・調理時間の選択UIを横スクロールのチップで作って」と指示すると、4つの選択UIをまとめて生成してくれる。

### 2. Zustand + AsyncStorageのストア設計

5つのストア（`mealStore`, `subscriptionStore`, `preferencesStore`, `historyStore`, `favoritesStore`）の設計をClaude Codeに任せた。型定義から永続化まで一貫して作ってくれるので、ストア間の整合性が保たれる。

### 3. 演出の追加が圧倒的に速い

「SSRのときだけハプティックフィードバックを3回にして」「レアリティごとにフラッシュの色を変えて」といった演出系の要望は、Claude Codeなら5分もかからない。手で書くとアニメーションライブラリのAPIを調べるだけで時間が溶ける。

---

## まとめ

献立ガチャは「日常の面倒な判断をゲーム化する」というコンセプトのアプリ。

技術的に面白かったポイントをまとめると以下の通り。

- **レアリティシステム** — 確率テーブル + 視覚演出 + ハプティクスで「引いた感」を作る
- **AIプロンプト設計** — 構造化JSON出力、動的コンテキスト注入、フォールバック処理
- **マネタイズ** — 無料枠→報酬広告→サブスクの3段階で、ユーザー体験と収益のバランスを取る
- **Claude Code活用** — 1386行のコンポーネントも、5つのストアも、演出追加も高速

個人開発でここまで作り込めたのは、Claude Codeのおかげとしか言いようがない。「AIで献立を生成するアプリをAIで作る」という入れ子構造も、なんだか面白い。

気になった方はぜひ触ってみてほしい。

https://kondate-nu.vercel.app

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
