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
 assert.ok(page.includes("'Required level '+level"));
 assert.ok(page.includes("met · editable"));
});

test('prerequisite input remains editable after user meets the required level',()=>{
 const page=readFileSync(new URL('../src/pages/building-upgrades/index.astro',import.meta.url),'utf8');
 assert.match(page,/shownRequirements=new Map\(\)/);
 assert.match(page,/shownRequirements\.set\(name,Math\.max\(level,shownRequirements\.get\(name\)\|\|0\)\)/);
 assert.match(page,/\[\.\.\.shownRequirements\.entries\(\)\]/);
 assert.match(page,/met · editable/);
 assert.match(page,/shownRequirements\.clear\(\)/);
 const planned=calculateUpgradePlan(source,{building:'Keep',currentLevel:39,targetLevel:40,currentLevels:{Walls:39,'Military Academy':4}});
 assert.ok(planned.selected.some(step=>step.building==='Keep'));
 const previous=calculateUpgradePlan(source,{building:'Keep',currentLevel:39,targetLevel:40,currentLevels:{Walls:38,'Military Academy':3}});
 assert.ok(previous.requiredLevels.Walls>=39);
 assert.ok(previous.prerequisite.length>=planned.prerequisite.length);
});

test('sequence table footer reports all four complete-plan resource totals',()=>{
 const page=readFileSync(new URL('../src/pages/building-upgrades/index.astro',import.meta.url),'utf8');
 assert.match(page,/<tfoot><tr class="sequence-totals">/);
 assert.match(page,/TOTAL · All required upgrades/);
 for(const key of ['food','lumber','stone','ore'])assert.ok(page.includes('id="sequence-'+key+'"'));
 assert.ok(page.includes("byId('sequence-'+key).textContent=fmt.format(plan.totals[i])"));
 assert.ok(page.includes('plan.tasks.slice(0,150)'));
});

test('Barracks 40 to 41 costs match the source and identifies the direct building prerequisites',()=>{
 const row=source.rows.find(x=>x.building==='Barracks'&&x.level===41);
 assert.deepEqual(row.cost,[58410052590,74150382110,76396003198,74129115270]);
 const direct=parseRequirements(row.requirements,catalog);
 assert.deepEqual(direct.buildings,[{building:'Keep',level:41},{building:'Triumphal Arch',level:2}]);
 const plan=calculateUpgradePlan(source,{building:'Barracks',currentLevel:40,targetLevel:41,currentLevels:{Keep:40,'Triumphal Arch':2}});
 assert.deepEqual(plan.selectedTotals,row.cost);
 assert.ok(plan.requiredLevels.Keep>=41);
 assert.ok(plan.tasks.some(x=>x.building==='Keep'&&x.level===41));
 assert.equal(new Set(plan.tasks.map(x=>x.building+' '+x.level)).size,plan.tasks.length);
});

test('primary prerequisites and selected upgrade resource amounts display above derived dependencies',()=>{
 const page=readFileSync(new URL('../src/pages/building-upgrades/index.astro',import.meta.url),'utf8');
 assert.match(page,/Primary building requirements/);
 assert.match(page,/id="direct-requirements-inputs"/);
 assert.match(page,/id="target-cost-resources"/);
 assert.ok(page.includes('parseRequirements(targetRow.requirements,catalog)'));
 assert.ok(page.includes('directRequirements.append(wrap)')===false);
 assert.ok(page.includes("drawInput(name,level,directRequirements)"));
 assert.ok(page.includes("fmt.format(plan.selectedTotals[i])"));
 assert.ok(page.indexOf('id="direct-requirements-inputs"')<page.indexOf('id="requirements-inputs"'));
});

test('unchecked special requirements change eligibility status but not resources',()=>{
 const page=readFileSync(new URL('../src/pages/building-upgrades/index.astro',import.meta.url),'utf8');
 assert.ok(page.includes('confirmation-progress'));
 assert.ok(page.includes('Checking items changes readiness only, not the resource totals'));
 assert.ok(page.includes("enteredLevels.add(name)"));
 assert.ok(page.includes("enteredLevels.delete(name)"));
 assert.ok(page.includes("current level not entered"));
});
