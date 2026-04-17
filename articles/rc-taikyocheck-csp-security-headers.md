---
title: "Next.jsでCSPからunsafe-evalを外してセキュリティヘッダーを固める"
emoji: "🔒"
type: "tech"
topics: ["nextjs", "security", "csp", "web"]
publish_order: 28
published: false
---

## この記事でわかること

- Next.jsでセキュリティヘッダーを `next.config.ts` にまとめて設定する
- CSP（Content Security Policy）から `unsafe-eval` を外す方法
- HSTS・X-Frame-Options・X-Content-Type-Options などの推奨設定
- Stripe / Supabase / GA4 など外部サービスとの共存

---

## なぜCSPから unsafe-eval を外すか

CSP（Content Security Policy）は、XSS攻撃を防ぐためのブラウザ機能です。`script-src` で許可するスクリプト元を絞り込みますが、デフォルトの Next.js テンプレには `unsafe-eval` が含まれていることがあります。

- `unsafe-eval`: `eval()` や `Function()` によるコード実行を許可
- これが有効だと、XSS攻撃者が任意コードを実行しやすくなる

セキュリティチェッカー（SecurityHeaders.com など）で最高ランクA+を取るには、`unsafe-eval` を削るのがほぼ必須。自分の退去費用チェッカー（taikyocheck.com）でも本番直前にこれを落としました。

---

## 設定方法：next.config.ts

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

---

## CSP各ディレクティブの意味

| ディレクティブ | 役割 | 推奨値 |
|---|---|---|
| `default-src` | 他で指定していないリソースのデフォルト | `'self'` |
| `script-src` | JavaScriptの読み込み元 | `'self'` + 必要な外部ドメイン |
| `style-src` | CSSの読み込み元 | `'self' 'unsafe-inline'` |
| `img-src` | 画像の読み込み元 | `'self' data: https: blob:` |
| `connect-src` | fetch/XHR/WebSocketの接続先 | `'self'` + API先 |
| `frame-src` | iframe埋め込み元 | Stripe Checkout等のみ |
| `object-src` | Flash等のプラグイン | `'none'` |
| `frame-ancestors` | 自サイトをiframe埋め込み可能な親 | `'none'` |
| `form-action` | form submit先 | `'self'` |

---

## `unsafe-inline` を落とすには nonce が必要

理想は `unsafe-inline` も落とすことですが、Next.js のインラインスクリプト（特に `next/script`）が動かなくなります。

完全に落とすには nonce ベースの CSP が必要：

```typescript
// middleware.ts
import { NextResponse } from 'next/server';

export function middleware(req: Request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const cspHeader = `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`;

  const res = NextResponse.next({
    request: {
      headers: new Headers({ 'x-nonce': nonce }),
    },
  });
  res.headers.set('Content-Security-Policy', cspHeader);
  return res;
}
```

各スクリプトタグに `nonce={nonce}` を付与する必要があり、運用コストが高い。個人開発なら `'unsafe-inline'` 妥協でも良いと思います。優先度は `unsafe-eval` を落とす方がずっと高い。

---

## 外部サービスとの共存

よく使う外部ツールを入れる場合、CSPを以下のように調整：

### Stripe

```
script-src ... https://js.stripe.com
frame-src https://js.stripe.com https://hooks.stripe.com
connect-src ... https://api.stripe.com
```

### Supabase

```
connect-src 'self' https://*.supabase.co wss://*.supabase.co
```

WebSocket使うならwssも許可。

### Google Analytics 4

```
script-src ... https://www.googletagmanager.com
connect-src ... https://www.google-analytics.com https://analytics.google.com
img-src ... https://www.google-analytics.com
```

### Google Fonts（使う場合）

```
style-src ... https://fonts.googleapis.com
font-src 'self' https://fonts.gstatic.com
```

---

## その他の推奨ヘッダー

### HSTS（Strict-Transport-Security）

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

HTTPS強制。`preload` 付きならHSTSプリロードリストに登録申請可能。申請後はブラウザが初回アクセスからHTTPSに強制する。

### X-Frame-Options

```
X-Frame-Options: DENY
```

自サイトをiframe埋め込みさせない。クリックジャッキング防止。CSPの `frame-ancestors 'none'` とセットで設定。

### X-Content-Type-Options

```
X-Content-Type-Options: nosniff
```

MIMEタイプスニッフィング禁止。`<img>` にJSファイルを仕込む攻撃を防ぐ。

### Permissions-Policy

```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

使わないブラウザAPIを明示的にブロック。サードパーティスクリプトが勝手にカメラ起動する系の攻撃を防ぐ。

---

## 動作確認方法

### 1. ブラウザDevTools

ChromeのDevTools > Network > Response Headers で、各ヘッダーが付いているか確認。

### 2. SecurityHeaders.com

https://securityheaders.com/ にURLを入れてスキャン。A+が取れていれば基本OK。

### 3. CSP Evaluator

https://csp-evaluator.withgoogle.com/ でCSPの脆弱性を診断。`unsafe-eval` があると警告が出る。

### 4. 実際に攻撃してみる

開発環境で `<script>alert('xss')</script>` を入力フィールドに入れて、ブラウザコンソールに「CSP違反」ログが出るか確認。ちゃんとCSPが効いてれば実行されない。

---

## まとめ

- `next.config.ts` の `async headers()` でセキュリティヘッダーを一括設定
- CSPから `unsafe-eval` は必ず外す
- `unsafe-inline` は nonce 運用が理想だが個人開発なら妥協可
- Stripe / Supabase / GA4 などの外部サービスは必要なドメインだけ許可
- HSTS / X-Frame-Options / X-Content-Type-Options を必ず併用

セキュリティヘッダーは「入れておいて損はない」領域なので、MVP段階から設定するのを推奨します。後で入れると外部サービス連携でCSP違反が出て修正が辛くなります。
