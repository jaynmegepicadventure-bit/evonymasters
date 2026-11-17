import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TROOP_TRAINING_COSTS} from '../src/data/troop-training-costs.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const curated=JSON.parse(read('../src/data/curated-qa.json'));
const buildings=JSON.parse(read('../src/data/building-upgrades.json'));
const page=read('../src/pages/qa/index.astro');

test('curated answers are unique and link to first-party tools',()=>{
 assert.ok(curated.length>=18);
 assert.equal(new Set(curated.map(q=>q.id)).size,curated.length);
 assert.equal(new Set(curated.map(q=>q.question.toLowerCase())).size,curated.length);
 for(const q of curated){
  assert.ok(q.question.length>15);
  assert.ok(q.answer.length>65);
  assert.match(q.relatedTool,/^\/[a-z-]+\/$/);
  assert.ok(q.category);
 }
});
test('Q&A is prerendered, searchable, and community moderation is still respected',()=>{
 assert.ok(page.includes('curatedQuestions.map(q=><details'));
 assert.ok(page.includes('data-origin="curated"'));
 assert.ok(page.includes('const API="https://evonymasters-feedback'));
 assert.ok(page.includes('data.questions'));
 assert.ok(page.includes('refreshCategories();render();'));
 assert.ok(page.includes('name="description"'));
 assert.ok(read('../src/pages/sitemap.xml.ts').includes("'/qa/'"));
});
test('specific cost answers match the source data, not guessed figures',()=>{
 const row=buildings.rows.find(r=>r.building==='Barracks'&&r.level===41);
 assert.deepEqual(row.cost,[58410052590,74150382110,76396003198,74129115270]);
 const answer=curated.find(q=>q.id==='barracks-41').answer;
 for(const number of row.cost)assert.ok(answer.includes(number.toLocaleString('en-US')));
 const t15=TROOP_TRAINING_COSTS.find(t=>t.type==='Ranged'&&t.tier===15);
 assert.deepEqual([t15.food,t15.wood,t15.stone,t15.ore,t15.gold],[7500,22500,7500,0,800]);
});
test('long SEO guides are no longer shown below the calculators',()=>{
 const march=read('../src/pages/troops/index.astro');
 const training=read('../src/pages/training/index.astro');
 assert.ok(!march.includes('march-preset-search-guide'));
 assert.ok(!training.includes('troop-cost-search-guide'));
 assert.ok(march.includes('href="/qa/"'));
 assert.ok(training.includes('href="/qa/"'));
});
