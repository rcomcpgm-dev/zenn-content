---
title: "Claude Codeにセキュリティ監査をさせる方法｜実際に見つかった脆弱性5つ"
emoji: "🛡️"
type: "tech"
topics: ["claudecode", "security", "webdev", "nextjs"]
publish_order: 17
published: false
---

Claude Codeのエージェント機能を使ってセキュリティ監査を実行し、実際に発見・修正した脆弱性5つを紹介します。手動レビューでは見落としがちな問題も、AIに任せれば網羅的に検出できます。

## はじめに

Webアプリを開発していると、機能実装に集中するあまりセキュリティが後回しになりがちです。

「あとでちゃんとチェックしよう」と思いつつ、そのまま本番にデプロイしてしまった経験はありませんか？

この記事では、**Claude Codeのエージェント機能を使ってセキュリティ監査を実行する方法**と、実際に自分のNext.jsプロジェクトで見つかった脆弱性5つを具体的に解説します。

### この記事でわかること

- Claude Codeでセキュリティ監査を実行する具体的な手順
- 実際に検出された脆弱性5つと、その修正方法（diff付き）
- 監査を開発フローに組み込むコツ

## Claude Codeでセキュリティ監査を実行する方法

### 1. エージェントにセキュリティ監査を指示する

Claude Codeのプロンプトに、以下のように具体的な監査項目を指示します。

```
このプロジェクトのセキュリティ監査をしてください。
以下の観点でチェックをお願いします：

1. 全APIルートの認証・認可チェック
2. 入力バリデーションの網羅性
3. XSS（クロスサイトスクリプティング）
4. CSRF（クロスサイトリクエストフォージェリ）
5. オープンリダイレクト
6. 秘密鍵・APIキーの漏洩
7. セキュリティヘッダーの設定

脆弱性が見つかったら、深刻度（Critical/High/Medium/Low）と
修正案をコード付きで提示してください。
```

### 2. AIが全ファイルを走査してレポートを出力

Claude Codeはプロジェクト内の全ファイルを読み込み、上記の観点で問題を洗い出します。APIルート、ミドルウェア、フロントエンドのコンポーネントまで横断的にチェックしてくれます。

### 3. CLAUDE.mdにチェックリストを書いておく

毎回プロンプトを打つのは手間なので、`CLAUDE.md`にセキュリティチェックリストを記載しておくのがおすすめです。

```markdown
### セキュリティチェック（必須）

タスクを1つ完了するたびに、以下を確認すること：

1. APIキーがクライアントサイドコードに露出していないか
2. サーバーサイドでのみ保持すべきシークレットがバンドルに含まれていないか
3. `.env`ファイルが`.gitignore`に含まれているか
4. 課金・認証のバイパスが不可能か
5. 新しいAPIエンドポイントにはレート制限があるか

違反を見つけた場合は、次のタスクに進む前に必ず修正すること。
```

こう書いておくと、Claude Codeは**機能実装のたびに自動的にセキュリティチェックを実行**してくれます。

## 実際に見つかった脆弱性5つ

ここからが本題です。自分のNext.jsプロジェクトで実際にClaude Codeが検出した脆弱性を紹介します。

### 脆弱性1: オープンリダイレクト（Critical）

**概要：** 認証コールバックの`next`パラメータが未検証で、外部サイトへリダイレクトされる問題。

ログイン後に元のページへ戻す処理で、`next`パラメータの値をそのままリダイレクト先に使っていました。

```
/auth/callback?next=//evil.com
```

このURLにアクセスすると、ログイン後に`evil.com`へリダイレクトされます。フィッシング攻撃に悪用される危険性があります。

**修正前：**

```typescript
// 修正前: nextパラメータをそのまま使用
const next = searchParams.get("next") || "/";
redirect(next);
```

**修正後：**

```typescript
// 修正後: リダイレクト先を検証
const next = searchParams.get("next") || "/";

const isSafeRedirect =
  next.startsWith("/") &&
  !next.startsWith("//") &&
  !next.includes("@");

redirect(isSafeRedirect ? next : "/");
```

`//evil.com`はブラウザがプロトコル相対URLとして解釈するため、`//`で始まるパスを拒否します。`@`を含むURLも`//user@evil.com`形式の攻撃を防ぐために除外しています。

### 脆弱性2: javascript: URLによるXSS（High）

**概要：** ユーザー入力のURLをそのまま`href`属性に使用しており、`javascript:`スキームでスクリプトが実行される問題。

たとえばオンラインショップのURL入力欄に以下を入れると、リンクをクリックした瞬間にスクリプトが実行されます。

```
javascript:alert(document.cookie)
```

**修正前：**

```tsx
// 修正前: ユーザー入力をそのままhrefに渡す
<a href={shop.onlineShopUrl} target="_blank" rel="noopener">
  ショップを見る
</a>
```

**修正後：**

```tsx
// 修正後: httpまたはhttpsプロトコルのみ許可
const isSafeUrl = (url: string): boolean => {
  return /^https?:\/\//.test(url);
};

{isSafeUrl(shop.onlineShopUrl) && (
  <a href={shop.onlineShopUrl} target="_blank" rel="noopener noreferrer">
    ショップを見る
  </a>
)}
```

`https://`または`http://`で始まるURLだけを許可し、それ以外はリンク自体をレンダリングしません。

### 脆弱性3: 入力バリデーション不足（High）

