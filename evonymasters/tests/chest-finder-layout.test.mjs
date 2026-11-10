import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const page=readFileSync(new URL('../src/pages/chests/index.astro',import.meta.url),'utf8');
test('Chest Finder uses Monsters, Events, All Chests tabs',()=>{
 for(const tab of ['monsters','events','all'])assert.match(page,new RegExp('data-tab="'+tab+'"'));
 assert.match(page,/role="tablist"/);
 assert.match(page,/source:"bosses"/);
 assert.match(page,/source:"events"/);
 assert.match(page,/source:"all"/);
});
test('Three reward items are matched by chest contents and globally ranked',()=>{
 assert.match(page,/selectedItems\.length===3/);
 assert.match(page,/const matchReward=\(chest,term\)=>/);
 assert.match(page,/chest\.nestedItems/);
 assert.match(page,/matchCount\(b\)-matchCount\(a\)/);
 assert.match(page,/maxPages=searching\?50:1/);
 assert.match(page,/do\{/);
 assert.match(page,/while\(morePages&&passes<maxPages\)/);
 assert.match(page,/allFound=merged/);
 assert.match(page,/most matched rewards first/);
});
test('Filters, full reward table, comparison dock and autocomplete are available',()=>{
 for(const id of ['monster-level','drop-type','live-filter','comparison-dock','chest-suggestions','compare','reset'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/id="search-items"/);
 assert.match(page,/View chest contents/);
 assert.match(page,/\["Reward","Quantity","Chance"\]/);
 assert.match(page,/Compare chests/);
 assert.match(page,/selected\.size>=4/);
 assert.match(page,/\/v2\/suggest\?q=/);
});
test('Inline browser scripts are valid JavaScript',()=>{
 for(const match of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  assert.doesNotThrow(()=>new Script(match[1]));
});
