/* Three annual SGIS observations; stores only validated public statistics. */
(function(root){'use strict';
function validate(data,sgis=root.VacancySgis){if(data?.format!=='sejong-sgis-trend'||data.version!==1||!Array.isArray(data.observations)||data.observations.length!==3)throw Error('3개 연도 인구·가구 통계 형식을 확인하세요.');const observations=data.observations.map(s=>sgis.validateSnapshot(s)).sort((a,b)=>a.year-b.year);if(observations.some((s,i)=>s.year!==observations[0].year+i||s.cityCode!==observations[0].cityCode))throw Error('연속 3개 연도 또는 동일 세종시 코드의 자료가 아닙니다.');return{format:'sejong-sgis-trend',version:1,observations};}
async function load(client,endYear,signal,sgis=root.VacancySgis){const end=Number(endYear);if(!Number.isInteger(end)||end<2017||end>new Date().getFullYear())throw Error('3개 연도 조회는 2017년 이후의 기준연도를 선택하세요.');const observations=[];for(let year=end-2;year<=end;year++){if(signal?.aborted)throw Error('3개 연도 조회를 중지했습니다.');observations.push(await sgis.loadStats(client,year,signal));}if(signal?.aborted)throw Error('3개 연도 조회를 중지했습니다.');return validate({format:'sejong-sgis-trend',version:1,observations},sgis);}
function change(values){const first=values[0],last=values.at(-1),complete=values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);return{complete,delta:complete?last-first:null,rate:complete&&first>0?(last-first)/first*100:null};}
const name=v=>String(v??'').trim().replace(/^세종(?:특별자치)?시\s*/,'').replace(/\s+/g,' ');
function selectionRegion(selected,records=[],leftRegions=[],regionAt=root.VacancySpatialBridge?.regionAt){
 const normalize=value=>name(value).replace(/[\s,]+/g,'');
 const valid=value=>/^[가-힣0-9]+(?:읍|면|동)$/.test(value);
 if(!selected)return leftRegions.length===1?leftRegions[0]:null;
 const point=selected.point??[selected.longitude,selected.latitude];
 const onMap=regionAt?.(point);
 if(onMap)return onMap;
 const address=selected.address;
 const related=address?records.filter(row=>normalize(row.address)===normalize(address)):[];
 const values=[...new Set([selected.region,...related.map(row=>row.region)].map(name).filter(valid))];
 if(values.length===1)return values[0];
 return name(address).split(/[\s,]+/).find(valid)||null;
}
function model(data,region,sgis=root.VacancySgis){const series=validate(data,sgis),observations=series.observations,matches=observations.map(s=>s.regions.filter(r=>typeof region==='object'&&region?.code?r.code===region.code:name(r.name)===name(region))),consistent=!!region&&matches.every(a=>a.length===1)&&matches.every(a=>a[0].code.length===8&&a[0].code===matches[0][0].code&&name(a[0].name)===name(matches[0][0].name));return{years:observations.map(s=>s.year),region:consistent?matches[0][0].name:null,regionStatus:!region?'not-selected':consistent?'ready':'unmatched',indicators:['population','households'].map(key=>{const city=observations.map(s=>s.total[key]),local=consistent?matches.map(a=>a[0][key]):null,a=change(city),b=local?change(local):null;return{key,city,local,cityChange:a,localChange:b,gap:a.rate!==null&&b?.rate!==null&&b?.rate!==undefined?b.rate-a.rate:null};})};}
function regionEvidence(data,region,sgis){
 if(!data)return null;
 const matches=data.observations.map(snapshot=>snapshot.regions.filter(row=>region?.code?row.code===region.code:name(row.name)===name(region)));
 const first=matches[0][0];
 if(!region||!first||first.code.length!==8||matches.some(rows=>rows.length!==1||rows[0].code!==first.code||name(rows[0].name)!==name(first.name)))return null;
 const series=key=>matches.map(rows=>rows[0][key]??null);
 return {region:first.name,years:data.observations.map(snapshot=>snapshot.year),
  population:series('population'),singleHouseholds:series('singleHouseholds'),
  ages:Object.entries(sgis.DEMAND_GROUPS).map(([key,label])=>({label,values:series(key)}))};
}
function houseEvidence(data,selected,records=[],sgis=root.VacancySgis){
 return regionEvidence(data,selectionRegion(selected,records),sgis);
}
function retainDemand(previous,next){
 if(!previous)return next;
 const keys=['singleHouseholds',...Object.keys(root.VacancySgis.DEMAND_GROUPS)];
 for(const snapshot of next.observations){
  const old=previous.observations.find(item=>item.year===snapshot.year&&item.cityCode===snapshot.cityCode);
  const byCode=new Map(old?.regions.map(region=>[region.code,region]));
  for(const region of snapshot.regions){
   const prior=byCode.get(region.code);
   if(!prior||name(prior.name)!==name(region.name))continue;
   for(const key of keys)if(!Object.hasOwn(region,key)&&Object.hasOwn(prior,key))region[key]=prior[key];
  }
 }
 return next;
}
function render(doc,host,data,region,houseSelected=false){
 host.replaceChildren();
 const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 if(!data){host.append(el('p','자료관리 → API 연결 → SGIS에서 인증한 뒤, 선택연도까지 3개연도 조회를 누르세요.','spatial-note'));return;}
 const m=model(data,region),fmt=value=>value.toLocaleString('ko-KR'),signed=value=>(value>0?'+':'')+value.toLocaleString('ko-KR',{maximumFractionDigits:1});
 const area=m.region?'비교 지역: '+m.region:
  m.regionStatus==='unmatched'?(typeof region==='string'?region+' · ':'')+'3개 연도의 동일 읍·면·동 통계가 필요합니다. SGIS 변화 통계를 다시 조회해 주세요.':
  houseSelected?'선택한 빈집의 읍·면·동을 확인하지 못했습니다. 위에서 비교 지역을 선택할 수 있습니다.':'빈집 또는 왼쪽 지역을 선택하거나 위의 비교 지역을 골라 주세요.';
 host.append(el('p',m.years.join(' · ')+'년 · SGIS 행정구역 통계','trend-scope'),el('p',area,'spatial-note'));
 function addChart(title,unit,groups){
  const section=el('section',undefined,'population-trend-indicator');
  section.append(el('h4',title));
  const series=groups.filter(([,values])=>values?.some(value=>value!==null))
   .map(([label,values,kind])=>({label,values,kind,rates:values.map(value=>values[0]>0&&value!==null?(value/values[0]-1)*100:null)}));
  if(!series.length){
   section.append(el('p','조회된 통계 없음','spatial-note'));host.append(section);return;
  }
  const extent=Math.max(1,...series.flatMap(group=>group.rates.map(value=>Math.abs(value??0))));
  const legend=el('div',undefined,'trend-compare-legend'),chart=el('div',undefined,'trend-compare-chart');
  for(const group of series)legend.append(el('span',group.label,group.kind));
  section.append(legend,el('p','첫해 대비 변화율 · 0% 기준선','spatial-note'),chart);
  for(const [index,year] of m.years.entries()){
   const block=el('div',undefined,'trend-compare-year');
   block.append(el('strong',year+'년'));
   for(const group of series){
    const value=group.values[index],rate=group.rates[index];
    const row=el('div',undefined,'population-trend-row trend-compare-row');
    const track=el('span',undefined,'trend-compare-track'),bar=el('span',undefined,'trend-compare-bar '+group.kind);
    if(rate!==null){
     bar.style.left=(50+Math.min(0,rate)/extent*49)+'%';
     bar.style.width=(Math.abs(rate)/extent*49)+'%';
     bar.style.minWidth='2px';
     track.append(bar);
    }
    const caption=value===null?'미제공':fmt(value)+unit+(rate===null?'':' · '+signed(rate)+'%');
    row.setAttribute('aria-label',year+'년 '+group.label+' '+caption);
    row.append(el('span',group.label,group.kind),track,el('span',caption));block.append(row);
   }
   chart.append(block);
  }
  for(const group of series){
   const delta=change(group.values).delta;
   if(delta!==null)section.append(el('p',group.label+' · 3개년 차이 '+signed(delta)+unit,'population-trend-change'));
  }
  host.append(section);
 }
 for(const item of m.indicators){
  const population=item.key==='population';
  addChart(population?'인구 변화':'가구 변화',population?'명':'가구',[
   ['세종시 전체',item.city,'city'],[m.region,item.local,'local']
  ]);
 }
 const demand=regionEvidence(data,region,root.VacancySgis);
 if(demand){
  host.append(el('h4',demand.region+' · 1인 가구와 연령별 인구'));
  if(demand.singleHouseholds.some(value=>value!==null)||demand.ages.some(item=>item.values.some(value=>value!==null))){
   addChart('⑥ 전체 1인 가구 변화','가구',[[demand.region,demand.singleHouseholds,'local']]);
   addChart('⑦ 연령별 인구 변화','명',demand.ages.map(({label,values},index)=>[label,values,'age-'+index]));
   const missing=demand.ages.filter(item=>item.values.every(value=>value===null)).map(item=>item.label);
   if(missing.length)host.append(el('p',missing.join(' · ')+' 미제공','spatial-note'));
  }else{
   host.append(el('p','자료관리 → API 연결 → SGIS에서 1인 가구·연령별 인구 조회를 누르세요.','spatial-note'));
  }
 }
 return m;
}
function init(){if(new URL(root.location.href).searchParams.get('view')!=='reuse')return;const doc=root.document,host=doc.getElementById('reusePanel');if(!host)return;const box=doc.createElement('details');box.id='populationTrendPanel';box.className='readiness-panel';box.open=true;const title=doc.createElement('summary');title.textContent='지역 인구·가구 변화 · 3개 연도';const regionLabel=doc.createElement('label');regionLabel.textContent='비교 지역 ';regionLabel.className='population-trend-region';const regionChoice=doc.createElement('select');regionChoice.setAttribute('aria-label','인구·가구 변화 비교 지역');regionLabel.append(regionChoice);const body=doc.createElement('div');box.append(title,regionLabel,body);host.append(box);let data=null,selected=null;const key='sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':sgis-census-trend:v1';
 function updateChoices(){const before=regionChoice.value||'auto';regionChoice.replaceChildren();const add=(value,text)=>{const o=doc.createElement('option');o.value=value;o.textContent=text;regionChoice.append(o);};add('auto','자동 · 빈집 / 왼쪽 지역 선택');add('city','세종시 전체');if(data){const obs=data.observations,common=obs[0].regions.filter(r=>r.code.length===8&&obs.every(o=>o.regions.some(x=>x.code===r.code&&name(x.name)===name(r.name)))).sort((a,b)=>a.name==='조치원읍'?-1:b.name==='조치원읍'?1:a.name.localeCompare(b.name,'ko'));for(const r of common)add(r.code,r.name);regionChoice.value=common.some(r=>r.code===before)||['auto','city'].includes(before)?before:'auto';}else regionChoice.value='auto';}
 function refresh(){const bridge=root.VacancySpatialBridge,records=bridge?.records?.()||[],left=bridge?.regionNames?.()||[],choice=regionChoice.value;const region=choice==='city'?null:choice&&choice!=='auto'?{code:choice}:selectionRegion(selected,records,left);render(doc,body,data,region,!!selected);if(data&&!region&&left.length>1&&choice==='auto'){const p=doc.createElement('p');p.className='spatial-note';p.textContent='여러 지역이 선택되어 있습니다. 위 비교 지역에서 한 지역을 선택하세요.';body.prepend(p);}}
 regionChoice.onchange=refresh;
 api.evidence=target=>houseEvidence(data,target,root.VacancySpatialBridge?.records?.()||[]);
 api.loadDemand=async(client,endYear,signal)=>{
  const base=data?.observations.at(-1).year===Number(endYear)?data:await load(client,endYear,signal);
  const observations=[];
  for(const snapshot of base.observations){
   if(signal?.aborted)throw Error('세부 통계 조회를 중지했습니다.');
   observations.push(await root.VacancySgis.loadDemand(client,snapshot,signal));
  }
  return {...base,observations};
 };
 const notify=()=>root.dispatchEvent?.(new Event("vacancy-sgis-trend-changed"));
 api.set=value=>{const clean=retainDemand(data,validate(value));data=clean;updateChoices();let saved=true;try{root.localStorage.setItem(key,JSON.stringify(clean));}catch{saved=false;}refresh();notify();return saved;};api.clear=()=>{root.localStorage.removeItem(key);data=null;updateChoices();refresh();notify();};root.addEventListener('vacancy-spatial-focus',e=>{selected=e.detail;regionChoice.value='auto';refresh();});root.addEventListener('vacancy-house-selected',event=>{
  const records=event.detail?.records||[],points=event.detail?.points||[];
  const point=points[0];
  selected=point?{...point,point:[point.longitude,point.latitude]}:records[0]||null;
  regionChoice.value='auto';
  refresh();
 }); root.addEventListener('vacancy-selection-cleared',()=>{selected=null;refresh();});root.addEventListener('vacancy-spatial-data-changed',refresh);root.addEventListener('storage',e=>{if(e.key===key||e.key===null){try{const raw=root.localStorage.getItem(key);data=raw?validate(JSON.parse(raw)):null;}catch{data=null;}updateChoices();refresh();notify();}});try{const raw=root.localStorage.getItem(key);if(raw)data=validate(JSON.parse(raw));}catch{}updateChoices();refresh();
}
const api={validate,load,change,model,render,selectionRegion,houseEvidence};root.VacancyPopulationTrend=api;if(typeof module==='object'&&module.exports)module.exports=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
