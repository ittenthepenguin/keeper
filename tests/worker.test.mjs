import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorker} from '../worker/index.js';

class Bucket {
  objects=new Map(); version=0;
  async get(key,options={}){
    const object=this.objects.get(key);if(!object)return null;
    const bytes=object.bytes.slice(),range=options.range;
    const data=range?bytes.slice(range.offset,range.offset+range.length):bytes;
    return {etag:object.etag,size:bytes.length,body:new Blob([data]).stream(),json:async()=>JSON.parse(new TextDecoder().decode(bytes)),arrayBuffer:async()=>data.buffer};
  }
  async head(key){const object=this.objects.get(key);return object?{size:object.bytes.length,etag:object.etag}:null}
  async put(key,value,options={}){
    const old=this.objects.get(key),condition=options.onlyIf;
    if(condition?.etagMatches&&condition.etagMatches!==old?.etag)return null;
    if(condition?.etagDoesNotMatch==='*'&&old)return null;
    const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value).slice();
    const object={bytes,etag:String(++this.version)};this.objects.set(key,object);return {etag:object.etag};
  }
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.objects.delete(key)}
}
const asset=(type,body)=>[type,Buffer.from(body).toString('base64'),'testhash'];
function setup(){
  const bucket=new Bucket(),worker=createWorker({'/index.html':asset('text/html','landing'),'/menu/index.html':asset('text/html','menu'),'/demo/index.html':asset('text/html','demo'),'/assets/sample-drive.mp4':asset('video/mp4','sample-clip')});
  const call=(path,{cookie,method='GET',data,body,headers={}}={})=>worker.fetch(new Request('https://keeper.test'+path,{method,headers:{...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:body?{body}:{})}),{BUCKET:bucket},{waitUntil(){}});
  async function visitor(){const r=await call('/api/state');return r.headers.get('set-cookie').split(';')[0]}
  return {bucket,call,visitor};
}
async function post(app,cookie,path,data={}){const r=await app.call('/api/'+path,{cookie,method:'POST',data});return {response:r,state:await r.json()}}
async function finishRecords(app,cookie){const sid=cookie.split('=')[1],key=`sessions/${sid}/state.json`,object=await app.bucket.get(key),state=await object.json();for(const item of state.incidents)item.createdAt=new Date(Date.now()-10000).toISOString();await app.bucket.put(key,JSON.stringify(state))}

