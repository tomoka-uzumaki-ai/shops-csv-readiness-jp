(function(root){
'use strict';
const fields=['値引き後の表示価格','値引き開始日時','値引き終了日時'];
function validValue(field,value){
 if(typeof value!=='string'||value.length>100)throw Error('変更値の形式・長さが不正です。');
 if(field===fields[0]){if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('変更する表示価格は0以上の整数を桁区切りなしで入力してください。');return;}
 const m=value.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/);if(!m)throw Error('変更する日時はYYYY/MM/DD HH:MM形式で入力してください。');
 const [y,mo,d,h,mi]=m.slice(1).map(Number),date=new Date(0);date.setUTCFullYear(y,mo-1,d);date.setUTCHours(h,mi,0,0);
 if(y<1||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d||date.getUTCHours()!==h||date.getUTCMinutes()!==mi)throw Error('変更する日時の月日・時刻を確認してください。');
}
function cellSpans(text){const rows=[];let cells=[],start=0,quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}if(!quoted&&(ch===','||ch==='\n'||ch==='\r')){cells.push([start,i]);if(ch===','){start=i+1;}else{rows.push(cells);cells=[];if(ch==='\r'&&text[i+1]==='\n')i++;start=i+1;}}}if(cells.length||start<text.length){cells.push([start,text.length]);rows.push(cells);}return rows;}
function editsFor(text,changes,check){
 const table=check.table(text);if(!Array.isArray(changes)||changes.length>150000)throw Error('修正指示の形式・件数が不正です。');
 const seen=new Set(),edits=[];for(const c of changes){if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==3||Object.keys(c).some(k=>!['row','field','value'].includes(k))||!Number.isInteger(c.row)||c.row<2||c.row>table.data.length+1||!fields.includes(c.field))throw Error('失敗行の許可された3欄だけを明示修正できます。');
 const key=c.row+'|'+c.field;if(seen.has(key))throw Error('同じ欄へ複数の修正指示があります。');seen.add(key);const original=table.data[c.row-2];if(original['処理結果']!=='失敗')throw Error('成功行は変更できません。');if(c.value===original[c.field])continue;validValue(c.field,c.value);edits.push({...c,col:table.header.indexOf(c.field)});}
 if(!edits.length)throw Error('変更がありません。失敗行の修正値を自分で入力してください。');
 const editedRows=new Map();for(const e of edits){if(!editedRows.has(e.row))editedRows.set(e.row,{...table.data[e.row-2]});editedRows.get(e.row)[e.field]=e.value;}const dateRows=new Set(edits.filter(e=>e.field!==fields[0]).map(e=>e.row));for(const row of dateRows){const r=editedRows.get(row);for(const field of fields.slice(1))validValue(field,r[field]);if(r[fields[1]]>=r[fields[2]])throw Error('日時を変更する行は、開始より後の終了日時が必要です。');}
 return {table,edits};
}
function applyText(text,changes,check){const {table,edits}=editsFor(text,changes,check),spans=cellSpans(text);if(spans.length!==table.data.length+1)throw Error('CSVの位置を読み取れませんでした。');const patches=edits.map(c=>{const [start,end]=spans[c.row-1][c.col];return {start,end,value:'"'+c.value+'"'};}).sort((a,b)=>a.start-b.start);const chunks=[];let cursor=0;for(const p of patches){chunks.push(text.slice(cursor,p.start),p.value);cursor=p.end;}chunks.push(text.slice(cursor));const output=chunks.join('');const compared=check.compare(text,output);if(!compared.pass)throw Error('原本の保全比較に一致しません。保存を止めました。');return {text:output,comparison:compared,edits};}
function byteOffsets(bytes,text,encoding,positions){
 if(!['utf-8','shift_jis'].includes(encoding))throw Error('UTF-8またはS-JISを選んでください。');
 const wanted=new Set(positions),offsets=new Map();let position=0,chars=0;while(position<bytes.length){if(wanted.has(chars))offsets.set(chars,position);const b=bytes[position];let width=1,units=1;if(encoding==='utf-8'){width=b<0x80?1:b<0xe0?2:b<0xf0?3:4;units=width===4?2:1;}else width=((b>=0x81&&b<=0x9f)||(b>=0xe0&&b<=0xfc))?2:1;position+=width;chars+=units;}
 if(wanted.has(chars))offsets.set(chars,position);if(chars!==text.length||position!==bytes.length||offsets.size!==wanted.size)throw Error('元ファイルの文字とバイト位置が一致しません。');return offsets;
}
function applyBytes(bytes,encoding,changes,check){
 if(!(bytes instanceof Uint8Array)||bytes.length>12000000)throw Error('元CSVは12MB以内です。');
 const text=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(bytes),made=applyText(text,changes,check),spans=cellSpans(text),positions=made.edits.flatMap(c=>spans[c.row-1][c.col]),offsets=byteOffsets(bytes,text,encoding,positions);
 const patches=made.edits.map(c=>{const [start,end]=spans[c.row-1][c.col];return {start:offsets.get(start),end:offsets.get(end),value:new TextEncoder().encode('"'+c.value+'"')};}).sort((a,b)=>a.start-b.start);
 let length=bytes.length;for(const p of patches)length+=p.value.length-(p.end-p.start);if(length>12000000)throw Error('保存CSVが12MBを超えます。元CSVの対象を分けてください。');const output=new Uint8Array(length);let read=0,write=0;for(const p of patches){output.set(bytes.subarray(read,p.start),write);write+=p.start-read;output.set(p.value,write);write+=p.value.length;read=p.end;}output.set(bytes.subarray(read),write);
 const savedText=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(output),comparison=check.compare(text,savedText);if(!comparison.pass||savedText!==made.text)throw Error('保存CSVの保全比較に一致しません。');return {bytes:output,text:savedText,comparison,edits:made.edits};
}
const api={fields,validValue,applyText,applyBytes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RetryMaker=api;
})(typeof window==='undefined'?globalThis:window);
