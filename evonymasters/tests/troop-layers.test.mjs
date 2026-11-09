import test from 'node:test';import assert from 'node:assert/strict';
import {FORMATIONS,REFERENCE_EXAMPLES,calculateFormation,displayFormationLayers} from '../src/lib/troop-layers.mjs';
for (const [type,example] of Object.entries(REFERENCE_EXAMPLES)) {
 test(type+' matches original Excel allocations',()=>{
  const actual=calculateFormation(type,example.size,example.tiers);
  assert.equal(actual.total,example.size);
  const found=Object.fromEntries(actual.rows.map(row=>[row.tier,row.count]));
  assert.deepEqual(found,example.expected);
 });
}
test('7,500,000 Ground matches the worksheet support and fixed layers',()=>{
 const x=calculateFormation('ground',7500000,[7,8,9,10,11,12,13,14,15]);
 assert.equal(x.support,490000); assert.equal(x.fixedTotal,625000);assert.equal(x.remaining,6385000);
});
test('T15 availability adjusts Ground: T14 becomes main top tier',()=>{
 const x=calculateFormation('ground',7500000,[7,8,9,10,11,12,13,14]);
 const map=Object.fromEntries(x.rows.map(y=>[y.tier,y.count]));
 assert.equal(map[14],2754000);assert.equal(map[13],2754000);assert.equal(map[12],1377000);
 assert.equal(x.total,7500000);
});
test('T3 through T16 are supported and totals never exceed entered march',()=>{
 for(const type of Object.keys(FORMATIONS)){
  for(const size of [0,1,100,50000,1000000,7500000]){
   for(const tiers of [[3],[3,4,5],[7,8,9,10,11,12,13,14],[3,7,11,15,16],[]]){
    const x=calculateFormation(type,size,tiers);
    assert.equal(x.total,tiers.length?size:0,JSON.stringify({type,size,tiers,x}));
    assert.ok(x.rows.every(r=>r.count>=0&&Number.isInteger(r.count)));
   }
  }
 }
});

test('T7 down to T1 use workbook Default Layer Size without increasing march',()=>{
 for(const type of Object.keys(FORMATIONS)){
  const example=REFERENCE_EXAMPLES[type];
  const result=calculateFormation(type,example.size,[3,4,5,6,7,8,9,10,11,12,13,...example.tiers.filter(t=>t>=14)]);
  const shown=displayFormationLayers(result);
  const rows=new Map(shown.rows.map(r=>[r.tier,r.count]));
  const base=type.toLowerCase().includes('siege')?1000:10000;
  for(let tier=1;tier<=6;tier++)assert.equal(rows.get(tier),base,type+' T'+tier);
  assert.ok(rows.get(7)>=base,type+' T7');
  assert.equal(shown.displayed+shown.otherSupport,result.total,type);
 }
});
test('T14–T16 unchecked defaults: main march still reconciles, low layers are present',()=>{
 for(const type of Object.keys(FORMATIONS)){
  const tiers=Array.from({length:11},(_,i)=>i+3);
  const result=calculateFormation(type,7500000,tiers);
  const shown=displayFormationLayers(result);
  assert.equal(shown.total,7500000);
  assert.equal(shown.rows[0].tier,13);
  assert.ok(shown.rows.some(r=>r.tier===1&&r.count>0));
 }
});
test('Display layers reconcile for small marches and unusual selected tiers',()=>{
 for(const type of Object.keys(FORMATIONS)){
  for(const size of [0,1,500,1000,10000,90000,7500000]){
   for(const tiers of [[3,4,5,6,7,8,9,10,11,12,13],[3,7,13,14,15],[3],[3,4,5,6,7,8,9,10,11,12,13,14,15,16],[]]){
    const actual=calculateFormation(type,size,tiers);
    const shown=displayFormationLayers(actual);
    assert.equal(shown.displayed+shown.otherSupport,actual.total);
   }
  }
 }
});
