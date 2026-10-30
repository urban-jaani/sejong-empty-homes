/* Offline joins for downloaded public data. No remote lookup, API key or address upload. */
(function(root){'use strict';
const TYPES={parcel:'연속지적도',building:'GIS 건물통합정보',register:'건축물대장 표제부',base:'건축물대장 기본개요',land:'토지특성정보',zoning:'용도지역·토지이용계획'};
const FIELDS={pnu:['필지고유번호(PNU)','PNU','고유번호','필지고유번호'],address:['지번주소','주소','소재지','대지위치','platPlc'],legalName:['법정동명','법정동리명'],jibun:['지번','JIBUN'],buildingPk:['관리건축물대장PK','mgmBldrgstPk','건축물대장PK'],gisId:['GIS건물통합식별번호','GIS건물관리번호'],dong:['동명칭','dongNm'],sigungu:['시군구코드','sigunguCd'],bjdong:['법정동코드','bjdongCd'],platGb:['대지구분코드','platGbCd'],bun:['번','bun'],ji:['지','ji'],parcelArea:['필지면적','토지면적','lndpclAr'],landArea:['대지면적','platArea'],buildingArea:['건축면적','건축물면적','archArea'],totalArea:['연면적','totArea'],approval:['사용승인일자','사용승인일','useAprDay'],structure:['건축물구조명','구조코드명','strctCdNm','구조'],usage:['건축물용도명','주용도코드명','mainPurpsCdNm','주용도','용도'],zone:['용도지역명','용도지역1명','용도지역','prposArea1Nm'],road:['도로접면명','도로접면','roadSideNm','roadSideCodeNm'],shape:['지형형상명','지형형상','ladFrmNm','tpgrphFrmCodeNm'],height:['지형높이명','지형높이','ladHeightNm','tpgrphHgCodeNm'],violation:['위반건축물여부','위반건축물유무','violBldYn','vltnBldYn'],parkingIndoorAuto:['옥내자주식대수','indrAutoUtcnt'],parkingOutdoorAuto:['옥외자주식대수','oudrAutoUtcnt'],parkingIndoorMech:['옥내기계식대수','indrMechUtcnt'],parkingOutdoorMech:['옥외기계식대수','oudrMechUtcnt'],elevator:['승용승강기수','rideUseElvtCnt'],emergencyElevator:['비상용승강기수','emgenUseElvtCnt'],year:['기준연도','stdrYear'],date:['생성일자','기준일자','crtnDay','lastUpdtDt']};
const NUMBERS=new Set(['parcelArea','landArea','buildingArea','totalArea','parkingIndoorAuto','parkingOutdoorAuto','parkingIndoorMech','parkingOutdoorMech','elevator','emergencyElevator']);
const cleanKey=s=>String(s).toLowerCase().replace(/[\s_()（）㎡%·]/g,'');
const norm=s=>String(s??'').normalize('NFC').trim().replace(/^세종시\s+/,'세종특별자치시 ').replace(/\s+/g,' ');
const text=v=>v===undefined||v===null?'':String(v).trim();
function number(v){if(text(v)==='')return null;const s=text(v).replace(/,/g,'');return /^\d+(\.\d+)?$/.test(s)&&Number.isFinite(+s)?+s:null;}
function pnu(v){if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('19자리 PNU가 숫자로 변형되었습니다. 원본의 문자형 PNU를 사용하세요.');return /^\d{19}$/.test(text(v))?text(v):'';}
function detect(headers,type){const map={};for(const [key,aliases]of Object.entries(FIELDS)){map[key]=headers.find(h=>[key,...aliases].some(a=>cleanKey(a)===cleanKey(h)))||'';}
 // This A-column profile is only for the documented GIS building dataset, never other SHPs.
 if(type==='building'&&['A1','A2','A9','A11','A13','A14','A15'].every(k=>headers.includes(k)))Object.assign(map,{gisId:'A1',pnu:'A2',legalName:'A4',jibun:'A5',usage:'A9',structure:'A11',buildingArea:'A12',approval:'A13',totalArea:'A14',landArea:'A15'});
 return map;}
function pnuFromParts(v){const sg=text(v.sigungu),bd=text(v.bjdong),g=text(v.platGb),b=text(v.bun),j=text(v.ji);
 if(!/^\d{5}$/.test(sg)||!/^\d{5}$/.test(bd)||!['0','1'].includes(g)||!/^\d{1,4}$/.test(b)||!/^\d{1,4}$/.test(j))return '';
 return sg+bd+(g==='0'?'1':'2')+b.padStart(4,'0')+j.padStart(4,'0');}
function normalizeRow(props,mapping,geometry=null){const row={};for(const k of Object.keys(FIELDS)){const v=mapping[k]?props[mapping[k]]:null;row[k]=NUMBERS.has(k)?number(v):k==='pnu'?pnu(v):text(v).slice(0,1200);}
 row.pnu=row.pnu||pnuFromParts(row);row.address=norm(row.address||((row.legalName&&row.jibun)?row.legalName+' '+row.jibun:''));
 if(geometry){row.geometry=geometry;row.bbox=bounds(geometry);}return row;}
function bounds(g){if(!g||!['Polygon','MultiPolygon'].includes(g.type))throw Error('공간자료는 Polygon 또는 MultiPolygon 도형이어야 합니다.');let box=[Infinity,Infinity,-Infinity,-Infinity],n=0;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;if(!Array.isArray(polygons)||!polygons.length)throw Error('빈 도형입니다.');
 for(const poly of polygons){if(!Array.isArray(poly)||!poly.length)throw Error('잘못된 도형입니다.');for(const ring of poly){if(!Array.isArray(ring)||ring.length<4)throw Error('잘못된 경계선입니다.');for(const c of ring){if(!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<120||c[0]>135||c[1]<30||c[1]>45)throw Error('좌표계가 경위도가 아니거나 국내 범위를 벗어났습니다. SHP에는 PRJ를 포함하고 GeoJSON은 EPSG:4326으로 내보내세요.');box[0]=Math.min(box[0],c[0]);box[1]=Math.min(box[1],c[1]);box[2]=Math.max(box[2],c[0]);box[3]=Math.max(box[3],c[1]);n++;}}}if(n>2000000)throw Error('도형이 너무 큽니다.');return box;}
function ringPosition(point,ring){let inside=false;const [x,y]=point;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[j],b=ring[i],cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
 if(Math.abs(cross)<1e-12&&x>=Math.min(a[0],b[0])-1e-10&&x<=Math.max(a[0],b[0])+1e-10&&y>=Math.min(a[1],b[1])-1e-10&&y<=Math.max(a[1],b[1])+1e-10)return 0;
 if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside?1:-1;}
function contains(g,point){for(const rings of g.type==='Polygon'?[g.coordinates]:g.coordinates){if(ringPosition(point,rings[0])<0)continue;let hole=false;for(const ring of rings.slice(1))if(ringPosition(point,ring)>0){hole=true;break;}if(!hole)return true;}return false;}
function geometryArea(g){const R=6371008.8,rad=Math.PI/180;const ringArea=ring=>{let sum=0;for(let i=0;i<ring.length-1;i++)sum+=(ring[i+1][0]-ring[i][0])*rad*(2+Math.sin(ring[i][1]*rad)+Math.sin(ring[i+1][1]*rad));return Math.abs(sum*R*R/2);};return(g.type==='Polygon'?[g.coordinates]:g.coordinates).reduce((sum,p)=>sum+Math.max(0,ringArea(p[0])-p.slice(1).reduce((n,r)=>n+ringArea(r),0)),0);}
function prepare(type,rows,meta={}){if(!TYPES[type]||!Array.isArray(rows)||!rows.length||rows.length>300000)throw Error('자료 종류 또는 건수를 확인하세요. 세종시 자료만 선택하세요.');const data={type,rows,meta,byPnu:new Map(),byAddress:new Map(),byPk:new Map(),cells:new Map(),large:[]};
 const add=(index,key,row)=>{if(!key)return;if(!index.has(key))index.set(key,[]);index.get(key).push(row);};
 rows.forEach(r=>{add(data.byPnu,r.pnu,r);add(data.byAddress,r.address,r);add(data.byPk,r.buildingPk,r);if(r.geometry){const b=r.bbox||bounds(r.geometry);r.bbox=b;const x0=Math.floor(b[0]*100),x1=Math.floor(b[2]*100),y0=Math.floor(b[1]*100),y1=Math.floor(b[3]*100);if((x1-x0+1)*(y1-y0+1)>400){data.large.push(r);return;}for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)add(data.cells,x+':'+y,r);}});return data;}
function spatial(data,point){if(!data||!point)return [];const candidates=[...(data.cells.get(Math.floor(point[0]*100)+':'+Math.floor(point[1]*100))||[]),...data.large];return candidates.filter(r=>{const b=r.bbox;return point[0]>=b[0]&&point[0]<=b[2]&&point[1]>=b[1]&&point[1]<=b[3]&&contains(r.geometry,point);});}
function result(rows,method,reason=''){return{rows,status:rows.length===1?'single':rows.length?'multiple':'none',method,reason};}
function match(data,keys,point,allowSpatial=false){if(!data)return result([],'','자료 미등록');let found;
if(keys.pk&&data.byPk.has(keys.pk))found=result(data.byPk.get(keys.pk),'건축물대장 PK');
else if(keys.pnu&&data.byPnu.has(keys.pnu))found=result(data.byPnu.get(keys.pnu),'PNU');
else if(keys.address&&data.byAddress.has(keys.address))found=result(data.byAddress.get(keys.address),'지번주소 일치');
else if(allowSpatial&&point)found=result(spatial(data,point),'좌표 포함 도형','주소 좌표 오차 가능');
else return result([],'','일치 자료 없음');
if(keys.pnu&&found.rows.some(r=>r.pnu&&r.pnu!==keys.pnu))return {...found,status:'conflict',reason:'기존 PNU와 후보 PNU 불일치'};
if(keys.pk&&found.rows.length&&found.rows.every(r=>r.buildingPk&&r.buildingPk!==keys.pk))return {...found,status:'conflict',reason:'기존 건축물대장 PK와 후보 PK 불일치'};
return found;}
function resolve(datasets,target){const lon=number(target.longitude),lat=number(target.latitude),point=lon!==null&&lat!==null&&lon>=120&&lon<=135&&lat>=30&&lat<=45?[lon,lat]:null;
 const keys={address:norm(target.address),pnu:pnu(target.pnu),pk:text(target.buildingPk)};
 const parcel=match(datasets.parcel,keys,point,true);const linkedPnu=keys.pnu||(parcel.status==='single'?parcel.rows[0].pnu:'');
 const k={...keys,pnu:linkedPnu};let building=match(datasets.building,k,point,true);
 if(building.status!=='conflict'&&building.rows.length>1&&point){const hits=building.rows.filter(r=>r.geometry&&contains(r.geometry,point));if(hits.length===1)building=result(hits,'PNU/주소 + 좌표 포함 건물');}
 // A point-in-building hit that contradicts a known parcel is not silently accepted.
 if(linkedPnu&&building.rows.some(r=>r.pnu&&r.pnu!==linkedPnu))building={...building,status:'conflict',reason:'필지 PNU와 건물 PNU 불일치'};
 const pk=keys.pk||(building.status==='single'?building.rows[0].buildingPk:'');
 const register=match(datasets.register,{...k,pk},null);const registerPk=pk||(register.status==='single'?register.rows[0].buildingPk:'');
 const base=match(datasets.base,{...k,pk:registerPk},null);const land=match(datasets.land,k,null);const zoning=match(datasets.zoning,k,point,true);
 return{parcel,building,register,base,land,zoning,pnu:linkedPnu,point};}
function parking(r){const v=['parkingIndoorAuto','parkingOutdoorAuto','parkingIndoorMech','parkingOutdoorMech'].map(k=>r[k]);const known=v.filter(x=>x!==null&&x!==undefined);return{value:known.length?known.reduce((a,b)=>a+b,0):null,complete:known.length===4};}
function age(v,year=new Date().getFullYear()){const s=text(v).replace(/[-./]/g,'');if(!/^(19|20)\d{2}(\d{4})?$/.test(s))return null;const y=+s.slice(0,4);if(y>year)return null;if(s.length===8){const d=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);if(!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)return null;}return year-y;}
function csv(text,delimiter){const lines=[],row=[];let cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))lines.push([...row]);row.length=0;cell='';}else cell+=c;}if(quoted)throw Error('닫히지 않은 따옴표가 있습니다.');if(cell||row.length){row.push(cell);lines.push(row);}return lines;}
function tableRows(grid,header=true){if(!grid.length)return [];const columns=header?grid[0].map((x,i)=>text(x)||'열'+(i+1)):grid[0].map((_,i)=>'열'+(i+1));if(new Set(columns).size!==columns.length)throw Error('중복 열 이름이 있습니다. 원본 열 이름을 확인하세요.');return grid.slice(header?1:0).filter(row=>row.some(v=>text(v)!=='')).map(row=>Object.fromEntries(columns.map((key,i)=>[key,row[i]??''])));}
function unwrap(json){if(json.type==='FeatureCollection')return json.features.map(f=>({props:f.properties||{},geometry:f.geometry}));if(Array.isArray(json))return json.map(props=>({props}));const items=json?.response?.body?.items?.item??json?.items?.item??json?.items??json?.records;if(items)return(Array.isArray(items)?items:[items]).map(props=>({props}));throw Error('지원하지 않는 JSON입니다. GeoJSON 또는 행 목록 JSON을 선택하세요.');}
async function parseFile(file,options,deps=root){const name=file.name.toLowerCase();if(file.size>250*1024*1024)throw Error('파일이 250MB를 넘습니다. 세종시 범위로 내려받거나 분리해 주세요.');const bytes=await file.arrayBuffer();
 if(name.endsWith('.zip')){if(!deps.JSZip||!deps.shp)throw Error('공간자료 읽기 도구가 없습니다. vendor 폴더를 함께 업로드하세요.');const zip=await deps.JSZip.loadAsync(bytes);const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir&&!n.startsWith('__MACOSX'));const shps=names.filter(n=>/\.shp$/i.test(n));if(!shps.length)throw Error('SHP ZIP 안에 .shp가 없습니다. 속성 ZIP은 압축을 풀고 CSV/TXT를 선택하세요.');const result=[];
 for(const shpName of shps){const stem=shpName.slice(0,-4),get=ext=>names.find(n=>n.toLowerCase()===(stem+ext).toLowerCase());const dbf=get('.dbf'),prj=get('.prj'),cpg=get('.cpg')||get('.cst');if(!dbf||!prj)throw Error('SHP ZIP에 같은 이름의 DBF와 PRJ를 포함하세요. 좌표계를 추측하지 않습니다.');let encoding=options.encoding==='auto'?(cpg?await zip.file(cpg).async('string'):'UTF-8'):options.encoding;encoding=encoding.trim();if(/^(cp|ms|windows[- ]?)?949$/i.test(encoding))encoding='euc-kr';if(encoding==='65001')encoding='utf-8';const geo=await deps.shp({shp:await zip.file(shpName).async('arraybuffer'),dbf:await zip.file(dbf).async('arraybuffer'),prj:await zip.file(prj).async('string'),cpg:encoding});const rows=unwrap(geo);if(result.length+rows.length>300000)throw Error('30만 건을 넘습니다. 세종시 범위로 선택하세요.');for(const row of rows)result.push(row);}return result;}
 if(/\.(geojson|json)$/.test(name)){const obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const crs=obj.crs?.properties?.name;if(crs&&!/4326|CRS84/i.test(crs))throw Error('GeoJSON은 EPSG:4326으로 변환해 주세요.');return unwrap(obj);}
 if(/\.(xlsx|xls)$/.test(name)){if(!deps.XLSX)throw Error('엑셀 읽기 도구를 준비 중입니다. 잠시 후 다시 선택하세요.');const book=deps.XLSX.read(bytes);const grid=deps.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:'',raw:true});return tableRows(grid,options.header).map(props=>({props}));}
 if(!/\.(csv|tsv|txt)$/.test(name))throw Error('SHP ZIP, GeoJSON, CSV/TXT, XLSX를 선택하세요.');let txt;try{txt=new TextDecoder(options.encoding==='auto'?'utf-8':options.encoding,{fatal:true}).decode(bytes);}catch{if(options.encoding!=='auto')throw Error('인코딩을 확인하세요.');txt=new TextDecoder('euc-kr').decode(bytes);}const first=txt.split(/\r?\n/)[0],delimiter=options.delimiter==='auto'?['\t','|',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0]:options.delimiter;return tableRows(csv(txt.replace(/^\uFEFF/,''),delimiter),options.header).map(props=>({props}));}

