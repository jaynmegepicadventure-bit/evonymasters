import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../integrations/calendar/worker.mjs';
const HOST='https://evonymasters-calendar.test';
function setup(){
 const map=new Map();
 const env={ADMIN_EMAILS:'admin@example.test,helper@example.test',CALENDAR:{
  get:async k=>map.get(k)??null,put:async(k,v)=>{map.set(k,v)}
 }};
 const signed={access:{getIdentity:async()=>({email:'admin@example.test'})}};
 const unknown={access:{getIdentity:async()=>({email:'unknown@example.test'})}};
 return {map,env,signed,unknown};
}
const url=p=>HOST+p;
const request=(path,method='GET',data,origin=HOST)=>new Request(url(path),{
 method,
 headers:{...(data!==undefined?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},
 ...(data!==undefined?{body:JSON.stringify(data)}:{})
});
const data={
 name:'Revelation of Maya',category:'Event',status:'Confirmed',
 startDate:'2026-11-12',endDate:'2026-11-15',startTime:'',endTime:'',
 notes:'Dates confirmed in game',sourceUrl:'https://example.test/event',published:false
};
test('Public calendar starts empty and unconfigured admin access is denied',async()=>{
 const {env,signed}=setup();
 const publicResponse=await worker.fetch(request('/api/events'),env);
 assert.equal(publicResponse.status,200);
 assert.deepEqual((await publicResponse.json()).events,[]);
 assert.equal((await worker.fetch(request('/api/admin/events'),env)).status,403);
 const noAllowlist={...env,ADMIN_EMAILS:''};
 assert.equal((await worker.fetch(request('/api/admin/events'),noAllowlist,signed)).status,403);
 assert.equal((await worker.fetch(request('/api/admin/events'),env,{access:{}})).status,403);
});
test('Admin login requires verified Access identity and explicit email authorization',async()=>{
 const {env,signed,unknown}=setup();
 assert.equal((await worker.fetch(request('/admin/'),env)).status,403);
 assert.equal((await worker.fetch(request('/admin/'),env,unknown)).status,403);
 const login=await worker.fetch(request('/admin/'),env,signed);
 assert.equal(login.status,200);
 assert.match(await login.text(),/Event Calendar Admin/);
 assert.equal((await worker.fetch(request('/api/admin/events'),env,unknown)).status,403);
});
test('Drafts stay private; admins publish, edit, and delete entries',async()=>{
 const {env,signed}=setup();
 const create=await worker.fetch(request('/api/admin/events','POST',data),env,signed);
 assert.equal(create.status,201,await create.clone().text());
 const item=(await create.json()).event;
 assert.match(item.id,/^[0-9a-f-]{36}$/);
 assert.equal(item.published,false);
 assert.deepEqual((await (await worker.fetch(request('/api/events'),env)).json()).events,[]);
 let all=await (await worker.fetch(request('/api/admin/events'),env,signed)).json();
 assert.equal(all.events.length,1);
 assert.equal(all.admin,'admin@example.test');
 const modified={...item,published:true,name:'Revelation of Maya · Updated'};
 const edit=await worker.fetch(request('/api/admin/events/'+item.id,'PUT',modified),env,signed);
 assert.equal(edit.status,200);
 const publicEvents=await (await worker.fetch(request('/api/events'),env)).json();
 assert.equal(publicEvents.events.length,1);
 assert.equal(publicEvents.events[0].name,modified.name);
 const remove=await worker.fetch(request('/api/admin/events/'+item.id,'DELETE',null,HOST),env,signed);
 assert.equal(remove.status,200);
 assert.equal((await (await worker.fetch(request('/api/events'),env)).json()).events.length,0);
});
test('All admin writes fail closed on bad origin, unverified user, invalid dates and unsafe payloads',async()=>{
 const {env,signed,unknown}=setup();
 assert.equal((await worker.fetch(request('/api/admin/events','POST',data),env)).status,403);
 assert.equal((await worker.fetch(request('/api/admin/events','POST',data),env,unknown)).status,403);
 assert.equal((await worker.fetch(request('/api/admin/events','POST',data,'https://elsewhere.test'),env,signed)).status,403);
 assert.equal((await worker.fetch(request('/api/admin/events','POST',{...data,startDate:'2026-02-31'}),env,signed)).status,400);
 assert.equal((await worker.fetch(request('/api/admin/events','POST',{...data,endDate:'2026-11-10'}),env,signed)).status,400);
 assert.equal((await worker.fetch(request('/api/admin/events','POST',{...data,sourceUrl:'javascript:alert(1)'}),env,signed)).status,400);
 assert.equal((await worker.fetch(request('/api/admin/events','POST',{...data,published:'true'}),env,signed)).status,400);
 assert.deepEqual((await (await worker.fetch(request('/api/events'),env)).json()).events,[]);
});
test('Public view only shows published events in chronological order and allows site CORS',async()=>{
 const {env,signed}=setup();
 for(const [name,startDate] of [['Later','2026-12-04'],['Earlier','2026-11-10']]){
  const r=await worker.fetch(request('/api/admin/events','POST',{...data,name,startDate,endDate:startDate,published:true}),env,signed);
  assert.equal(r.status,201);
 }
 const resp=await worker.fetch(request('/api/events','GET',undefined,'https://evonymasters.jaynmegepicadventure.workers.dev'),env);
 assert.equal(resp.headers.get('access-control-allow-origin'),'https://evonymasters.jaynmegepicadventure.workers.dev');
 const body=await resp.json();
 assert.deepEqual(body.events.map(e=>e.name),['Earlier','Later']);
 const preflight=await worker.fetch(new Request(url('/api/events'),{method:'OPTIONS',headers:{origin:'https://evonymasters.jaynmegepicadventure.workers.dev'}}),env);
 assert.equal(preflight.status,204);
});
