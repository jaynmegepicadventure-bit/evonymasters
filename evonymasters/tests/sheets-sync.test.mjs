import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../integrations/sheets-sync/worker.mjs';

const API = 'https://sync.example.test';
const SECRET = 'test-only-not-a-production-secret';
const sites = { allowed: 'https://evonymasters.jaynmegepicadventure.workers.dev', blocked: 'https://unrelated.example' };
const headers = {
  events: ['LOCATION','EVENT','RECURRANCE','FEQUENCY','EVENT NAME','SUB EVENT','ACTIVITY TYPE','ITEM AVAILABILITY','STAMINA','DETAIL','LEVEL','ITEM','QUANTITY','GENERAL','CASTLE'],
  monsters: ['Monster Type','Monster Level','Monster Name','Power','Stamina','Event','Reward Item (in-game)','Quantity','Drop Classification'],
  boxes: ['Box Name','Level','Reward Item (in-game)','Quantity','Drop Classification','Source','Notes']
};
const padded = (record, length) => Array.from({length}, (_, index) => record[index] ?? '');
const payload = () => ({version:1,tabs:{
  events:[[],headers.events,padded(['Event Centre','','','','Festival','','','','','','','Refining Stone','20'],15)],
  monsters:[headers.monsters,['Boss','1','Zombie','36500','15','','Lv1 Boss Monster Chest','1','Guaranteed'],['Boss','1','Zombie','36500','15','','Refining Stone','2','Possible']],
  boxes:[[],headers.boxes,['Lv1 Boss Monster Chest','','Inner Chest','1','Guaranteed'],['Inner Chest','','Refining Stone','7','Possible'],['Inner Chest','','Another Reward','10','Guaranteed'],['Inner Chest','','Lv1 Boss Monster Chest','1','Possible']]
}});
function runtime(){
 const map=new Map();
 return {map,env:{SYNC_SECRET:SECRET,DATA:{get:async k=>map.get(k)??null,put:async(k,v)=>{map.set(k,v)}}}};
}
async function signedRequest(raw, secret=SECRET){
 const body=typeof raw==='string'?raw:JSON.stringify(raw);
 const timestamp=String(Date.now());
 const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+body));
 const signature=Buffer.from(digest).toString('hex');
 return new Request(API+'/v1/sync',{method:'POST',headers:{'x-sync-timestamp':timestamp,'x-sync-signature':signature,'content-type':'application/json'},body});
}
test('signed import succeeds and stores validated snapshot',async()=>{
 const {env,map}=runtime();
 const response=await worker.fetch(await signedRequest(payload()),env);
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).counts,{events:1,monsters:2,boxes:4});
 assert.ok(map.has('latest'));
});
test('wrong secret rejects update without damaging previous data',async()=>{
 const {env,map}=runtime();
 await worker.fetch(await signedRequest(payload()),env);
 const before=map.get('latest');
 const response=await worker.fetch(await signedRequest(payload(),'incorrect'),env);
 assert.equal(response.status,401);
 assert.equal(map.get('latest'),before);
});
test('invalid incoming rows keep last known good data',async()=>{
 const {env,map}=runtime();
 await worker.fetch(await signedRequest(payload()),env);
 const before=map.get('latest');
 const altered=payload();
 altered.tabs.boxes[2][0]='';
 const response=await worker.fetch(await signedRequest(altered),env);
 assert.equal(response.status,422);
 assert.equal(map.get('latest'),before);
});
test('nested box matching tracks possible drops and contained quantity, with cycle protection',async()=>{
 const {env}=runtime();
 await worker.fetch(await signedRequest(payload()),env);
 const response=await worker.fetch(new Request(API+'/v1/search?q=Refining%20Stone',{headers:{origin:sites.allowed}}),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('access-control-allow-origin'),sites.allowed);
 const data=await response.json();
 assert.ok(data.results.some(x=>x.source==='monster'&&x.name==='Zombie'&&x.item==='Refining Stone'&&x.quantity==='7'&&x.classification==='Possible'&&x.route.join('/')==='Lv1 Boss Monster Chest/Inner Chest/Refining Stone'));
 assert.ok(data.results.some(x=>x.source==='event'&&x.name==='Festival'&&x.quantity==='20'));
 assert.ok(data.results.length<20,'cyclic boxes must not expand indefinitely');
});
test('unknown site origin cannot read cross-site and browser preflight is constrained',async()=>{
 const {env}=runtime();
 const disallowed=await worker.fetch(new Request(API+'/v1/search?q=stone',{headers:{origin:sites.blocked}}),env);
 assert.equal(disallowed.headers.has('access-control-allow-origin'),false);
 const preflight=await worker.fetch(new Request(API+'/v1/search',{method:'OPTIONS',headers:{origin:sites.blocked}}),env);
 assert.equal(preflight.status,403);
 const permitted=await worker.fetch(new Request(API+'/v1/search',{method:'OPTIONS',headers:{origin:sites.allowed}}),env);
 assert.equal(permitted.status,204);
});

