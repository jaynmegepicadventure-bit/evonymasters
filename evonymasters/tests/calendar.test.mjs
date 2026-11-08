import test from "node:test";
import { Script } from "node:vm";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import worker from "../integrations/calendar/worker.mjs";
const HOST="https://evonymasters-calendar.test",origin=HOST;
const fakeCatalog=[
 {id:"event:revelation%20of%20maya",name:"Revelation of Maya",kind:"Event"},
 {id:"family:boss%7Cymir",name:"Ymir",kind:"Boss",family:true},
 {id:"monster:boss%7Cymir%7C1",name:"Ymir · Lv 1",kind:"Boss",level:"1",familyId:"family:boss%7Cymir"},
 {id:"monster:boss%7Cymir%7C6",name:"Ymir · Lv 6",kind:"Boss",level:"6",familyId:"family:boss%7Cymir"},
 {id:"family:event%20boss%7Chydra",name:"Hydra",kind:"Event Boss",family:true},
 {id:"family:regular%20monster%7Czombie",name:"Zombie",kind:"Regular Monster",family:true}
];
function runtime(){
 const map=new Map();
 const env={ADMIN_EMAILS:"admin@example.test,team@example.test",CALENDAR:{
  get:async k=>map.get(k)??null,put:async(k,v)=>{map.set(k,v)}
 },CATALOG_SERVICE:{fetch:async()=>Response.json({entries:fakeCatalog})}};
 const access={access:{getIdentity:async()=>({email:"admin@example.test"})}};
 const outsider={access:{getIdentity:async()=>({email:"outsider@example.test"})}};
 return {map,env,access,outsider};
}
function request(path,method="GET",body,requestOrigin=HOST){
 return new Request(HOST+path,{method,
 headers:{...(body!==undefined?{"content-type":"application/json"}:{}),...(requestOrigin?{origin:requestOrigin}:{})},
 ...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
const basics={targetIds:[fakeCatalog[0].id,fakeCatalog[1].id],rule:"dates",selectedDates:["2026-11-12","2026-11-16"],startDate:"",endDate:"",reviewAfter:"",excludedDates:[],daysOfWeek:[],intervalDays:14,startTime:"",endTime:"",status:"Confirmed",notes:"",sourceUrl:"",published:true,paused:false};
async function add(env,ctx,changes={}){
 const res=await worker.fetch(request("/api/admin/schedules","POST",{...basics,...changes}),env,ctx);
 assert.equal(res.status,201,await res.clone().text());
 return (await res.json()).schedule;
}
async function publicEvents(env,from="2026-11-08",to="2026-11-30",params=""){
 const r=await worker.fetch(request("/api/events?from="+from+"&to="+to+params),env);
 assert.equal(r.status,200,await r.clone().text());return (await r.json()).events;
}
test("Cloudflare Access and allowlist are both necessary; only authenticated admins read catalog",async()=>{
 const {env,access,outsider}=runtime();
 assert.equal((await worker.fetch(request("/admin/"),env)).status,403);
 assert.equal((await worker.fetch(request("/api/admin/catalog"),env,outsider)).status,403);
 assert.equal((await worker.fetch(request("/admin/"),env,{access:{}})).status,403);
 assert.equal((await worker.fetch(request("/admin/"),{...env,ADMIN_EMAILS:""},access)).status,403);
 const page=await worker.fetch(request("/admin/"),env,access);
 assert.equal(page.status,200);assert.match(await page.text(),/Bulk|Select events and monsters/i);
 const data=await (await worker.fetch(request("/api/admin/catalog"),env,access)).json();
 assert.deepEqual(data.entries,fakeCatalog);
 assert.deepEqual(await publicEvents(env),[]);
});
test("Bulk specific dates publish all selected source ids, with drafts remaining private",async()=>{
 const {env,access}=runtime();
 const s=await add(env,access,{published:false});
 assert.deepEqual(await publicEvents(env),[]);
 const pub=await worker.fetch(request("/api/admin/schedules/"+s.id,"PUT",{...s,targetIds:s.targets.map(t=>t.id),published:true,replace:false}),env,access);
 assert.equal(pub.status,200,await pub.clone().text());
 const results=await publicEvents(env);
 assert.equal(results.length,4);
 assert.deepEqual([...new Set(results.map(e=>e.date))],["2026-11-12","2026-11-16"]);
 assert.ok(results.some(e=>e.kind==="Boss"&&e.family));
 assert.ok(results.some(e=>e.kind==="Event"));
 assert.equal((await publicEvents(env,"2026-11-12","2026-11-12","&kind=Boss")).length,1);
});
test("Daily, weekly, interval and ongoing schedules expand according to UTC days",async()=>{
 const {env,access}=runtime();
 await add(env,access,{targetIds:[fakeCatalog[0].id],rule:"daily",selectedDates:[],startDate:"",endDate:""});
 await add(env,access,{targetIds:[fakeCatalog[1].id],rule:"weekly",selectedDates:[],startDate:"2026-11-08",endDate:"2026-11-23",daysOfWeek:[1,5]});
 await add(env,access,{targetIds:[fakeCatalog[4].id],rule:"interval",selectedDates:[],startDate:"2026-11-09",endDate:"2026-11-20",intervalDays:3,excludedDates:["2026-11-15"]});
 await add(env,access,{targetIds:[fakeCatalog[5].id],rule:"ongoing",selectedDates:[],startDate:"2026-11-10",endDate:"2026-11-12"});
 const events=await publicEvents(env,"2026-11-08","2026-11-20");
 const on=id=>events.filter(e=>e.sourceId===id).map(e=>e.date);
 assert.deepEqual(on(fakeCatalog[0].id),Array.from({length:13},(_,i)=>new Date(Date.UTC(2026,10,8+i)).toISOString().slice(0,10)));
 assert.deepEqual(on(fakeCatalog[1].id),["2026-11-09","2026-11-13","2026-11-16","2026-11-20"]);
 assert.deepEqual(on(fakeCatalog[4].id),["2026-11-09","2026-11-12","2026-11-18"]);
 assert.deepEqual(on(fakeCatalog[5].id),["2026-11-10","2026-11-11","2026-11-12"]);
});
test("Always available is opt-in, paused records disappear, and tentative remains labelled",async()=>{
 const {env,access}=runtime();
 const s=await add(env,access,{targetIds:[fakeCatalog[5].id],rule:"always",selectedDates:[],startDate:"",endDate:"",status:"Tentative"});
 assert.equal((await publicEvents(env,"2026-11-10","2026-11-11")).length,0);
 const all=await publicEvents(env,"2026-11-10","2026-11-11","&includeAlways=true");
 assert.equal(all.length,2);assert.equal(all[0].status,"Tentative");
 const paused=await worker.fetch(request("/api/admin/schedules/"+s.id,"PUT",{...s,targetIds:s.targets.map(t=>t.id),paused:true}),env,access);
 assert.equal(paused.status,200);
 assert.equal((await publicEvents(env,"2026-11-10","2026-11-11","&includeAlways=true")).length,0);
});
test("Replace only removes selected targets from other schedules; unselected sources survive",async()=>{
 const {env,access}=runtime();
 const old=await add(env,access);
 await add(env,access,{targetIds:[fakeCatalog[1].id],rule:"range",startDate:"2026-11-20",endDate:"2026-11-21",selectedDates:[],replace:true});
 const list=await (await worker.fetch(request("/api/admin/schedules"),env,access)).json();
 assert.equal(list.schedules.length,2);
 assert.deepEqual(list.schedules.find(s=>s.id===old.id).targets.map(t=>t.id),[fakeCatalog[0].id]);
 assert.ok((await publicEvents(env,"2026-11-12","2026-11-12")).some(e=>e.kind==="Event"));
 assert.ok(!(await publicEvents(env,"2026-11-12","2026-11-12")).some(e=>e.kind==="Boss"));
});
test("Admin writes reject invalid IDs, unsafe origins, unknown user, recurrence errors and deletes",async()=>{
 const {env,access,outsider}=runtime();
 assert.equal((await worker.fetch(request("/api/admin/schedules","POST",basics),env)).status,403);
 assert.equal((await worker.fetch(request("/api/admin/schedules","POST",basics),env,outsider)).status,403);
 assert.equal((await worker.fetch(request("/api/admin/schedules","POST",basics,"https://example.test"),env,access)).status,403);
 for(const bad of [
  {targetIds:["unknown"]},{rule:"weekly",selectedDates:[],startDate:"2026-11-09",endDate:"2026-11-30",daysOfWeek:[]},
  {rule:"interval",selectedDates:[],startDate:"2026-11-09",endDate:"2026-11-30",intervalDays:0},
  {rule:"alternate-weekends",selectedDates:[],startDate:"2026-11-09",endDate:""},
  {selectedDates:["2026-02-31"]},{sourceUrl:"javascript:alert(1)"}
 ]){const r=await worker.fetch(request("/api/admin/schedules","POST",{...basics,...bad}),env,access);assert.equal(r.status,400,JSON.stringify(bad)+": "+await r.text());}
 assert.equal((await worker.fetch(request("/api/events?from=2026-01-01&to=2027-01-01"),env)).status,400);
 const s=await add(env,access);
 const deleted=await worker.fetch(request("/api/admin/schedules/"+s.id,"DELETE"),env,access);
 assert.equal(deleted.status,200);assert.deepEqual(await publicEvents(env),[]);
});
test("Public CORS is narrowly scoped",async()=>{
 const {env}=runtime();
 const url="/api/events?from=2026-11-09&to=2026-11-10";
 const allowed=await worker.fetch(request(url,"GET",undefined,"https://evonymasters.jaynmegepicadventure.workers.dev"),env);
 assert.equal(allowed.headers.get("access-control-allow-origin"),"https://evonymasters.jaynmegepicadventure.workers.dev");
 const blocked=await worker.fetch(request(url,"GET",undefined,"https://unrelated.test"),env);
 assert.equal(blocked.headers.has("access-control-allow-origin"),false);
});

test("Admin and public calendar browser scripts are syntactically valid",async()=>{
 const {env,access}=runtime();
 const html=await (await worker.fetch(request("/admin/"),env,access)).text();
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match,"admin interface should include its interactive script");
 assert.doesNotThrow(()=>new Script(match[1]));
 const calendar=readFileSync(new URL("../src/pages/calendar/index.astro",import.meta.url),"utf8");
 const publicScript=calendar.match(/<script is:inline>([\s\S]*?)<\/script>/);
 assert.ok(publicScript);
 assert.doesNotThrow(()=>new Script(publicScript[1]));
});
test("Daily schedules need no dates and publish automatically",async()=>{
 const {env,access}=runtime();
 const saved=await add(env,access,{targetIds:[fakeCatalog[0].id],rule:"daily",selectedDates:[],startDate:"",endDate:"",reviewAfter:"",published:undefined});
 assert.equal(saved.published,true);
 const entries=await publicEvents(env,"2026-11-10","2026-11-12");
 assert.deepEqual(entries.map(e=>e.status),["Confirmed","Confirmed","Confirmed"]);
});

test("Weekend rules use UTC Saturday and Sunday, with alternate weekends anchored on Saturday",async()=>{const {env,access}=runtime();
 await add(env,access,{targetIds:[fakeCatalog[1].id],rule:"weekends",selectedDates:[],startDate:"",endDate:""});
 await add(env,access,{targetIds:[fakeCatalog[4].id],rule:"alternate-weekends",selectedDates:[],startDate:"2026-11-14",endDate:""});
 const results=await publicEvents(env,"2026-11-13","2026-11-30");
 const dates=id=>results.filter(e=>e.sourceId===id).map(e=>e.date);
 assert.deepEqual(dates(fakeCatalog[1].id),["2026-11-14","2026-11-15","2026-11-21","2026-11-22","2026-11-28","2026-11-29"]);
 assert.deepEqual(dates(fakeCatalog[4].id),["2026-11-14","2026-11-15","2026-11-28","2026-11-29"]);
});

test("Player-facing reward, event, chest and homepage browser scripts remain syntactically valid",()=>{
 for(const path of ["../src/pages/resources/index.astro","../src/pages/events/index.astro","../src/pages/chests/index.astro","../src/pages/index.astro","../src/pages/bosses/[id].astro"]){
  const html=readFileSync(new URL(path,import.meta.url),"utf8");
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for(const [,source] of scripts)assert.doesNotThrow(()=>new Script(source),path);
 }
 const resources=readFileSync(new URL("../src/pages/resources/index.astro",import.meta.url),"utf8");
 assert.match(resources,/>Reward Activity </);
 assert.match(resources,/>Availability </);
 assert.doesNotMatch(resources,/>Frequency <span class="arrow"/);
 assert.doesNotMatch(resources,/>Notes \/ How to obtain <span class="arrow"/);
 assert.match(resources,/addField\("Notes \/ How to obtain",row.note\)/);
 assert.doesNotMatch(resources,/id="activity-filter"/);
});
