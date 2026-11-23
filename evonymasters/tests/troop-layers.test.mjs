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


test('regression snapshots compare original reference march sizes with new distributions',()=>{
 const checks=[
  ['ranged',7393200,[14,15],{14:2653467,15:2653466,13:1516267}],
  ['mounted',7480700,[14],{14:3861500,13:1930750,12:1158450}],
  ['ground',7500000,[14,15],{14:3850000,15:1925000,13:1155000}]
 ];
 for(const [type,size,upper,expected] of checks){
  const result=calculateFormation(type,size,[...base,...upper]);
  const layers=byTier(result);
  for(const [tier,count] of Object.entries(expected))assert.equal(layers[tier],count,`${type} T${tier}`);
  assert.equal(result.total,size);
 }
});

test('adaptive thresholds include exactly 4M and 6M boundaries',()=>{
 for(const [size,want] of [[1,1000],[3999999,1000],[4000000,5000],[6000000,5000],[6000001,10000],[7500000,10000]])
  assert.equal(combatLayerSize(size),want);
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
    for(let tier=1;tier<=9;tier++)assert.equal(byTier(x)[tier],layer,`${type} T${tier}`);
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
  assert.ok(r[13]>r[12]||type==='ranged');
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
 assert.match(page,/checked=\\{false\\}/);
 assert.match(page,/value=""/);
 assert.doesNotMatch(page,/Restore Excel examples/);
});
