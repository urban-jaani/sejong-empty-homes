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
async function request(pnu,year,key,signal){
 const url=new URL('https://api.vworld.kr/ned/data/getLandCharacteristics');for(const [k,v]of Object.entries({pnu,format:'json',numOfRows:'1000',pageNo:'1',key,domain:new URL('.',root.location.href).href,...(year?{stdrYear:year}:{})}))url.searchParams.set(k,v);
 let response;try{response=await root.fetch(url.href,{signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});}catch(e){if(e.name==='AbortError')throw Error('조회 시간이 초과됐습니다. 다시 시도하세요.');throw Error('토지특성 API에 연결하지 못했습니다. 인터넷·인증키 등록 URL·API 권한과 브라우저 교차출처 허용 여부를 확인하세요.');}
 if(!response.ok)throw Error('토지특성 서버 응답 오류 ('+response.status+').');let json;try{json=await response.json();}catch{throw Error('JSON 응답을 받지 못했습니다. 토지특성 API 권한을 확인하세요.');}return parse(json,pnu,year);
}
function init(){if(new URLSearchParams(root.location.search).get('view')!=='reuse')return;const doc=root.document,panel=doc.getElementById('spatialImportPanel');if(!panel)return;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},box=el('details');box.id='landApiPanel';box.open=true;box.append(el('summary','토지특성 자동 조회'));
 const key=el('input');key.type='password';key.autocomplete='off';key.setAttribute('aria-label','브이월드 인증키');key.placeholder='브이월드 인증키';try{key.value=root.localStorage.getItem('sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':vworld-key')||'';}catch{}
 const year=el('input');year.type='number';year.min='1900';year.max=String(new Date().getFullYear());year.placeholder='기준연도: 비우면 응답 중 최신';year.setAttribute('aria-label','토지특성 기준연도');
 const selected=el('p','지도에서 빈집을 선택하세요.'),info=el('p','조회 버튼을 누르면 선택 필지번호(PNU)를 브이월드에 전송합니다. 주소나 조사 목록은 전송하지 않습니다.');info.className='spatial-note';
 const button=el('button','선택한 빈집 토지정보 조회');button.type='button';button.disabled=true;const status=el('p');status.className='spatial-note';status.setAttribute('role','status');let current=null,busy=false;
 root.addEventListener('vacancy-spatial-focus',event=>{current=event.detail.pnu&&/^\d{19}$/.test(event.detail.pnu)?{pnu:event.detail.pnu,address:event.detail.address}:null;selected.textContent=current?(current.address||'선택 필지')+' · PNU '+current.pnu:'연결된 필지번호가 없습니다. 연속지적도 연결을 확인하세요.';button.disabled=busy||!current;status.textContent='';});
 button.onclick=async()=>{if(!current||busy)return;const value=key.value.trim(),y=year.value.trim();if(!value){status.textContent='브이월드 인증키를 입력하세요. 키는 대화창에 보내지 않아도 됩니다.';return;}if(y&&(!/^\d{4}$/.test(y)||+y<1900||+y>new Date().getFullYear())){status.textContent='기준연도를 확인하세요.';return;}const target={...current};busy=true;button.disabled=true;status.textContent='선택한 필지의 토지정보를 조회합니다…';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{const row=await request(target.pnu,y,value,controller.signal);const saved=await root.VacancySpatial.connectLand([row]);if(current?.pnu===target.pnu)status.textContent=row.stdrYear+'년 자료 연결 완료 · '+(saved?'이 브라우저에 저장됨':'저장 공간 부족: 현재 화면에서만 사용');}catch(e){if(current?.pnu===target.pnu)status.textContent=e.message;}finally{clearTimeout(timer);busy=false;button.disabled=!current;}};
 box.append(info,key,year,selected,button,status);panel.append(box);
}
const api={parse,request};if(typeof module==='object'&&module.exports)module.exports=api;root.VacancyLandApi=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();}
})(typeof window!=='undefined'?window:globalThis);
