import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../src/pages/chests/index.astro',import.meta.url),'utf8');
const start=page.indexOf('const matchCount=');
const end=page.indexOf('const matchReward=',start);
assert.ok(start>=0 && end>start);
const evaluator=new Function('toText','compareChest',page.slice(start,end)+'\nreturn {quantityValue,rewardAmount,rewardRank,compareRewardChests};');
const rank=evaluator(x=>String(x??'').trim(),(a,b)=>a.name.localeCompare(b.name));
const chest=(name,items,matched=['Lumber'],nestedItems=[])=>({name,items,nestedItems,_matchedItems:matched});
test('higher recorded Lumber rewards rank above alphabetical Common-to-Epic order',()=>{
 const common=chest('Common Hydra Chest',[{item:'Lumber',quantity:'500K'}]);
 const epic=chest('Epic Hydra Chest',[{item:'Lumber',quantity:'2M'}]);
 assert.ok(rank.compareRewardChests(epic,common,['Lumber'])<0);
 assert.deepEqual([common,epic].sort((a,b)=>rank.compareRewardChests(a,b,['Lumber'])).map(x=>x.name),['Epic Hydra Chest','Common Hydra Chest']);
});
test('recorded quantity outranks rarity when Common provides more',()=>{
 const common=chest('Common Hydra Chest',[{item:'Lumber',quantity:'5M'}]);
 const epic=chest('Epic Hydra Chest',[{item:'Lumber',quantity:'2M'}]);
 assert.ok(rank.compareRewardChests(common,epic,['Lumber'])<0);
});
test('match count has priority for multiple searched reward items',()=>{
 const two=chest('Common Chest',[{item:'Lumber',quantity:'10K'},{item:'Ore',quantity:'1K'}],['Lumber','Ore']);
 const one=chest('Epic Chest',[{item:'Lumber',quantity:'10M'}],['Lumber']);
 assert.ok(rank.compareRewardChests(two,one,['Lumber','Ore'])<0);
});
test('explicit denomination and quantity are multiplied but missing amounts are not guessed',()=>{
 assert.equal(rank.quantityValue('2.5M'),2500000);
 assert.equal(rank.quantityValue('1,250,000'),1250000);
 assert.equal(rank.rewardAmount({item:'500K Lumber Box',quantity:'3'}),1500000);
 assert.equal(rank.rewardAmount({item:'Lumber',quantity:'not recorded'}),null);
 const unknown=chest('Common Hydra Chest',[{item:'Lumber',quantity:'not recorded'}]);
 const recorded=chest('Epic Hydra Chest',[{item:'Lumber',quantity:'100K'}]);
 assert.ok(rank.compareRewardChests(recorded,unknown,['Lumber'])<0);
});
test('rarity breaks otherwise equal or unknown recorded reward scores',()=>{
 const common=chest('Common Hydra Chest',[{item:'Lumber',quantity:'100K'}]);
 const epic=chest('Epic Hydra Chest',[{item:'Lumber',quantity:'100K'}]);
 assert.ok(rank.compareRewardChests(epic,common,['Lumber'])<0);
});
test('single-reward sorting remains local to explicitly loaded results',()=>{
 assert.doesNotMatch(page,/verifyFullRewards/);
 assert.match(page,/visible\.sort\(\(a,b\)=>sortOrder\.value==="live"/);
 assert.match(page,/chest-reward-amount/);
 assert.match(page,/Highest recorded amounts first among loaded results/);
});
