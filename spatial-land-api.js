/* Land-characteristics lookup: sends only the selected PNU to VWorld on request. */
(function(root){'use strict';
function parse(data,pnu,year=''){
 if(!/^\d{19}$/.test(pnu))throw Error('19자리 PNU가 필요합니다.');
 const box=data?.landCharacteristicss||data?.landCharacteristics;
 if(!box){const code=String(data?.response?.error?.code||data?.error?.code||'').replace(/[^A-Za-z0-9_-]/g,'');throw Error('토지특성 응답을 확인하지 못했습니다'+(code?' ('+code+')':'')+'. 인증키의 토지특성 API 이용 권한을 확인하세요.');}
 const raw=box.field==null?[]:Array.isArray(box.field)?box.field:[box.field];
 if(Number(box.totalCount)>raw.length)throw Error('응답이 여러 페이지입니다. 기준연도를 지정해 다시 조회하세요.');
 const rows=raw.filter(r=>String(r.pnu)===pnu&&/^\d{4}$/.test(String(r.stdrYear))&&(!year||String(r.stdrYear)===year));
 if(!rows.length)throw Error('해당 필지·기준연도의 자료가 없습니다. 연도를 비워 조회하거나 다른 연도를 선택하세요.');
 const latest=rows.reduce((y,r)=>String(r.stdrYear)>y?String(r.stdrYear):y,'');const selected=rows.filter(r=>String(r.stdrYear)===latest);
 if(selected.length!==1)throw Error('동일 필지·연도에 여러 결과가 있어 자동 적용하지 않았습니다.');
 return selected[0];
}
let callbackSerial=0;
function browserRequest(url,signal){
 return new Promise((resolve,reject)=>{
  if(!root.document?.head)return reject(Error('브라우저 연결 도구를 사용할 수 없습니다. 온라인 현황판에서 다시 시도하세요.'));
  const callback='sejongLandCallback_'+Date.now()+'_'+(++callbackSerial),script=root.document.createElement('script');let finished=false,timer;
  function finish(error,data){if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);script.remove();delete root[callback];error?reject(error):resolve(data);}
  function abort(){finish(Error('조회 시간이 초과됐습니다. 다시 시도하세요.'));}
  if(signal?.aborted)return abort();
  root[callback]=data=>finish(null,data);signal?.addEventListener('abort',abort,{once:true});
  script.onerror=()=>finish(Error('브이월드 브라우저 연결도 실패했습니다. 인증키 등록 URL·토지특성 API 권한·네트워크를 확인하세요.'));
  script.onload=()=>{if(!finished)finish(Error('브이월드에서 브라우저용 응답을 받지 못했습니다. 토지특성 API 권한·등록 URL을 확인하세요. (응답 방식 확인 필요)'));};
  const callbackUrl=new URL(url);callbackUrl.searchParams.set('callback',callback);script.src=callbackUrl.href;script.referrerPolicy='strict-origin-when-cross-origin';
  timer=setTimeout(abort,20000);try{root.document.head.append(script);}catch{finish(Error('브라우저 호출이 차단됐습니다. 온라인 현황판에서 다시 시도하세요.'));}
 });
}
async function request(pnu,year,key,signal){
 if(!/^\d{19}$/.test(pnu))throw Error('19자리 PNU가 필요합니다.');
 const url=new URL('https://api.vworld.kr/ned/data/getLandCharacteristics');for(const [k,v]of Object.entries({pnu,format:'json',numOfRows:'1000',pageNo:'1',key,domain:new URL('.',root.location.href).href,...(year?{stdrYear:year}:{})}))url.searchParams.set(k,v);
 let response;try{response=await root.fetch(url.href,{signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});}catch(e){
  if(signal?.aborted||e.name==='AbortError')throw Error('조회 시간이 초과됐습니다. 다시 시도하세요.');
  if(root.document?.head)return parse(await browserRequest(url.href,signal),pnu,year);
  throw Error('토지특성 API에 연결하지 못했습니다. 온라인 현황판에서 다시 시도하세요.');
 }
 if(!response.ok)throw Error('토지특성 서버 응답 오류 ('+response.status+').');let json;try{json=await response.json();}catch{throw Error('JSON 응답을 받지 못했습니다. 토지특성 API 권한을 확인하세요.');}return parse(json,pnu,year);
}

async function runBatch(options){
 const {year='',key,signal,applyOne,onProgress=()=>{},requestOne=request,pause=ms=>new Promise(r=>setTimeout(r,ms))}=options;
 const pnus=[...new Set(options.pnus)];if(pnus.some(p=>!/^\d{19}$/.test(p)))throw Error('조회 목록에 잘못된 PNU가 있습니다.');
 const result={total:pnus.length,success:0,failed:0,errors:[],stopped:false,reason:''};let consecutive=0;
 for(const pnu of pnus){if(signal?.aborted){result.stopped=true;result.reason='사용자가 중지했습니다.';break;}
  onProgress({...result,current:pnu});const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,25000);
  try{const row=await requestOne(pnu,year,key,controller.signal);if(signal?.aborted){result.stopped=true;result.reason='사용자가 중지했습니다.';break;}const saved=await applyOne([row]);result.success++;consecutive=0;if(saved===false){result.stopped=true;result.reason='저장 공간이 부족해 중지했습니다. 마지막 조회 결과는 현재 화면에서만 사용할 수 있습니다.';break;}}
  catch(e){if(signal?.aborted){result.stopped=true;result.reason='사용자가 중지했습니다.';break;}result.failed++;consecutive++;result.errors.push({pnu,message:e.message});if(consecutive>=3){result.stopped=true;result.reason='연속 3건 실패해 중지했습니다. 인증키와 연결 상태를 확인하세요.';break;}}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);onProgress({...result,current:pnu});}
  if(result.success+result.failed<pnus.length)await pause(350);
 }
 return result;
}
function init(){if(new URLSearchParams(root.location.search).get('view')!=='reuse')return;const doc=root.document,panel=doc.getElementById('spatialImportPanel');if(!panel)return;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},box=el('details');box.id='landApiPanel';box.open=true;box.append(el('summary','토지특성 자동 조회'));
 const key=el('input');key.type='password';key.autocomplete='off';key.setAttribute('aria-label','브이월드 인증키');key.placeholder='브이월드 인증키';try{key.value=root.localStorage.getItem('sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':vworld-key')||'';}catch{}
 const year=el('input');year.type='number';year.min='1900';year.max=String(new Date().getFullYear());year.placeholder='기준연도: 비우면 응답 중 최신';year.setAttribute('aria-label','토지특성 기준연도');
 const selected=el('p','지도에서 빈집을 선택하세요.'),info=el('p','버튼을 누르면 필지번호(PNU)를 브이월드에 전송합니다. 전체 조회는 현재 연도의 모든 조사주소를 대상으로 하며 지역·등급 필터와 무관합니다. 같은 필지는 한 번만 조회합니다.');info.className='spatial-note';
 const button=el('button','선택한 빈집 토지정보 조회');button.type='button';button.disabled=true;
 const bulk=el('button','현재 연도 전체 조회·이어하기');bulk.type='button';const stop=el('button','조회 중지');stop.type='button';stop.disabled=true;
 const skip=el('input');skip.type='checkbox';skip.checked=true;const skipLabel=el('label','저장된 결과 건너뛰기');skipLabel.append(skip);
 const hint=el('p','연도를 비우면 저장된 결과를 그대로 재사용합니다. 최신 자료를 다시 확인하려면 건너뛰기를 해제하세요. 창을 닫거나 탭을 이동하면 조회가 멈추며 완료된 결과는 남습니다.');hint.className='spatial-note';
 const progress=el('progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','토지정보 조회 진행');progress.style.width='100%';
 const errors=el('details');errors.append(el('summary','실패한 필지 확인'));const errorList=el('div');errors.append(errorList);
 const status=el('p');status.className='spatial-note';status.setAttribute('role','status');let current=null,busy=false,batchController=null;
 function setBusy(value){busy=value;button.disabled=value||!current;bulk.disabled=value;stop.disabled=!value||!batchController;key.disabled=value;year.disabled=value;skip.disabled=value;}
 function settings(){const value=key.value.trim(),y=year.value.trim();if(!value)throw Error('브이월드 인증키를 입력하세요. 키는 대화창에 보내지 않아도 됩니다.');if(y&&(!/^\d{4}$/.test(y)||+y<1900||+y>new Date().getFullYear()))throw Error('기준연도를 확인하세요.');return{value,y};}
 root.addEventListener('vacancy-spatial-focus',event=>{current=event.detail.pnu&&/^\d{19}$/.test(event.detail.pnu)?{pnu:event.detail.pnu,address:event.detail.address}:null;selected.textContent=current?(current.address||'선택 필지')+' · PNU '+current.pnu:'연결된 필지번호가 없습니다. 연속지적도 연결을 확인하세요.';button.disabled=busy||!current;if(!busy)status.textContent='';});
 button.onclick=async()=>{if(!current||busy)return;let setting;try{setting=settings();}catch(e){status.textContent=e.message;return;}const target={...current};setBusy(true);status.textContent='선택한 필지의 토지정보를 조회합니다…';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{const row=await request(target.pnu,setting.y,setting.value,controller.signal);const saved=await root.VacancySpatial.connectLand([row]);if(current?.pnu===target.pnu)status.textContent=row.stdrYear+'년 자료 연결 완료 · '+(saved?'이 브라우저에 저장됨':'저장 공간 부족: 현재 화면에서만 사용');}catch(e){if(current?.pnu===target.pnu)status.textContent=e.message;}finally{clearTimeout(timer);setBusy(false);}};
 stop.onclick=()=>{if(batchController){batchController.abort();stop.disabled=true;status.textContent='중지 중입니다. 완료된 자료는 유지합니다.';}};
 bulk.onclick=async()=>{if(busy)return;let setting,plan;try{setting=settings();plan=root.VacancySpatial.landTargets(setting.y,skip.checked);}catch(e){status.textContent=e.message;return;}
  const context=' · 저장 결과 '+plan.cached+'필지 재사용 · PNU 미연결 '+plan.missing+'주소';errorList.replaceChildren();progress.max=Math.max(1,plan.pnus.length);progress.value=0;
  if(!plan.pnus.length){status.textContent='새로 조회할 필지가 없습니다'+context;return;}
  batchController=new AbortController();setBusy(true);
  try{const result=await runBatch({pnus:plan.pnus,year:setting.y,key:setting.value,signal:batchController.signal,applyOne:rows=>root.VacancySpatial.connectLand(rows),onProgress:r=>{progress.value=r.success+r.failed;status.textContent='처리 '+(r.success+r.failed)+' / '+r.total+'필지 · 성공 '+r.success+' · 실패 '+r.failed+context;}});
   status.textContent=(result.stopped?'조회 중지':'조회 완료')+' · 성공 '+result.success+' · 실패 '+result.failed+' / 대상 '+result.total+'필지'+context+(result.reason?' · '+result.reason:'');
   for(const error of result.errors){const p=el('p',error.pnu+' · '+error.message);p.className='spatial-note';errorList.append(p);}
  }catch(e){status.textContent=e.message;}finally{batchController=null;setBusy(false);}
 };
 box.append(info,key,year,selected,button,skipLabel,hint,bulk,stop,progress,status,errors);panel.append(box);
}

const api={parse,request,browserRequest,runBatch};if(typeof module==='object'&&module.exports)module.exports=api;root.VacancyLandApi=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
