import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RESOURCE_TYPES,resourcesFor,valueFor} from '../src/lib/reward-planner.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Lumber is canonical but Wood and Safe Wood still calculate correctly',()=>{
 assert.deepEqual(RESOURCE_TYPES,['Food','Lumber','Stone','Ore']);
 assert.deepEqual(resourcesFor('Super Safe Resources Chest',2),{Food:2000000,Lumber:2000000,Stone:2000000,Ore:2000000});
 for(const source of ['Wood','Lumber','Wood / Lumber','Safe Wood','Safe Lumber']){
  assert.equal(valueFor(source,'250K','Lumber'),250000);
  assert.equal(valueFor(source,'250K','Wood'),250000);
 }
});
test('Troop and building resource headings use in-game Lumber name',()=>{
 const training=read('../src/pages/training/index.astro');
 const costs=read('../src/pages/building-costs/index.astro');
 const upgrades=read('../src/pages/building-upgrades/index.astro');
 assert.match(training,/<th scope="col">Lumber<\/th>/);
 assert.doesNotMatch(training,/<th scope="col">Wood<\/th>/);
 assert.match(costs,/<th scope="col">Lumber<\/th>/);
 assert.doesNotMatch(costs,/Wood \/ Lumber<\/th>/);
 assert.match(upgrades,/>Lumber<\/th>/);
});
test('Loot Compass and finder pages render historic Wood as Lumber',()=>{
 for(const path of ['../src/pages/loot-compass/index.astro','../src/pages/resources/index.astro','../src/pages/chests/index.astro']){
  const page=read(path);
  assert.match(page,/displayResourceName/);
  assert.match(page,/Safe Lumber/);
 }
 const compass=read('../src/pages/loot-compass/index.astro');
 assert.match(compass,/target=displayResourceName\(target\)/);
 assert.match(compass,/option.value=displayResourceName\(name\)/);
});
test('Resource catalog uses Lumber display name without changing Wood ID',()=>{
 const items=JSON.parse(read('../src/data/items.json'));
 const lumber=items.find(i=>i.id==='wood');
 assert.equal(lumber.name,'Lumber');
});
