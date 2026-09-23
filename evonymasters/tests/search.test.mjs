import test from 'node:test';import assert from 'node:assert/strict';
import {searchMonsters,suggestions} from '../src/lib/search.mjs';
import {validateData} from '../scripts/validation.mjs';
const monsters=[{id:'a',name:'Example Boss',type:'Boss',event:null,stamina:20,power:100,rewards:[{itemId:'wood',kind:'guaranteed',quantity:1}]},{id:'b',name:'Example Event',type:'Event',event:'Example Festival',stamina:10,power:null,rewards:[{itemId:'stone',kind:'possible',quantity:null}]}];
test('reward filter finds matching monster',()=>assert.deepEqual(searchMonsters(monsters,{item:'wood'}).map(m=>m.id),['a']));
test('type and keyword filters combine',()=>assert.deepEqual(searchMonsters(monsters,{type:'Event',query:'festival'}).map(m=>m.id),['b']));
test('sort by stamina',()=>assert.deepEqual(searchMonsters(monsters,{sort:'stamina'}).map(m=>m.id),['b','a']));
test('suggestions include matching item',()=>assert.deepEqual(suggestions(monsters,[{name:'Refining Stone'}],'ref'),['Refining Stone']));
test('reject unknown reward IDs',()=>assert.equal(validateData(monsters,[{id:'stone'}]).some(e=>e.includes('Unknown reward')),true));

import { readFileSync } from 'node:fs';
const publishedMonsters=JSON.parse(readFileSync(new URL('../src/data/monsters.json',import.meta.url)));
const publishedItems=JSON.parse(readFileSync(new URL('../src/data/items.json',import.meta.url)));
test('published data passes validation',()=>assert.deepEqual(validateData(publishedMonsters,publishedItems),[]));
for(const resource of ['wood','food','stone','ore'])test(`published ${resource} filter returns sourced monsters`,()=>{
  const found=searchMonsters(publishedMonsters,{item:resource});
  assert.ok(found.length>0,`No monsters found for ${resource}`);
  assert.ok(found.every(m=>m.rewards.some(r=>r.itemId===resource&&r.sourceUrl&&r.origin==='other_chest')));
});
test('standard boss chests are not published as reward items',()=>{
  assert.ok(publishedItems.every(i=>!/^lv\\d+-boss-monster-chest$/.test(i.id)));
  assert.ok(publishedMonsters.every(m=>m.rewards.every(r=>!/^lv\\d+-boss-monster-chest$/.test(r.itemId))));
});