**概要：** APIのPOST/PUTエンドポイントでリクエストボディのサイズ制限がなく、IDの存在チェックも未実施。

数MBのJSONを送りつけてデータベースを肥大化させたり、存在しない`industry_id`を指定して不整合なデータを作成できる状態でした。

**修正前：**

```typescript
// 修正前: リクエストボディをそのまま使用
export async function POST(request: Request) {
  const body = await request.json();
  const { data } = await supabase
    .from("sites")
    .insert(body);
  return NextResponse.json(data);
}
```

**修正後：**

```typescript
// 修正後: サイズ制限 + IDのホワイトリスト検証
const MAX_BODY_SIZE = 50 * 1024; // 50KB

const VALID_INDUSTRY_IDS = [
  "restaurant", "salon", "clinic", "gym", "realestate"
];

export async function POST(request: Request) {
  // サイズチェック
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "リクエストが大きすぎます" },
      { status: 413 }
    );
  }

  const body = await request.json();

  // IDのホワイトリスト検証
  if (!VALID_INDUSTRY_IDS.includes(body.industry_id)) {
    return NextResponse.json(
      { error: "無効な業種IDです" },
      { status: 400 }
    );
  }

  const { data } = await supabase
    .from("sites")
    .insert({
      industry_id: body.industry_id,
      template_id: body.template_id,
      // 必要なフィールドだけ明示的に取り出す
    });
  return NextResponse.json(data);
}
```

リクエストボディを丸ごと`insert`に渡すのではなく、必要なフィールドだけを明示的に取り出すようにしています。

### 脆弱性4: 画像アップロードのインデックス制限なし（Medium）

**概要：** 画像アップロード時のファイル名パターンに上限がなく、任意の数のファイルをアップロード可能。

```
menu-0.jpg, menu-1.jpg, ... menu-99999.jpg
```

のように大量のファイルをアップロードしてストレージを圧迫できる状態でした。

**修正前：**

```typescript
// 修正前: 任意のインデックスを許可
const filePattern = /^menu-\d+\.(jpg|png|webp)$/;
```

**修正後：**

```typescript
// 修正後: 0-9の10個までに制限
const filePattern = /^menu-[0-9]\.(jpg|png|webp)$/;
```

`\d+`（1桁以上の任意の数字）を`[0-9]`（1桁の数字）に変更するだけで、アップロード数を10個に制限できます。

### 脆弱性5: HSTSヘッダーなし（Medium）

**概要：** `Strict-Transport-Security`ヘッダーが設定されておらず、SSL stripping攻撃のリスクがある。

SSL stripping攻撃とは、中間者がHTTPSをHTTPにダウングレードして通信を傍受する手法です。HSTSヘッダーを設定すると、ブラウザが強制的にHTTPS接続を使うようになります。

**修正：** Next.jsの`next.config.ts`でヘッダーを追加します。

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

HSTSと一緒に`X-Content-Type-Options`と`X-Frame-Options`も追加しておくと、MIMEスニッフィングやクリックジャッキングも防げます。

## 見つからなかった（安全だった）もの

脆弱性が見つからなかった箇所も重要です。以下は正しく実装されていたものです。

- **Supabase RLS（Row Level Security）が正しく設定されていた** - 他ユーザーのデータにアクセスできないことを確認
- **APIキーがクライアントコードに露出していなかった** - 秘密鍵はすべてサーバーサイドで管理
- **SQLインジェクションなし** - Supabaseのクエリビルダーを使っているため、生SQLを書く箇所がなかった

フレームワークやBaaSの機能を正しく使っていれば、自然と防げる脆弱性もあります。

## セキュリティ監査を習慣にするコツ

### 新機能を追加したら毎回監査させる

機能実装とセキュリティチェックをセットにするのが理想です。Claude Codeなら「この変更にセキュリティ上の問題はないか？」と聞くだけで済みます。

### CLAUDE.mdにチェックリストを常備する

前述の通り、`CLAUDE.md`にセキュリティチェックリストを書いておけば、Claude Codeが毎回のタスク完了時に自動チェックしてくれます。人間が忘れても、AIは忘れません。

### pre-pushフックで秘密情報チェックも併用する

AIだけに頼らず、`git-secrets`や`gitleaks`などのツールをpre-pushフックに設定しておくと、`.env`ファイルやAPIキーのうっかりコミットを機械的に防げます。

```bash
# gitleaksをpre-pushフックに設定する例
brew install gitleaks
cat <<'EOF' > .git/hooks/pre-push
#!/bin/bash
gitleaks detect --source . --verbose
EOF
chmod +x .git/hooks/pre-push
```

## まとめ

Claude Codeを使ったセキュリティ監査のポイントをまとめます。

1. **具体的な監査項目を指示する** - 「セキュリティチェックして」ではなく、XSS、CSRF、認証バイパスなど観点を列挙する
2. **CLAUDE.mdにチェックリストを書く** - 毎回の指示が不要になり、自動的に監査が走る
3. **修正は即座に適用する** - Claude Codeが検出と修正案の提示を同時にやってくれる
4. **AIとツールを併用する** - gitleaksなどの静的チェックツールも組み合わせる

セキュリティ監査は専門家に依頼すると数十万円かかることもあります。もちろんAIが専門家の代替になるわけではありませんが、**日常的な開発フローの中で基本的な脆弱性を潰しておく**には十分な効果があります。

「あとでやろう」を「毎回自動でやる」に変える。それだけで、セキュリティのレベルは大きく変わります。

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