test('event-only searches are not crowded out by monster search cap',async()=>{
 const {env}=runtime();
 const data=payload();
 for(let index=0; index<45; index++) data.tabs.monsters.push(['Boss',String(index+2),'Repeat Monster','36500','15','','Refining Stone','1','Possible']);
 const response=await worker.fetch(await signedRequest(data),env);
 assert.equal(response.status,200);
 const result=await worker.fetch(new Request(API+'/v1/search?q=refining%20stone&source=event'),env);
 const payloadOut=await result.json();
 assert.ok(payloadOut.results.length>0);
 assert.ok(payloadOut.results.every(x=>x.source==='event'));
 assert.equal(payloadOut.results[0].name,'Festival');
});
test('monster type filtering occurs before truncation',async()=>{
 const {env}=runtime();
 const data=payload();
 data.tabs.monsters.push(['Regular','1','Regular Target','200','5','','Refining Stone','3','Guaranteed']);
 assert.equal((await worker.fetch(await signedRequest(data),env)).status,200);
 const response=await worker.fetch(new Request(API+'/v1/search?q=refining%20stone&source=monster&monsterType=Regular'),env);
 const result=await response.json();
 assert.ok(result.results.length>0);
 assert.ok(result.results.every(x=>x.name==='Regular Target'));
});

