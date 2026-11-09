import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TROOP_TRAINING_COSTS,TROOP_TYPES,calculateTrainingRow,calculateTrainingTotals} from '../src/data/troop-training-costs.mjs';
test('Uploaded Excel provides all 64 distinct T1–T16 troop type combinations',()=>{
 assert.equal(TROOP_TRAINING_COSTS.length,64);
 assert.equal(new Set(TROOP_TRAINING_COSTS.map(r=>r.id)).size,64);
 for(let tier=1;tier<=16;tier++)for(const type of TROOP_TYPES){
  assert.ok(TROOP_TRAINING_COSTS.some(r=>r.tier===tier&&r.type===type),`Missing T${tier} ${type}`);
 }
});
test('All Troops Required start at 0, producing zero costs and row totals',()=>{
 const results=TROOP_TRAINING_COSTS.map(r=>calculateTrainingRow(r,0));
 const totals=calculateTrainingTotals(results);
 for(const key of ['required','food','wood','stone','ore','power','gold','totalResources'])assert.equal(totals[key],0);
});
test('Full cost table agrees with source workbook when quantity is 1 each',()=>{
 const rows=TROOP_TRAINING_COSTS.map(r=>calculateTrainingRow(r,1));
 const actual=calculateTrainingTotals(rows);
 assert.deepEqual(actual,{required:64,food:167350,wood:167230,stone:166210,ore:165320,power:3178.24,gold:9200,totalResources:666110});
});
test('T10 Siege stone special value is kept at 2250 (not inferred)',()=>{
 const x=TROOP_TRAINING_COSTS.find(r=>r.id==='t10-siege');
 assert.equal(x.stone,2250);
});
test('Row total sums Food + Wood + Stone + Ore; gold and power remain separate',()=>{
 const ground=TROOP_TRAINING_COSTS.find(r=>r.id==='t15-ground');
 const x=calculateTrainingRow(ground,1000);
 assert.equal(x.food,22500000);
 assert.equal(x.wood,0);
 assert.equal(x.stone,7500000);
 assert.equal(x.ore,7500000);
 assert.equal(x.totalResources,37500000);
 assert.equal(x.gold,800000);
 assert.equal(x.power,163000);
});
test('Filtering type or tier produces proper subtotals without losing grand total',()=>{
 const data=TROOP_TRAINING_COSTS.map(r=>calculateTrainingRow(r,r.type==='Ground'?100:50));
 const overall=calculateTrainingTotals(data);
 const filtered=calculateTrainingTotals(data.filter(r=>r.type==='Ground'));
 assert.equal(filtered.required,1600);
 assert.equal(overall.required,4000);
 assert.equal(filtered.totalResources,TROOP_TRAINING_COSTS.filter(r=>r.type==='Ground').reduce((s,r)=>s+100*(r.food+r.wood+r.stone+r.ore),0));
});
test('Troop Training UI has independently filterable type and tier columns and default zero inputs',()=>{
 const src=readFileSync(new URL('../src/pages/training/index.astro',import.meta.url),'utf8');
 assert.match(src,/id="type-filter"/);
 assert.match(src,/id="tier-filter"/);
 assert.match(src,/value="0"/);
 assert.match(src,/Filtered subtotal/);
 assert.match(src,/Grand total \(all entries\)/);
 assert.match(src,/Total resources/);
});