function reviewSummary(res,target,year=new Date().getFullYear()){
 const rows=[],known=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&String(v)!=='미기재';
 const add=(label,value,source)=>rows.push({label,value:known(value)?String(value):'자료 없음',source});
 const pick=(key,fallback)=>{for(const type of ['register','building']){const r=res[type];if(r.status==='single'&&known(r.rows[0][key]))return{value:r.rows[0][key],source:TYPES[type]+' · 후보 1건'};}return{value:target[fallback||key],source:'빈집 조사자료'};};
 add('빈집 등급',target.grade,'빈집 조사자료');
 const approval=pick('approval','approvalDate');add('사용승인일·연도',approval.value,approval.source);const years=age(approval.value,year);add('경과연수(연도 차이)',years===null?'미산정':years+'년',approval.source);
 for(const [label,key,fallback]of [['구조','structure'],['대장상 용도','usage'],['건축면적','buildingArea'],['연면적','totalArea'],['대장 대지면적','landArea']]){const v=pick(key,fallback);add(label,known(v.value)?v.value+(['buildingArea','totalArea','landArea'].includes(key)?' ㎡':''):null,v.source);}
 const parcel=res.parcel;if(parcel.status==='single'){const r=parcel.rows[0];add('공부상 필지면적',known(r.parcelArea)?r.parcelArea+' ㎡':null,TYPES.parcel+' · 후보 1건');if(r.geometry)add('필지 도형 계산면적(참고)',geometryArea(r.geometry).toFixed(1)+' ㎡','경계 도형으로 계산');}else add('필지 조건',parcel.status==='multiple'?'여러 후보 · 확인 필요':'미연결','연속지적도');
 for(const t of ['register','building'])if(res[t].status==='multiple'||res[t].status==='conflict')add(TYPES[t]+' 연결',res[t].status==='multiple'?'후보 '+res[t].rows.length+'건 · 개별 확인 필요':'연결정보 불일치','자동으로 한 건을 선택하지 않음');
 for(const [label,key]of [['도로접면','road'],['용도지역','zone'],['지형 높이','height'],['지형 형상','shape']]){let value=null,source='추가 자료 필요';for(const t of key==='zone'?['zoning','land']:['land'])if(res[t].status==='single'&&known(res[t].rows[0][key])){value=res[t].rows[0][key];source=TYPES[t]+' · 후보 1건';break;}add(label,value,source);}
 return rows;
}

