# AUN風 修正指示ツール（プロトタイプ）

WebページまたはPDFの上に、ドラッグで修正枠を置いてコメント管理できる試作アプリです。

## 1. 事前準備

- Node.js 20 以上をインストール
- Googleアカウント（GASデプロイ用）

## 2. Google Apps Script（GAS）を準備

1. [Google Apps Script](https://script.google.com/) を開く  
2. 「新しいプロジェクト」を作成  
3. エディタの `Code.gs` を、このリポジトリの [gas/Code.gs](/Users/katsuyama/Documents/進行中/2026/2026_WIN/my-aun-app/gas/Code.gs) に置き換え  
4. 右上「デプロイ」→「新しいデプロイ」  
5. 種類は「ウェブアプリ」  
6. 実行ユーザー: `自分`  
7. アクセス権: `全員`  
8. デプロイ後に表示される URL（`.../exec`）を控える  

## 3. Reactアプリを起動

1. このフォルダで以下を実行

```bash
npm install
cp .env.example .env.local
```

2. `.env.local` の `VITE_GAS_PROXY_URL` に、GASの `.../exec` URL を貼り付け  
3. 開発サーバーを起動

```bash
npm run dev
```

4. ブラウザで表示されたURL（通常 `http://localhost:5173`）を開く  

## 4. 使い方

- Web表示モード
  - URL欄に対象サイトを入力して「読み込み」
  - 表示領域でドラッグすると修正枠が作成
  - 枠は移動 / リサイズ可能（`react-rnd`）
- PDFモード
  - 「PDFをアップロード」でPDFを選択
  - PDF上に同じように修正枠を作成
- 右側のコメント一覧
  - 枠番号と同期
  - コメント編集、削除が可能

## 5. 補足

- GAS URLが未設定の場合は、画面にエラーメッセージが出ます。
- Webページ表示は `iframe srcDoc` に `base` タグを補完するため、相対URLの崩れを軽減しています。
