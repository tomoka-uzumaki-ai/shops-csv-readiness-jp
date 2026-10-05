(function(root){
  'use strict';
  const required=['商品ID','処理フラグ','処理結果','エラー理由','値引き後の表示価格','値引き開始日時','値引き終了日時'];
  const editable=new Set(['値引き後の表示価格','値引き開始日時','値引き終了日時']);
  function parseCsv(text){
    text=text.replace(/^\uFEFF/,'');
    const rows=[];let row=[],field='',state='start';
    function finishField(){row.push(field);field='';state='start';}
    function finishRow(){finishField();rows.push(row);row=[];if(rows.length>50001)throw Error('50,000行を超えるCSVは扱いません。');}
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(state==='quoted'){
        if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else state='after';}
        else field+=c;
      }else if(c===','){finishField();}
      else if(c==='\n'||c==='\r'){finishRow();if(c==='\r'&&text[i+1]==='\n')i++;}
      else if(c==='"'){if(state!=='start')throw Error('引用符の構造が不正です。');state='quoted';}
      else {if(state==='after')throw Error('閉じた引用符の後に余分な文字があります。');field+=c;state='plain';}
    }
    if(state==='quoted')throw Error('引用符が閉じていません。');
    if(row.length||field!==''||state!=='start'||text.endsWith(','))finishRow();
    return rows;
  }
  function table(text){
    const rows=parseCsv(text),header=rows.shift();
    if(!header||new Set(header).size!==header.length||header.some(h=>h===''))throw Error('見出しが空欄または重複しています。');
    if(required.some(h=>!header.includes(h)))throw Error('商品ID・処理フラグ・結果・理由・値引き価格・開始・終了の列が必要です。');
    if(!rows.length)throw Error('データ行がありません。');
    const seen=new Set();
    const data=rows.map((row,i)=>{
      if(row.length!==header.length)throw Error(`${i+2}行目の列数または空行を確認してください。`);
      const item=Object.fromEntries(header.map((h,j)=>[h,row[j]]));
      if(!item['商品ID']||seen.has(item['商品ID']))throw Error(`${i+2}行目の商品IDが空欄または重複しています。`);
      seen.add(item['商品ID']);
      if(item['処理フラグ']!=='CREATE')throw Error('CREATEの登録エラーCSV専用です。更新・削除は比較しません。');
      if(!['# 成功','失敗'].includes(item['処理結果']))throw Error(`${i+2}行目の処理結果を認識できません。元ファイルを確認してください。`);
      return item;
    });
    return {header,data};
  }
  function compare(beforeText,afterText){
    let a,b;try{a=table(beforeText);b=table(afterText);}catch(e){return {pass:false,issues:[{kind:'structure',message:e.message}],edits:[]};}
    const issues=[],edits=[];
    if(JSON.stringify(a.header)!==JSON.stringify(b.header))issues.push({kind:'headers',message:'列名または列の順番が変わっています。'});
    if(JSON.stringify(a.data.map(r=>r['商品ID']))!==JSON.stringify(b.data.map(r=>r['商品ID'])))issues.push({kind:'rows',message:'行の削除・追加・並べ替え、または商品IDの変更があります。'});
    if(!issues.length)a.data.forEach((row,i)=>{
      const changed=a.header.filter(h=>row[h]!==b.data[i][h]);if(!changed.length)return;
      if(row['処理結果']==='# 成功')issues.push({kind:'success',row:i+2,fields:changed,message:'成功行が変更されています。'});
      else if(changed.some(h=>!editable.has(h)))issues.push({kind:'immutable',row:i+2,fields:changed,message:'失敗行の編集不可欄が変更されています。'});
      else edits.push({row:i+2,fields:changed});
    });
    return {pass:issues.length===0,rows:a.data.length,success:a.data.filter(r=>r['処理結果']==='# 成功').length,failed:a.data.filter(r=>r['処理結果']==='失敗').length,edits,issues};
  }
  const api={parseCsv,table,compare};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RetryCheck=api;
})(typeof window==='undefined'?globalThis:window);
