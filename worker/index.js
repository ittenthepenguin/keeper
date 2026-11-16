// Public prototype host. R2 stores separate browser sessions and explicitly shared records.
// Capture can be real; acquisition signing, proof, and off-device backup remain simulated.
const COOKIE = 'keeper_demo_session';
const MAX_CLIP = 25 * 1024 * 1024;
const MAX_SESSION = 75 * 1024 * 1024;
const seeds = { 'KPR-2481':'Oak Street & 5th Ave', 'KPR-2427':'I-80 Westbound', 'KPR-2392':'Market Street' };
const encoder = new TextEncoder();
const id = () => crypto.randomUUID().replaceAll('-', '');
const initial = () => ({ mode:'wireless', incidents:[], share:null, latestMediaId:null, media:{}, grants:{} });
const stateKey = sid => `sessions/${sid}/state.json`;
function json(value, status=200) { return new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json','cache-control':'no-store'}}); }
function fail(message,status=400) { const error=new Error(message);error.status=status;throw error; }
function cookieSession(request) {
  const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)keeper_demo_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] || null;
}
async function load(bucket,sid) {
  const object=await bucket.get(stateKey(sid));
  return {state:object?await object.json():initial(),etag:object?.etag};
}
async function update(bucket,sid,change) {
  for(let attempt=0;attempt<5;attempt++) {
    const {state,etag}=await load(bucket,sid);
    const result=change(state);
    const saved=await bucket.put(stateKey(sid),JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if(saved)return {state,result};
  }
  fail('The demo is busy. Please try again.',409);
}
function publicState(state) {
  return {mode:state.mode,share:state.share,latestMediaId:state.latestMediaId,incidents:state.incidents.map(item=>{
    const elapsed=Date.now()-Date.parse(item.createdAt);
    return {...item,status:elapsed<1800?'collecting':elapsed<3800?'signing':'saved',proof:elapsed<5500?'pending':'ready',backup:elapsed<3800?'waiting':elapsed<7000?'transferring':'confirmed'};
  })};
}
function incident(state,incidentId) {
  if(typeof incidentId!=='string')return null;
  return publicState(state).incidents.find(item=>item.id===incidentId) || (Object.hasOwn(seeds,incidentId)?{id:incidentId,title:seeds[incidentId],source:'sample',status:'saved',backup:'confirmed',proof:'ready',createdAt:'2026-11-01T12:00:00Z'}:null);
}
async function grantFor(bucket,token) {
  if(!/^[a-f0-9]{32}$/.test(token))return null;
  const object=await bucket.get(`shares/${token}.json`);
  if(!object)return null;
  const index=await object.json(), {state}=await load(bucket,index.owner);
  if(state.grants[token]!==index.id)return null;
  const record=incident(state,index.id);
  return record?{...index,token,record,state}:null;
}
async function readBody(request,limit) {
  const size=Number(request.headers.get('content-length')||0);
  if(size>limit)fail('Clip is too large for this demo (25 MB maximum).',413);
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();fail('Request is too large for this demo.',413)}chunks.push(value)}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes;
}
function rangeFor(header,size) {
  if(!header)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!match||(!match[1]&&!match[2]))return false;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{start,end}:false;
}
function assetResponse(request,asset) {
  const [type,base64,hash]=asset;
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const headers=new Headers({'content-type':type,'etag':`"${hash}"`,'cache-control':type.startsWith('text/html')?'no-cache':'public, max-age=300','accept-ranges':'bytes','x-content-type-options':'nosniff'});
  if(request.headers.get('if-none-match')===`"${hash}"`)return new Response(null,{status:304,headers});
  const range=rangeFor(request.headers.get('range'),bytes.length);
  if(range===false)return new Response(null,{status:416,headers:{'content-range':`bytes */${bytes.length}`}});
  if(range){headers.set('content-range',`bytes ${range.start}-${range.end}/${bytes.length}`);headers.set('content-length',String(range.end-range.start+1));return new Response(request.method==='HEAD'?null:bytes.slice(range.start,range.end+1),{status:206,headers})}
  headers.set('content-length',String(bytes.length));return new Response(request.method==='HEAD'?null:bytes,{headers});
}
async function mediaResponse(request,bucket,info) {
  const head=await bucket.head(info.key);if(!head)return json({error:'Clip unavailable'},404);
  const range=rangeFor(request.headers.get('range'),head.size);
  if(range===false)return new Response(null,{status:416,headers:{'content-range':`bytes */${head.size}`}});
  const headers=new Headers({'content-type':info.type,'accept-ranges':'bytes','cache-control':'private, no-store','content-length':String(range?range.end-range.start+1:head.size)});
  if(range)headers.set('content-range',`bytes ${range.start}-${range.end}/${head.size}`);
  const object=request.method==='HEAD'?null:await bucket.get(info.key,range?{range:{offset:range.start,length:range.end-range.start+1}}:{});
  return new Response(object?.body||null,{status:range?206:200,headers});
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function zip(files) {
  const local=[],central=[];let offset=0;
  const buffer=n=>new Uint8Array(n),u16=(b,o,n)=>new DataView(b.buffer).setUint16(o,n,true),u32=(b,o,n)=>new DataView(b.buffer).setUint32(o,n,true);
  for(const [name,value] of files){const filename=encoder.encode(name),data=typeof value==='string'?encoder.encode(value):value;let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    const h=buffer(30);u32(h,0,0x04034b50);u16(h,4,20);u32(h,14,crc);u32(h,18,data.length);u32(h,22,data.length);u16(h,26,filename.length);local.push(h,filename,data);
    const c=buffer(46);u32(c,0,0x02014b50);u16(c,4,20);u16(c,6,20);u32(c,16,crc);u32(c,20,data.length);u32(c,24,data.length);u16(c,28,filename.length);u32(c,42,offset);central.push(c,filename);offset+=h.length+filename.length+data.length;
  }
  const directory=central.reduce((n,b)=>n+b.length,0),end=buffer(22);u32(end,0,0x06054b50);u16(end,8,files.length);u16(end,10,files.length);u32(end,12,directory);u32(end,16,offset);
  const result=buffer(offset+directory+22);let at=0;for(const part of [...local,...central,end]){result.set(part,at);at+=part.length}return result;
}
function eventStream(request,bucket,sid) {
  let timer,end,controller,closed=false,reading=false,last='';
  const cleanup=()=>{closed=true;clearInterval(timer);clearTimeout(end);request.signal.removeEventListener('abort',stop)};
  const stop=()=>{if(closed)return;cleanup();try{controller.close()}catch{}};
  async function send(){if(closed||reading)return;reading=true;try{const {state}=await load(bucket,sid);const text=JSON.stringify(publicState(state));if(!closed&&text!==last){last=text;controller.enqueue(encoder.encode(`data: ${text}\n\n`))}}catch(error){if(!closed){cleanup();controller.error(error)}}finally{reading=false}}
  const stream=new ReadableStream({start(c){controller=c;send();timer=setInterval(send,1000);end=setTimeout(stop,10000);request.signal.addEventListener('abort',stop,{once:true})},cancel(){cleanup()}});
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive'}});
}
export function createWorker(assets) {
  async function api(request,env,ctx,url,sid) {
    const bucket=env.BUCKET;if(!bucket)return json({error:'Demo storage is not configured.'},503);
    const route=url.pathname;
    if(request.method==='GET'&&route==='/api/events')return eventStream(request,bucket,sid);
    if(request.method==='GET'&&route==='/api/state')return json(publicState((await load(bucket,sid)).state));
    if(request.method==='GET'&&route.startsWith('/api/share/')){
      const grant=await grantFor(bucket,route.split('/').pop());if(!grant)return json({error:'Link unavailable'},404);
      const record={...grant.record};if(record.mediaUrl)record.mediaUrl+=`?share=${grant.token}`;
      return json({id:grant.id,token:grant.token,incident:record});
    }
    if(['GET','HEAD'].includes(request.method)&&route.startsWith('/api/media/')){
      const mediaId=route.split('/').pop(),{state}=await load(bucket,sid);let info=state.media[mediaId];
      if(!info&&url.searchParams.has('share')){const grant=await grantFor(bucket,url.searchParams.get('share'));if(grant?.record.mediaId===mediaId)info=grant.state.media[mediaId]}
      return info?mediaResponse(request,bucket,info):json({error:'Clip unavailable'},404);
    }
    if(request.method==='GET'&&route.startsWith('/api/package/')){
      const grant=await grantFor(bucket,route.split('/').pop());if(!grant)return json({error:'Link unavailable'},404);
      const media=grant.record.mediaId?grant.state.media[grant.record.mediaId]:null;
      const object=media?await bucket.get(media.key):null;
      const sample=assets['/assets/sample-drive.mp4'];if(!object&&!sample)return json({error:'Recording unavailable'},404);
      const clip=object?new Uint8Array(await object.arrayBuffer()):Uint8Array.from(atob(sample[1]),c=>c.charCodeAt(0));
      const name=media?.fileName||'sample-drive.mp4';
      const record=JSON.stringify({demo:true,note:'Acquisition signing, proof, and remote backup are simulated. This record is unsigned.',incident:grant.id,source:media?'Browser camera or selected video':'Sample recording',files:[name]},null,2);
      return new Response(zip([[name,clip],['record.json',record],['README.txt','Keeper public prototype. The recording may be real. Signing, proof, and remote backup are simulated; this package is unsigned.\n']]),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="Keeper-demo.zip"','cache-control':'no-store'}});
    }
    if(request.method!=='POST')return json({error:'Not found'},404);
    const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Origin not allowed'},403);
    if(route==='/api/media'){
      const type=(request.headers.get('content-type')||'').split(';')[0];if(!type.startsWith('video/'))return json({error:'Choose a video clip.'},415);
      const data=await readBody(request,MAX_CLIP);if(!data.length)return json({error:'The camera did not produce a clip.'},400);
      const mediaId=id(),extension=type.includes('mp4')?'mp4':type.includes('quicktime')?'mov':type.includes('ogg')?'ogv':'webm';
      const info={id:mediaId,type,fileName:`recording-${mediaId}.${extension}`,sizeBytes:data.length,url:`/api/media/${mediaId}`,key:`sessions/${sid}/media/${mediaId}`};
      await update(bucket,sid,state=>{if(Object.values(state.media).reduce((n,m)=>n+m.sizeBytes,0)+data.length>MAX_SESSION)fail('Demo storage is full. Reset this demo session to clear saved clips.',507);state.media[mediaId]=info;state.latestMediaId=mediaId});
      try{await bucket.put(info.key,data,{httpMetadata:{contentType:type}})}catch(error){await update(bucket,sid,state=>{delete state.media[mediaId];if(state.latestMediaId===mediaId)state.latestMediaId=null});throw error}
      const {key,...publicInfo}=info;return json(publicInfo,201);
    }
    let input;try{input=JSON.parse(new TextDecoder().decode(await readBody(request,10000))||'{}')}catch(error){if(error.status)throw error;return json({error:'Invalid JSON'},400)}
    if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Invalid request'},400);
    if(route==='/api/reset'){
      const {state:old}=await load(bucket,sid);
      await update(bucket,sid,state=>Object.assign(state,initial()));
      const keys=[...Object.values(old.media).map(m=>m.key),...Object.keys(old.grants).map(token=>`shares/${token}.json`)];
      if(keys.length)await bucket.delete(keys);
      return json(publicState(initial()));
    }
    const result=await update(bucket,sid,state=>{
      if(route==='/api/mode'){if(!['wireless','phone'].includes(input.mode))fail('Invalid mode');state.mode=input.mode}
      else if(route==='/api/incident'){
        if(state.incidents.length>=50)fail('Reset this demo session before adding more incidents.',409);
        const clip=input.mediaId?state.media[input.mediaId]:null;if(input.mediaId&&!clip)fail('Recording unavailable. Save the clip again.');
        const now=new Date(),retain=new Date(now);retain.setUTCFullYear(retain.getUTCFullYear()+1);
        state.incidents.unshift({id:id(),title:input.source==='phone'?'Reported incident':clip?'Camera recording':'Incident recording',source:input.source==='phone'?'phone':clip?'camera':'sample',createdAt:now.toISOString(),status:'collecting',backup:'waiting',proof:'pending',mode:state.mode,shared:false,retainUntil:retain.toISOString(),...(clip?{mediaUrl:clip.url,mediaId:clip.id,mimeType:clip.type,fileName:clip.fileName,sizeBytes:clip.sizeBytes}:{})});
      }else if(route==='/api/retention'){
        const ready=incident(state,input.id),item=state.incidents.find(i=>i.id===input.id);if(!item||ready?.status!=='saved')fail('Record not ready');const date=new Date(item.retainUntil);date.setUTCFullYear(date.getUTCFullYear()+1);item.retainUntil=date.toISOString();
      }else if(route==='/api/share'){
        const record=incident(state,input.id);if(!record||record.status!=='saved')fail('Record not ready');
        let token=Object.keys(state.grants).find(t=>state.grants[t]===record.id);if(!token){token=id();state.grants[token]=record.id}state.share={id:record.id,token};const own=state.incidents.find(i=>i.id===record.id);if(own)own.shared=true;
      }else if(route==='/api/revoke'){
        const token=input.token||state.share?.token;if(token)delete state.grants[token];if(state.share?.token===token)state.share=null;
      }else fail('Not found',404);
    });
    if(route==='/api/share')await bucket.put(`shares/${result.state.share.token}.json`,JSON.stringify({owner:sid,id:result.state.share.id}),{httpMetadata:{contentType:'application/json'}});
    return json(publicState(result.state));
  }
  return {async fetch(request,env={},ctx={waitUntil(){}}){
    try{
      const url=new URL(request.url);
      if(url.pathname.startsWith('/api/')){
        const existing=cookieSession(request),sid=existing||id()+id();
        const response=await api(request,env,ctx,url,sid);
        const headers=new Headers(response.headers);headers.set('x-content-type-options','nosniff');
        if(!existing)headers.append('set-cookie',`${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
        return new Response(response.body,{status:response.status,headers});
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      if(url.pathname==='/menu'||url.pathname==='/demo')return Response.redirect(url.origin+url.pathname+'/',308);
      if(url.pathname==='/phone/'||url.pathname==='/dashcam/')return Response.redirect(url.origin+url.pathname.slice(0,-1),308);
      let path=decodeURIComponent(url.pathname);
      if(path==='/')path='/index.html';
      else if(path==='/menu/')path='/menu/index.html';
      else if(path==='/demo/'||path==='/phone'||path==='/dashcam'||/^\/s\/[a-f0-9]{32}\/?$/.test(path))path='/demo/index.html';
      const asset=assets[path];return asset?assetResponse(request,asset):new Response('Page not found',{status:404,headers:{'content-type':'text/plain; charset=utf-8'}});
    }catch(error){return json({error:error.status?error.message:'The demo service is temporarily unavailable. Please try again.'},error.status||500)}
  }};
}
