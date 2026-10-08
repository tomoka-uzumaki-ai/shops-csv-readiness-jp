'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),S=require('./logic.js');
class Element{constructor(value=''){this.value=value;this.textContent='';this.disabled=false;this.files=[];this.events={};}addEventListener(k,f){this.events[k]=f;}async fire(k='click'){return this.events[k]();}}
const ids=['model','expected','model-status','model-file','expected-file','country','subtotal','weight','single-output','batch-output','save-cart','save-json','save-csv','save-baseline','sample','validate','check','batch'];
const els=Object.fromEntries(ids.map(id=>[id,new Element()]));els.country.value='JP';els.subtotal.value='5000';els.weight.value='500';let saved=[];
const sample=fs.readFileSync(__dirname+'/sample.json','utf8');
const context={ShippingRules:S,TextEncoder,Blob,setTimeout:fn=>fn(),URL:{createObjectURL:blob=>{saved.push(blob);return 'blob:test';},revokeObjectURL:()=>{}},fetch:async()=>({ok:true,text:async()=>sample}),document:{documentElement:{lang:'ja'},getElementById:id=>els[id],createElement:()=>({click:()=>{}})}};
vm.runInNewContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
(async()=>{
 await els.sample.fire();await els.check.fire();assert.equal(els['save-cart'].disabled,false);assert.deepEqual(JSON.parse(els['single-output'].textContent).matches.map(x=>x.id),['free','express']);
 await els['save-cart'].fire();assert.equal(JSON.parse(await saved.at(-1).text()).cart.subtotal_minor,5000);
 await els.batch.fire();assert.equal(JSON.parse(els['batch-output'].textContent).status,'unconfirmed');await els['save-csv'].fire();assert.ok((await saved.at(-1).text()).startsWith('case,country'));
 els.model.value='{}';await els.model.fire('input');assert.equal(els['save-cart'].disabled,true);assert.equal(els['save-json'].disabled,true);await els.validate.fire();await els.check.fire();assert.equal(els['save-cart'].disabled,true);assert.ok(els['single-output'].textContent.includes('未確認'));
 await els.sample.fire();await els.batch.fire();els.expected.value='{broken';await els.expected.fire('input');assert.equal(els['save-json'].disabled,true);await els.batch.fire();assert.equal(els['save-json'].disabled,true);
 els.expected.value='';let usd=JSON.parse(sample);usd.currency='USD';els.model.value=JSON.stringify(usd);await els.model.fire('input');await els.validate.fire();els.subtotal.value='49.99';await els.check.fire();assert.equal(JSON.parse(els['single-output'].textContent).cart.subtotal_minor,4999);els.subtotal.value='49.999';await els.subtotal.fire('input');await els.check.fire();assert.equal(els['save-cart'].disabled,true);
 els['model-file'].files=[{size:2,text:async()=> '{}'}];await els['model-file'].fire('change');assert.equal(els['save-json'].disabled,true);await els.check.fire();assert.equal(els['save-cart'].disabled,true);
 els['model-file'].files=[{size:sample.length,text:async()=>sample}];await els['model-file'].fire('change');assert.equal(JSON.parse(els.model.value).currency,'JPY');els.subtotal.value='5000';await els.check.fire();assert.equal(els['save-cart'].disabled,false);
 let resolve;els['model-file'].files=[{size:sample.length,text:()=>new Promise(r=>resolve=r)}];let importing=els['model-file'].fire('change');els.model.value='{}';await els.model.fire('input');resolve(sample);await importing;assert.equal(els.model.value,'{}');await els.check.fire();assert.equal(els['save-cart'].disabled,true);
 console.log(JSON.stringify({status:'passed',checks:10,route:'DOM event harness, actual saved JSON/CSV blobs; browser visual QA remains parent'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
