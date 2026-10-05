#!/usr/bin/env python3
"""Private normalized application-contract examples; never calls Mercari API.
These are NOT API response schemas, a migration adapter, or a compatibility test.
"""
import json
from pathlib import Path


def inspect(case):
    issues=[]; kind=case['kind']; d=case['input']
    if kind in ('quantity','multi_product','split_shipping'):
        products=d['products']; ids=[p['variant_key'] for p in products]
        if len(set(ids))!=len(ids): issues.append('duplicate_variant_line')
        for p in products:
            buckets=[p['remaining'],p['sent'],p['canceled']]
            if min(buckets+[p['purchased']])<0 or sum(buckets)!=p['purchased']:
                issues.append('quantity_conservation')
        if kind=='multi_product' and d['application_order_count']!=1:
            issues.append('purchase_units_miscounted_as_orders')
        if kind=='split_shipping':
            shipment_ids=[s['shipment_key'] for s in d['shipments']]
            if len(set(shipment_ids))!=len(shipment_ids):issues.append('duplicate_shipment_key')
            if d['application_marks_all_complete'] and any(p['remaining'] for p in products):
                issues.append('premature_order_completion')
    elif kind=='partial_cancel':
        if d['attempt_partial'] and not d['isPartialCancelable']:
            issues.append('partial_cancel_not_permitted')
        if d['application_marks_canceled'] and d['cancellation_status']=='CANCELING':
            issues.append('async_request_not_completed')
    elif kind=='message':
        if d['legacy_messages'] is None and d['application_treats_no_history']:
            issues.append('null_does_not_prove_no_history')
    elif kind=='webhook':
        events=d['events']; unique={e['synthetic_event_key'] for e in events}
        if d['processed_effects']!=len(unique):issues.append('replay_or_distinct_event_lost')
    else:raise ValueError('unsupported kind')
    return sorted(set(issues))


def main():
    root=Path(__file__).parent;cases=json.loads((root/'fixtures.json').read_text())['cases'];results=[]
    for c in cases:
        observed=inspect(c)
        assert observed==sorted(c['expected_issues']), (c['id'], observed)
        repaired={'kind':c['kind'],'input':c['repaired_input']}
        assert inspect(repaired)==[], c['id']+' repaired example'
        results.append({'id':c['id'],'caught':observed,'repaired_example_pass':True})
    assert len(results)==6
    out={'synthetic':True,'network_calls':0,'actual_api_compatibility_verified':False,'normalization_adapter_verified':False,'six_cases':results,'all_pass':True}
    (root/'fixture-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'all_pass':True,'cases':len(results),'network_calls':0}))
if __name__=='__main__':main()