test('v2 item finder groups nested rewards by source instead of listing every drop',async()=>{
 const {env}=runtime();
 assert.equal((await worker.fetch(await signedRequest(payload()),env)).status,200);
 const response=await worker.fetch(new Request(API+'/v2/search?q=refining%20stone'),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.ok(body.groups.length>0);
 const zombie=body.groups.find(g=>g.title==='Zombie');
 assert.ok(zombie,'Zombie must appear once as a grouped source');
 assert.equal(body.groups.filter(g=>g.title==='Zombie').length,1);
 assert.ok(zombie.items.some(i=>i.quantity==='7'&&i.classification==='Possible'&&i.route.join(' / ')==='Lv1 Boss Monster Chest / Inner Chest / Refining Stone'));
 assert.ok(body.groups.some(g=>g.title==='Festival'));
 assert.ok(body.groups.some(g=>g.title==='Inner Chest'));
});
test('v2 category and guarantee filters apply before returning grouped results',async()=>{
 const {env}=runtime();
 await worker.fetch(await signedRequest(payload()),env);
 const onlyEvents=await (await worker.fetch(new Request(API+'/v2/search?q=refining%20stone&type=events'),env)).json();
 assert.ok(onlyEvents.groups.length>0);
 assert.ok(onlyEvents.groups.every(g=>g.source==='events'));
 const onlyGuaranteed=await (await worker.fetch(new Request(API+'/v2/search?q=refining%20stone&drop=Guaranteed'),env)).json();
 assert.ok(onlyGuaranteed.groups.every(g=>g.items.every(x=>x.classification==='Guaranteed')));
 assert.ok(onlyGuaranteed.groups.every(g=>g.title!=='Festival'),'Unknown event rewards must never be presented as guaranteed');
 const onlyPossible=await (await worker.fetch(new Request(API+'/v2/search?q=refining%20stone&drop=Possible'),env)).json();
 assert.ok(onlyPossible.groups.some(g=>g.title==='Zombie'));
});
test('v2 suggestions rank exact and prefix item matches without returning entire sheet',async()=>{
 const {env}=runtime();
 await worker.fetch(await signedRequest(payload()),env);
 const response=await worker.fetch(new Request(API+'/v2/suggest?q=refin'),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.ok(body.items.includes('Refining Stone'));
 assert.ok(body.items.length<=10);
 assert.equal(body.groups,undefined);
});
test('v2 search accepts only supported filters and pages',async()=>{
 const {env}=runtime();
 await worker.fetch(await signedRequest(payload()),env);
 for(const suffix of ['type=private','drop=Nothing','page=-1','page=1.2']){
   const response=await worker.fetch(new Request(API+'/v2/search?q=gems&'+suffix),env);
   assert.equal(response.status,400,suffix);
 }
 const response=await worker.fetch(new Request(API+'/v2/search?q=stone',{headers:{origin:sites.allowed}}),env);
 assert.equal(response.headers.get('access-control-allow-origin'),sites.allowed);
});

test('v3 comparison table returns quantities and sorts every source before paging',async()=>{
 const {env}=runtime();
 const data=payload();
 for(let i=0;i<25;i++)data.tabs.events.push(['Centre','','','','Event '+String(i).padStart(2,'0'),'','Personal Activity','','','','','Refining Stone',String(i+1)]);
 assert.equal((await worker.fetch(await signedRequest(data),env)).status,200);
 const r=await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&sort=quantity&direction=asc'),env);
 assert.equal(r.status,200);
 const j=await r.json();
 assert.equal(j.total>=26,true);
 assert.equal(j.hasMore,true);
 assert.equal(j.groups.length,15);
 assert.equal(j.groups[0].quantityMax,25,'highest numeric quantity should be first across entire dataset');
 const next=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&sort=quantity&direction=asc&page=1'),env)).json();
 assert.ok(next.groups.length>0);
 assert.ok(j.groups.every(g=>g.quantityMax===null||g.quantityMax>=next.groups[0].quantityMax));
});
test('v3 source title sort reverses with direction and preserves global order',async()=>{
 const {env}=runtime();await worker.fetch(await signedRequest(payload()),env);
 const asc=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&sort=source&direction=asc'),env)).json();
 const desc=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&sort=source&direction=desc'),env)).json();
 assert.equal(asc.groups[0].title,desc.groups.at(-1).title);
});
test('v3 shows alternative reward tiers as a range, not a sum',async()=>{
 const {env}=runtime();const data=payload();
 data.tabs.events.push(['Centre','','','','Festival','','','','','','','Refining Stone','40']);
 data.tabs.events.push(['Centre','','','','Festival','','','','','','','Refining Stone','80']);
 await worker.fetch(await signedRequest(data),env);
 const result=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=events'),env)).json();
 const festival=result.groups.find(x=>x.title==='Festival');
 assert.equal(festival.quantityDisplay,'20–80');
 assert.equal(festival.chance,'Unspecified');
});
test('v3 splits explicit Tasks from Events and includes event bosses in Bosses tab',async()=>{
 const {env}=runtime();const data=payload();
 data.tabs.events.push(['Centre','','','','Daily Task Rewards','My Tasks','Personal Activity','','','','','Refining Stone','77']);
 data.tabs.monsters.push(['Event','8','Special Beast','999','20','Event','Refining Stone','9','Possible']);
 await worker.fetch(await signedRequest(data),env);
 const tasks=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=tasks'),env)).json();
 assert.ok(tasks.groups.some(x=>x.title==='Daily Task Rewards'));
 const events=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=events'),env)).json();
 assert.ok(!events.groups.some(x=>x.title==='Daily Task Rewards'));
 const bosses=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=all-bosses'),env)).json();
 assert.ok(bosses.groups.some(x=>x.title==='Special Beast'));
 assert.ok(bosses.groups.some(x=>x.title==='Zombie'));
});
test('v3 rejects invalid sort and returns origin-scoped CORS',async()=>{
 const {env}=runtime();await worker.fetch(await signedRequest(payload()),env);
 const bad=await worker.fetch(new Request(API+'/v3/search?q=stone&sort=made-up'),env);
 assert.equal(bad.status,400);
 const good=await worker.fetch(new Request(API+'/v3/search?q=stone',{headers:{origin:sites.allowed}}),env);
 assert.equal(good.headers.get('access-control-allow-origin'),sites.allowed);
 const opts=await worker.fetch(new Request(API+'/v3/search',{method:'OPTIONS',headers:{origin:sites.allowed}}),env);
 assert.equal(opts.status,204);
});

test('event classification column can be inserted before ITEM and syncs Redeem, Possible, Guaranteed',async()=>{
 const {env,map}=runtime(),data=payload();
 data.tabs.events[1]=[...data.tabs.events[1]];
 data.tabs.events[1].splice(11,0,'Drop Classification');
 data.tabs.events[2].splice(11,0,'Redeem');
 const next=padded(['Event Centre','','','','Festival','','','','','','','Possible','Refining Stone','50'],16);
 data.tabs.events.push(next);
 const redeem=await worker.fetch(await signedRequest(data),env);
 assert.equal(redeem.status,200);
 assert.equal(JSON.parse(map.get('latest')).events[0].fields['Drop Classification'],'Redeem');
 const res=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=events'),env)).json();
 const festival=res.groups.find(g=>g.title==='Festival');
 assert.ok(festival.items.some(x=>x.classification==='Redeem'));
 assert.ok(festival.items.some(x=>x.classification==='Possible'));
 assert.equal(festival.context.location,'Event Centre');
 assert.ok(festival.items.some(x=>x.details?.location==='Event Centre'));
 const onlyRedeem=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=events&drop=Redeem'),env)).json();
 assert.ok(onlyRedeem.groups.some(x=>x.title==='Festival'));
});
test('v3 event activity filters isolate Alliance and Personal activity records',async()=>{
 const {env}=runtime(),data=payload();
 data.tabs.events.push(['Events','','','','Alliance Rewards','Alliance Battle','Alliance activity','','','','','Refining Stone','75']);
 data.tabs.events.push(['Events','','','','Personal Rewards','Personal Gathering','Personal activity','','','','','Refining Stone','70']);
 await worker.fetch(await signedRequest(data),env);
 const alliance=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=events&activity=alliance'),env)).json();
 assert.ok(alliance.groups.some(x=>x.title==='Alliance Rewards'));
 assert.ok(!alliance.groups.some(x=>x.title==='Personal Rewards'));
 const personal=await (await worker.fetch(new Request(API+'/v3/search?q=refining%20stone&type=events&activity=personal'),env)).json();
 assert.ok(personal.groups.some(x=>x.title==='Personal Rewards'));
 assert.ok(!personal.groups.some(x=>x.title==='Alliance Rewards'));
 const invalid=await worker.fetch(new Request(API+'/v3/search?q=stone&activity=everything'),env);
 assert.equal(invalid.status,400);
});
test('v4 chest search looks up boxes by contents, returns source relationships and nested items',async()=>{
 const {env}=runtime();await worker.fetch(await signedRequest(payload()),env);
 const result=await worker.fetch(new Request(API+'/v4/chests?q=refining%20stone',{headers:{origin:sites.allowed}}),env);
 assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),sites.allowed);
 const body=await result.json();
 assert.ok(body.chests.some(c=>c.name==='Lv1 Boss Monster Chest'));
 const outer=body.chests.find(c=>c.name==='Lv1 Boss Monster Chest');
 assert.ok(outer.sources.some(s=>s.name==='Zombie'));
 assert.ok(outer.nestedCount>0);
 const compare=await (await worker.fetch(new Request(API+'/v4/chests/compare?id='+encodeURIComponent(outer.id)),env)).json();
 assert.ok(compare.chests[0].nestedItems.some(i=>i.item==='Refining Stone'&&i.classification==='Possible'));
 assert.ok(compare.chests[0].nestedItems.length<100);
});
test('v4 chest comparison limits selections and rejects missing chest identifiers',async()=>{
 const {env}=runtime();await worker.fetch(await signedRequest(payload()),env);
 for(const suffix of ['','?id=not-a-real-chest','?id=a&id=b&id=c&id=d&id=e']){
  const r=await worker.fetch(new Request(API+'/v4/chests/compare'+suffix),env);
  assert.ok(r.status===400||r.status===404);
 }
 const preflight=await worker.fetch(new Request(API+'/v4/chests',{method:'OPTIONS',headers:{origin:sites.allowed}}),env);
 assert.equal(preflight.status,204);
});
