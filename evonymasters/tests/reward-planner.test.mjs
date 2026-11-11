import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,resourcesFor,valueFor,liveIndex,isLive,eligibleRecord,plan,scheduledDays,dailyChecklist,remainingTarget,eventForecast,monsterForecast} from '../src/lib/reward-planner.mjs';

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
 assert.equal(matched,null);
});
test('nested chest not mistaken for guaranteed loot and unknown quantity ignored',()=>{
 const index=liveIndex([{date:'2026-11-12',name:'Crazy Eggs',kind:'Event',status:'Confirmed'}]);
 const row={source:'events',title:'Crazy Eggs',context:{frequency:'Daily'},items:[
  {item:'Super Safe Resource Chest',quantity:'15',classification:'Guaranteed',route:['Super Safe Resource Chest']},
  {item:'Gems',quantity:'Variable',classification:'Guaranteed',route:['Gems']}
 ]};
 const eligible=eligibleRecord(row,'Combined Resources',index,'2026-11-12');
 assert.equal(eligible.guaranteed,60e6);
 assert.equal(eligible.rewards.length,1);
});
test('one-time stamina budget is not multiplied by number of days',()=>{
 const monster={name:'Test Monster',source:'bosses',stamina:40,guaranteed:1e6,possible:4e6};
 const result=plan([monster],{target:'Combined Resources',quantity:'7B',stamina:'10000',days:'7'});
 assert.equal(result.allocation[0].hunts,250);
 assert.equal(result.monsterGuaranteed,250e6);
 assert.equal(result.monsterGuaranteed,250e6);
 assert.equal(result.dailyGoal,1e9);
});
test('no stamina leaves recommendation visible without inventing hunts',()=>{
 const monster={name:'Test Monster',source:'bosses',stamina:40,guaranteed:1e6,possible:0};
 const result=plan([monster],{target:'Ore',quantity:'7B'});
 assert.equal(result.allocation.length,0);
 assert.equal(result.stamina,null);
});

test('exclude possible rewards and direct alternatives never get summed',()=>{
 const index=liveIndex([{date:'2026-11-12',name:'Crazy Eggs',kind:'Event',status:'Confirmed'}]);
 const row={source:'events',title:'Crazy Eggs',context:{},items:[
  {item:'Super Safe Resources Chest',quantity:'5',classification:'Guaranteed',route:['Super Safe Resources Chest']},
  {item:'Super Safe Resources Chest',quantity:'15',classification:'Guaranteed',route:['Super Safe Resources Chest']},
  {item:'Super Safe Resources Chest',quantity:'100',classification:'Possible',route:['Super Safe Resources Chest']},
  {item:'Ore',quantity:'500M',classification:'Guaranteed',route:['Boss Chest','Ore']}
 ]};
 const eligible=eligibleRecord(row,'Combined Resources',index,'2026-11-12');
 assert.equal(eligible.guaranteed,60e6);
 assert.equal(eligible.rewards.length,2);
});
test('tentative calendar records do not count as confirmed LIVE availability',()=>{
 const index=liveIndex([{date:'2026-11-12',name:'Crazy Eggs',kind:'Event',status:'Tentative'}]);
 assert.equal(isLive(index,'Event','Crazy Eggs','2026-11-12'),false);
});

test('checklist has only returned eligible events and stamina-allocated monsters',()=>{
 const result={
  events:[{id:'crazy',name:'Crazy Eggs',detail:'Egg prize',guaranteed:60e6}],
  allocation:[{id:'ymir',name:'Ymir',hunts:2,totalStamina:80,guaranteedTotal:4e6}],
  monsters:[{id:'not-selected',name:'Other Monster',guaranteed:99e6}]
 };
 const tasks=dailyChecklist(result,'2026-11-12');
 assert.deepEqual(tasks.map(x=>x.category),['Event','Monster']);
 assert.equal(tasks[0].recordedReward,60e6);
 assert.equal(tasks[1].stamina,80);
 assert.equal(tasks[1].recordedReward,4e6);
 assert.ok(tasks.every(x=>x.id.includes('2026-11-12')));
});
test('manually claimed amount, never checked tasks, changes remaining target',()=>{
 assert.equal(remainingTarget('7B','250M'),6_750_000_000);
 assert.equal(remainingTarget('100K','150K'),0);
 assert.equal(remainingTarget('7B',null),7_000_000_000);
 assert.equal(remainingTarget(null,'10M'),null);
});

test('5B Food goal includes regular and Safe Food, but only food share of resource chests',()=>{
 assert.equal(valueFor('Food','500M','Food'),500_000_000);
 assert.equal(valueFor('Safe Food','250M','Food'),250_000_000);
 assert.equal(valueFor('Super Resources Chest','15','Food'),15_000_000);
 assert.equal(valueFor('Super Safe Resource Chest','15','Food'),15_000_000);
 assert.equal(valueFor('Super Safe Resources Chest','15','Food'),15_000_000);
 assert.equal(valueFor('Super Resources Chest','15','Combined Resources'),60_000_000);
 assert.equal(valueFor('Super Safe Resource Chest','15','Combined Resources'),60_000_000);
 assert.equal(valueFor('Wood','500M','Food'),0);
 assert.equal(valueFor('Safe Ore','500M','Food'),0);
 assert.equal(remainingTarget('5B','250M'),4_750_000_000);
});
test('safe and standard single-resource rewards count toward their own targets',()=>{
 for(const [name,target] of [['Safe Food','Food'],['Safe Wood','Wood'],['Safe Lumber','Wood'],['Safe Stone','Stone'],['Safe Ore','Ore']]){
  assert.equal(valueFor(name,'25M',target),25_000_000);
  assert.equal(valueFor(name,'25M','Combined Resources'),25_000_000);
 }
});

test('event-only completion outlook uses confirmed dates and one prize per appearance',()=>{
 const today='2026-11-12';
 const idx=liveIndex([
  {date:today,name:'Crazy Eggs',kind:'Event',status:'Confirmed'},
  {date:'2026-11-13',name:'Crazy Eggs',kind:'Event',status:'Confirmed'},
  {date:'2026-11-13',name:'Crazy Eggs',kind:'Event',status:'Confirmed'},
  {date:'2026-11-14',name:'Crazy Eggs',kind:'Event',status:'Tentative'},
  {date:'2026-11-16',name:'Crazy Eggs',kind:'Event',status:'Confirmed'}
 ],today);
 const result=eventForecast([{name:'Crazy Eggs',guaranteed:60e6,stamina:null}],idx,'120M',today,7);
 assert.equal(result.claimsNeeded,2);
 assert.equal(result.opportunities,3);
 assert.equal(result.completionDate,'2026-11-13');
 assert.equal(result.daysUntil,2);
 const insufficient=eventForecast([{name:'Crazy Eggs',guaranteed:60e6}],idx,'300M',today,7);
 assert.equal(insufficient.completionDate,null);
});
test('monster forecast shows hunt and stamina needs without inventing hunt duration',()=>{
 const result=monsterForecast([
  {name:'A',guaranteed:6e6,stamina:40},
  {name:'B',guaranteed:4e6,stamina:20}
 ],'5B','10000');
 assert.equal(result.name,'B');
 assert.equal(result.huntsNeeded,1250);
 assert.equal(result.staminaNeeded,25000);
 assert.equal(result.huntsInBudget,500);
 assert.equal(result.rewardInBudget,2e9);
 assert.equal(result.meetsGoal,false);
});
