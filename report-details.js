/* Local-only detailed survey and per-house PDF viewer. No dataset or PDF is fetched/uploaded. */
(function(root){
'use strict';
const stringFields=['id','address','region','grade','fieldSurveyDate','gradeSurveyDate','type','approvalYear','floors','structure','roof','vacancyPeriod','vacancyCause','reuseIntent','disclosureIntent'];
const numberFields=['landArea','totalArea','buildingArea'];
function normalizeAddress(value){return String(value??'').trim().replace(/\s+/g,' ').replace(/^세종시\s+/,'세종특별자치시 ');}
function validateDataset(input){
 if(!input||input.format!=='sejong-vacancy-details'||input.version!==1||!Array.isArray(input.records)||!input.records.length||input.records.length>10000)throw new Error('상세 조사대장 JSON 형식이 아닙니다. 제공된 파일을 선택하세요.');
 const src=input.source;
 if(!src||!Number.isInteger(src.pageCount)||src.pageCount<2||src.pageCount>20000||!Number.isInteger(src.byteLength)||src.byteLength<1||!/^[a-f0-9]{64}$/.test(src.sha256)||typeof src.name!=='string'||!Number.isInteger(src.year))throw new Error('원본 PDF 확인 정보가 올바르지 않습니다.');
 const ids=new Set(),pages=new Set();
 const records=input.records.map(row=>{
  if(!row||!Number.isInteger(row.page)||row.page<2||row.page>src.pageCount||row.reportYear!==src.year)throw new Error('보고서 페이지 또는 조사연도가 올바르지 않습니다.');
  const clean={page:row.page,reportYear:row.reportYear};
  for(const k of stringFields){if(typeof row[k]!=='string'||row[k].length>1000)throw new Error('상세대장 항목 형식을 확인하세요.');clean[k]=row[k];}
  if(!clean.id.trim()||!clean.address.trim()||ids.has(clean.id)||pages.has(clean.page))throw new Error('고유번호 또는 페이지가 중복되거나 비어 있습니다.');
  ids.add(clean.id);pages.add(clean.page);
  for(const k of numberFields){if(row[k]!==null&&(!Number.isFinite(row[k])||row[k]<0))throw new Error('면적 형식을 확인하세요.');clean[k]=row[k];}
  return clean;
 });
 return {format:input.format,version:1,source:{name:src.name.slice(0,200),year:src.year,pageCount:src.pageCount,byteLength:src.byteLength,sha256:src.sha256},records};
}
function lookupRecords(dataset,addresses){
 const keys=new Set(addresses.map(normalizeAddress).filter(Boolean));
 return dataset?dataset.records.filter(r=>keys.has(normalizeAddress(r.address))):[];
}
async function verifyPdfBytes(bytes,source,cryptoApi){
 if(bytes.byteLength!==source.byteLength)throw new Error('원본 PDF와 파일 크기가 다릅니다. 상세대장에 대응하는 원본을 선택하세요.');
 if(!cryptoApi?.subtle)throw new Error('이 브라우저에서는 PDF 원본 확인을 할 수 없습니다. 최신 Chrome 또는 Edge의 HTTPS 화면에서 시도하세요.');
 const digest=await cryptoApi.subtle.digest('SHA-256',bytes);
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==source.sha256)throw new Error('상세대장과 다른 PDF입니다. 페이지가 잘못 연결되지 않도록 원본을 다시 선택하세요.');
 return true;
}
async function extractPage(sourceDoc,page,PDFLib){
 if(!Number.isInteger(page)||page<1||page>sourceDoc.getPageCount())throw new Error('보고서 페이지 범위를 확인하세요.');
 const doc=await PDFLib.PDFDocument.create();const [copied]=await doc.copyPages(sourceDoc,[page-1]);
 // Prevent copied annotations from retaining actions/links. Page content, images and text remain unchanged.
 copied.node.delete(PDFLib.PDFName.of('Annots'));doc.addPage(copied);doc.setTitle('개별 빈집 조사보고서');
 return doc.save();
}
const api={validateDataset,normalizeAddress,lookupRecords,verifyPdfBytes,extractPage};
if(typeof module==='object'&&module.exports)module.exports=api;
if(!root.document)return;
const doc=root.document;
const storeKey='sejong-dashboard:v1:'+new URL('.',root.location.href).pathname+':report-details';
let metadataRequest=0;
let dataset=null,sourcePdf=null,pdfLoading=false,selectionSerial=0,viewerUrl=null,panel=null,statusEl=null,pdfStatusEl=null,searchDialog=null,viewerDialog=null;
function el(tag,text,className){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function textValue(value){return value===null||value===undefined||value===''?'미기재':String(value);}
function labelInput(text,type,accept){const label=el('label',text),input=el('input');input.type=type;input.accept=accept;label.append(input);return [label,input];}
function closeViewer(){if(viewerDialog){viewerDialog.close();viewerDialog.replaceChildren();}if(viewerUrl){URL.revokeObjectURL(viewerUrl);viewerUrl=null;}}
function mount(host,addresses){const target=el('section',undefined,'report-detail-card');target.dataset.reportAddresses=JSON.stringify([...new Set(addresses.filter(a=>typeof a==='string'&&a.trim()))]);host.append(target);renderLinked(target);return target;}
function refresh(){for(const node of doc.querySelectorAll('[data-report-addresses]'))renderLinked(node);if(searchDialog?.open)renderSearch();}
function renderLinked(host){
 const addresses=JSON.parse(host.dataset.reportAddresses||'[]');host.replaceChildren();host.append(el('h4','2025년 상세조사 · 원본 보고서'));
 if(!dataset){host.append(el('p','왼쪽 「상세 조사보고서」에서 상세대장 JSON과 원본 PDF를 선택하세요.'));return;}
 const matches=lookupRecords(dataset,addresses);
 if(!matches.length){host.append(el('p','이 주소와 일치하는 2025년 조사표가 없습니다. 상세대장 검색으로 주소 표기를 확인하세요.'));return;}
 const duplicate=addresses.some(a=>lookupRecords(dataset,[a]).length>1);
 host.append(el('p',duplicate?'같은 주소의 조사표가 여러 장입니다. 고유번호·면적·구조를 대조한 뒤 해당 보고서를 선택하세요.':'주소가 일치하는 조사표입니다. 동일 건물인지 고유번호·면적·구조로 확인하세요.','report-note'));
 for(const r of matches)host.append(recordCard(r));
}
function recordCard(r){
 const card=el('details',undefined,'report-record');card.open=true;
 card.append(el('summary','고유번호 '+r.id+' · '+r.grade+' · '+r.page+'쪽'));
 card.append(el('p',r.address));
 const dl=el('dl');
 const fields=[['현장조사일',r.fieldSurveyDate],['등급산정일',r.gradeSurveyDate],['주택유형',r.type],['사용승인연도',r.approvalYear],['대지면적',r.landArea===null?null:r.landArea+' ㎡'],['건축면적',r.buildingArea===null?null:r.buildingArea+' ㎡'],['연면적',r.totalArea===null?null:r.totalArea+' ㎡'],['층수',r.floors],['구조',r.structure],['지붕',r.roof],['미거주 기간',r.vacancyPeriod],['발생 원인',r.vacancyCause],['향후 활용의향',r.reuseIntent],['공개 동의 의향',r.disclosureIntent]];
 for(const [k,v]of fields)dl.append(el('dt',k),el('dd',textValue(v)));card.append(dl);
 card.append(el('p','2025년 조사 당시 기록입니다. 기존 탭의 등급을 덮어쓰지 않으며, 빈칸은 미기재입니다. 활용·철거 결정에는 추가 확인이 필요합니다.','report-note'));
 const button=el('button',sourcePdf?'개별 조사보고서 PDF 보기':'원본 PDF 선택 후 보고서 보기');button.type='button';button.disabled=!sourcePdf||pdfLoading;button.onclick=()=>openRecord(r);card.append(button);
 return card;
}
async function openRecord(record){
 if(!sourcePdf||!dataset||pdfLoading)return;
 closeViewer();const capturedPdf=sourcePdf;const serial=selectionSerial;
 if(!viewerDialog){viewerDialog=el('dialog',undefined,'report-viewer');doc.body.append(viewerDialog);viewerDialog.addEventListener('cancel',e=>{e.preventDefault();closeViewer();});}
 const close=el('button','닫기');close.type='button';close.onclick=closeViewer;
 const title=el('h3',record.address+' · 고유번호 '+record.id);
 const info=el('p','원본 '+record.page+'쪽을 한 장으로 준비합니다.');
 viewerDialog.append(close,title,info,el('p','이 원문에는 소유자 등 개인정보가 포함될 수 있습니다. 공개 저장소에 올리지 마세요.','report-note'));viewerDialog.showModal();
 try{
  const bytes=await extractPage(capturedPdf,record.page,root.PDFLib);
  if(serial!==selectionSerial||!viewerDialog.open)return;
  viewerUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  info.textContent='원본 '+record.page+'쪽 · 현재 PDF는 이 조사표 1쪽만 포함합니다.';
  const link=el('a','PDF 열기 / 저장');link.href=viewerUrl;link.target='_blank';link.rel='noopener';
  const download=el('a','한 장 다운로드');download.href=viewerUrl;download.download='빈집조사_'+record.id+'.pdf';
  const frame=el('iframe');frame.title='개별 조사보고서';frame.src=viewerUrl+'#page=1&view=FitH';
  viewerDialog.append(link,doc.createTextNode(' · '),download,frame);
 }catch{info.textContent='이 페이지를 PDF로 준비하지 못했습니다. 원본 파일과 PDF 도구를 확인하세요.';}
}
function renderSearch(){
 const results=searchDialog.querySelector('.report-search-results'),input=searchDialog.querySelector('input'),query=input.value.trim();results.replaceChildren();
 if(!dataset){results.append(el('p','먼저 상세대장 JSON을 선택하세요.'));return;}
 const found=dataset.records.filter(r=>!query||r.address.includes(query)||r.id.includes(query)||r.region.includes(query));
 results.append(el('p','검색 '+found.length+'건 / 전체 '+dataset.records.length+'건 · 처음 50건 표시'));
 for(const r of found.slice(0,50)){const block=recordCard(r);block.open=false;results.append(block);}
}
function showSearch(){
 if(!searchDialog){searchDialog=el('dialog',undefined,'report-search');const close=el('button','닫기');close.onclick=()=>searchDialog.close();const input=el('input');input.type='search';input.placeholder='주소 또는 고유번호';input.setAttribute('aria-label','주소 또는 고유번호 검색');input.oninput=renderSearch;searchDialog.append(close,el('h3','2025년 상세 조사대장 검색'),input,el('div',undefined,'report-search-results'));doc.body.append(searchDialog);}
 renderSearch();searchDialog.showModal();
}
function setStatus(message){statusEl.textContent=message;}
async function importMetadata(file){
 if(!file)return;const request=++metadataRequest;
 try{
  if(file.size>12*1024*1024)throw new Error('상세대장 파일이 너무 큽니다. 제공된 JSON을 선택하세요.');
  const clean=validateDataset(JSON.parse(await file.text()));if(request!==metadataRequest)return;
  selectionSerial++;sourcePdf=null;pdfLoading=false;closeViewer();dataset=clean;
  pdfStatusEl.textContent='원본 PDF를 선택하세요. PDF는 이 화면을 닫으면 해제됩니다.';
  let saved=true;try{root.localStorage.setItem(storeKey,JSON.stringify(clean));}catch{saved=false;}
  setStatus(clean.source.year+'년 상세조사 '+clean.records.length+'건 (빈집미해당 포함) · '+(saved?'이 브라우저에 저장됨':'저장 공간 부족: 현재 화면에서만 사용'));refresh();
 }catch(error){if(request!==metadataRequest)return;setStatus(error instanceof SyntaxError?'JSON 파일을 읽지 못했습니다. 기존 상세대장은 유지됩니다.':error.message+' 기존 상세대장은 유지됩니다.');}
}
async function importPdf(file){
 if(!file)return;
 if(!dataset){pdfStatusEl.textContent='먼저 상세대장 JSON을 선택하세요.';return;}
 const serial=++selectionSerial;sourcePdf=null;pdfLoading=true;closeViewer();refresh();
 pdfStatusEl.textContent='PDF 원본을 확인하고 있습니다…';
 try{
  if(!root.PDFLib)throw new Error('PDF 도구 파일이 없습니다. pdf-lib.min.js를 HTML과 같은 폴더에 두세요.');
  if(file.size!==dataset.source.byteLength)throw new Error('원본 PDF와 크기가 다릅니다. 제공한 보고서 원본을 선택하세요.');
  const bytes=await file.arrayBuffer();await verifyPdfBytes(bytes,dataset.source,root.crypto);
  const parsed=await root.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});
  if(parsed.getPageCount()!==dataset.source.pageCount)throw new Error('PDF 페이지 수가 일치하지 않습니다.');
  if(serial!==selectionSerial)return;sourcePdf=parsed;pdfStatusEl.textContent='원본 일치 확인 · '+parsed.getPageCount()+'쪽 · PDF는 서버로 업로드하지 않으며 이 화면에서만 사용합니다.';
 }catch(error){if(serial===selectionSerial)pdfStatusEl.textContent=error.message;}
 finally{if(serial===selectionSerial){pdfLoading=false;refresh();}}
}
function init(){
 const host=doc.querySelector('.dashboard-left')||doc.querySelector('.workspace > aside')||doc.querySelector('.grid > aside');if(!host)return;
 panel=el('details',undefined,'report-import');panel.append(el('summary','상세 조사보고서 (2025년)'));
 panel.append(el('p','① 상세대장 JSON → ② 원본 PDF를 선택하세요. 상세대장은 이 브라우저에 기억하고 PDF는 화면을 다시 열 때 선택합니다.','report-note'));
 const [jsonLabel,jsonInput]=labelInput('상세대장 선택','file','.json');jsonInput.onchange=()=>importMetadata(jsonInput.files[0]);
 statusEl=el('p','상세대장을 선택하세요.','report-note');statusEl.setAttribute('role','status');
 const [pdfLabel,pdfInput]=labelInput('원본 결과보고서 PDF 선택','file','.pdf');pdfInput.onchange=()=>importPdf(pdfInput.files[0]);
 pdfStatusEl=el('p','PDF는 서버로 전송하지 않습니다.','report-note');pdfStatusEl.setAttribute('role','status');
 const search=el('button','상세대장 검색');search.type='button';search.onclick=showSearch;
 const forget=el('button','상세대장 기억 해제');forget.type='button';forget.onclick=()=>{
  try{root.localStorage.removeItem(storeKey);}catch{setStatus('저장된 상세대장을 지우지 못했습니다. 브라우저 설정을 확인하세요.');return;}
  metadataRequest++;selectionSerial++;dataset=null;sourcePdf=null;pdfLoading=false;closeViewer();jsonInput.value='';pdfInput.value='';setStatus('이 브라우저의 상세대장 기억을 해제했습니다. 원본 파일은 그대로 있습니다.');pdfStatusEl.textContent='PDF 선택 해제됨';refresh();
 };
 panel.append(jsonLabel,statusEl,pdfLabel,pdfStatusEl,search,forget,el('p','주소·건물정보가 포함된 상세대장과 원본 PDF는 공개 GitHub에 올리지 마세요.','report-note'));host.append(panel);
 try{const raw=root.localStorage.getItem(storeKey);if(raw){dataset=validateDataset(JSON.parse(raw));setStatus(dataset.source.year+'년 상세조사 '+dataset.records.length+'건 (빈집미해당 포함) · 저장자료 복원');}}catch{setStatus('저장된 상세대장을 읽지 못했습니다. JSON 파일을 다시 선택하세요.');}
 refresh();
 root.addEventListener('storage',e=>{if(e.key===storeKey){try{dataset=e.newValue?validateDataset(JSON.parse(e.newValue)):null;metadataRequest++;selectionSerial++;pdfLoading=false;sourcePdf=null;closeViewer();setStatus(dataset?'다른 탭의 상세대장 반영 · '+dataset.records.length+'건':'상세대장 기억이 해제됐습니다.');pdfStatusEl.textContent='원본 PDF를 다시 선택하세요.';refresh();}catch{setStatus('변경된 상세대장을 읽지 못했습니다.');}}});
}
root.VacancyReports={...api,mount};
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
