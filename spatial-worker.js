importScripts('./vendor/shp-6.2.0.js','./vendor/jszip-3.10.1.min.js','./vendor/xlsx-0.20.3.min.js','./spatial-core.js');
self.onmessage=async e=>{try{const rows=await self.VacancySpatialCore.parseFile(e.data.file,e.data.options,self);if(rows.length>300000)throw Error('30만 건을 넘습니다. 세종시 범위로 선택하세요.');self.postMessage({rows});}catch(err){self.postMessage({error:err.message});}};
