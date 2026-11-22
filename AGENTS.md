# PDF Highlight Demo

- 位置情報の保存形式はフロントエンドとAPIの契約です。ページ番号は1始まり、矩形はPDFの表示向きで左上を原点とする0〜1の座標を使います。
- ライブラリの座標との変換は `frontend/src/coordinates.ts` に置きます。
- 業務ルールはBusiness、SQLiteとファイル操作はInfrastructureに置きます。APIはBusinessのモデルを返します。
- Composeでは `./data` をAPIコンテナの `/data` にバインドします。動作検証には別のホストフォルダを使えます。
- 変更後は `docker compose up --build` でビルドして起動し、`npm --prefix tests test` を実行します。手順はREADMEを参照してください。
