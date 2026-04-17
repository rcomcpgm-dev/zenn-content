---
title: "Next.js APIルートにIPベースのレート制限を実装する｜インメモリで十分動く"
emoji: "🛡️"
type: "tech"
topics: ["nextjs", "security", "typescript", "api"]
publish_order: 27
published: false
---

## この記事でわかること

- Next.js App Router の API Route にレート制限を実装する
- インメモリで十分に動く構成とその限界
- Redisに移行するタイミングの見極め
- ボットアクセスとリトライ嵐から API を守る基本

---

## なぜレート制限が必要か

個人開発でサービスを公開した直後、高確率で遭遇するのがこの2つです。

1. 悪意あるユーザーが診断APIを連打して計算リソースを食い潰す
2. クローラーが脳死で全パスを叩きに来てServerless Functionの無料枠を溶かす

無料枠を溶かされると課金が発生します。特にLLM APIを叩いているエンドポイントが標的になると、1日で数千円単位で飛ぶリスクがあるのでレート制限はMVP段階でも入れておくべきです。

自分の退去費用チェッカー（taikyocheck.com）でも、診断APIとStripe Checkoutセッション作成APIにレート制限を入れました。実装コスト小、効果大です。

---

## インメモリで実装

Redisを使うのが教科書的ですが、個人開発レベルならインメモリで十分動きます。

```typescript
// lib/rate-limit.ts
type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  ip: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt < now) {
    // 新規 or 期限切れ
    const newBucket = { count: 1, resetAt: now + windowMs };
    buckets.set(ip, newBucket);
    return { ok: true, remaining: limit - 1, resetAt: newBucket.resetAt };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count++;
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

// メモリ肥大化防止（定期的にクリーンアップ）
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000);
```

---

## APIルートで使う

```typescript
// app/api/diagnose/route.ts
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const result = checkRateLimit(ip, 10, 60_000); // 1分に10回まで

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        resetAt: result.resetAt,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetAt),
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // 通常の処理...
}
```

`X-RateLimit-*` ヘッダーを返すのがベストプラクティス。クライアントがリトライ戦略を組めるようになります。

---

## IPの取得注意

Vercelの場合、IPは以下の優先順位で取る：

1. `x-forwarded-for` の先頭（カンマ区切りの場合は最初のIP）
2. `x-real-ip`
3. それもなければ unknown

`x-forwarded-for` は「クライアント IP, プロキシ IP, ...」と連結されるので、カンマ区切りで split して `[0]` を使うのが安全。

---

## インメモリの限界

インメモリは以下のケースで破綻します。

### 1. サーバーレス関数が複数インスタンス

Vercelは負荷に応じて関数のインスタンスを増やします。インスタンスごとにメモリが独立しているので、IP Aが1回目をインスタンスXで、2回目をインスタンスYで叩くと、Yはカウントゼロから始まる。つまり実質無制限化する。

### 2. 関数のコールドスタート

一定時間アクセスがないとインスタンスが落とされる。落とされた時点でバケットは消える。

### 3. 高トラフィック時の精度

低〜中トラフィックなら実用上問題ないけど、秒間数百リクエストを捌くと精度が落ちる。

---

## いつRedisに移行するか

以下のどれかに当てはまったらRedis（Upstashなど）に移行検討：

- DAU 1000人超え
- レート制限超過ログが月100件超え
- 有料プランをユーザーに提供し始めた（課金制限のため正確な計測が必要）
- エッジランタイムで動かしたくなった（インメモリはNodeランタイム前提）

個人開発のMVP〜PMF前はインメモリで十分です。PMF後でトラフィックが増えたタイミングで Upstash Redis に切り替えればOK。

---

## 補完的な対策

レート制限だけじゃ防ぎきれないので、以下も併用：

### 1. ボットフィルタリング

GA4なら「既知のボットとクローラーをすべて除外」設定を入れる。分析データが歪まなくなる。

### 2. Honeypot フィールド

フォームに `display: none` の隠しフィールドを入れ、そこに値が入っていたらボット判定で弾く。CAPTCHA入れるほどじゃない時に有効。

### 3. Cloudflare 前段配置

無料枠でDDoS対策・Rate Limiting・WAFがセットで手に入る。Vercelの前にCloudflareを挟むだけで攻撃耐性が段違いに上がる。

---

## まとめ

- 個人開発のMVPはインメモリレート制限で十分
- IPは `x-forwarded-for` の先頭から取得、IPv4/v6両対応
- `X-RateLimit-*` ヘッダーを返してクライアントにリトライ情報を渡す
- サーバーレスの複数インスタンス問題があるのでトラフィックが伸びたらRedis移行

レート制限は「入れない理由」を考えるより「入れとくべきデフォルト」として扱ったほうが安全です。コスト攻撃のリスクは無料枠を使っているほど高くなるので、最初から組み込むのがおすすめ。