test('all public surfaces and static ranges are served with exact paths',async()=>{
  const app=setup();for(const path of ['/','/menu/','/demo/','/phone','/dashcam','/s/'+'a'.repeat(32)])assert.equal((await app.call(path)).status,200,path);
  assert.equal((await app.call('/menu')).headers.get('location'),'https://keeper.test/menu/');
  assert.equal((await app.call('/phone/')).headers.get('location'),'https://keeper.test/phone');
  assert.equal((await app.call('/missing')).status,404);
  assert.equal((await app.call('/assets/sample-drive.mp4',{headers:{range:'bytes=0-5'}})).status,206);
  assert.equal(await (await app.call('/assets/sample-drive.mp4',{headers:{range:'bytes=0-5'}})).text(),'sample');
  assert.equal((await app.call('/assets/sample-drive.mp4',{headers:{range:'bytes=999-'}})).status,416);
  assert.equal((await app.call('/assets/sample-drive.mp4',{method:'HEAD'})).headers.get('content-length'),'11');
});
test('anonymous browser sessions are isolated and concurrent changes do not lose records',async()=>{
  const app=setup(),a=await app.visitor(),b=await app.visitor();assert.notEqual(a,b);
  const results=await Promise.all([post(app,a,'incident'),post(app,a,'incident')]);for(const result of results)assert.equal(result.response.status,200);
  assert.equal((await (await app.call('/api/state',{cookie:a})).json()).incidents.length,2);
  assert.equal((await (await app.call('/api/state',{cookie:b})).json()).incidents.length,0);
  assert.match((await app.call('/api/state')).headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('input bounds and origin checks are enforced',async()=>{
  const app=setup(),cookie=await app.visitor();
  assert.equal((await app.call('/api/mode',{cookie,method:'POST',data:{mode:'wireless'},headers:{origin:'https://other.test'}})).status,403);
  assert.equal((await post(app,cookie,'mode',{mode:'invalid'})).response.status,400);
  assert.equal((await post(app,cookie,'share',{id:'constructor'})).response.status,400);
  assert.equal((await app.call('/api/media',{cookie,method:'POST',body:'bad',headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await app.call('/api/media',{cookie,method:'POST',body:'x',headers:{'content-type':'video/mp4','content-length':String(26*1024*1024)}})).status,413);
  assert.equal((await app.call('/api/incident',{cookie,method:'POST',body:'{',headers:{'content-type':'application/json'}})).status,400);
});
test('recorded video stays private, supports ranges, and can be shared and revoked',async()=>{
  const app=setup(),owner=await app.visitor(),other=await app.visitor(),video=Buffer.from('exact uploaded video bytes');
  const upload=await app.call('/api/media',{cookie:owner,method:'POST',body:video,headers:{'content-type':'video/mp4'}});assert.equal(upload.status,201);const media=await upload.json();assert(!('key' in media));
  assert.equal((await app.call(media.url,{cookie:other})).status,404);
  assert.deepEqual(new Uint8Array(await (await app.call(media.url,{cookie:owner})).arrayBuffer()),new Uint8Array(video));
  assert.equal(await (await app.call(media.url,{cookie:owner,headers:{range:'bytes=6-13'}})).text(),'uploaded');
  const created=await post(app,owner,'incident',{mediaId:media.id});const incidentId=created.state.incidents[0].id;
  assert.equal((await post(app,owner,'share',{id:incidentId})).response.status,400);
  await finishRecords(app,owner);
  const shared=await post(app,owner,'share',{id:incidentId});assert.equal(shared.response.status,200);const token=shared.state.share.token;
  const recipient=await (await app.call('/api/share/'+token,{cookie:other})).json();assert(!('owner' in recipient));assert.match(recipient.incident.mediaUrl,/\?share=/);
  assert.equal((await app.call(recipient.incident.mediaUrl,{cookie:other})).status,200);
  const archive=await app.call('/api/package/'+token,{cookie:other});assert.equal(archive.headers.get('content-type'),'application/zip');const zipped=Buffer.from(await archive.arrayBuffer());assert.equal(zipped.readUInt32LE(0),0x04034b50);assert(zipped.includes(video));assert(zipped.includes(Buffer.from('unsigned')));
  await post(app,owner,'revoke',{token});assert.equal((await app.call('/api/share/'+token)).status,404);assert.equal((await app.call(recipient.incident.mediaUrl,{cookie:other})).status,404);assert.equal((await app.call('/api/package/'+token)).status,404);
});
test('multiple sample links coexist, retention updates, and reset clears only its own session',async()=>{
  const app=setup(),a=await app.visitor(),b=await app.visitor();
  const one=(await post(app,a,'share',{id:'KPR-2481'})).state.share.token,two=(await post(app,a,'share',{id:'KPR-2427'})).state.share.token;
  assert.equal((await app.call('/api/share/'+one)).status,200);assert.equal((await app.call('/api/share/'+two)).status,200);
  await post(app,a,'revoke',{token:one});assert.equal((await app.call('/api/share/'+one)).status,404);assert.equal((await app.call('/api/share/'+two)).status,200);
  const created=await post(app,b,'incident');await finishRecords(app,b);const old=created.state.incidents[0].retainUntil;const extended=await post(app,b,'retention',{id:created.state.incidents[0].id});assert(new Date(extended.state.incidents[0].retainUntil)>new Date(old));
  await post(app,a,'reset');assert.equal((await app.call('/api/share/'+two)).status,404);assert.equal((await (await app.call('/api/state',{cookie:b})).json()).incidents.length,1);
});
test('event stream immediately connects with session-scoped data and supports cancellation',async()=>{
  const app=setup(),cookie=await app.visitor();await post(app,cookie,'incident');const controller=new AbortController();
  const response=await app.call('/api/events',{cookie});assert.equal(response.headers.get('content-type'),'text/event-stream');const reader=response.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/"incidents":\[\{/);await reader.cancel();controller.abort();
});
test('exported pages contain hosted destinations and no loopback links',async()=>{
  const landing=await readFile('site/index.html','utf8'),menu=await readFile('site/menu/config.js','utf8');
  assert(landing.includes('href="/menu/"')&&landing.includes('href="/demo/"'));assert(landing.includes('mailto:ioh38@gatech.edu'));
  assert(!/https?:\/\/(localhost|127\.0\.0\.1)/.test(landing+menu));assert(menu.includes('/#pilot'));
});
