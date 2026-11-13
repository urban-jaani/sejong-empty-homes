/* MOIS administrative-area CSV exports. */
(function(root){
'use strict';
const source='https://jumin.mois.go.kr/statMonth.do';
const regionName=value=>String(value??'').trim().replace(/^세종(?:특별자치)?시\s+/,'');
function readCsv(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
 const fields=line=>[...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
  .map(match=>(match[1]?.replace(/""/g,'"')??match[2]).trim());
 const header=fields(lines.shift()||'');
 const columns=header.flatMap((label,index)=>{
  const match=label.match(/^(20\d{2})년\s*(\d{1,2})월\s*_?\s*(?:(?:계|전체)\s*_?\s*)?총\s*인구수$/);
  return match?[{index,month:match[1]+'-'+match[2].padStart(2,'0')}]:[];
 });
 if(!columns.length||!/^행정(?:구역|기관)(?:명)?$/.test(header[0]))throw Error('행정동별 주민등록 인구 및 세대현황 CSV 원본을 선택하세요.');
 return lines.flatMap(line=>{
  const row=fields(line),area=row[0]?.match(/^(세종(?:특별자치)?시(?:\s+.+)?)\s*\((36\d{8})\)$/);
  if(!area)return [];
  const [,name,code]=area;
  const region=regionName(name);
  if(code!=='3600000000'&&!/^[가-힣0-9]+(?:읍|면|동)$/.test(region))return [];
  return columns.flatMap(({index,month})=>{
   const value=row[index]?.replace(/,/g,'');
   return /^\d+$/.test(value??'')?[{code,name:code==='3600000000'?'세종시 전체':region,month,value:Number(value)}]:[];
  });
 });
}
function prepare(rows){
 const data=new Map();
 for(const row of rows){
  if(!/^36\d{8}$/.test(row.code)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.month)||
   typeof row.name!=='string'||!Number.isSafeInteger(row.value)||row.value<0)throw Error('주민등록 인구 자료 형식을 확인하세요.');
  const key=row.month+':'+row.code,old=data.get(key);
  if(old&&(old.name!==row.name||old.value!==row.value))throw Error('같은 지역과 기준월에 서로 다른 값이 있습니다.');
  data.set(key,row);
 }
 const values=[...data.values()];
 const available=new Set(values.filter(row=>row.code!=='3600000000').map(row=>row.month));
 const series=[...available].sort().reverse().map(month=>[2,1,0].map(offset=>(Number(month.slice(0,4))-offset)+month.slice(4))).find(period=>period.every(month=>available.has(month)));
 if(!series)throw Error('같은 달의 연속 3개년 세종시 읍·면·동 자료를 선택하세요. 시 전체 행만 있는 파일은 읍·면·동을 포함해 다시 내려받으세요.');
 return {months:series,rows:values.filter(row=>series.includes(row.month))};
}
function trendSeries(data,target,records,resolveRegion){
 if(!data)return [];
 const region=resolveRegion(target,records);
 const collect=(label,match)=>{
  const entries=data.months.map(month=>data.rows.filter(row=>row.month===month&&match(row)));
  if(entries.some(rows=>rows.length!==1||rows[0].code!==entries[0][0].code))return [];
  return [{label,periods:data.months,values:entries.map(rows=>rows[0].value)}];
 };
 const city=collect('세종시 전체',row=>row.code==='3600000000');
 const local=region?collect(region,row=>row.code!=='3600000000'&&row.name===regionName(region)):[];
 return [...local,...city];
}
function evidence(data,target,records,resolveRegion){
 return trendSeries(data,target,records,resolveRegion).map(({label,periods,values})=>{
  const delta=values.at(-1)-values[0];
  return label+' 주민등록 총인구 · '+periods.map((month,index)=>month+' '+values[index].toLocaleString('ko-KR')+'명').join(' → ')+
   ' · 처음 대비 '+(delta>0?'+':'')+delta.toLocaleString('ko-KR')+'명 (행정안전부)';
 });
}
function init(){
 if(new URL(root.location.href).searchParams.get('view')!=='reuse')return;
 const doc=root.document,left=doc.querySelector('.dashboard-left');
 if(!left)return;
 const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const panel=el('section');panel.id='residentPopulationImport';panel.className='spatial-import';
 const label=el('label','주민등록 인구 CSV 선택 ');
 const file=el('input');file.type='file';file.accept='.csv';file.multiple=true;label.append(file);
 const note='세종시 전체 읍·면·동의 같은 달 3개년 CSV를 함께 선택하세요.';
 const status=el('p',note);status.setAttribute('role','status');
 const link=el('a','행정안전부 CSV 받기');link.href=source;link.target='_blank';link.rel='noopener noreferrer';
 const clear=el('button','주민등록 인구 연결 해제');clear.type='button';
 panel.append(el('h3','주민등록 인구 · 3개년'),link,label,clear,status);left.append(panel);
 const key='sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':resident-population:v1';
 let data=null,revision=0;
 const notify=()=>root.dispatchEvent(new Event('vacancy-resident-population-changed'));
 function restore(){
  try{const raw=root.localStorage.getItem(key);data=raw?prepare(JSON.parse(raw)):null;}catch{data=null;}
  status.textContent=data?data.months.join(' · ')+' 자료 연결':note;
 }
 restore();
 api.evidence=target=>root.VacancyPopulationTrend?.selectionRegion
  ?evidence(data,target,root.VacancySpatialBridge?.records?.()||[],root.VacancyPopulationTrend.selectionRegion)
  :[];
 api.trendSeries=target=>root.VacancyPopulationTrend?.selectionRegion
  ?trendSeries(data,target,root.VacancySpatialBridge?.records?.()||[],root.VacancyPopulationTrend.selectionRegion)
  :[];
 file.onchange=async()=>{
  const files=[...file.files];if(!files.length)return;
  const current=++revision;
  try{
   const rows=await Promise.all(files.map(async item=>{
    const bytes=await item.arrayBuffer();
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{text=new TextDecoder('euc-kr').decode(bytes);}
    return readCsv(text);
   }));
   if(current!==revision)return;
   data=prepare(rows.flat());
   let saved=true;
   try{root.localStorage.setItem(key,JSON.stringify(data.rows));}catch{saved=false;}
   status.textContent=data.months.join(' · ')+' 연결 · '+(saved?'이 브라우저에 저장됨':'이번 화면에서 표시');
   notify();
  }catch(error){if(current===revision)status.textContent=error.message;}
  finally{if(current===revision)file.value='';}
 };
 clear.onclick=()=>{
  revision++;
  try{root.localStorage.removeItem(key);data=null;file.value='';status.textContent=note;notify();}
  catch{status.textContent='저장 통계를 지우지 못했습니다.';}
 };
 root.addEventListener('storage',event=>{if(event.key===key||event.key===null){revision++;restore();notify();}});
}
const api={readCsv,prepare,evidence};
root.VacancyResidentPopulation=api;
if(typeof module==='object'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