function evaluateReviewFilter(res,target,options,year=new Date().getFullYear(),fieldRecords=[]){
 const tests=[],known=v=>v!==null&&v!==undefined&&!['','미기재','미제공','자료 없음','원본 자료 없음','-'].includes(String(v).trim());
 const value=(key,fallback)=>{for(const type of ['register','building'])if(res[type].status==='single'&&known(res[type].rows[0][key]))return res[type].rows[0][key];return target[fallback||key];};
 if(options.ageEnabled){const years=age(value('approval','approvalDate'),year);tests.push(years===null?null:years>=options.minAge&&(options.maxAge==null||years<=options.maxAge));}
 if(options.areaEnabled){let raw=value('landArea');if(options.areaSource==='parcel'){raw=null;for(const type of ['parcel','land'])if(res[type]?.status==='single'&&known(res[type].rows[0].parcelArea)){raw=res[type].rows[0].parcelArea;break;}}const area=number(raw);tests.push(area===null||area<=0?null:area>=(options.minArea??0)&&(options.maxArea==null||area<options.maxArea));}
 if(options.road!=='all'){const road=res.land.status==='single'&&known(res.land.rows[0].road);tests.push(options.road==='missing'?!road:!!road);}
 if(options.roadExact){const road=res.land.status==='single'?res.land.rows[0].road:null;tests.push(known(road)?String(road).trim()===options.roadExact:null);}
 const physical=options.physical||'all';if(physical!=='all'){const v=fieldRecords.length===1?fieldRecords[0].fieldCriteria?.checks?.minor_physical_damage:null,knownCheck=v===true||v===false;tests.push(physical==='unknown'?!knownCheck:!knownCheck?null:physical==='checked'?v===true:v===false);}
 return tests.includes(false)?'no':tests.includes(null)?'unknown':'match';
}
const READINESS_FIELDS={coordinates:'빈집 좌표',pnu:'필지번호 PNU',grade:'조사 등급',approval:'사용승인일·연도',structure:'건물 구조',usage:'대장상 용도',buildingArea:'건축면적',totalArea:'연면적',landArea:'대장 대지면적',parcelArea:'공부상 필지면적',parcelGeometry:'필지 도형',buildingGeometry:'건물 도형',road:'도로접면 분류',height:'지형 높이',shape:'지형 형상',zone:'용도지역',parking:'주차대수',elevator:'승용승강기 수',fieldChecklist:'현장 판별 체크기록',physicalCheck:'창호·지붕·외벽 복합 파손항목 기록'};
function readinessProfile(res,records,year=new Date().getFullYear(),fieldRecords=[]){
 const fields={},known=v=>v!==null&&v!==undefined&&!['','-','미기재','미제공','자료 없음','원본 자료 없음'].includes(String(v).trim());
 const state=(value,key,source)=>{if(key==='approval')return{state:age(value,year)===null?'invalid':'ready',source};if(['buildingArea','totalArea','landArea','parcelArea'].includes(key)){const n=number(value);return{state:n===null?'invalid':n===0?'zero':'ready',source};}return{state:'ready',source};};
 function pick(key,types,fallback){let ambiguous=false,conflict=false;for(const type of types){const r=res[type];if(r.status==='conflict'){conflict=true;continue;}if(r.status==='multiple'){if(r.rows.some(row=>known(row[key])))ambiguous=true;continue;}if(r.status==='single'&&known(r.rows[0][key]))return state(r.rows[0][key],key,TYPES[type]);}
  if(fallback){const values=[...new Set(records.map(r=>r[fallback]).filter(known).map(v=>String(v).trim()))];if(values.length===1)return state(values[0],key,'빈집 조사자료');if(values.length>1)ambiguous=true;}
  return{state:conflict?'conflict':ambiguous?'ambiguous':'missing',source:''};}
 fields.coordinates={state:res.point?'ready':'missing',source:'빈집 좌표파일'};fields.pnu={state:/^\d{19}$/.test(res.pnu)?'ready':'missing',source:'연결키·필지 후보'};
 fields.grade=pick('grade',[],'grade');fields.approval=pick('approval',['register','building'],'approvalDate');fields.structure=pick('structure',['register','building']);fields.usage=pick('usage',['register','building']);
 for(const key of ['buildingArea','totalArea','landArea'])fields[key]=pick(key,['register','building'],key);
 fields.parcelArea=pick('parcelArea',['parcel','land']);
 for(const [key,type]of [['parcelGeometry','parcel'],['buildingGeometry','building']]){const r=res[type];fields[key]={state:r.status==='single'&&r.rows[0].geometry?'ready':r.status==='multiple'?'ambiguous':r.status==='conflict'?'conflict':'missing',source:TYPES[type]};}
 for(const key of ['road','height','shape','zone'])fields[key]=pick(key,key==='zone'?['zoning','land']:['land']);
 const register=res.register;if(register.status==='single'){const row=register.rows[0];fields.parking={state:parking(row).complete?'ready':'missing',source:TYPES.register};fields.elevator={state:number(row.elevator)!==null?'ready':known(row.elevator)?'invalid':'missing',source:TYPES.register};}else for(const key of ['parking','elevator'])fields[key]={state:register.status==='multiple'?'ambiguous':register.status==='conflict'?'conflict':'missing',source:TYPES.register};
 const field=fieldRecords.length===1?fieldRecords[0].fieldCriteria:null;const baseState=fieldRecords.length>1?'ambiguous':'missing';
 fields.fieldChecklist={state:field&&Object.values(field.checks).length===19&&Object.values(field.checks).every(v=>v===true||v===false)?'ready':baseState,source:'2025년 현장조사서'};
 fields.physicalCheck={state:field&&(field.checks.minor_physical_damage===true||field.checks.minor_physical_damage===false)?'ready':baseState,source:'2025년 현장조사서'};
 return fields;
}
const api={READINESS_FIELDS,readinessProfile,evaluateReviewFilter,reviewSummary,TYPES,FIELDS,detect,normalizeRow,prepare,resolve,contains,bounds,geometryArea,parking,age,parseFile,tableRows,pnuFromParts,number};if(typeof module==='object'&&module.exports)module.exports=api;root.VacancySpatialCore=api;
})(typeof window!=='undefined'?window:globalThis);
