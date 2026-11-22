# PDF Highlight Demo

PDFに四角いマークと説明を付け、同じ位置に復元できることを確認するWebアプリです。ハイライトは閲覧画面に重ねて描画し、アップロードしたPDFはそのまま保存します。

## 起動

Docker EngineとDocker Composeが動作している環境で、プロジェクトのルートから実行します。

```sh
docker compose up --build
```

[http://localhost:8080](http://localhost:8080) を開きます。停止とコンテナの削除は `docker compose down` で行えます。ポートを変更する場合は `PDF_HIGHLIGHT_PORT=8081 docker compose up --build` を実行します。

| ホスト側の保存先 | 内容 |
| --- | --- |
| `./data/pdfs/` | アップロードしたPDF |
| `./data/pdf-highlight.db` | PDFのメタデータとハイライト |

Composeはホストの `./data` をAPIコンテナの `/data` にバインドマウントします。`PDF_DATA_DIR` に別のホストフォルダを指定できます。初回起動時にSQLiteを初期化します。

## 操作と検証

1. 一覧で「ファイルを選択」を押すか、アップロード欄にPDFをドロップします。検証にはパスワード保護されていない複数ページのPDFを使います。アップロード上限は50 MiBです。
2. ファイル名をクリックし、PDFのスクロールと「文字選択」で本文の選択を確認します。
3. 「矩形選択」に切り替え、PDFページ内でドラッグします。説明を入力して「登録する」を押します。別のページにも矩形を追加します。
4. ページを再読み込みし、一覧でハイライトを選びます。対象ページの矩形へ移動し、拡大、縮小、幅に合わせる操作で矩形が対象箇所に追随します。
5. PDF上の矩形をクリックすると、ハイライトパネルに説明が表示されます。ハイライト一覧の削除ボタンから矩形を削除できます。
6. PDFとハイライトを残した状態で、同じ保存先を指定して `docker compose up -d --force-recreate` を実行します。再度PDFを開き、同じ位置に矩形が表示されることを確認します。ドキュメント一覧からPDFを削除すると、そのPDFのハイライトも削除されます。

## 自動テスト

Node.js 22を用意し、Composeでアプリを起動してから実行します。

```sh
npm --prefix tests ci
(cd tests && npx playwright install chromium)
npm --prefix tests test
```

テストは一時PDFを生成し、終了時に削除します。別ポートを使う場合は `BASE_URL=http://127.0.0.1:8081 npm --prefix tests test` で接続先を指定できます。

- APIテストはアップロードの検証、PDFのバイト一致、HTTP Rangeの `206` / `416`、ハイライトの登録、入力検証、PDF削除時の連鎖削除を確認します。
- ブラウザテストは文字選択、サイズと回転が異なる2ページへの矩形登録、再読み込み、拡大・縮小後の四辺の位置、該当箇所へのスクロール、説明表示、削除を確認します。

## 実装

フロントエンドはReact 18.3.1、TypeScript、Vite、MUIを使用しています。`react-pdf-highlighter-extended` 8.1.0の `PdfLoader` と `PdfHighlighter` でPDF.jsを利用し、矩形選択とオーバーレイの配置を行います。PDF.js本体とWorkerは同じ4.10.38を使用し、アプリと同じホストから配信します。[ライブラリの公式ドキュメント](https://danielarnould.github.io/react-pdf-highlighter-extended/docs/)

保存する矩形は、PDFの表示向きにおけるページ左上を原点とした比率 `{ left, top, right, bottom }` です。各値は0〜1、ページ番号は1始まりです。選択時にはライブラリから受け取った座標をページの幅と高さで割り、描画時にはライブラリの `ScaledPosition` に戻します。変換は `frontend/src/coordinates.ts` に置いています。

APIはASP.NET Core 10、永続化はEF Core 10とSQLiteを使います。Business層が登録・削除と入力検証を担当し、Infrastructure層がSQLiteとPDFファイルを扱います。PDFのページ数はアップロード時にPdfPigで取得します。

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/documents` | `multipart/form-data` の `file` でPDFを登録 |
| GET | `/api/documents` | PDFの一覧とメタデータを取得 |
| GET / HEAD | `/api/documents/{id}/content` | PDFを配信。GETはHTTP Range対応 |
| DELETE | `/api/documents/{id}` | PDFと関連ハイライトを削除 |
| GET | `/api/documents/{id}/highlights` | ハイライト一覧を取得 |
| POST | `/api/documents/{id}/highlights` | `pageNumber`、`rectangle`、任意の `description` で登録 |
| DELETE | `/api/highlights/{id}` | ハイライトを削除 |

## AI誤字チェック

OpenAI互換APIの `POST /v1/chat/completions` を利用します。Composeを起動する前にルートの `.env` に接続先とモデル名を設定してください。

```dotenv
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=利用するモデル名
```

上のURLは、Docker Desktopのホストで互換APIを動かす場合の例です。APIコンテナから到達できるURLを指定してください。 [Docker Desktopのネットワーク設定](https://docs.docker.com/desktop/features/networking/#networking-features)認証が必要な場合は `LLM_API_KEY` を設定します。JSON Schemaに対応しない互換APIでは `LLM_USE_JSON_SCHEMA=false` を指定すると、本文でJSONを要求し、受け取った応答をアプリで検証します。応答の待ち時間は1ページあたり120秒で、`LLM_TIMEOUT_SECONDS` で調整できます。

1. PDFを開き、「現在のページ」または「全ページ」を選びます。
2. 「誤字チェックを開始」を押します。全ページを選んだときはページ順に処理され、進捗と完了したページの候補が表示されます。PDFの本文を接続先へ送信するのは、この操作で開始した処理だけです。
3. 候補の「位置を表示」で該当箇所を確認します。「採用」を押すと、修正案と理由を含むハイライトがSQLiteに保存されます。位置を一意に照合できない候補も一覧に表示されます。
4. [日本語の検証用PDF](tests/fixtures/japanese-proofreading.pdf) には各ページに2箇所ずつ、計6箇所の誤字があります。「本人確確認」「電話番語」「２週刊」「７日簡」「返却ボクスッ」「くさだい」が検証対象です。

校正は文字を抽出できる横書きPDFを対象とし、1ページあたり20,000文字まで処理します。画像のみのページや途中で失敗したページはページ別に表示し、残りのページは処理を続けます。未採用の候補と進捗はAPIのメモリに保持され、再起動すると消えます。

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/documents/{id}/proofreading` | `{"scope":"page","pageNumber":2}` または `{"scope":"all"}` で開始し、`202` とチェックIDを返す |
| GET | `/api/documents/{id}/proofreading` | 最新のチェック結果を取得。履歴がない場合は `204` |
| GET | `/api/documents/{id}/proofreading/{checkId}` | 進捗、ページ別エラー、誤字候補と0〜1の矩形を取得 |

AI採用時は既存のハイライト登録APIに候補IDを `id` として渡します。同じIDと同じ内容で再送した場合は、保存済みのハイライトを返します。

### 互換APIのモックで検証

検証用のCompose設定では、テストデータ専用の互換APIを追加します。既存のアプリやPDFに影響しないよう、別ポートと別データフォルダを使います。

```sh
export PDF_DATA_DIR="$(mktemp -d)"
export PDF_HIGHLIGHT_PORT=55080
docker compose -p pdfhighlight-test -f compose.yaml -f tests/compose.proofreading.yaml up --build -d --wait
BASE_URL=http://127.0.0.1:55080 PROOFREADING_MOCK_URL=http://127.0.0.1:55134 npm --prefix tests test
docker compose -p pdfhighlight-test -f compose.yaml -f tests/compose.proofreading.yaml down
```
