/* Locally entered shipping model. No API, money arithmetic uses integer minor units. */
(function(root){
'use strict';
const MAX=1048576, CAP=200, moneyLimit=1000000000, weightLimit=10000000;
const fail=m=>{throw new Error(m);};
const exact=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail('Invalid object / unsupported field');};
const integer=(v,max)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail('Expected bounded nonnegative integer');};
const alias=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v))fail('Use a short ASCII alias');};
function parse(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX)fail('JSON exceeds 1 MiB');return JSON.parse(text);}
function bounds(v,max){exact(v,['min','max']);integer(v.min,max);if(v.max!==null){integer(v.max,max);if(v.max<v.min)fail('Maximum is below minimum');}}
function validateModel(x){
 exact(x,['schema','currency','boundary_semantics','zones']);
 if(x.schema!=='shipping-local-v1'||!['JPY','USD'].includes(x.currency)||x.boundary_semantics!=='inclusive')fail('Unsupported schema, currency or boundary semantics');
 if(!Array.isArray(x.zones)||!x.zones.length||x.zones.length>50)fail('Use 1–50 zones');
 const zoneIds=new Set(),rateIds=new Set(),countryIds=new Set();let total=0;
 x.zones.forEach(z=>{exact(z,['id','countries','rates']);alias(z.id);if(zoneIds.has(z.id))fail('Duplicate zone ID');zoneIds.add(z.id);
 if(!Array.isArray(z.countries)||!z.countries.length||z.countries.length>250)fail('Use 1–250 country codes per zone');
 z.countries.forEach(c=>{if(typeof c!=='string'||!/^[A-Z]{2}$/.test(c)||countryIds.has(c))fail('Country codes must be unique uppercase pairs across zones');countryIds.add(c);});
 if(!Array.isArray(z.rates)||!z.rates.length)fail('Zone has no rates');
 z.rates.forEach(r=>{exact(r,['id','name','price_minor','subtotal_minor','weight_g']);alias(r.id);if(rateIds.has(r.id))fail('Duplicate rate ID');rateIds.add(r.id);
 if(typeof r.name!=='string'||!r.name.trim()||r.name.length>80||/[\x00-\x1f]/.test(r.name))fail('Rate name must be 1–80 printable characters');integer(r.price_minor,moneyLimit);bounds(r.subtotal_minor,moneyLimit);bounds(r.weight_g,weightLimit);if(++total>100)fail('Maximum 100 rates');});});
 return JSON.parse(JSON.stringify(x));
}
function validateCart(c){exact(c,['country','subtotal_minor','weight_g']);if(typeof c.country!=='string'||!/^[A-Z]{2}$/.test(c.country))fail('Country must be an uppercase two-letter code');integer(c.subtotal_minor,moneyLimit);integer(c.weight_g,weightLimit);return c;}
const contains=(b,n)=>n>=b.min&&(b.max===null||n<=b.max);
function check(model,cart){validateCart(cart);let zones=model.zones.filter(z=>z.countries.includes(cart.country));let matches=zones.flatMap(z=>z.rates.filter(r=>contains(r.subtotal_minor,cart.subtotal_minor)&&contains(r.weight_g,cart.weight_g)).map(r=>({id:r.id,name:r.name,price_minor:r.price_minor,zone_id:z.id})));
 return {cart:{...cart},currency:model.currency,matches,flags:[...(zones.length?[]:['country_not_in_entered_model']),...(!matches.length?['gap']:[]),...(matches.length>1?['multiple_options']:[])],status:'entered_model_only'};
}
function scenarios(model){let rows=[],seen=new Set(),omitted=0; const add=(c,origin)=>{const key=JSON.stringify(c);if(seen.has(key))return;seen.add(key);if(rows.length>=CAP){omitted++;return;} rows.push({id:'case-'+String(rows.length+1).padStart(3,'0'),cart:c,origin});};
 model.zones.forEach(z=>z.countries.forEach(country=>z.rates.forEach(r=>{
 const anchor={country,subtotal_minor:r.subtotal_minor.min,weight_g:r.weight_g.min};add(anchor,r.id+':anchor');
 ['subtotal_minor','weight_g'].forEach(dim=>['min','max'].forEach(edge=>{let n=r[dim][edge];if(n===null)return;[-1,0,1].forEach(delta=>{let value=n+delta;if(value<0||value>(dim==='weight_g'?weightLimit:moneyLimit))return;add({...anchor,[dim]:value},r.id+':'+dim+':'+edge+':'+delta);});}));
 })));
 return {cases:rows,coverage:{generated:rows.length,omitted_unique:omitted,limit:CAP,complete_within_strategy:omitted===0,strategy:'Each finite min/max at -1, 0, +1 minor currency unit or gram; other dimension at rule minimum; all entered countries. Not exhaustive combinations.'}};
}
const rateSet=rows=>rows.map(r=>({id:r.id,price_minor:r.price_minor})).sort((a,b)=>a.id.localeCompare(b.id));
function baseline(model){const s=scenarios(model);const result={schema:'shipping-expectations-v1',currency:model.currency,declaration_kind:'generated_baseline',declaration:'Generated from entered model; review before treating as intended behavior.',coverage:{...s.coverage},cases:s.cases.map(c=>({...c,expected:rateSet(check(model,c.cart).matches)}))};let removed=0;while(new TextEncoder().encode(JSON.stringify(result,null,2)).length>MAX-512){result.cases.pop();removed++;}if(removed){result.coverage.generated=result.cases.length;result.coverage.omitted_unique+=removed;result.coverage.complete_within_strategy=false;result.coverage.strategy+=' Baseline cases additionally limited by 1 MiB UTF-8 export budget.';}return result;}
function validateExpected(x){exact(x,['schema','currency','declaration_kind','declaration','coverage','cases']);
 if(x.schema!=='shipping-expectations-v1'||!['JPY','USD'].includes(x.currency)||!['owner_declared','generated_baseline'].includes(x.declaration_kind)||typeof x.declaration!=='string'||!x.declaration.trim()||x.declaration.length>300)fail('Expected file needs currency and declaration');
 if(!Array.isArray(x.cases)||!x.cases.length||x.cases.length>CAP)fail('Expected cases must be 1–200');let ids=new Set();
 x.cases.forEach(c=>{exact(c,['id','cart','origin','expected']);alias(c.id);if(ids.has(c.id))fail('Duplicate case ID');ids.add(c.id);validateCart(c.cart);if(typeof c.origin!=='string'||c.origin.length>200)fail('Invalid case origin');if(!Array.isArray(c.expected)||c.expected.length>100)fail('Too many expected rates');let rs=new Set();c.expected.forEach(r=>{exact(r,['id','price_minor']);alias(r.id);integer(r.price_minor,moneyLimit);if(rs.has(r.id))fail('Duplicate expected rate');rs.add(r.id);});});
 if(x.coverage!==undefined){exact(x.coverage,['generated','omitted_unique','limit','complete_within_strategy','strategy']);integer(x.coverage.generated,CAP);integer(x.coverage.omitted_unique,10000000);if(x.coverage.generated!==x.cases.length||x.coverage.limit!==CAP||typeof x.coverage.complete_within_strategy!=='boolean'||typeof x.coverage.strategy!=='string'||x.coverage.strategy.length>400)fail('Invalid coverage metadata');}
 return JSON.parse(JSON.stringify(x));
}
function regression(model,expected){let s=expected?{cases:expected.cases,coverage:expected.coverage||{strategy:'Owner supplied cases; coverage unknown'}}:scenarios(model);if(expected&&expected.currency!==model.currency)fail('Expected currency differs from model');
 const rows=s.cases.map(c=>{let actual=check(model,c.cart),rates=rateSet(actual.matches),ok=expected?JSON.stringify(rates)===JSON.stringify(rateSet(c.expected)):null;return {id:c.id,origin:c.origin,...actual,expected:expected?rateSet(c.expected):null,comparison:ok===null?'unconfirmed':ok?'matches_declared_expectation':'mismatch'};});
 return {schema:'shipping-report-v1',currency:model.currency,status:!expected?'unconfirmed':rows.some(r=>r.comparison==='mismatch')?'mismatch':expected.declaration_kind==='generated_baseline'?'matches_generated_baseline':'matches_owner_declared_cases',declaration_kind:expected?expected.declaration_kind:null,coverage:s.coverage,rows,limits:'Local entered model only. Gaps and multiple options are observations; multiple options may be valid. No market eligibility, live checkout, profile combination, carrier/app rates, discount/tax or production guarantee.'};
}
function csv(report){const q=v=>'"'+String(v).replace(/"/g,'""')+'"';return ['case,country,subtotal_minor,weight_g,currency,matched_rates,flags,comparison',...report.rows.map(r=>[r.id,r.cart.country,r.cart.subtotal_minor,r.cart.weight_g,r.currency,r.matches.map(m=>m.id+':'+m.price_minor).join('|'),r.flags.join('|'),r.comparison].map(q).join(','))].join('\r\n');}
const api={parse,validateModel,validateCart,check,scenarios,baseline,validateExpected,regression,csv,MAX};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ShippingRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
