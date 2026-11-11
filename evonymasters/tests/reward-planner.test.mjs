import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,resourcesFor,valueFor,liveIndex,isLive,eligibleRecord,plan,scheduledDays} from '../src/lib/reward-planner.mjs';

test('quantity input supports suffixes but ignores unverified amounts',()=>{
 assert.equal(parseAmount('7B'),7_000_000_000);
 assert.equal(parseAmount('10,000'),10_000);
 assert.equal(parseAmount('100K'),100_000);
 assert.equal(parseAmount('Variable'),null);
 assert.equal(parseAmount('-5'),null);
 assert.equal(parseAmount(''),null);
});
test('super and super safe chests are 1M each resource type',()=>{
 for(const chest of ['Super Resources Chest','Super Safe Resource Chest','Super Safe Resources Chest']){
  assert.deepEqual(resourcesFor(chest,2),{Food:2e6,Wood:2e6,Stone:2e6,Ore:2e6});
  assert.equal(valueFor(chest,15,'Combined Resources'),60e6);
  assert.equal(valueFor(chest,15,'Ore'),15e6);
 }
 assert.equal(valueFor('Food','3,000,000','Ore'),0);
 assert.equal(valueFor('Ore','3,000,000','Ore'),3e6);
});
test('only matching scheduled and confirmed dates qualify',()=>{
 const index=liveIndex([
  {date:'2026-11-12',name:'Crazy Eggs',kind:'Event',status:'Confirmed'},
  {date:'2026-11-13',name:'Crazy Eggs',kind:'Event',status:'Confirmed'},
  {date:'2026-11-12',name:'Ymir',kind:'Event Boss',status:'Tentative',family:true},
  {date:'2026-11-12',name:'Garuda Trial',kind:'Event',status:'Needs Review'}
 ],'2026-11-12');
 assert.equal(isLive(index,'Event','Crazy Eggs','2026-11-12'),true);
 assert.equal(isLive(index,'Event','Crazy Eggs','2026-11-14'),false);
 assert.equal(isLive(index,'Event','Garuda Trial','2026-11-12'),false);
 assert.deepEqual(scheduledDays(index,'Event','Crazy Eggs','2026-11-12',3),['2026-11-12','2026-11-13']);
 const ymir={source:'event-bosses',title:'Ymir - Level 5',context:{event:'Ymir',stamina:'40'},items:[{item:'Super Safe Resource Chest',quantity:'2',classification:'Guaranteed',route:['Boss Chest','Super Safe Resource Chest']}]};
 const matched=eligibleRecord(ymir,'Combined Resources',index,'2026-11-12');
 assert.equal(matched.guaranteed,0);
 assert.equal(matched.possible,8e6);
});
test('nested chest not mistaken for guaranteed loot and unknown quantity ignored',()=>{
 const index=liveIndex([{date:'2026-11-12',name:'Crazy Eggs',kind:'Event',status:'Confirmed'}]);
 const row={source:'events',title:'Crazy Eggs',context:{frequency:'Daily'},items:[
  {item:'Super Safe Resource Chest',quantity:'15',classification:'Guaranteed',route:['Super Safe Resource Chest']},
  {item:'Gems',quantity:'Variable',classification:'Guaranteed',route:['Gems']}
 ]};
 const eligible=eligibleRecord(row,'Combined Resources',index,'2026-11-12');
 assert.equal(eligible.guaranteed,60e6);
 assert.equal(eligible.possible,0);
});
test('one-time stamina budget is not multiplied by number of days',()=>{
 const monster={name:'Test Monster',source:'bosses',stamina:40,guaranteed:1e6,possible:4e6};
 const result=plan([monster],{target:'Combined Resources',quantity:'7B',stamina:'10000',days:'7'});
 assert.equal(result.allocation[0].hunts,250);
 assert.equal(result.monsterGuaranteed,250e6);
 assert.equal(result.monsterPossible,1e9);
 assert.equal(result.dailyGoal,1e9);
});
test('no stamina leaves recommendation visible without inventing hunts',()=>{
 const monster={name:'Test Monster',source:'bosses',stamina:40,guaranteed:1e6,possible:0};
 const result=plan([monster],{target:'Ore',quantity:'7B'});
 assert.equal(result.allocation.length,0);
 assert.equal(result.stamina,null);
});
