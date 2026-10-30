/* Reuse-only screening. Results are evidence filters, not safety or legal decisions. */
(function(root){'use strict';if(new URLSearchParams(root.location.search).get('view')!=='reuse')return;
const core=root.VacancySpatialCore;if(!core)return;const norm=v=>String(v??'').trim().replace(/\s+/g,' ');
let options={ageEnabled:false,minAge:40,areaEnabled:false,maxArea:100,road:'all'},allowed=null,status,timer;
const isActive=()=>options.ageEnabled||options.areaEnabled||options.road!=='all';
function rebuild(){if(!isActive()){allowed=null;if(status)status.textContent='조건을 선택하면 지도·조사목록·집계에 함께 적용합니다.';return;}
 const records=root.VacancySpatialBridge?.records()||[],groups=new Map();for(const record of records){const key=norm(record.address);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
 allowed=new Set();let unknown=0;
 for(const [key,items]of groups){const target={...items[0]};for(const field of ['approvalDate','landArea']){const values=new Set(items.map(r=>field==='landArea'?core.number(r[field]):norm(r[field])).filter(v=>v!==null&&v!==''&&v!=='미기재'));target[field]=values.size===1?[...values][0]:null;}
 const res=root.VacancySpatial.resolve(target),state=core.evaluateReviewFilter(res,target,options);if(state==='match')allowed.add(key);else if(state==='unknown')unknown++;}
 if(status)status.textContent='전체 '+groups.size+'주소 중 조건 일치 '+allowed.size+' · 자료 부족으로 판단 불가 '+unknown+' · 조건 불일치 '+(groups.size-allowed.size-unknown)+'. 지도에는 지역·등급 선택도 함께 적용됩니다.';
}
root.VacancyReuseFilter={rebuild,isActive,matches:address=>!isActive()||allowed===null||allowed.has(norm(address))};
function init(){const doc=root.document,left=doc.querySelector('.dashboard-left');if(!left)return;const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};const panel=el('section');panel.id='reuseFilterPanel';panel.className='spatial-import';panel.append(el('h3','조건으로 빈집 찾기'));
 const age=el('input');age.type='checkbox';const ageLabel=el('label','경과연수 이상');ageLabel.append(age);const ageValue=el('input');ageValue.type='number';ageValue.min='1';ageValue.value='40';ageValue.setAttribute('aria-label','최소 경과연수');
 const area=el('input');area.type='checkbox';const areaLabel=el('label','대장 대지면적 미만 (㎡)');areaLabel.append(area);const areaValue=el('input');areaValue.type='number';areaValue.min='0.1';areaValue.step='any';areaValue.value='100';areaValue.setAttribute('aria-label','최대 대장 대지면적');
 const road=el('select');road.setAttribute('aria-label','도로접면 자료 확인 여부');for(const [v,t]of [['all','도로접면 자료: 전체'],['missing','도로접면 자료 미확인'],['known','도로접면 자료 있음']]){const option=el('option',t);option.value=v;road.append(option);}road.value='all';
 const apply=el('button','조건 적용');apply.type='button';const reset=el('button','조건 초기화');reset.type='button';status=el('p');status.className='spatial-note';status.setAttribute('role','status');
 const note=el('p','선택한 조건을 모두 충족하는 주소를 표시합니다. 대지면적은 공부상 필지면적과 다를 수 있으며, 0·빈 값은 면적 판단에서 제외합니다. 경과연수는 연도 차이이고 안전 상태를 뜻하지 않습니다. 도로자료 미확인은 맹지를 뜻하지 않습니다.');note.className='spatial-note';
 apply.onclick=()=>{const minAge=Number(ageValue.value),maxArea=Number(areaValue.value);if((age.checked&&(!Number.isFinite(minAge)||minAge<1))||(area.checked&&(!Number.isFinite(maxArea)||maxArea<=0))){status.textContent='선택한 조건의 연수·면적에 양수를 입력하세요.';return;}options={ageEnabled:age.checked,minAge,areaEnabled:area.checked,maxArea,road:road.value};root.VacancySpatialBridge.refreshView(true);};
 reset.onclick=()=>{age.checked=false;area.checked=false;road.value='all';options={ageEnabled:false,minAge:40,areaEnabled:false,maxArea:100,road:'all'};ageValue.value='40';areaValue.value='100';root.VacancySpatialBridge.refreshView(true);};
 panel.append(ageLabel,ageValue,areaLabel,areaValue,road,apply,reset,status,note);left.insertBefore(panel,left.children[2]||null);rebuild();
}
root.addEventListener('vacancy-spatial-data-changed',()=>{if(!isActive())return;clearTimeout(timer);timer=setTimeout(()=>root.VacancySpatialBridge?.refreshView(),500);});
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();
})(window);
