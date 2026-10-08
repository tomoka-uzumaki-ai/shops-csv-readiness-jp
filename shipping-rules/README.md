# 配送条件のローカル確認 / Entered shipping conditions

無料の2つの仕事：U08は1カートの全該当送料を表示。U10は境界ケースを生成・保存し、旧モデルの期待結果を変更後モデルへ再生。翻訳版は同じ機能です。

Open index.html (Japanese) or english.html (English). If your browser blocks sample loading from file://, import sample.json using the file picker. The model and expected files are processed locally. This tool makes no Shopify API calls and does not send original data. The sample is fictional.

1. `sample.json`の形式で本人の正規化した条件を作る。1通貨JPYまたはUSD。金額は整数の最小通貨単位（JPY円、USDセント）、重量は整数g。min/max両端を含む手動モデル、max:nullは上限なし。
2. モデルを検証する。国コード・小計（JPY円整数/USDドル小数2桁以内）・重量を入力し、該当送料を全件表示・1カートJSON保存。0件はgap、複数件はmultiple_options。複数候補は合法な選択肢にもなる。最安・無料を選ばない。
3. 境界実行でJSON/CSVを保存。各有限min/maxの-1/0/+1最小通貨単位またはg、他方はそのルールのmin。全入力国を対象、最大200ケース、未生成数・戦略・網羅限界も出力。全組合せや全配送国を保証しない。
4. 元モデルで「生成ベースライン保存」、送料などを変えたモデルを検証し直し、元ベースラインを期待JSONへ入れて比較。**元のカート**でIDと価格を比較する。生成ベースラインは1 MiB以内へケースを制限し、省略数を開示する。自動生成ベースライン一致は正しい設定の証明ではない。本人の独立判断による期待ファイルはdeclaration_kind:owner_declaredと根拠を記入。期待ファイルなしはunconfirmed。

U08 checks one cart. U10 creates a bounded boundary suite and replays saved old cases against a changed model. Every matching option is returned. Multiple options can be valid. Generated baseline exports stay within 1 MiB, disclosing any omitted cases. Generated baselines are not independent proof of correctness; owner-declared expectations are explicitly distinguished. No expectation means unconfirmed, never a pass.

Limits: JSON maximum 1 MiB; 50 zones; 100 rates in total; 200 cases. Money 0–1,000,000,000 minor units, weight 0–10,000,000 whole grams. Unique short ASCII IDs. Unique uppercase two-letter country codes across zones; codes are checked only for format, not real sales eligibility. Model and expected imports validate completely before replacing accepted data. Any edit or import attempt invalidates downloadable old outputs; asynchronous stale imports are ignored.

Scope: one manually normalized shipping group, not live Shopify checkout. Excludes profile combination, carrier/app rates, discounts, taxes, currency conversion, regional subconditions and market activation. None of the results certify country eligibility or what Shopify will actually charge. Use current official documentation and an authorized checkout test for those outcomes.

Official source checked **2026-10-09**: [Shopify — setting up shipping zones and rates](https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates/setting-up-shipping-rates). It documents zones, amount/weight rates, coverage gaps, multiple checkout options and active market requirements. Some stores move to shipping options by market; this model does not identify a store's setup. Inclusive semantics are explicitly this local model's contract, not a universal live-system inference.

```sh
node test_logic.cjs
node test_app.cjs
```

Source is free, per LICENSE.txt. Original business settings remain the owner's responsibility. Real checkout compatibility must be verified separately.
