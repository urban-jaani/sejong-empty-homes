/* Grid-code joins prepared from SGIS total-population CSVs; missing is never zero. */
(function(root){'use strict';
function validate(d){if(d?.format!=='sejong-grid-population-trend'||d.version!==1||d.size!==100||d.crs!=='EPSG:5179'||d.indicator!=='to_in_001'||!Array.isArray(d.years)||d.years.length!==3||d.years.some((y,i)=>!Number.isInteger(y)||y<2015||y>new Date().getFullYear()||y!==d.years[0]+i)||!Array.isArray(d.cells)||!d.cells.length||d.cells.length>100000)throw Error('100m 연도별 격자인구 JSON 형식을 확인하세요.');const ids=new Set(),positions=new Set(),cells=d.cells.map(c=>{if(!Array.isArray(c)||c.length!==6||!/^다바\d{6}$/.test(c[0])||ids.has(c[0])||positions.has(c[1]+':'+c[2])||c[1]!==900000+Number(c[0].slice(2,5))*100||c[2]!==1800000+Number(c[0].slice(5))*100||!Number.isFinite(c[3])||!Number.isFinite(c[4])||c[3]<120||c[3]>135||c[4]<30||c[4]>45||!Array.isArray(c[5])||c[5].length!==3||c[5].some(v=>v!==null&&(!Number.isInteger(v)||v<0)))throw Error('격자 코드·좌표·연도별 인구값을 확인하세요.');ids.add(c[0]);positions.add(c[1]+':'+c[2]);return[c[0],c[1],c[2],c[3],c[4],c[5].slice()];});return{format:d.format,version:1,size:100,crs:d.crs,indicator:d.indicator,boundaryYear:Number.isInteger(d.boundaryYear)?d.boundaryYear:null,years:d.years.slice(),cells};}
function prepare(d){const clean=validate(d);return{...clean,byPosition:new Map(clean.cells.map(c=>[c[1]+':'+c[2],c]))};}
function change(values){if(!values||values.some(v=>v===null))return{delta:null,rate:null};const delta=values[2]-values[0];return{delta,rate:values[0]>0?delta/values[0]*100:null};}
function analyze(data,point,radius=500,core=root.VacancyNeighborhood){if(![300,500,1000].includes(radius))throw Error('분석 반경을 확인하세요.');if(!Array.isArray(point)||point.length!==2||point.some(v=>!Number.isFinite(v))||point[0]<120||point[0]>135||point[1]<30||point[1]>45)return{state:'coordinates-missing'};const [x,y]=core.tm(...point),key=Math.floor(x/100)*100+':'+Math.floor(y/100)*100,cell=data.byPosition.get(key)||null,rows=[],sum=[0,0,0],known=[0,0,0];let expected=0,common=0;
 for(let gx=Math.floor((x-radius)/100)*100;gx<=x+radius;gx+=100)for(let gy=Math.floor((y-radius)/100)*100;gy<=y+radius;gy+=100){if(Math.hypot(gx+50-x,gy+50-y)>radius)continue;expected++;const c=data.byPosition.get(gx+':'+gy);if(!c)continue;rows.push(c);c[5].forEach((v,i)=>{if(v!==null)known[i]++;});if(c[5].every(v=>v!==null)){common++;c[5].forEach((v,i)=>sum[i]+=v);}}
 return{state:'ready',years:data.years,point,radius,cell,cellChange:change(cell?.[5]),rows,range:{expected,common,known,excluded:expected-common,values:common?sum:[null,null,null],change:change(common?sum:[null,null,null])}};}
function color(values){const c=change(values);return c.delta===null?'#a8afb5':c.delta>0?'#2c83b8':c.delta<0?'#dc8740':'#f2f4ef';}

const DEMOGRAPHIC_SERIES=[
 ['1인 가구','가구'],['0~14세','명'],['15~19세','명'],
 ['20~39세','명'],['40~64세','명'],['65세 이상','명']
];

function prepareDemographics(data){
 const invalid=()=>Error('세종시 1km 격자 인구·가구 JSON 파일을 확인하세요.');
 if(data?.format!=='sejong-grid-demographics'||data.version!==1||data.size!==1000||
    data.crs!=='EPSG:5179'||!Array.isArray(data.years)||data.years.length!==3||
    data.years.some((year,index)=>!Number.isInteger(year)||year<2015||
      year>new Date().getFullYear()||year!==data.years[0]+index)||
    !Array.isArray(data.cells)||!data.cells.length||data.cells.length>10000)throw invalid();
 const byPosition=new Map();
 for(const cell of data.cells){
  if(!Array.isArray(cell)||cell.length!==3+DEMOGRAPHIC_SERIES.length||
     !/^다바\d{4}$/.test(cell[0])||cell[1]!==900000+Number(cell[0].slice(2,4))*1000||
     cell[2]!==1800000+Number(cell[0].slice(4))*1000||
     cell.slice(3).some(values=>!Array.isArray(values)||values.length!==3||
       values.some(value=>value!==null&&(!Number.isSafeInteger(value)||value<0))))throw invalid();
  const key=cell[1]+':'+cell[2];
  if(byPosition.has(key))throw invalid();
  byPosition.set(key,cell);
 }
 return {years:data.years,byPosition};
}

function demographicCell(data,point,core=root.VacancyNeighborhood){
 if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))return null;
 const [x,y]=core.tm(...point);
 return data.byPosition.get(Math.floor(x/1000)*1000+':'+Math.floor(y/1000)*1000)||null;
}
function init(){if(new URL(root.location.href).searchParams.get('view')!=='reuse')return;const doc=root.document,left=doc.querySelector('.dashboard-left'),host=doc.getElementById('reusePanel');if(!left||!host)return;const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};const inputPanel=el('section',undefined,'spatial-import');inputPanel.id='gridTrendImport';const file=el('input');file.type='file';file.accept='.json';file.setAttribute('aria-label','연도별 100m 격자인구 JSON 선택');const erase=el('button','격자 변화자료 연결 해제');erase.type='button';const status=el('p','준비한 세종시_100m격자인구_2022_2024.json을 선택하세요.','spatial-note');status.setAttribute('role','status');inputPanel.append(el('h3','연도별 100m 격자인구'),file,erase,status);left.append(inputPanel);
 const box=el('details',undefined,'readiness-panel');box.id='gridPopulationTrendPanel';box.open=true;const summary=el('summary','빈집 위치 격자인구 변화'),body=el('div');
 const demographicsFile=el('input');
 demographicsFile.type='file';
 demographicsFile.accept='.json';
 demographicsFile.setAttribute('aria-label','1km 격자 인구·가구 JSON 선택');
 const demographicsErase=el('button','1km 자료 연결 해제');
 demographicsErase.type='button';
 const demographicsStatus=el('p','세종시_1km격자_인구가구_2022_2024.json을 선택하세요.','spatial-note');
 demographicsStatus.setAttribute('role','status');
 inputPanel.append(el('h3','연도별 1km 격자 인구·가구'),demographicsFile,demographicsErase,demographicsStatus);
 const demographicsBox=el('section');
 demographicsBox.id='gridDemographics';
 const demographicsChart=el('div');
 let demographics=null,demographicsSerial=0;
 const mapButton=el('button','격자인구 지도보기');mapButton.type='button';mapButton.setAttribute('aria-pressed','false');
 const radius=el('select');
 for(const metres of [300,500,1000]){
  const option=el('option',metres.toLocaleString('ko-KR')+'m');
  option.value=String(metres);radius.append(option);
 }
 radius.value='500';
 const radiusLabel=el('label','빈집 기준 반경 ');radiusLabel.append(radius);
 const controls=el('div',undefined,'nearby-review-controls');controls.append(radiusLabel,mapButton);
 box.append(summary,body);host.append(box);let data=null,selected=null,showOnMap=false,layer=null,serial=0,queue=Promise.resolve();const key='sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':grid-population-trend:v1';
 const demographicsKey=key+':demographics-1km';
 root.VacancyGridPopulationTrend.evidence=(point,radius=500)=>data?analyze(data,point,radius):{state:'missing'};
 const notify=()=>root.dispatchEvent(new Event('vacancy-grid-trend-data-changed'));
 function store(mode,value,storageKey=key){const action=()=>new Promise((resolve,reject)=>{const req=root.indexedDB.open('sejong-grid-population-trend-v1',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('data'))req.result.createObjectStore('data');};req.onerror=()=>reject(Error('저장소 연결 실패'));req.onsuccess=()=>{const db=req.result;try{const tx=db.transaction('data',mode==='get'?'readonly':'readwrite'),s=tx.objectStore('data'),r=mode==='get'?s.get(storageKey):mode==='put'?s.put(value,storageKey):s.delete(storageKey);tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=tx.onabort=()=>{db.close();reject(Error('브라우저 저장 실패'));};}catch(e){db.close();reject(e);}};});const result=queue.then(action,action);queue=result.catch(()=>{});return result;}
 const clear=()=>{layer?.remove();layer=null;};
 const current=()=>data?analyze(data,selected?.point,Number(radius.value)):null;
 function draw(m=current()){clear();const map=root.VacancyNeighborhoodMapBridge?.getMap?.();if(!showOnMap||m?.state!=='ready'||!map||!root.L||!root.VacancyNeighborhoodMap?.cellGeometry)return;if(!map.getPane('gridPopulationChange')){map.createPane('gridPopulationChange');map.getPane('gridPopulationChange').style.zIndex=415;}layer=root.L.layerGroup().addTo(map);for(const c of m.rows){const delta=change(c[5]).delta,tip=el('span',c[0]+' · '+data.years[0]+'→'+data.years[2]+': '+(delta===null?'비교 보류':(delta>0?'+':'')+delta+'명'));root.L.geoJSON({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[root.VacancyNeighborhoodMap.cellGeometry(c[1],c[2])]}},{pane:'gridPopulationChange',style:{color:m.cell?.[0]===c[0]?'#174c32':'#738575',weight:m.cell?.[0]===c[0]?2:.4,fillColor:color(c[5]),fillOpacity:.5}}).bindTooltip(tip).addTo(layer);}}
 function populationChart(title,years,values,unit='명',max=Math.max(1,...values)){
  const group=el('section',undefined,'population-trend-group');
  group.append(el('h4',title));
  for(const [index,year] of years.entries()){
   const value=values[index],row=el('div',undefined,'population-trend-row');
   const track=el('span',undefined,'population-trend-track');
   track.setAttribute('aria-hidden','true');
   if(value!==null){
    const bar=el('span',undefined,'population-trend-bar');
    bar.style.width=value/max*100+'%';
    track.append(bar);
   }
   row.append(el('span',year+'년'),track,el('span',value===null?'미제공':value.toLocaleString('ko-KR')+unit));
   group.append(row);
  }
  return group;
 }
 function renderDemographics(){
  demographicsChart.replaceChildren();
  const cell=demographics&&demographicCell(demographics,selected?.point);
  if(!demographics||!cell){
   const message=!demographics?'자료관리 → 분석자료에서 1km 격자 인구·가구 JSON을 연결하세요.':
    selected?.point?.every(Number.isFinite)?'선택한 위치의 1km 격자 자료가 없습니다.':'좌표가 있는 빈집을 선택하세요.';
   demographicsChart.append(el('p',message,'spatial-note'));
   return;
  }
  const [[householdLabel,householdUnit],...ageSeries]=DEMOGRAPHIC_SERIES;
  const [households,...ageValues]=cell.slice(3);
  const ageMax=Math.max(1,...ageValues.flat());
  const ageChart=el('section');
  ageChart.append(el('h5','연령별 인구'),el('p','연령대별 막대는 같은 눈금을 사용합니다.','spatial-note'));
  for(const [index,[label,unit]] of ageSeries.entries()){
   ageChart.append(populationChart(label,demographics.years,ageValues[index],unit,ageMax));
  }
  demographicsChart.append(populationChart(householdLabel,demographics.years,households,householdUnit),ageChart,
   el('p','SGIS 인구주택총조사 · 격자 코드 '+cell[0]+' · 연령대 합계는 세부 구간 값이 모두 있는 해에 표시합니다.','spatial-note'));
 }
 demographicsBox.append(el('h4','빈집이 속한 1km 격자 인구·가구'),demographicsChart);
 demographicsFile.onchange=async()=>{
  const source=demographicsFile.files?.[0];
  if(!source)return;
  const request=++demographicsSerial;
  try{
   if(source.size>2*1024*1024)throw Error('2MB 이하의 준비된 1km JSON을 선택하세요.');
   const raw=JSON.parse(await source.text()),prepared=prepareDemographics(raw);
   if(request!==demographicsSerial)return;
   demographics=prepared;
   renderDemographics();
   await store('put',raw,demographicsKey).then(()=>{
    if(request===demographicsSerial)demographicsStatus.textContent='1km 격자 통계 연결 · 이 브라우저에 저장됨';
   },()=>{
    if(request===demographicsSerial)demographicsStatus.textContent='1km 격자 통계 연결 · 이번 화면에서만 사용';
   });
  }catch(error){
   if(request===demographicsSerial)demographicsStatus.textContent=error.message;
  }
 };
 demographicsErase.onclick=async()=>{
  const request=++demographicsSerial;
  demographics=null;
  demographicsFile.value='';
  renderDemographics();
  try{
   await store('delete',undefined,demographicsKey);
   if(request===demographicsSerial)demographicsStatus.textContent='1km 자료 연결을 해제했습니다.';
  }catch{
   if(request===demographicsSerial)demographicsStatus.textContent='연결을 해제했습니다. 브라우저의 저장 자료는 지우지 못했습니다.';
  }
 };
 store('get',undefined,demographicsKey).then(saved=>{
  if(demographicsSerial||!saved)return;
  demographics=prepareDemographics(saved);
  demographicsStatus.textContent='저장한 1km 격자 통계를 복원했습니다.';
  renderDemographics();
 }).catch(()=>{
  if(!demographicsSerial)demographicsStatus.textContent='저장 자료를 복원하지 못했습니다. 1km JSON을 선택하세요.';
 });
 function render(){
  body.replaceChildren();
  const m=current();
  mapButton.disabled=m?.state!=='ready';
  radius.disabled=mapButton.disabled;
  if(!data)body.append(el('p','자료관리 → 분석자료 → 격자 인구·가구 통계에서 100m JSON을 연결하세요.','spatial-note'));
  else if(mapButton.disabled)body.append(el('p','좌표가 있는 빈집을 선택하세요.','spatial-note'));
  else{
   const {cell,range,years}=m;
   const cellChart=populationChart('빈집이 속한 100m 격자 거주인구',years,cell?.[5]??years.map(()=>null));
   if(cell)cellChart.append(el('p','격자 코드 '+cell[0],'spatial-note'));
   body.append(cellChart,demographicsBox,controls,populationChart('반경 '+m.radius.toLocaleString('ko-KR')+'m 거주인구',years,range.values),
    el('p','중심점이 반경 안에 있고 3개 연도 모두 값이 있는 100m 격자 '+range.common+'/'+range.expected+'개 합계','spatial-note'));
   if(showOnMap)body.append(el('p','파랑 증가 / 주황 감소 / 밝은색 동일 / 회색 미제공','spatial-note'));
  }
  if(mapButton.disabled)body.append(demographicsBox);
  mapButton.setAttribute('aria-pressed',String(showOnMap&&!mapButton.disabled));
  renderDemographics();
  draw(m);
 }
 radius.onchange=render;
 mapButton.onclick=()=>{
  if(mapButton.disabled)return;
  showOnMap=!showOnMap;render();
 }; file.onchange=async()=>{const f=file.files?.[0];if(!f)return;const own=++serial;if(f.size>20*1024*1024){status.textContent='20MB 이하의 준비된 JSON을 선택하세요.';return;}try{const clean=validate(JSON.parse(await f.text()));if(own!==serial)return;data=prepare(clean);render();notify();let saved=true;try{await store('put',clean);}catch{saved=false;}if(own===serial)status.textContent=clean.years.join('·')+'년 '+clean.cells.length.toLocaleString('ko-KR')+'격자 연결 · '+(saved?'이 브라우저에 저장됨':'이번 화면에서만 사용');}catch(e){if(own===serial)status.textContent=e.message+' 이전 연결은 유지합니다.';}};
 erase.onclick=async()=>{const own=++serial;data=null;file.value='';render();notify();try{await store('delete');if(own===serial)status.textContent='격자 변화자료 연결과 저장을 지웠습니다.';}catch{if(own===serial)status.textContent='연결은 해제했지만 저장 자료를 지우지 못했습니다.';}};root.addEventListener('vacancy-spatial-focus',e=>{selected=e.detail;render();});root.addEventListener('vacancy-house-selected',e=>{const p=e.detail?.points?.[0];if(p){selected={address:p.address,point:[p.longitude,p.latitude]};render();}});root.addEventListener('vacancy-selection-cleared',()=>{selected=null;render();});root.addEventListener('vacancy-neighborhood-map-ready',()=>draw());render();const initial=serial;store('get').then(saved=>{if(initial!==serial||!saved)return;data=prepare(saved);status.textContent='저장한 연도별 격자인구를 복원했습니다.';render();notify();}).catch(()=>{if(initial===serial)status.textContent='저장자료를 복원하지 못했습니다. 준비한 JSON을 선택하세요.';});
}
const api={validate,prepare,change,analyze,color,prepareDemographics,demographicCell};root.VacancyGridPopulationTrend=api;if(typeof module==='object'&&module.exports)module.exports=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
