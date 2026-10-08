#!/usr/bin/env python3
"""Replay normalized synthetic events; Python 3.9+, no network calls."""
import argparse
import copy
import json
import re
import sys
from pathlib import Path

MAX_BYTES = 1048576
MAX_EVENTS = 500
MAX_QUANTITY = 1000000
ALIAS = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

class ContractError(ValueError):
    pass

def exact(obj, keys):
    if not isinstance(obj, dict) or set(obj) != set(keys):
        raise ContractError("Missing or unsupported fields")

def alias(value):
    if not isinstance(value, str) or not ALIAS.fullmatch(value):
        raise ContractError("Use a 1–64 character ASCII alias, not real IDs or customer data")

def quantity(value):
    if type(value) is not int or not 1 <= value <= MAX_QUANTITY:
        raise ContractError("Quantity must be a whole number from 1 to 1,000,000")

def validate(document):
    exact(document, ["schema", "synthetic", "sequence", "events"])
    if document["schema"] != "normalized-order-events-v1" or document["synthetic"] is not True or document["sequence"] != "declared_arrival_order":
        raise ContractError("Only the declared-arrival synthetic schema is accepted")
    events = document["events"]
    if not isinstance(events, list) or not 1 <= len(events) <= MAX_EVENTS:
        raise ContractError("Use 1–500 events")
    for event in events:
        exact(event, ["event_key", "kind", "order_alias", "items"])
        alias(event["event_key"])
        alias(event["order_alias"])
        if event["kind"] not in ["order_created", "shipment", "cancel_requested", "canceled_completed"]:
            raise ContractError("Unknown event kind")
        if not isinstance(event["items"], list) or not 1 <= len(event["items"]) <= 100:
            raise ContractError("Use 1–100 variant items per event")
        variants = set()
        for item in event["items"]:
            exact(item, ["variant_alias", "quantity"])
            alias(item["variant_alias"])
            quantity(item["quantity"])
            if item["variant_alias"] in variants:
                raise ContractError("Duplicate variant in one event")
            variants.add(item["variant_alias"])
    return document

def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ContractError("Duplicate JSON object field")
        obj[key] = value
    return obj

def load(path):
    source = Path(path)
    if source.is_symlink() or not source.is_file():
        raise ContractError("Input must be a regular file, not a symlink")
    with source.open("rb") as handle:
        data = handle.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ContractError("Input exceeds 1 MiB")
    try:
        return validate(json.loads(data.decode("utf-8-sig"), object_pairs_hook=unique_object))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ContractError("Input must be valid UTF-8 JSON") from exc

def snapshot(orders):
    result = copy.deepcopy(orders)
    for order in result.values():
        total = {key: sum(v[key] for v in order["variants"].values()) for key in ["purchased", "remaining", "sent", "canceled", "pending_cancel"]}
        for variant in order["variants"].values():
            if variant["purchased"] != variant["remaining"] + variant["sent"] + variant["canceled"] or not 0 <= variant["pending_cancel"] <= variant["remaining"]:
                raise ContractError("Quantity conservation failed")
        order["totals"] = total
        order["resolved"] = total["remaining"] == 0
    return result

def replay(document):
    validate(document)
    orders, seen, timeline = {}, {}, []
    for position, event in enumerate(document["events"], 1):
        key = event["event_key"]
        normalized = json.dumps(event, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        try:
            if key in seen:
                if seen[key] != normalized:
                    raise ContractError("Same event_key has a different payload")
                timeline.append({"position": position, "event_key": key, "effect": "duplicate_ignored", "snapshot": snapshot(orders)})
                continue
            candidate = copy.deepcopy(orders)
            order_key = event["order_alias"]
            if event["kind"] == "order_created":
                if order_key in candidate:
                    raise ContractError("Order already exists; only same-key identical resend is idempotent")
                if len(candidate) >= 100 or sum(len(o["variants"]) for o in candidate.values()) + len(event["items"]) > 1000:
                    raise ContractError("Snapshot resource limit: 100 orders / 1000 total variants")
                candidate[order_key] = {"variants": {item["variant_alias"]: {"purchased": item["quantity"], "remaining": item["quantity"], "sent": 0, "canceled": 0, "pending_cancel": 0} for item in event["items"]}}
            else:
                if order_key not in candidate:
                    raise ContractError("Event arrived before order_created")
                variants = candidate[order_key]["variants"]
                for item in event["items"]:
                    variant_key, amount = item["variant_alias"], item["quantity"]
                    if variant_key not in variants:
                        raise ContractError("Unknown variant")
                    v = variants[variant_key]
                    if event["kind"] == "shipment":
                        if v["canceled"] and v["remaining"] == 0:
                            raise ContractError("Shipment after full cancellation completion for this variant")
                        if amount > v["remaining"] - v["pending_cancel"]:
                            raise ContractError("Shipment exceeds available unrequested quantity")
                        v["remaining"] -= amount
                        v["sent"] += amount
                    elif event["kind"] == "cancel_requested":
                        if amount > v["remaining"] - v["pending_cancel"]:
                            raise ContractError("Cancellation request exceeds available quantity")
                        v["pending_cancel"] += amount
                    else:
                        if amount > v["pending_cancel"] or amount > v["remaining"]:
                            raise ContractError("Cancellation completion exceeds requested remaining quantity")
                        v["remaining"] -= amount
                        v["pending_cancel"] -= amount
                        v["canceled"] += amount
            state = snapshot(candidate)
            orders = candidate
            seen[key] = normalized
            timeline.append({"position": position, "event_key": key, "effect": "accepted", "snapshot": state})
        except ContractError as exc:
            return {"schema": "synthetic-event-replay-report-v1", "status": "stopped", "failed_position": position, "failed_event_key": key, "error": str(exc), "timeline": timeline, "final_snapshot": snapshot(orders), "compatibility": "unconfirmed"}
    return {"schema": "synthetic-event-replay-report-v1", "status": "accepted_synthetic_contract", "timeline": timeline, "final_snapshot": snapshot(orders), "compatibility": "unconfirmed", "limits": "Declared arrival order; normalized aliases only. Not Mercari fields/IDs, not an API adapter, and not real API or production certification."}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Normalized synthetic UTF-8 JSON")
    parser.add_argument("--output", required=True, help="New report path; existing paths are never overwritten")
    args = parser.parse_args(argv)
    target = Path(args.output)
    try:
        if target.is_symlink() or target.exists():
            raise ContractError("Output already exists; choose a new path")
        document = load(args.input)
        report = replay(document)
        # Exclusive creation prevents replacing source or a concurrent writer's file.
        with target.open("x", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        print(json.dumps({"status": report["status"], "report": str(target), "compatibility": "unconfirmed"}, ensure_ascii=False))
        return 0 if report["status"] == "accepted_synthetic_contract" else 2
    except (ContractError, OSError) as exc:
        print("Unconfirmed: " + str(exc), file=sys.stderr)
        return 3

if __name__ == "__main__":
    sys.exit(main())
