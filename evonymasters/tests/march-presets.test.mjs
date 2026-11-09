import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculatePreset,makeUnlocks,TYPES,PRESETS} from "../src/lib/marchPresets.mjs";
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
 assert.match(page,/id="march-size"/);assert.match(page,/id="unlock-grid"/);
 assert.match(page,/data-preset="smallSiege"/);assert.match(page,/data-preset="ranged"/);
 assert.match(page,/Select all troops/);assert.match(page,/Copy preset/);
 assert.match(page,/T16 is not/);
 assert.match(header,/href:'\/march-presets\/'/);
});
