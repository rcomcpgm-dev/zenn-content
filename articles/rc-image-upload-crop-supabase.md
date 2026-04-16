---
title: "Claude Code × Supabase Storageで画像アップロード+切り抜きUIを実装する"
emoji: "🖼️"
type: "tech"
topics: ["claudecode", "supabase", "nextjs", "react"]
publish_order: 19
published: false
---

## この記事でわかること

Next.jsアプリに**Supabase Storageを使った画像アップロード機能**を実装する方法です。ただアップロードするだけでなく、X（Twitter）のアイコン設定のような**切り抜きUI**も付けます。

react-easy-cropで切り抜き、Canvas APIでリサイズ+WebP圧縮、Supabase Storageにアップロード。この一連の流れをClaude Codeに任せたら1時間で動くものが出来ました。

## 完成形のイメージ

```
画像選択（ファイル選択 or ドラッグ&ドロップ）
    ↓
フルスクリーンの切り抜きモーダル
    ↓
ピンチ/スライダーでズーム、ドラッグで位置調整
    ↓
クライアントサイドでリサイズ + WebP圧縮
    ↓
Supabase Storageにアップロード
```

用途に応じてアスペクト比を変えています。

| 画像タイプ | アスペクト比 | リサイズ後のサイズ |
|-----------|------------|------------------|
| ヒーロー画像 | 16:9 | 1280x720 |
| メニュー画像 | 1:1 | 640x640 |

## Supabase Storageのセットアップ

### バケット作成

Supabase Dashboardからも作れますが、SQLで管理しておくと再現性があります。

```sql
-- バケット作成（public: 誰でも読み取り可能）
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true);
```

### RLSポリシー設定

ポイントは「認証ユーザーは自分のフォルダにだけ書き込み可、読み取りは誰でもOK」という設計です。

```sql
-- 公開読み取り（認証不要）
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-images');

-- 認証ユーザーは自分のフォルダにアップロード可能
CREATE POLICY "Authenticated users can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 認証ユーザーは自分のフォルダ内のファイルを更新可能
CREATE POLICY "Authenticated users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'site-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 認証ユーザーは自分のフォルダ内のファイルを削除可能
CREATE POLICY "Authenticated users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

`storage.foldername(name)` でパスの最初のフォルダ名を取得し、それが `auth.uid()` と一致するかチェックしています。つまりファイルパスが `{user_id}/hero.webp` のような構造になります。

## react-easy-cropの導入

切り抜きUIは `react-easy-crop` を使います。Xのアイコン設定やInstagramの投稿と同じ操作感を簡単に実装できるライブラリです。

```bash
npm install react-easy-crop
```

### 切り抜きモーダルのコンポーネント

```tsx
"use client";

import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { useState, useCallback } from "react";

type ImageCropModalProps = {
  imageSrc: string;
  aspect: number; // 16/9 or 1/1
  onCropComplete: (croppedArea: Area) => void;
  onCancel: () => void;
};

