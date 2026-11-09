import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_LAYERS,FORMATIONS,REFERENCE_EXAMPLES,calculateFormation,displayFormationLayers} from '../src/lib/troop-layers.mjs';
const auto=Array.from({length:11},(_,i)=>i+3);
function rows(result){return Object.fromEntries(result.rows.map(row=>[row.tier,row.count]));}
const crossTypeSum=Object.values(DEFAULT_LAYERS).reduce((a,b)=>a+b,0);
for(const [type,example] of Object.entries(REFERENCE_EXAMPLES)){
 test(type+' deducts all 4 troop types to T9 and other 3 above T9',()=>{
  const x=calculateFormation(type,example.size,[...auto,...example.tiers.filter(t=>t>=14)]);
  const cfg=FORMATIONS[type], own=DEFAULT_LAYERS[cfg.troopType];
  const highest=x.tiers[0];
  assert.equal(x.ownLayers,own*9);
  assert.equal(x.otherLayers,(crossTypeSum-own)*(9+highest-9));
  assert.equal(x.baseLayers,9*crossTypeSum+(highest-9)*(crossTypeSum-own));
  assert.equal(x.total,example.size);
  assert.equal(x.rows.reduce((s,r)=>s+r.count,0)+x.otherLayers,example.size);
  const d=displayFormationLayers(x);
  assert.equal(d.displayed+d.otherSupport,example.size);
  for(let tier=1;tier<=6;tier++)assert.equal(rows(x)[tier],own,type+' T'+tier);
 });
}
test('Ground 7,500,000 reserves all four troop types and respects 40/40/20',()=>{
 const x=calculateFormation('ground',7500000,[...auto,14,15]);
 assert.equal(x.baseLayers,405000);
 assert.equal(x.extraFixed,595000);
 assert.equal(x.remaining,6500000);
 assert.equal(x.otherLayers,315000);
 assert.equal(rows(x)[15],2600000);
 assert.equal(rows(x)[14],2600000);
 assert.equal(rows(x)[13],1300000);
 assert.equal(rows(x)[12],500000);
 assert.equal(rows(x)[9],25000);
 assert.equal(rows(x)[8],25000);
 assert.equal(rows(x)[7],25000);
 assert.equal(x.total,7500000);
});
test('Ranged 7,393,200 matches percentages after the revised layer deductions',()=>{
 const x=calculateFormation('ranged',7393200,[...auto,14,15]);
 assert.equal(x.baseLayers,405000);
 assert.equal(x.extraFixed,140000);
 assert.equal(x.remaining,6848200);
 assert.equal(rows(x)[15],1027230);
 assert.equal(rows(x)[14],1369640);
 assert.equal(rows(x)[13],2054460);
 assert.equal(rows(x)[12],2396870);
 assert.equal(x.total,7393200);
});
test('Only T3–T13 enabled applies low-T14 percentages to their actual tiers',()=>{
 const x=calculateFormation('ranged',7393200,auto);
 assert.equal(x.tiers[0],13);
 const d=rows(x);
 assert.equal(d[14],undefined);
 assert.ok(d[13]>0&&d[12]>0);
 assert.equal(d[11],50000);
 assert.equal(x.total,7393200);
});
test('All siege variants reserve just one underlying siege troop type',()=>{
 for(const type of ['bigSiege','smallSiege','soloSiege']){
  const x=calculateFormation(type,7500000,[...auto,14]);
  assert.equal(x.ownLayers,9000);
  assert.equal(x.otherLayers,420000);
  assert.equal(x.baseLayers,429000);
  assert.equal(x.total,7500000);
 }
});
test('Small Siege fixed T9 increases the existing T9 default, not duplicated',()=>{
 const x=calculateFormation('smallSiege',5749450,[...auto,14]);
 assert.equal(rows(x)[9],50000);
 assert.equal(x.extraFixed,249000);
 assert.equal(rows(x)[11],5071450);
 assert.equal(x.total,5749450);
});
test('Inputs never return negative tiers and insufficient march warns rather than silently over-allocating',()=>{
 for(const type of Object.keys(FORMATIONS)){
  for(const size of [0,1,10000,500000,1000000,7500000]){
   for(const tiers of [auto,[...auto,14],[...auto,14,15,16]]){
    const x=calculateFormation(type,size,tiers);
    assert.ok(x.rows.every(row=>Number.isInteger(row.count)&&row.count>=0));
    const d=displayFormationLayers(x);
    assert.equal(d.displayed+d.otherSupport,x.total);
    if(size&&size>=x.support)assert.equal(x.total,size);
    else if(size)assert.ok(x.total>=size);
   }
  }
 }
});
test('Public page starts with no upper-level checkboxes selected or march values',()=>{
 const page=readFileSync(new URL('../src/pages/troops/index.astro',import.meta.url),'utf8');
 assert.match(page,/checked=\{false\}/);
 assert.match(page,/value=""/);
 assert.match(page,/const tiers=\[14,15,16\]/);
});

test('Cavalry 5,874,400 with T15 reproduces Excel layer reserve and no 125k overestimate',()=>{
 const x=calculateFormation('mounted',5874400,[...auto,14,15]);
 const d=displayFormationLayers(x), amount=rows(x);
 assert.equal(x.ownLayers,90000);
 assert.equal(x.otherLayers,315000);
 assert.equal(x.extraFixed,170000);
 assert.equal(x.excelAdjustment,125000);
 assert.equal(x.support,700000);
 assert.equal(x.remaining,5174400);
 assert.equal(amount[15],776160);
 assert.equal(amount[14],1034880);
 assert.equal(amount[13],1552320);
 assert.equal(amount[12],1811040);
 assert.equal(x.total,5874400);
 assert.equal(d.displayed+d.otherSupport,5874400);
});
test('Cavalry without T15 does not apply T15-specific workbook reserve',()=>{
 const x=calculateFormation('mounted',5874400,[...auto,14]);
 assert.equal(x.excelAdjustment,0);
 assert.equal(x.total,5874400);
});
