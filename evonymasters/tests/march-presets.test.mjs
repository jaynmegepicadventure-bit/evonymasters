import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculatePreset,makeUnlocks,TYPES,PRESETS} from "../src/lib/marchPresets.mjs";
import worker from "../integrations/calendar/worker.mjs";
import {Script} from "node:vm";
const count=(result,tier)=>result.allocations.find(row=>row.tier===tier)?.count||0;
test("Ranged sample reproduces uploaded 2024 workbook at its given unlocks and size",()=>{
 const unlocked=makeUnlocks();unlocked.Ranged[15]=true;unlocked.Ground[15]=true;
 const result=calculatePreset({marchSize:7393200,preset:"ranged",unlocked});
 assert.equal(result.reserve,660000);
 assert.equal(result.mainTroops,6733200);
 assert.deepEqual([15,14,13,12].map(tier=>count(result,tier)),[1009980,1346640,2019960,2356620]);
});
test("Cavalry sample follows no-T15 ratios and exact workbook reserve",()=>{
 const unlocked=makeUnlocks();unlocked.Ranged[15]=true;unlocked.Ground[15]=true;
 const result=calculatePreset({marchSize:7480700,preset:"cavalry",unlocked});
 assert.equal(result.reserve,700000);
 assert.deepEqual([14,13,12].map(tier=>count(result,tier)),[1695175,2373245,2712280]);
});
test("Ground sample includes workbook's T12 support reserve when T15 unlocked",()=>{
 const unlocked=makeUnlocks();unlocked.Ranged[15]=true;unlocked.Ground[15]=true;
 const result=calculatePreset({marchSize:7486400,preset:"ground",unlocked});
 assert.equal(result.reserve,1115000);
 assert.deepEqual([15,14,13].map(tier=>count(result,tier)),[2548560,2548560,1274280]);
});
test("Big Siege, Small Siege and Solo Siege sample totals",()=>{
 const unlocked=makeUnlocks();unlocked.Ranged[15]=true;unlocked.Ground[15]=true;
 const big=calculatePreset({marchSize:6013200,preset:"bigSiege",unlocked});
 assert.equal(big.reserve,56000);assert.equal(count(big,14),1489300);assert.equal(count(big,13),4467900);
 const small=calculatePreset({marchSize:5749450,preset:"smallSiege",unlocked});
 assert.equal(small.reserve,52000);assert.equal(count(small,11),5447450);
 for(const tier of [14,13,12,10,9])assert.equal(count(small,tier),50000);
 const solo=calculatePreset({marchSize:5549800,preset:"soloSiege",unlocked});
 assert.equal(solo.reserve,52000);assert.equal(count(solo,14),824670);assert.equal(count(solo,13),2748900);assert.equal(count(solo,12),1924230);
});
test("Each unlocked T16 troop type uses a disclosed T15-share extrapolation",()=>{
 for(const [key,profile] of Object.entries(PRESETS)){
  const unlocked=makeUnlocks();unlocked[profile.type][15]=true;unlocked[profile.type][16]=true;
  const result=calculatePreset({marchSize:8500000,preset:key,unlocked});
  assert.equal(result.reserve+result.allocations.reduce((n,r)=>n+r.count,0),8500000);
  assert.ok(result.warnings.some(x=>x.includes("T16 is not in")));
 }
});
test("Empty unlocks, reduced marches and tier fallbacks never exceed capacity",()=>{
 for(const key of Object.keys(PRESETS)){
  const unlocked=makeUnlocks();for(const type of TYPES)for(const tier of [13,14,15,16])unlocked[type][tier]=false;
  for(const marchSize of [1,50000,500000,1000000,100000000]){
   const result=calculatePreset({marchSize,preset:key,unlocked});
   assert.equal(result.rows.reduce((n,r)=>n+r.count,0),marchSize);
   assert.ok(result.rows.every(r=>Number.isInteger(r.count)&&r.count>=0));
  }
 }
});
test("March page renders accessible unlock matrix, preset tabs and output",()=>{
 const page=readFileSync(new URL("../src/pages/march-presets/index.astro",import.meta.url),"utf8");
 const header=readFileSync(new URL("../src/components/SiteHeader.astro",import.meta.url),"utf8");
 assert.match(page,/data-size/);assert.match(page,/data-tiers/);
 assert.match(page,/data-type="ranged"/);assert.match(page,/data-type="cavalry"/);
 assert.match(page,/data-type="ground"/);assert.match(page,/data-type="siege"/);
 assert.match(page,/id="all-tiers"/);assert.match(page,/Copy this preset/);
 assert.doesNotMatch(page,/withTop:|withoutTop:|Allocation %|id="calc-rules"/);
 assert.doesNotMatch(page,/from ['"][^'"]*marchPresets/);
 assert.match(page,/T16 recommendations are estimates/);
 assert.match(header,/href:'\/march-presets\/'/);
});

test("Protected Troop Calculations admin tab is available only to authorized admins",async()=>{
 const saved=new Map(),env={ADMIN_EMAILS:"admin@test.example",CALENDAR:{get:async k=>saved.get(k)||null,put:async(k,v)=>saved.set(k,v)}};
 const auth={access:{getIdentity:async()=>({email:"admin@test.example"})}};
 const uri="https://evonymasters-calendar.test";
 const request=(url,method="GET",data,origin=uri)=>new Request(uri+url,{method,headers:{origin,...(data?{"content-type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
 assert.equal((await worker.fetch(request("/api/admin/march-presets"),env)).status,403);
 const admin=await worker.fetch(request("/admin/"),env,auth);
 assert.equal(admin.status,200);
 const html=await admin.text();
 assert.match(html,/Troop Calculations/);
 assert.match(html,/id="troops-admin"/);
 assert.match(html,/Save troop calculations/);
 const inline=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(inline);assert.doesNotThrow(()=>new Script(inline[1]));
 const response=await worker.fetch(request("/api/admin/march-presets"),env,auth);
 assert.equal(response.status,200);
 const original=await response.json();
 assert.equal(original.presets.ranged.withTop.reduce((n,r)=>n+r[1],0),100);
 const config=structuredClone(original);
 config.presets.ranged.withTop=[[15,30],[14,20],[13,20],[12,30]];
 const put=await worker.fetch(request("/api/admin/march-presets","PUT",config),env,auth);
 assert.equal(put.status,200,await put.clone().text());
 const persisted=await (await worker.fetch(request("/api/admin/march-presets"),env,auth)).json();
 assert.equal(persisted.presets.ranged.withTop[0][1],30);
 assert.equal((await worker.fetch(request("/api/admin/march-presets","PUT",{presets:{...original.presets,ranged:{...original.presets.ranged,withTop:[[15,25],[14,25],[13,25],[12,20]]}}}),env,auth)).status,400);
});
test("Public march calculation returns only counts and observes privately edited percentages",async()=>{
 const saved=new Map(),env={ADMIN_EMAILS:"admin@test.example",CALENDAR:{get:async k=>saved.get(k)||null,put:async(k,v)=>saved.set(k,v)}};
 const auth={access:{getIdentity:async()=>({email:"admin@test.example"})}},host="https://evonymasters-calendar.test",site="https://evonymasters.jaynmegepicadventure.workers.dev";
 const req=(path,body,origin=site)=>new Request(host+path,{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)});
 const body={marchSize:7393200,preset:"ranged",unlocked:{Ranged:{13:true,14:true,15:true,16:false},Cavalry:{13:true,14:true,15:false,16:false},Ground:{13:true,14:true,15:true,16:false},Siege:{13:true,14:true,15:false,16:false}}};
 const first=await worker.fetch(req("/api/march-presets/calculate",body),env);
 assert.equal(first.status,200,await first.clone().text());
 const result=await first.json();
 assert.equal(result.rows.reduce((n,r)=>n+r.count,0),body.marchSize);
 assert.equal(result.reserve,660000);
 assert.equal(JSON.stringify(result).includes("withTop"),false);
 assert.equal(JSON.stringify(result).includes("percent"),false);
 assert.equal((await worker.fetch(req("/api/march-presets/calculate",body,"https://untrusted.example"),env)).status,403);
 const config=await (await worker.fetch(new Request(host+"/api/admin/march-presets",{headers:{origin:host}}),env,auth)).json();
 config.presets.ranged.withTop=[[15,30],[14,20],[13,20],[12,30]];
 await worker.fetch(new Request(host+"/api/admin/march-presets",{method:"PUT",headers:{origin:host,"content-type":"application/json"},body:JSON.stringify(config)}),env,auth);
 const second=await (await worker.fetch(req("/api/march-presets/calculate",body),env)).json();
 assert.ok(second.rows.find(r=>r.tier===15).count>result.rows.find(r=>r.tier===15).count);
 assert.equal(second.rows.reduce((n,r)=>n+r.count,0),body.marchSize);
 const preflight=await worker.fetch(new Request(host+"/api/march-presets/calculate",{method:"OPTIONS",headers:{origin:site}}),env);
 assert.equal(preflight.status,204);
 assert.match(preflight.headers.get("access-control-allow-headers"),/content-type/);
});
