/* Official VWorld land-use attributes. Preserve designation relationships; no legal verdict. */
(function(root){'use strict';
const ENDPOINT='https://api.vworld.kr/ned/data/getLandUseAttr';
function parsePage(data,pnu){
 const box=data?.landUses||data?.landUseAttrs||data?.landUseAttr;
 if(!box){const code=String(data?.response?.error?.code||data?.error?.code||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80);throw Error('토지이용계획 응답을 읽지 못했습니다'+(code?' ('+code+')':'')+'. 토지이용계획 API 권한을 확인하세요.');}
 const rows=box.field==null?[]:Array.isArray(box.field)?box.field:[box.field];let total=box.totalCount==null?rows.length:Number(box.totalCount);
 if(!Number.isSafeInteger(total)||total<0||total<rows.length||(!rows.length&&total>0))throw Error('토지이용계획의 결과 건수를 확인하지 못했습니다.');
 if(box.totalCount==null&&rows.length===1000)throw Error('전체 결과 건수가 없어 다음 페이지 여부를 판단할 수 없습니다.');
 if(rows.some(r=>String(r.pnu)!==pnu))throw Error('응답의 필지번호가 조회한 PNU와 다릅니다. 자동 적용하지 않았습니다.');
 const items=rows.map(r=>({code:String(r.prposAreaDstrcCode||'').slice(0,100),name:String(r.prposAreaDstrcCodeNm||'').slice(0,300),relationCode:String(r.cnflcAt??'').slice(0,30),relation:String(r.cnflcAtNm||'').slice(0,100),mapNumber:String(r.manageNo||'').slice(0,200),date:String(r.lastUpdtDt||'').slice(0,40)}));
 if(items.some(r=>!r.code&&!r.name))throw Error('지정 명칭과 코드가 없는 결과가 있어 적용하지 않았습니다.');return{items,total,rawCount:rows.length};
}
async function request(pnu,key,signal){
 if(!/^\d{19}$/.test(pnu))throw Error('19자리 필지번호가 필요합니다.');const all=[];let expected=null;
 for(let page=1;page<=20;page++){
  const url=new URL(ENDPOINT);for(const [k,v]of Object.entries({pnu,key,domain:new URL('.',root.location.href).href,format:'json',numOfRows:'1000',pageNo:String(page)}))url.searchParams.set(k,v);
  let response,data;try{response=await root.fetch(url.href,{signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});}catch(e){if(signal?.aborted||e.name==='AbortError')throw Error('조회가 중지됐거나 시간이 초과됐습니다.');if(!root.VacancyLandApi?.browserRequest)throw Error('브라우저 연결 도구가 없습니다. spatial-land-api.js도 함께 확인하세요.');data=await root.VacancyLandApi.browserRequest(url.href,signal);}
  if(response){if(!response.ok)throw Error('토지이용계획 서버 오류 ('+response.status+').');try{data=await response.json();}catch{throw Error('JSON 응답을 받지 못했습니다. 토지이용계획 API 권한을 확인하세요.');}}
  if(signal?.aborted)throw Error('조회를 중지했습니다.');const part=parsePage(data,pnu);if(expected===null)expected=part.total;else if(expected!==part.total)throw Error('조회 중 결과 건수가 바뀌었습니다. 다시 조회하세요.');
  all.push(...part.items);if(all.length>=expected){if(all.length!==expected)throw Error('페이지별 건수 합계가 맞지 않습니다.');const seen=new Set();for(const item of all){const identity=JSON.stringify(item);if(seen.has(identity))throw Error('중복 페이지 또는 동일 결과가 있어 자동 적용하지 않았습니다.');seen.add(identity);}return{pnu,designations:all,queriedAt:new Date().toISOString()};}
  if(!part.rawCount)throw Error('다음 페이지 결과가 누락됐습니다.');
 }
 throw Error('조회 페이지가 너무 많아 중지했습니다.');
}
async function runBatch({pnus,key,signal,applyOne,onProgress=()=>{},requestOne=request,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
 const result={total:new Set(pnus).size,success:0,failed:0,errors:[],stopped:false,reason:''};let consecutive=0;
 for(const pnu of new Set(pnus)){if(signal?.aborted){result.stopped=true;result.reason='사용자가 중지했습니다.';break;}const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,25000);signal?.addEventListener('abort',abort,{once:true});
  try{const row=await requestOne(pnu,key,controller.signal);if(signal?.aborted){result.stopped=true;result.reason='사용자가 중지했습니다.';break;}const saved=await applyOne([row]);result.success++;consecutive=0;if(saved===false){result.stopped=true;result.reason='저장 공간 부족: 마지막 결과는 현재 화면에서만 사용합니다.';break;}}
  catch(e){if(signal?.aborted){result.stopped=true;result.reason='사용자가 중지했습니다.';break;}result.failed++;consecutive++;result.errors.push({pnu,message:e.message});if(consecutive>=3){result.stopped=true;result.reason='연속 3건 실패해 중지했습니다. 인증키·연결 상태를 확인하세요.';break;}}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);onProgress({...result});}
  if(result.success+result.failed<result.total)await pause(350);
 }
 return result;
}
function init(){if(new URL(root.location.href).searchParams.get('view')!=='reuse')return;const doc=root.document,panel=doc.getElementById('spatialImportPanel');if(!panel)return;const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},box=el('details');box.id='landUseApiPanel';box.open=true;box.append(el('summary','토지이용계획 자동 조회'));
 const note=el('p','필지번호를 브이월드로 전송해 지정 명칭·관계를 가져옵니다. 지정 관계는 원자료 제공값으로 표시하며, 건축·용도변경 가능 여부를 판정하지 않습니다.');note.className='spatial-note';
 const key=el('input');key.type='password';key.autocomplete='off';key.placeholder='브이월드 인증키';key.setAttribute('aria-label','토지이용계획 조회 인증키');try{key.value=root.localStorage.getItem('sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':vworld-key')||'';}catch{}
 const selected=el('p','지도에서 빈집을 선택하세요.'),single=el('button','선택 빈집 토지이용계획 조회'),bulk=el('button','현재 연도 전체 조회·이어하기'),stop=el('button','토지이용계획 조회 중지');single.type=bulk.type=stop.type='button';single.disabled=stop.disabled=true;
 const skip=el('input');skip.type='checkbox';skip.checked=true;const label=el('label','저장된 토지이용계획 건너뛰기');label.append(skip);const hint=el('p','전체 조회는 지역·등급 조건과 관계없이 현재 연도 조사 전체를 대상으로 합니다. 저장된 결과의 갱신 여부를 다시 확인하려면 체크를 해제하세요. 조회 중에는 창을 열어두세요.');hint.className='spatial-note';
 const status=el('p');status.className='spatial-note';status.setAttribute('role','status');const progress=el('progress');progress.max=1;progress.value=0;progress.style.width='100%';progress.setAttribute('aria-label','토지이용계획 조회 진행');const failures=el('details');failures.append(el('summary','실패한 필지 확인'));const list=el('div');failures.append(list);
 let current=null,busy=false,controller=null;const setBusy=v=>{busy=v;single.disabled=v||!current;bulk.disabled=v;stop.disabled=!v;key.disabled=skip.disabled=v;};
 root.addEventListener('vacancy-spatial-focus',e=>{current=/^\d{19}$/.test(e.detail.pnu)?{pnu:e.detail.pnu,address:e.detail.address}:null;selected.textContent=current?(current.address||'선택 필지')+' · '+current.pnu:'연결된 PNU가 없습니다.';single.disabled=busy||!current;});
 async function start(all){if(busy||(!all&&!current))return;const value=key.value.trim();if(!value){status.textContent='인증키를 입력하세요. 키는 대화창에 보내지 않아도 됩니다.';return;}let plan;try{plan=all?root.VacancySpatial.zoningTargets(skip.checked):{pnus:[current.pnu],cached:0,missing:0};}catch(e){status.textContent=e.message;return;}const suffix=' · 저장 결과 '+plan.cached+'필지 재사용 · PNU 미연결 '+plan.missing+'주소';if(!plan.pnus.length){status.textContent='새로 조회할 필지가 없습니다'+suffix;return;}
  list.replaceChildren();progress.max=plan.pnus.length;progress.value=0;controller=new AbortController();setBusy(true);status.textContent='토지이용계획을 조회합니다…';
  try{const result=await runBatch({pnus:plan.pnus,key:value,signal:controller.signal,applyOne:rows=>root.VacancySpatial.connectZoning(rows),onProgress:r=>{progress.value=r.success+r.failed;status.textContent='처리 '+(r.success+r.failed)+' / '+r.total+'필지 · 성공 '+r.success+' · 실패 '+r.failed+suffix;}});status.textContent=(result.stopped?'조회 중지':'토지이용계획 연결 완료')+' · 성공 '+result.success+' · 실패 '+result.failed+suffix+(result.reason?' · '+result.reason:'');for(const error of result.errors){const p=el('p',error.pnu+' · '+error.message);p.className='spatial-note';list.append(p);}}
  catch(e){status.textContent=e.message;}finally{controller=null;setBusy(false);}
 }
 single.onclick=()=>start(false);bulk.onclick=()=>start(true);stop.onclick=()=>{controller?.abort();stop.disabled=true;status.textContent='중지 중입니다. 저장된 결과는 유지됩니다.';};box.append(note,key,selected,single,label,hint,bulk,stop,progress,status,failures);panel.append(box);
}
const api={parsePage,request,runBatch};if(typeof module==='object'&&module.exports)module.exports=api;root.VacancyLandUse=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