export function ImageCropModal({
  imageSrc,
  aspect,
  onCropComplete,
  onCancel,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleConfirm = () => {
    if (croppedAreaPixels) {
      onCropComplete(croppedAreaPixels);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* 切り抜きエリア */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>

      {/* コントロール */}
      <div className="p-4 bg-black/80">
        <div className="max-w-md mx-auto space-y-4">
          {/* ズームスライダー */}
          <div className="flex items-center gap-3">
            <span className="text-white text-sm">-</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-white text-sm">+</span>
          </div>

          {/* ボタン */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded text-white border border-white/30"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 rounded bg-blue-600 text-white"
            >
              この範囲で決定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

`onCropComplete` コールバックで返ってくる `croppedAreaPixels` が重要です。元画像上の切り抜き領域（x, y, width, height）がピクセル単位で入っています。

## クライアントサイドで切り抜き+リサイズ+WebP変換

ここが一番ハマりやすいポイントです。Canvas APIで切り抜きとリサイズを**2段階**で処理します。

```typescript
type CropResult = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function cropAndResize(
  imageSrc: string,
  cropArea: CropResult,
  targetWidth: number,
  targetHeight: number
): Promise<Blob> {
  const image = await loadImage(imageSrc);

  // ステップ1: 切り抜き
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropArea.width;
  cropCanvas.height = cropArea.height;
  const cropCtx = cropCanvas.getContext("2d")!;

  cropCtx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    cropArea.width,
    cropArea.height
  );

  // ステップ2: リサイズ + WebP変換
  const resizeCanvas = document.createElement("canvas");
  resizeCanvas.width = targetWidth;
  resizeCanvas.height = targetHeight;
  const resizeCtx = resizeCanvas.getContext("2d")!;

  resizeCtx.drawImage(cropCanvas, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve) => {
    resizeCanvas.toBlob(
      (blob) => resolve(blob!),
      "image/webp",
      0.8 // 品質80%
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

### なぜ2段階にするのか

1回の `drawImage` で切り抜きとリサイズを同時にやると、座標計算がずれることがあります。特に元画像が大きいときに顕著です。

```typescript
// これだと座標がずれることがある
ctx.drawImage(
  image,
  cropArea.x, cropArea.y, cropArea.width, cropArea.height,  // ソース
  0, 0, targetWidth, targetHeight                            // 出力
);
```

切り抜き → リサイズの2段階に分ければ、各ステップの責務が明確になり安定します。

### 圧縮効果

WebP品質80%への変換で、元のJPEG/PNGファイルが大幅に軽くなります。

| 元画像 | 変換後 |
|--------|--------|
| 2MB JPEG | 100-300KB WebP |
| 5MB PNG | 200-400KB WebP |

ブラウザで完結するのでサーバー負荷もゼロです。

## アップロードAPI

Next.js API Routeでバリデーションとアップロードを行います。

```typescript
// app/api/images/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_TYPE_PATTERN = /^(hero|menu-[0-9])$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const imageType = formData.get("imageType") as string | null;

  // バリデーション
  if (!file || !imageType) {
    return NextResponse.json(
      { error: "file and imageType are required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "JPEG, PNG, WebP only" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File size must be under 5MB" },
      { status: 400 }
    );
  }

  if (!IMAGE_TYPE_PATTERN.test(imageType)) {
    return NextResponse.json(
      { error: "Invalid image type" },
      { status: 400 }
    );
  }

  // アップロード
  const filePath = `${user.id}/${imageType}.webp`;

  const { error } = await supabase.storage
    .from("site-images")
    .upload(filePath, file, {
      upsert: true, // 既存ファイルを上書き
      contentType: "image/webp",
    });

  if (error) {
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }

  // 公開URLを返す（キャッシュバスター付き）
  const {
    data: { publicUrl },
  } = supabase.storage.from("site-images").getPublicUrl(filePath);

  return NextResponse.json({
    url: `${publicUrl}?t=${Date.now()}`,
  });
}
```

`?t=${Date.now()}` がキャッシュバスター。同じパスに画像を更新したとき、ブラウザが古い画像をキャッシュから返してしまう問題を防ぎます。

## アップロード中のUX

アップロード中は既存の画像を消してプログレスバーを表示します。完了したら新しい画像に差し替え。

```tsx
function ImageUploader({ imageType, aspect, targetSize }: Props) {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (croppedBlob: Blob) => {
    setUploading(true);
    setError(null);
    setImageUrl(null); // 既存画像を消す

    const formData = new FormData();
    formData.append("file", croppedBlob, `${imageType}.webp`);
    formData.append("imageType", imageType);

    try {
      const res = await fetch("/api/images", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {uploading && <ProgressBar />}
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {imageUrl && (
        <img src={imageUrl} alt="" className="w-full rounded" />
      )}
    </div>
  );
}
```

プログレスバーはCSSアニメーションで十分です。Supabase Storageの `upload` はプログレスイベントを返さないので、不確定プログレスバー（左右に動くやつ）にしています。

```tsx
function ProgressBar() {
  return (
    <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
      <div className="h-full bg-blue-500 rounded animate-progress" />
    </div>
  );
}
```

```css
@keyframes progress {
  0% { width: 0%; margin-left: 0%; }
  50% { width: 60%; margin-left: 20%; }
  100% { width: 0%; margin-left: 100%; }
}
.animate-progress {
  animation: progress 1.5s ease-in-out infinite;
}
```

## 注意点まとめ

### ブラウザキャッシュ問題

同じURLのファイルを上書きアップロードすると、ブラウザが古い画像をキャッシュから表示します。

```typescript
// NG: キャッシュが効いて古い画像が表示される
const url = supabase.storage.from("site-images").getPublicUrl(path);

// OK: タイムスタンプでキャッシュを回避
const url = `${publicUrl}?t=${Date.now()}`;
```

画像を表示するコンポーネント側でも、URLが変わったことを検知して再レンダリングさせる必要があります。`key` propにURLを渡すのが手っ取り早いです。

### Canvas APIの座標ズレ

前述の通り、切り抜きとリサイズは2段階で。特にRetinaディスプレイなど `devicePixelRatio` が1以外の環境で問題が起きやすいです。

### WebP非対応ブラウザ

2024年以降、主要ブラウザはすべてWebPに対応しています。IE11を切っていれば気にする必要はありません。

## Claude Codeに頼むときのコツ

この機能を実装するとき、Claude Codeにはこんな感じで指示しました。

```
画像アップロード機能を実装して。

- Supabase Storageを使う
- react-easy-cropで切り抜きUIをつける
- ヒーロー画像は16:9（1280x720）、メニュー画像は1:1（640x640）
- クライアントでWebP変換してからアップロード
- API Routeで認証・バリデーション

Xのアイコン設定みたいなUXにしたい。
フルスクリーンモーダルで切り抜き→ズームスライダー付き。
```

Supabase StorageのRLSポリシーは別途指示しました。ここはセキュリティに関わるので、生成されたSQLを自分で確認するのがおすすめです。

## まとめ

- **Supabase Storage** + RLSで認証付きの画像管理を構築
- **react-easy-crop** でXライクな切り抜きUIを実装
- **Canvas API** で切り抜き+リサイズ+WebP圧縮（サーバー負荷ゼロ）
- キャッシュバスター付きURLでブラウザキャッシュ問題を回避
- 切り抜きとリサイズは2段階処理で座標ズレを防止

「画像の切り抜きUI、自前で実装するのは大変そう」と思っていましたが、react-easy-cropが優秀で、Claude Codeとの組み合わせで1時間あれば動くものが出来ます。

:::message
**この記事が役に立ったら「いいね」お願いします！**
AI×開発の情報を発信中です。
- X (Twitter): [@adlei_builds](https://x.com/adlei_builds)
:::
