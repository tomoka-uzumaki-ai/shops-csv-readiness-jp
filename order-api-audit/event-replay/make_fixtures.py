"""Generate fictional arrival sequences; no real payload conversion."""
import copy
import json
from pathlib import Path

def event(key, kind, items, order='order-demo'):
    return {'event_key':key,'kind':kind,'order_alias':order,'items':[{'variant_alias':v,'quantity':n} for v,n in items]}
create=event('created','order_created',[('sku-a',3),('sku-b',2)])
ship=event('ship-a-1','shipment',[('sku-a',1)])
request=event('request-a','cancel_requested',[('sku-a',2)])
cancel=event('complete-a','canceled_completed',[('sku-a',2)])
fixtures={
 'partial-cancel-then-ship': [event('create-partial','order_created',[('sku-a',3)]),event('request-one','cancel_requested',[('sku-a',1)]),event('complete-one','canceled_completed',[('sku-a',1)]),event('ship-two','shipment',[('sku-a',2)])],
 'accepted-mixed': [create,ship,request,cancel,event('ship-b-1','shipment',[('sku-b',1)]),event('ship-b-2','shipment',[('sku-b',1)])],
 'identical-resend': [create,ship,copy.deepcopy(ship),event('ship-a-2','shipment',[('sku-a',1)])],
 'request-pending': [create,ship,request],
 'conflicting-resend': [create,ship,event('ship-a-1','shipment',[('sku-a',2)])],
 'before-created': [ship,create],
 'after-canceled': [event('create-full','order_created',[('sku-a',1)]),event('request-full','cancel_requested',[('sku-a',1)]),event('complete-full','canceled_completed',[('sku-a',1)]),event('ship-after','shipment',[('sku-a',1)])],
 'over-shipment': [create,event('too-many','shipment',[('sku-a',4)])],
 'completion-without-request': [create,cancel],
 'atomic-mixed-failure': [create,event('mixed-fail','shipment',[('sku-a',1),('sku-b',3)])]
}
for name,events in fixtures.items():
    (Path(__file__).parent/'fixtures'/(name+'.json')).write_text(json.dumps({'schema':'normalized-order-events-v1','synthetic':True,'sequence':'declared_arrival_order','events':events},indent=2)+'\n')
