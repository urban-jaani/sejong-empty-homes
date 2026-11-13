(function(root){
'use strict';
const source='https://www.data.go.kr/data/15164428/fileData.do';
const hourLabel=hour=>String(hour).padStart(2,'0')+':00';
const columns=['기준 연도','기준 월','행정동 코드','행정동명','시간대','총인구'];

function prepare(rows){
 const regions=new Map();
 for(const {props} of rows){
  if(!columns.every(key=>Object.hasOwn(props,key)))throw Error('세종시 행정동별 유동인구 CSV의 열 이름을 확인하세요.');
  const [year,month,code,name,hour,value]=columns.map(key=>String(props[key]??'').trim());
  if(!/^20\d{2}$/.test(year)||!/^0?[1-9]$|^1[0-2]$/.test(month)||!/^36\d{8}$/.test(code)||
   !/^[가-힣0-9]+(?:읍|면|동)$/.test(name)||!/^\d{1,2}$/.test(hour)||Number(hour)>23||
   (value!==''&&(!/^\d+(?:\.\d+)?$/.test(value.replace(/,/g,''))||!Number.isFinite(Number(value.replace(/,/g,'')))))){
   throw Error('기준월·행정동·시간대 또는 총인구 값을 확인하세요.');
  }
  const date=year+'-'+month.padStart(2,'0'),total=value===''?null:Number(value.replace(/,/g,''));
  if(!regions.has(name))regions.set(name,new Map());
  const periods=regions.get(name);
  if(!periods.has(date))periods.set(date,{code,hours:Array(24).fill(null),seen:new Set()});
  const period=periods.get(date),index=Number(hour);
  if(period.code!==code||period.seen.has(index))throw Error(name+' '+date+'에 중복되거나 서로 다른 행정동 코드가 있습니다.');
  period.seen.add(index);period.hours[index]=total;
 }
 if(!regions.size)throw Error('CSV에서 유동인구 자료를 찾지 못했습니다.');
 return regions;
}

function init(){
 if(new URL(root.location.href).searchParams.get('view')!=='reuse')return;
 const doc=root.document,left=doc.querySelector('.dashboard-left'),results=doc.getElementById('reusePanel');
 if(!left||!results)return;
 const el=(tag,text,cls)=>{
  const node=doc.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
 };
 const input=el('section',undefined,'spatial-import');input.id='floatingPopulationImport';
 const link=el('a','세종시 유동인구 CSV 받기');link.href=source;link.target='_blank';link.rel='noopener noreferrer';
 const file=el('input');file.type='file';file.accept='.csv';file.setAttribute('aria-label','행정동별 유동인구 CSV');
 const clear=el('button','자료 연결 해제');clear.type='button';
 const status=el('p','CSV 원본을 선택하세요.','spatial-note');status.setAttribute('role','status');
 input.append(el('h3','행정동별 유동인구'),link,file,clear,status);left.append(input);
 const panel=el('details',undefined,'readiness-panel');panel.id='floatingPopulationPanel';panel.open=true;
 const month=el('select'),comparison=el('select');
 const monthLabel=el('label','기준월 '),comparisonLabel=el('label','비교월 ');
 monthLabel.append(month);comparisonLabel.append(comparison);
 const controls=el('div',undefined,'nearby-review-controls');
 controls.append(monthLabel,comparisonLabel);
 const body=el('div');
 panel.append(el('summary','읍·면·동 유동인구'),controls,body);results.append(panel);
 const key='sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':floating-population:v1';
 let data=null,selected=null,revision=0;
 let selectedHour=12;
 const getRegion=target=>root.VacancyPopulationTrend?.selectionRegion?.(target,root.VacancySpatialBridge?.records?.()||[]);
 const format=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:1})+'명';
 function fill(select,entries){
  const previous=select.value;
  select.replaceChildren(...entries.map(([value,label])=>{
   const option=el('option',label);option.value=value;return option;
  }));
  select.value=entries.some(([value])=>value===previous)?previous:(entries[0]?.[0]??'');
 }
 function chart(series){
  const section=el('section',undefined,'population-trend-indicator');
  const legend=el('div',undefined,'trend-compare-legend');
  for(const group of series)legend.append(el('span',group.date,group.style));
  const svg=(tag,attributes={})=>{
   const node=doc.createElementNS('http://www.w3.org/2000/svg',tag);
   for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
   return node;
  };
  const plot=svg('svg',{viewBox:'0 0 320 154',class:'floating-hour-chart','aria-hidden':'true'});
  const peak=Math.max(1,...series.flatMap(group=>group.hours.map(value=>value??0)));
  const unit=10**Math.floor(Math.log10(peak));
  const max=Math.ceil(peak/unit)*unit;
  const x=hour=>44+hour*264/23,y=value=>126-value/max*112;
  for(const value of [0,max/2,max]){
   plot.append(svg('line',{x1:x(0),x2:x(23),y1:y(value),y2:y(value),class:'floating-hour-grid'}));
   const label=svg('text',{x:40,y:y(value)+4,'text-anchor':'end'});
   label.textContent=value.toLocaleString('ko-KR');
   plot.append(label);
  }
  for(const hour of [0,6,12,18,23]){
   const label=svg('text',{x:x(hour),y:145,'text-anchor':'middle'});
   label.textContent=hour+'시';plot.append(label);
  }
  const cursor=svg('line',{y1:y(max),y2:y(0),class:'floating-hour-cursor'});
  plot.append(cursor);
  const dots=[];
  for(const group of series){
   let path='',previousKnown=false;
   group.hours.forEach((value,index)=>{
    if(value!==null){
     path+=(previousKnown?'L':'M')+x(index)+' '+y(value)+' ';
     if(group.hours[index-1]==null&&group.hours[index+1]==null){
      plot.append(svg('circle',{cx:x(index),cy:y(value),r:2,class:'floating-hour-dot '+group.style}));
     }
    }
    previousKnown=value!==null;
   });
   plot.append(svg('path',{d:path,class:'floating-hour-line '+group.style}));
   const dot=svg('circle',{r:4,class:'floating-hour-dot '+group.style});dots.push(dot);
  }
  plot.append(...dots);
  const slider=el('input');slider.type='range';slider.min='0';slider.max='23';slider.step='1';
  slider.value=String(selectedHour);slider.setAttribute('aria-label','조회 시간대');
  const readout=el('div',undefined,'floating-hour-readout');
  readout.setAttribute('aria-live','polite');
  function showHour(){
   selectedHour=Number(slider.value);
   const time=hourLabel(selectedHour);
   slider.setAttribute('aria-valuetext',time);
   cursor.setAttribute('x1',x(selectedHour));cursor.setAttribute('x2',x(selectedHour));
   readout.replaceChildren(el('strong',time),...series.map((group,index)=>{
    const value=group.hours[selectedHour],dot=dots[index];
    dot.setAttribute('visibility',value===null?'hidden':'visible');
    if(value!==null){dot.setAttribute('cx',x(selectedHour));dot.setAttribute('cy',y(value));}
    return el('span',group.date+' '+(value===null?'미제공':format(value)),group.style);
   }));
  }
  slider.oninput=showHour;showHour();
  section.append(el('h4','시간대별 유동인구 비교'),legend,plot,slider,readout);
  return section;
 }
 function render(){
  body.replaceChildren();
  const region=selected?getRegion(selected):null,periods=data?.get(region);
  controls.hidden=!periods;
  if(!periods){
   const text=!data?'자료관리 → 분석자료 → 행정동별 유동인구에서 CSV를 연결하세요.':
    !selected?'지도에서 빈집을 선택하세요.':region?region+' 자료가 이 CSV에 없습니다.':'빈집의 읍·면·동을 확인할 수 없습니다.';
   body.append(el('p',text,'spatial-note'));return;
  }
  const dates=[...periods.keys()].sort().reverse();
  fill(month,dates.map(date=>[date,date]));
  const period=periods.get(month.value);
  const comparable=dates.filter(date=>date!==month.value&&periods.get(date).code===period.code);
  fill(comparison,comparable.length?comparable.map(date=>[date,date]):[['','비교할 월 없음']]);
  comparison.disabled=!comparable.length;
  const series=[{date:month.value,hours:period.hours,style:'local'}];
  if(comparison.value)series.push({date:comparison.value,hours:periods.get(comparison.value).hours,style:'city'});
  body.append(el('p',region+' · 이동통신 기반 월별 시간대별 일평균','trend-scope'),
   chart(series),
   el('p','출처 세종특별자치시. 동일인이 여러 시간대에 집계될 수 있어 시간대별 인구를 합산하지 않습니다.','spatial-note'));
 }
 api.evidence=target=>{
  const region=getRegion(target),periods=data?.get(region);
  if(!periods)return [];
  const latest=[...periods.keys()].sort().at(-1);
  return [region+' 유동인구 · '+latest+'까지 '+periods.size+'개월 · 시간대별 일평균 (세종특별자치시)'];
 };
 const notify=()=>{render();root.dispatchEvent(new Event('vacancy-floating-population-changed'));};
 function restore(){
  try{
   const raw=root.localStorage.getItem(key);
   data=raw?prepare(JSON.parse(raw)):null;
   status.textContent=data?'저장된 '+data.size+'개 읍·면·동 자료를 불러왔습니다.':'CSV 원본을 선택하세요.';
  }catch{data=null;status.textContent='CSV를 다시 선택하세요.';}
  notify();
 }
 file.onchange=async()=>{
  const chosen=file.files?.[0];if(!chosen)return;
  const current=++revision;
  try{
   if(!/\.csv$/i.test(chosen.name))throw Error('CSV 원본을 선택하세요.');
   const rows=await root.VacancySpatialCore.parseFile(chosen,{header:true,encoding:'auto',delimiter:','});
   if(current!==revision)return;
   data=prepare(rows);
   const savedRows=rows.map(({props})=>({props:Object.fromEntries(columns.map(column=>[column,props[column]]))}));
   let saved=true;
   try{root.localStorage.setItem(key,JSON.stringify(savedRows));}catch{saved=false;}
   status.textContent=data.size+'개 읍·면·동 연결 · '+(saved?'이 브라우저에 저장됨':'이번 화면에서 표시');
   notify();
  }catch(error){if(current===revision)status.textContent=error.message;}
  finally{if(current===revision)file.value='';}
 };
 clear.onclick=()=>{
  revision++;file.value='';
  try{root.localStorage.removeItem(key);restore();}
  catch{status.textContent='저장 자료를 지우지 못했습니다.';}
 };
 month.onchange=comparison.onchange=render;
 root.addEventListener('vacancy-spatial-focus',event=>{selected=event.detail;render();});
 root.addEventListener('vacancy-house-selected',event=>{
  selected=event.detail?.points?.[0]||event.detail?.records?.[0]||null;render();
 });
 root.addEventListener('vacancy-selection-cleared',()=>{selected=null;render();});
 root.addEventListener('storage',event=>{if(event.key===key||event.key===null){revision++;restore();}});
 restore();
}
const api={prepare};
root.VacancyFloatingPopulation=api;
if(typeof module==='object'&&module.exports)module.exports=api;
if(root.document){
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);
 else init();
}
})(typeof window!=='undefined'?window:globalThis);
