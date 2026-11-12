/* Korea Tourism Organization, provincial daily visitor counts. */
(function(root){
'use strict';
const endpoint='https://apis.data.go.kr/B551011/DataLabService/metcoRegnVisitrDDList';
const source='https://www.data.go.kr/data/15101972/openapi.do';
const monthKey=date=>date.toISOString().slice(0,7);
const lastMonth=()=>{
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format();
 return monthKey(new Date(Date.parse(today+'-01T00:00:00Z')-86400000));
};
function months(end){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(end)||end>lastMonth())throw Error('이미 끝난 기준월을 선택하세요.');
 const [year,month]=end.split('-').map(Number);
 return Array.from({length:12},(_,index)=>{
  const date=new Date(Date.UTC(year,month-12+index,1));
  const next=new Date(Date.UTC(year,month-11+index,1));
  return {month:monthKey(date),days:(next-date)/86400000};
 });
}
function aggregate(rows,period){
 const dates=new Map();
 for(const row of rows){
  if(!/^세종(?:특별자치)?시$/.test(String(row.areaNm??'').trim())||!/^외지인(?:\s*\(b\))?$/.test(String(row.touDivNm??'').trim()))continue;
  const date=String(row.baseYmd??''),count=String(row.touNum??'').trim();
  const day=Number(date.slice(6));
  if(!/^\d{8}$/.test(date)||!date.startsWith(period.month.replace('-',''))||day<1||day>period.days)continue;
  if(!/^\d+(?:\.\d+)?$/.test(count)||!Number.isFinite(Number(count)))continue;
  if(dates.has(date)&&dates.get(date)!==Number(count))throw Error(period.month+'의 같은 날짜에 서로 다른 집계가 있습니다.');
  dates.set(date,Number(count));
 }
 return {...period,covered:dates.size,total:dates.size===period.days?[...dates.values()].reduce((sum,value)=>sum+value,0):null};
}
async function loadMonth(key,period,fetcher){
 const base=period.month.replace('-',''),pageSize=1000,rows=[];
 let pages=1,expected;
 for(let page=1;page<=pages;page++){
  const url=new URL(endpoint);
  url.search=new URLSearchParams({serviceKey:key,MobileOS:'ETC',MobileApp:'SejongVacancy',_type:'json',
   startYmd:base+'01',endYmd:base+period.days,pageNo:String(page),numOfRows:String(pageSize)}).toString();
  let response;
  try{response=await fetcher(url.href,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});}
  catch{throw Error('관광공사 API에 연결하지 못했습니다. 네트워크 또는 브라우저의 교차 출처 제한을 확인하세요.');}
  if(!response.ok)throw Error('관광공사 API 응답 오류 ('+response.status+'). 활용 승인과 인증키를 확인하세요.');
  let json;
  try{json=await response.json();}catch{throw Error('관광공사 API의 JSON 응답을 읽지 못했습니다. 활용 승인과 인증키를 확인하세요.');}
  const result=json?.response;
  if(!/^0+$/.test(String(result?.header?.resultCode??'')))throw Error('관광공사 API 조회가 거절됐습니다. 활용 승인과 인증키를 확인하세요.');
  const body=result.body,total=Number(body?.totalCount),size=Number(body?.numOfRows),items=body?.items?.item;
  if(!Number.isInteger(total)||total<0||(total>0&&(!Number.isInteger(size)||size<1)))throw Error('방문자 API의 페이지 정보를 읽지 못했습니다.');
  if(page===1){expected=total;pages=total===0?1:Math.ceil(total/size);}
  if(total!==expected||pages>100)throw Error('방문자 자료 범위가 변경됐습니다. 다시 조회하세요.');
  rows.push(...(Array.isArray(items)?items:items?[items]:[]));
 }
 if(rows.length!==expected)throw Error('방문자 자료 일부가 누락됐습니다. 다시 조회하세요.');
 return aggregate(rows,period);
}
function validate(data){
 if(!Array.isArray(data)||data.length!==12)throw Error('12개월 방문자 자료가 필요합니다.');
 const periods=months(data.at(-1)?.month);
 return periods.map((period,index)=>{
  const {month,covered,total}=data[index];
  if(month!==period.month||!Number.isInteger(covered)||covered<0||covered>period.days||
   (covered===period.days?!Number.isFinite(total)||total<0:total!==null))throw Error('저장된 방문자 통계 형식이 올바르지 않습니다.');
  return {...period,covered,total};
 });
}
function summary(data){
 if(!data)return [];
 const complete=data.filter(item=>item.total!==null);
 return ['세종시 전체 외지인 방문 · '+data[0].month+'~'+data.at(-1).month+' · 월 합계 '+complete.length+'/12개월 (한국관광공사)'];
}
function renderChart(doc,host,data){
 host.replaceChildren();
 const el=(tag,text,cls)=>{
  const node=doc.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
 };
 if(!data){
  host.append(el('p','자료관리 → API 연결 → 한국관광공사 방문자에서 조회하세요.','spatial-note'));
  return;
 }
 const complete=data.filter(item=>item.total!==null);
 const max=Math.max(1,...complete.map(item=>item.total));
 const chart=el('ul',undefined,'visitor-trend-chart');
 for(const item of data){
  const row=el('li',undefined,'visitor-trend-row');
  const track=el('span',undefined,'visitor-trend-track');
  track.setAttribute('aria-hidden','true');
  const bar=el('span',undefined,'visitor-trend-bar');
  if(item.total!==null){
   bar.style.width=(item.total/max*100)+'%';
   track.append(bar);
  }else{
   track.className+=' visitor-trend-missing';
  }
  const value=item.total===null?'미집계 '+item.covered+'/'+item.days+'일':Math.round(item.total).toLocaleString('ko-KR')+'명';
  row.append(el('span',item.month),track,el('span',value));chart.append(row);
 }
 host.append(el('p','세종시 전체 · 월 합계 '+complete.length+'/'+data.length+'개월','trend-scope'),chart,
  el('p','한국관광공사 · 일별 외지인 방문자 수의 월 합계입니다. 여러 날 방문한 사람은 날짜별로 집계됩니다.','spatial-note'));
}
function init(){
 const doc=root.document;
 if(new URL(root.location.href).searchParams.get('view')!=='reuse')return;
 const left=doc.querySelector('.dashboard-left');
 if(!left)return;
 const el=(tag,text)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
 const panel=el('section');panel.id='visitorTrendImport';panel.className='spatial-import';
 const key=el('input');key.type='password';key.autocomplete='off';key.setAttribute('aria-label','관광공사 서비스키');key.placeholder='일반 인증키';
 const end=el('input');end.type='month';end.value=end.max=lastMonth();end.setAttribute('aria-label','방문자 추이 마지막 기준월');
 const label=el('label','마지막 기준월 ');label.append(end);
 const query=el('button','세종시 외지인 방문자 조회'),clear=el('button','저장 통계 지우기');
 query.type=clear.type='button';
 const status=el('p','선택한 기준월까지 12개월을 조회합니다.');status.setAttribute('role','status');
 const link=el('a','공공데이터포털 활용신청');link.href=source;link.target='_blank';link.rel='noopener noreferrer';
 panel.append(el('h3','세종시 방문자 추이'),link,key,label,query,clear,status);left.append(panel);
 const results=doc.getElementById('reusePanel');
 const chartPanel=el('details');chartPanel.id='visitorTrendPanel';chartPanel.className='readiness-panel';chartPanel.open=true;
 const chartBody=el('div');
 chartPanel.append(el('summary','세종시 외지인 방문 추이'),chartBody);
 results?.append(chartPanel);
 const storage='sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':tourism-visitors:v1';
 let data=null;
 function restore(){
  try{const raw=root.localStorage.getItem(storage);data=raw?validate(JSON.parse(raw)):null;}
  catch{data=null;}
  if(data){end.value=data.at(-1).month;status.textContent='저장 통계 복원 · '+data[0].month+'~'+data.at(-1).month;}
  else status.textContent='선택한 기준월까지 12개월을 조회합니다.';
 }
 const notify=()=>{
  renderChart(doc,chartBody,data);
  root.dispatchEvent(new Event('vacancy-visitor-data-changed'));
 };
 api.evidence=()=>summary(data);
 restore();
 renderChart(doc,chartBody,data);
 query.onclick=async()=>{
  if(query.disabled)return;
  let serviceKey=key.value.trim();
  if(!serviceKey){status.textContent='공공데이터포털 인증키를 입력하세요.';return;}
  let periods;
  try{periods=months(end.value);if(serviceKey.includes('%'))serviceKey=decodeURIComponent(serviceKey);}
  catch(error){status.textContent=error instanceof URIError?'인증키 형식을 확인하세요.':error.message;return;}
  query.disabled=clear.disabled=end.disabled=key.disabled=true;
  key.value='';
  try{
   const next=[];
   for(const period of periods){
    status.textContent=period.month+' 조회 중 ('+(next.length+1)+'/12)';
    next.push(await loadMonth(serviceKey,period,root.fetch.bind(root)));
   }
   if(next.every(item=>item.total===null))throw Error('한 달 전체를 집계할 수 있는 세종시 외지인 자료가 없습니다.');
   data=validate(next);
   let saved=true;
   try{root.localStorage.setItem(storage,JSON.stringify(data));}catch{saved=false;}
   status.textContent='조회 완료 · 주변환경의 세종시 외지인 방문 추이에서 확인하세요. '+(saved?'조회 결과를 이 브라우저에 저장했습니다.':'이번 화면에서만 표시합니다.');
   notify();
  }catch(error){status.textContent=error.message+' 기존 조회 결과는 유지됩니다.';}
  finally{query.disabled=clear.disabled=end.disabled=key.disabled=false;}
 };
 clear.onclick=()=>{
  try{root.localStorage.removeItem(storage);data=null;status.textContent='저장된 방문자 통계를 지웠습니다.';notify();}
  catch{status.textContent='저장 통계를 지우지 못했습니다.';}
 };
 root.addEventListener('storage',event=>{if(event.key===storage||event.key===null){restore();notify();}});
}
const api={months,aggregate,loadMonth,summary,renderChart};
root.VacancyVisitorTrend=api;
if(typeof module==='object'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
