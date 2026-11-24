import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chestMatches,chestKey} from '../src/lib/monster-chests.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const boxes=JSON.parse(read('../src/data/chest-contents-sheet.json'));
const monsters=JSON.parse(read('../src/data/monster-rewards-sheet.json'));
const sheetPage=read('../src/components/SheetMonsterPage.astro');
const legacyPage=read('../src/components/LegacyMonsterPage.astro');

test('chest data comes from the IN THE BOXES tab with exact names and classifications',()=>{
 assert.equal(boxes.length,135);
 assert.ok(boxes.every(box=>box.name&&Array.isArray(box.contents)&&box.contents.length));
 assert.equal(new Set(boxes.map(box=>chestKey(box.name))).size,boxes.length);
 const ammit=monsters.find(m=>m.name==='Ammit'&&m.level==='18');
 const result=chestMatches(ammit.rewards.map(r=>r.item),boxes);
 const lv18=result.matched.find(b=>b.name==='Lv18 Boss Monster Chest');
 assert.ok(lv18);
 assert.equal(lv18.contents.length,7);
 assert.ok(lv18.contents.some(r=>r.item==='Food'&&r.quantity==='2,500,000'&&r.classification==='Guaranteed'));
 assert.ok(result.missing.includes('Dragon Scroll Chest'));
});
test('chest matches use exact names; missing or similar chests never borrow contents',()=>{
 const result=chestMatches([' Lv18  Boss Monster Chest ','Lv19 Boss Monster Chest','Unknown Boss Chest','lv18 boss monster chest'],boxes);
 assert.equal(result.matched.filter(b=>b.name==='Lv18 Boss Monster Chest').length,1);
 assert.ok(result.missing.includes('Unknown Boss Chest'));
 assert.ok(!result.matched.some(b=>b.name==='Unknown Boss Chest'));
});
test('all monster templates use the requested three sections in order without explanatory blocks',()=>{
 for(const template of [sheetPage,legacyPage]){
  const headings=['<h2>Guaranteed rewards</h2>','<h2>Possible rewards</h2>','<h2>Chest contents</h2>'];
  assert.ok(headings.every(h=>template.includes(h)));
  assert.ok(headings.every((h,i)=>!i||template.indexOf(headings[i-1])<template.indexOf(h)));
  assert.ok(!template.includes('Understanding {monster.name} rewards'));
  assert.ok(!template.includes('Recorded rewards for {monster.name} from the EVONYMASTERS master spreadsheet'));
  assert.ok(template.includes("chestMatches("));
  assert.ok(template.includes('chest.contents'));
 }
});
