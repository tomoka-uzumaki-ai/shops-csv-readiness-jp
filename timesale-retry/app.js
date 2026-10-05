'use strict';
const $=id=>document.getElementById(id);let revision=0;
function invalidate(){revision++;$('result').replaceChildren();$('result').hidden=true;$('compare').disabled=!($('original').files.length&&$('edited').files.length);$('state').textContent=$('compare').disabled?'2ファイルを選ぶと比較できます。':'比較前に元ファイルが設定履歴からの原本であることを確認してください。';}
for(const id of ['original','edited','encoding'])$(id).addEventListener('change',invalidate);
$('clear').addEventListener('click',()=>{$('original').value='';$('edited').value='';invalidate();});
function append(tag,text){const el=document.createElement(tag);el.textContent=text;$('result').append(el);}
function render(answer,mode){
  $('result').replaceChildren();$('result').hidden=false;$('result').dataset.pass=String(answer.pass);
  append('p',mode==='demo'?'架空例の結果（自分のファイルは比較していません）':'選択した2ファイルの結果');
  append('h2',answer.pass?'保全差分は一致。価格・日時などは未確認です。':'再提出を保留：元ファイルとの違いを確認してください。');
  if(answer.rows!==undefined)append('p',`元${answer.rows}行／成功${answer.success}行／失敗${answer.failed}行。入力欄を変えた失敗行は${answer.edits.length}行。`);
  for(const issue of answer.issues.slice(0,25))append('p',`${issue.row?issue.row+'行目：':''}${issue.message}${issue.fields?' 対象欄：'+issue.fields.join('、'):''}`);
  if(answer.issues.length>25)append('p',`表示は最初の25件です。差分${answer.issues.length}件を元CSVで確認してください。`);
  if(answer.pass){if(!answer.edits.length)append('p','変更なし：対象入力欄の変更はありません。失敗原因の解消は確認できていません。');for(const edit of answer.edits.slice(0,25))append('p',`${edit.row}行目の入力欄を変更：${edit.fields.join('、')}`);append('p','失敗行の入力内容が正しくなったか、この比較だけでは分かりません。最新の公式条件・実管理画面・設定後の結果を確認してください。');}
  $('state').textContent='比較終了。ファイルの送信・書換え・アップロードはしていません。';
}
$('compare').addEventListener('click',async()=>{
  const before=$('original').files[0],after=$('edited').files[0];if(!before||!after)return;
  const current=++revision;$('result').hidden=true;$('state').textContent='端末内で比較中…';
  try{
    if(before.size>12000000||after.size>12000000)throw Error('各12MB以下のCSVを選んでください。');
    const encoding=$('encoding').value;
    const texts=await Promise.all([before,after].map(async f=>new TextDecoder(encoding,{fatal:true}).decode(await f.arrayBuffer())));
    if(current!==revision)return;
    render(RetryCheck.compare(...texts),'files');
  }catch(e){if(current!==revision)return;render({pass:false,issues:[{message:e instanceof TypeError?'文字コードを確認し、2ファイルを選び直してください。':e.message}],edits:[]},'files');}
});
const demoHeader='処理フラグ,商品ID,商品名,現在価格,値引き後の表示価格,値引き開始日時,値引き終了日時,処理結果,エラー理由\n';
const demoBefore=demoHeader+'CREATE,fictional-A,架空A,1000,800,2026/10/10 12:00,2026/10/11 12:00,# 成功,\nCREATE,fictional-B,架空B,1000,100,2026/10/10 12:00,2026/10/11 12:00,失敗,架空の価格条件エラー\n';
for(const [id,bad]of [['demo-ok',false],['demo-bad',true]])$(id).addEventListener('click',()=>{revision++;const after=demoBefore.replace('架空B,1000,100,','架空B,1000,700,');render(RetryCheck.compare(demoBefore,bad?after.replace('架空A,1000,800,','架空A,1000,700,'):after),'demo');});
