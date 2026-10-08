# 注文イベントの順序・再送・数量を確認する / Order event replay

無料・非公式。自分の注文連携を保守する開発担当向け。Python 3.9以上。標準ライブラリのみ。

この追加パックは、到着順に並べた**合成の正規化イベント**を再生します。既存の6例の最終状態チェックを置き換えず、最終状態へ至る依頼・完了・部分発送・再送の経路を確認します。実APIへ接続せず、原ファイルを変更・送信しません。顧客情報、トークン、実注文IDは入れないでください。

## 試す / Try it

```sh
python3 replay_events.py fixtures/accepted-mixed.json --output my-first-report.json
python3 replay_events.py fixtures/partial-cancel-then-ship.json --output my-partial-report.json
python3 replay_events.py fixtures/conflicting-resend.json --output my-conflict-report.json
python3 test_replay.py
```

出力先は存在しない新しいパスを指定します。上書き・ディレクトリ作成はしません。エラーなら次の未使用パスを選びます。入力はUTF-8 JSON（BOM可）、最大1 MiB・500イベント・1イベント100商品。snapshot容量上限は100注文・全体1000商品別名。数量は1〜1,000,000の整数。別名は英数字・`_`・`-`の1〜64文字。未知フィールド、重複JSONキー、真偽値を数量にする入力を拒否します。

The CLI requires a new, nonexisting report path. It does not overwrite source or output files, create parent directories, make API calls, or send input data. Use UTF-8 JSON, at most 1 MiB / 500 events / 100 variant items per event. Python 3.9+ is required. Snapshots are bounded to 100 orders / 1000 total variants. Use aliases and synthetic data only.

|終了コード / Exit|結果 / Result|
|---|---|
|0|合成契約の全イベントを受理 / accepted synthetic contract, real compatibility unconfirmed|
|2|途中イベントで停止。直前までのsnapshotを新規JSONへ保存 / stopped with snapshots before the failure|
|3|入力/出力の不備。合格として使わない / input or output invalid, no acceptance claim|

## このモデルのルール / Rules of this model

- `sequence: declared_arrival_order`：JSON配列の順番を到着順として再生。時刻順の再整列・実Webhook順序の復元はしません。
- `order_created`：商品別の購入数と残数を作成。同じ注文別名を別event keyで作り直す操作を拒否。
- `shipment`：未発送・取消依頼されていない残数だけ発送できる。部分取消完了後も残数は発送可能。全量取消後や残数超過は停止。
- `cancel_requested`：pending_cancelを増やす。残数・取消数は変えない。この合成モデルでは依頼中数量を予約し、発送へ転用しない。
- `canceled_completed`：対応する依頼中数量が必要。残数と依頼中数量を減らし、取消数を増やす。
- 同じ`event_key`・同じpayloadは再送として作用を加えない。キー同じ・payload違いは競合として停止。同じ注文の異なるキーは独立イベント。
- 毎回 `purchased = remaining + sent + canceled`、`0 <= pending_cancel <= remaining`。1イベントに複数商品があり途中で失敗すると、そのイベント全体を適用しない。

The array order is the declared arrival order. A request reserves pending units but does not cancel them. Completion consumes only requested remaining units. Partially canceled variants can ship their uncanceled remainder. Identical same-key resends are idempotent; conflicting payloads stop. Every accepted or ignored event saves a quantity-conserving snapshot. A failed event is atomic and leaves the preceding state intact. These are declared synthetic application rules, **not claims about Mercari payload fields, IDs, headers, permitted real cancellation operations, or real API behavior**.

## 自分のアプリへ使う前に / Before using it for your app

自分のアプリが実payloadをこの形式へ正規化するadapterを別途実装してください。合成event keyはMercariの実識別子ではありません。実APIの型・権限・状態遷移・再送・永続化・到着順を現在の公式仕様と権限あるSandboxで検証する必要があります。終了0、架空例の全合格、ZIP取得は互換認定・移行完了・実導入を意味しません。

**Your app must normalize its own actual payloads through a separately implemented adapter.** Verify that adapter, permissions, persistence, resend handling and transitions using current official documentation and an authorized Sandbox. This tool neither implements nor certifies a real API adapter.

原例：同じ無料パックの [`../fixtures.json`](../fixtures.json)（6つの架空最終状態）。数量・複数商品・部分取消・分割発送・再送から、この時間順検査を作成。旧messagesのnullは時間順数量処理の対象外として元の検査に残しています。元のscannerとverify_fixtures.pyは変更していません。

Current official reference: [Mercari Shops API](https://api.mercari-shops.com/docs/index.html). Original final-state examples: [public fixtures.json](https://github.com/tomoka-uzumaki-ai/shops-csv-readiness-jp/blob/x4-source-audit-v0.1.0/order-api-audit/fixtures.json), baseline package checked 2026-10-05. No new live API compatibility claim is made on 2026-10-09.

`LICENSE.txt` applies to newly included code, fictional replay inputs and instructions to the extent of the publisher's rights. Original reference material retains its existing notices; Shopify/Mercari documentation is linked, not relicensed. See `SOURCE_POINTERS.json` and `SHA256SUMS`.
