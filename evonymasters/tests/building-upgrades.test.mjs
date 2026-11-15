import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIndex,parseRequirements,calculateUpgradePlan} from '../src/lib/building-upgrades.mjs';
const source=JSON.parse(readFileSync(new URL('../src/data/building-upgrades.json',import.meta.url),'utf8'));
const catalog=buildIndex(source);
test('draft dataset contains every building and updated Ideal Land rule',()=>{
 assert.equal(source.buildings.length,39);
 assert.equal(source.rows.length,1622);
 const ideal=source.rows.find(x=>x.building==='Ideal Land'&&x.level===7);
 assert.match(ideal.requirements,/12,000/);
 assert.ok(!ideal.requirements.includes('1,2000'));
});
test('normal building requirements and special conditions are distinguished',()=>{
 const p=parseRequirements('Walls Lv39, Military Academy Lv4\nResearch : Military - Conscription Lv1',catalog);
 assert.deepEqual(p.buildings,[{building:'Walls',level:39},{building:'Military Academy',level:4}]);
 assert.ok(p.specials===undefined);
 assert.equal(p.special.length,1);
 assert.match(p.special[0],/Research/);
});
test('simple cost summation includes only missing levels',()=>{
 const p=calculateUpgradePlan(source,{building:'Keep',currentLevel:1,targetLevel:2,currentLevels:{Academy:1}});
 assert.equal(p.selected.length,1);
 assert.deepEqual(p.selectedTotals,[3450,3400,0,0]);
 assert.deepEqual(p.prerequisiteTotals,[0,0,0,0]);
 assert.equal(p.tasks.length,1);
});
test('Keep 40 includes Walls 39 and Military Academy 4 exactly once',()=>{
 const p=calculateUpgradePlan(source,{building:'Keep',currentLevel:39,targetLevel:40,currentLevels:{Walls:38,'Military Academy':3}});
 assert.ok(p.tasks.some(x=>x.building==='Walls'&&x.level===39));
 assert.ok(p.tasks.some(x=>x.building==='Military Academy'&&x.level===4));
 assert.equal(new Set(p.tasks.map(x=>x.building+'|'+x.level)).size,p.tasks.length);
 assert.deepEqual(p.selectedTotals,[45703358481,55631218128,55951913968,61944104458]);
});
test('prerequisite cost drops as current level increases',()=>{
 const original=calculateUpgradePlan(source,{building:'Keep',currentLevel:39,targetLevel:40,currentLevels:{Walls:38,'Military Academy':3}});
 const finished=calculateUpgradePlan(source,{building:'Keep',currentLevel:39,targetLevel:40,currentLevels:{Walls:39,'Military Academy':4}});
 assert.ok(original.prerequisite.length>finished.prerequisite.length);
 assert.ok(finished.totals.every((n,i)=>n<=original.totals[i]));
});
test('special requirements stay visible and unpriced',()=>{
 const p=calculateUpgradePlan(source,{building:'Wonder',currentLevel:0,targetLevel:1,currentLevels:{Keep:30}});
 assert.ok(p.specials.some(x=>/Glory|Badges|Research Stones/.test(x.requirement)));
 assert.ok(p.warnings.some(x=>/confirmation/.test(x)));
});
test('source validation catches duplicate level entries',()=>{
 const repeated={buildings:['Keep'],rows:[{building:'Keep',level:1,cost:[0,0,0,0]},{building:'Keep',level:1,cost:[0,0,0,0]}]};
 assert.throws(()=>buildIndex(repeated),/Duplicate/);
});
test('draft page is not linked from public navigation or sitemap',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const page=read('../src/pages/building-upgrades/index.astro');
 assert.match(page,/noindex,nofollow/);
 assert.match(page,/DRAFT/);
 assert.ok(!read('../src/components/SiteHeader.astro').includes("href:'/building-upgrades/'"));
 assert.ok(!read('../src/pages/sitemap.xml.ts').includes("'/building-upgrades/'"));
});

test('required-level labels render alongside prerequisite inputs',()=>{
 const page=readFileSync(new URL('../src/pages/building-upgrades/index.astro',import.meta.url),'utf8');
 assert.ok(page.includes("hint=el('small','', 'Required level '+level)"));
});
