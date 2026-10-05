#!/usr/bin/env python3
"""Find candidate legacy Mercari Shops order API references in local source files.

This is a text audit, not a GraphQL parser or an API compatibility verdict.
No files are uploaded, modified, or retained.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

EXTENSIONS = {".graphql", ".gql", ".js", ".jsx", ".ts", ".tsx", ".py", ".php", ".go", ".rb", ".java", ".json", ".yaml", ".yml"}
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", ".next", "coverage", "__pycache__"}
MAX_FILE_BYTES = 1_000_000
MAX_FILES = 5_000

# Exact API names are high-signal. `order`/`orders` are too generic in ordinary
# application code, so their query check is restricted to GraphQL documents.
RULES = (
    ("cancelOrder", r"\bcancelOrder\b", "複数個購入時にFAILED_PRECONDITION。cancelOrderTransactionまたは条件付きのcancelOrderProductsを確認"),
    ("completeOrder", r"\bcompleteOrder\b", "旧Orderの1購入単位のみ完了。createOrderShipping→completeOrderShippingを確認"),
    ("updateShippingTrackingCode", r"\bupdateShippingTrackingCode\b", "旧APIには対象・状態制限。updateOrderShippingTrackingCodeを確認"),
    ("addTransactionMessage", r"\baddTransactionMessage\b", "旧メッセージAPI。現行の問い合わせAPIと移行要件を原典で確認"),
    ("addOrderTransactionMessage", r"\baddOrderTransactionMessage\b", "問い合わせAPIへの移行候補。注文APIの期限と別に2027年1月中旬予定を原典確認"),
    ("legacy_message_webhook", r"\b(?:order_transaction_message_created|transactionmessage_created|transaction_message_created|ORDER_TRANSACTION_MESSAGE_CREATED|TRANSACTION_MESSAGE_CREATED)\b", "旧メッセージWebhook。INQUIRY_MESSAGE_CREATEDへの移行候補、2027年1月中旬予定"),
    ("qualified_legacy_messages", r"\b(?:Order|OrderTransaction)\.messages\b", "旧messages取得。nullを履歴なしと判断せずinquiries/inquiryMessagesへ"),
    ("debugCreateOrder", r"\bdebugCreateOrder\b", "単品だけの旧テスト注文。複数個のSandboxテストを確認"),
    ("legacy_order_webhook", r"\b(?:order_created|order_paid|order_canceled|ORDER_CREATED|ORDER_PAID|ORDER_CANCELED)\b", "旧Webhookは購入単位で複数通知の可能性。取引単位のWebhookと重複処理を確認"),
)
GRAPHQL_RULES = (
    ("orders_query", r"\borders\s*(?:\(|\{)", "旧ordersは1商品×1個を1件として返す。orderTransactionsへの移行を確認"),
    ("order_query", r"\border\s*(?:\(|\{)", "旧orderを使用。orderTransactionへの移行を確認"),
)


def source_files(root: Path):
    if root.is_file():
        if root.suffix.lower() in EXTENSIONS:
            yield root
        return
    count = 0
    for directory, children, filenames in os.walk(root):
        children[:] = [child for child in children if child not in SKIP_DIRS]
        for filename in filenames:
            path = Path(directory) / filename
            if path.is_symlink() or path.suffix.lower() not in EXTENSIONS:
                continue
            count += 1
            if count > MAX_FILES:
                raise RuntimeError(f"{MAX_FILES}ファイルを超えたため中断。対象ディレクトリを絞って再実行してください。")
            yield path


def scan(root: Path):
    findings = []
    files_read = 0
    skipped_large = 0
    unreadable = 0
    for path in source_files(root):
        if path.stat().st_size > MAX_FILE_BYTES:
            skipped_large += 1
            continue
        try:
            lines = path.read_text(encoding="utf-8-sig", errors="strict").splitlines()
        except (UnicodeError, OSError):
            unreadable += 1
            continue
        files_read += 1
        rules = RULES + (GRAPHQL_RULES if path.suffix.lower() in {".graphql", ".gql"} else ())
        # Contextual text candidate only: a GraphQL document may contain an
        # unrelated messages field. Human scope review is explicitly required.
        has_order_context = bool(re.search(r"\b(?:order|orders|orderTransaction|orderTransactions)\s*(?:\(|\{)|\bon\s+(?:Order|OrderTransaction)\b", "\n".join(lines)))
        for line_number, line in enumerate(lines, start=1):
            if path.suffix.lower() in {".graphql", ".gql"} and line.lstrip().startswith("#"):
                continue
            if path.suffix.lower() in {".graphql", ".gql"} and has_order_context and re.search(r"\bmessages\s*(?:\(|\{)", line):
                findings.append({"file": str(path), "line": line_number, "rule": "graphql_order_messages_candidate", "action": "Order関連文書内のmessages候補。別リソースの場合は誤検出。選択範囲と問い合わせ移行期限を手動照合", "confidence": "contextual_candidate_not_parser"})
            for rule_id, pattern, action in rules:
                if re.search(pattern, line):
                    findings.append({"file": str(path), "line": line_number, "rule": rule_id, "action": action})
    return {"scan_status": "incomplete" if skipped_large or unreadable or not files_read else "complete", "scanned_files": files_read, "skipped_large_files": skipped_large, "unreadable_files": unreadable, "findings": findings}


def main() -> int:
    parser = argparse.ArgumentParser(description="メルカリShops注文APIの旧参照をローカルで候補抽出")
    parser.add_argument("path", type=Path, help="自分が権限を持つソースファイルかディレクトリ")
    parser.add_argument("--json", action="store_true", help="JSONで出力")
    args = parser.parse_args()
    selected = args.path.expanduser()
    if selected.is_symlink():
        parser.error("シンボリックリンクをルートには指定できません。権限ある実ファイルを指定してください。")
    root = selected.resolve()
    if not root.exists():
        parser.error(f"存在しません: {root}")
    try:
        report = scan(root)
    except (OSError, RuntimeError) as exc:
        print(f"検査できません: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"検査状態 {report['scan_status']} / 読取済み {report['scanned_files']} / サイズ省略 {report['skipped_large_files']} / UTF-8不備・読取不可 {report['unreadable_files']}")
        for item in report["findings"]:
            print(f"{item['file']}:{item['line']} [{item['rule']}] {item['action']}")
        print(f"候補 {len(report['findings'])}件。0件でもAPI互換性を保証しません。コメント・未使用コードの誤検出と生成コード外の見落としがあります。")
    if report["scan_status"] == "incomplete":
        return 3
    return 2 if report["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
