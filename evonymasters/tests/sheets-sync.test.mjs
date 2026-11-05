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
