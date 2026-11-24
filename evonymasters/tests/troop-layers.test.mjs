import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FORMATIONS,REFERENCE_EXAMPLES,combatLayerSize,calculateFormation,displayFormationLayers} from '../src/lib/troop-layers.mjs';
const base=Array.from({length:11},(_,i)=>i+3);
const all=[...base,14,15,16];
const byTier=x=>Object.fromEntries(x.rows.map(({tier,count})=>[tier,count]));
const selected=example=>[...base,...example.tiers.filter(t=>t>=14)];
const siege=['bigSiege','smallSiege','soloSiege'];
const combat=['ranged','mounted','ground'];


test('adaptive layer sizes increase each million and become 10K at 7M',()=>{
 for(const [size,want] of [[1,1000],[1999999,1000],[2000000,2000],[3000000,3000],[3999999,3000],[4000000,4000],[5000000,5000],[6000000,6000],[6999999,6000],[7000000,10000],[7500000,10000]])
  assert.equal(combatLayerSize(size),want);
});
test('custom support sizes override recommendations and validate bounds',()=>{
 for(const type of combat){
  const x=calculateFormation(type,4000000,[...base,14],{layerSize:3000});
  assert.equal(x.layerSize,3000);
  assert.equal(x.otherLayers,3*14*3000);
  assert.equal(x.total,4000000);
 }
 assert.throws(()=>calculateFormation('ranged',4000000,[...base,14],{layerSize:0}));
 assert.throws(()=>calculateFormation('ranged',4000000,[...base,14],{layerSize:1000001}));
});
test('T14 ranged uses tier-specific 20/30/50 preference (T12 > T13 > T14)',()=>{
 const x=calculateFormation('ranged',4000000,[...base,14]);
 const r=byTier(x);
 assert.ok(r[12]>r[13]&&r[13]>r[14]);
 assert.equal(r[9],4000);
 assert.equal(x.total,4000000);
});
test('large march fixed T9-T11 and special ground T12 allocations survive',()=>{
 const ranged=byTier(calculateFormation('ranged',7500000,[...base,14,15]));
 for(const t of [9,10,11])assert.equal(ranged[t],50000);
 const mounted=byTier(calculateFormation('mounted',7500000,[...base,14]));
 assert.equal(mounted[9],25000);assert.equal(mounted[10],25000);assert.equal(mounted[11],100000);
 const ground=byTier(calculateFormation('ground',7500000,[...base,14,15]));
 assert.equal(ground[9],25000);assert.equal(ground[11],25000);assert.equal(ground[12],500000);
});
for(const type of combat){
 test(type+' reconciles reference examples and adaptive march sizes',()=>{
  const example=REFERENCE_EXAMPLES[type];
  for(const size of [1500000,3999999,4000000,5000000,6000000,6000001,example.size,7500000]){
   for(const tiers of [base,[...base,14],[...base,14,15],all]){
    const x=calculateFormation(type,size,tiers);
    const layer=combatLayerSize(size);
    const highest=x.tiers[0];
    const d=displayFormationLayers(x);
    assert.equal(x.ownLayers,9*layer);
    assert.equal(x.otherLayers,3*highest*layer);
    assert.equal(x.total,size,`${type} ${size} ${highest}`);
    assert.equal(d.displayed+d.otherSupport,size);
    for(let tier=1;tier<=6;tier++)assert.equal(byTier(x)[tier],layer,`${type} T${tier}`);
    assert.ok(x.rows.every(row=>Number.isInteger(row.count)&&row.count>=0));
   }
  }
 });
 test(type+' keeps T14 as the largest combat tier when T15/T16 unlock',()=>{
  for(const tiers of [[...base,14,15],all]){
   const x=calculateFormation(type,7500000,tiers);
   const counts=byTier(x);
   assert.ok(counts[14]>=counts[15],`${type}: T14 < T15`);
   if(tiers.includes(16))assert.ok(counts[14]>=counts[16],`${type}: T14 < T16`);
  }
 });
 test(type+' redistributes the leading tiers when T14 is not owned',()=>{
  const x=calculateFormation(type,3500000,base);
  const r=byTier(x);
  assert.equal(x.tiers[0],13);
  assert.ok(r[13]>0&&r[12]>0);
  assert.ok(r[11]>0);
  assert.equal(r[14],undefined);
  assert.equal(x.total,3500000);
 });
}
for(const type of siege){
 test(type+' retains worksheet-based 1K layers and reference total',()=>{
  const example=REFERENCE_EXAMPLES[type];
  const x=calculateFormation(type,example.size,selected(example));
  assert.equal(x.ownLayers,9000);
  assert.equal(x.otherLayers,3*Math.max(...x.tiers)*1000);
  assert.equal(x.total,example.size);
  assert.equal(displayFormationLayers(x).displayed+displayFormationLayers(x).otherSupport,example.size);
 });
}
test('small siege fixed T9 stays 50K, with T11 as residual',()=>{
 const x=calculateFormation('smallSiege',5749450,[...base,14]);
 assert.equal(byTier(x)[9],50000);
 assert.equal(byTier(x)[11],5449450);
 assert.equal(x.total,5749450);
});
test('all siege variants preserve their T16 support layers',()=>{
 for(const type of siege){
  const x=calculateFormation(type,7000000,all);
  const counts=byTier(x);
  for(let tier=1;tier<=16;tier++)assert.ok(counts[tier]>=1000,`${type} T${tier}`);
  assert.equal(x.total,7000000);
 }
});
test('insufficient capacity is explicitly identified rather than silently overfilling',()=>{
 for(const type of Object.keys(FORMATIONS)){
  const x=calculateFormation(type,1000,all);
  assert.ok(x.unallocated>0);
  assert.ok(x.total>x.march);
 }
});
test('the public page retains empty defaults and no restore button',()=>{
 const page=readFileSync(new URL('../src/pages/troops/index.astro',import.meta.url),'utf8');
 assert.match(page,/checked=\{false\}/);
 assert.match(page,/value=""/);
 assert.doesNotMatch(page,/Restore Excel examples/);
});

test('PvP guidance and custom toggle are present without enabling siege custom inputs',()=>{
 const page=readFileSync(new URL('../src/pages/troops/index.astro',import.meta.url),'utf8');
 assert.match(page,/Recommended PvP march presets/);
 assert.match(page,/mode-recommended/);
 assert.match(page,/mode-custom/);
 assert.match(page,/custom-layer-field/);
 assert.match(page,/layer-size-row/);
 assert.match(page,/t.base!==1000/);
});
