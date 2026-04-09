# AUN風 修正指示ツール

WebページやPDFの上に修正枠を置き、コメントを案件単位で保存しながら、お客様と制作担当で共有するアプリです。

## 必要なもの

- Node.js 20 以上
- Google Apps Script 用の Google アカウント
- Supabase プロジェクト

## 1. GAS を準備する

1. [Google Apps Script](https://script.google.com/) を開く
2. 新しいプロジェクトを作成
3. [Code.gs](/Users/katsuyama/Documents/進行中/2026/2026_WIN/my-aun-app/gas/Code.gs) の内容を貼り付け
4. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
5. 実行ユーザーは `自分`
6. アクセス権は `全員`
7. 発行された `.../exec` URL を控える

## 2. Supabase を準備する

1. Supabase で新規プロジェクトを作成
2. SQL Editor を開く
3. [schema.sql](/Users/katsuyama/Documents/進行中/2026/2026_WIN/my-aun-app/supabase/schema.sql) をそのまま実行
4. `Authentication` の Email 認証を有効化
5. `Project Settings` → `API` から以下を控える

- `Project URL`
- `anon public key`

このSQLで次のものが作成されます。

- 担当者プロフィール `profiles`
- 案件 `projects`
- 案件メンバー `project_members`
- 修正枠 `project_annotations`
- PDF保存用 Storage bucket `project-files`
- 案件メンバーにだけ見える RLS ポリシー

## 3. ローカル環境を起動する

```bash
npm install
cp .env.example .env.local
```

`.env.local` に以下を設定します。

```env
VITE_GAS_PROXY_URL=GASのexec URL
VITE_SUPABASE_URL=Supabase Project URL
VITE_SUPABASE_ANON_KEY=Supabase anon key
```

起動:

```bash
npm run dev
```

本番ビルド確認:

```bash
npm run build
```

## 4. できること

- 担当者ログイン / 新規登録
- 案件の新規作成
- Web案件とPDF案件の作成
- 案件共有URLの発行
- 案件メンバーごとの権限制御
- 修正枠とコメントの保存
- お客様と制作担当の同一案件共有

## 5. 権限の考え方

- `owner`: 案件作成者。編集とメンバー管理が可能
- `editor`: 制作担当。編集とメンバー管理が可能
- `client`: お客様。注釈編集が可能
- `viewer`: 閲覧のみ

## 6. 補足

- Web案件は保存されたURLを GAS 経由で読み直します
- PDF案件は Supabase Storage に保存され、案件メンバーだけが署名付きURLで読めます
- 共有URLを知っていても、案件メンバーに含まれていないユーザーは閲覧できません
