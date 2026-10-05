# Shops CSV Readiness JP

自社開発の注文連携を保守する担当者向けに、[注文API旧参照候補パックの手順と無料ZIP](https://tomoka-uzumaki-ai.github.io/shops-csv-readiness-jp/order-api-audit/)も公開しています。店舗CSV点検とは別の仕事です。実API互換性や移行完了を保証しません。

[日本語のCSV移行確認ツール](https://tomoka-uzumaki-ai.github.io/shops-csv-readiness-jp/)です。メルカリShopsの2026年9月の複数個購入に伴うCSVの変更について、ファイルをブラウザー内だけで読み、旧形式・新形式の候補と、注文件数・数量・売上明細の集計上の確認点を示します。

公式サービスではありません。CSVの移行やシステム対応を保証せず、アップロード用CSVの生成もしません。実際の運用では[メルカリShops公式案内](https://jp-news.mercari.com/mercari-shops/info/53548)と管理画面の原本を照合してください。サンプルCSVはすべて架空データです。

このサイトはアクセス解析・外部JavaScript・ファイルアップロードを利用しません。選択したCSVは訪問者の端末内でのみ処理されます。

2026-09-30にメルカリShopsガイドの公式ダミー[発送CSV](https://guide.mercari-shops-static.com/orders_update_cart.csv)と[売上明細CSV](https://guide.mercari-shops-static.com/sales_report_cart.csv)を取得して検査しました。発送は注文3件・商品行4件、売上明細は15行・販売利益列の単純合計4,732円となり、別のCSVパーサーによる集計と一致しました。ダミー内の金額は実売・当方の利益ではありません。実際の提供開始は告知記事が「予定」と表記するため未確認です。
