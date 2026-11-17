import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TROOP_TRAINING_COSTS} from '../src/data/troop-training-costs.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const buildings=JSON.parse(read('../src/data/building-upgrades.json'));

test('building cost guide exposes source rows and links to upgrade calculator',()=>{
 const page=read('../src/pages/building-costs/index.astro');
 assert.ok(page.includes('data.rows.filter'));
 assert.ok(page.includes('Wood / Lumber'));
 assert.ok(page.includes('from the previous level'));
 assert.ok(page.includes('/building-upgrades/'));
 assert.ok(page.includes('name="description"'));
 assert.ok(buildings.rows.length>1500);
 assert.ok(new Set(buildings.rows.map(r=>r.building)).size>=30);
});
test('building guide is in sitemap and discoverable from calculator',()=>{
 assert.ok(read('../src/pages/sitemap.xml.ts').includes("'/building-costs/'"));
 assert.ok(read('../src/pages/building-upgrades/index.astro').includes('href="/building-costs/"'));
});
test('troop training guide includes source-backed 1000-unit table and march links',()=>{
 const page=read('../src/pages/training/index.astro');
 assert.ok(page.includes('TROOP_TRAINING_COSTS.filter'));
 assert.ok(page.includes('t.food*1000'));
 assert.ok(page.includes('href="/troops/"'));
 assert.equal(TROOP_TRAINING_COSTS.length,64);
});
test('march preset guide covers all existing preset types',()=>{
 const page=read('../src/pages/troops/index.astro');
 assert.ok(page.includes('Evony March Preset & Troop Layer Calculator</h1>'));
 for(const name of ['Ranged','Cavalry','Ground','BIG Siege','Small Siege','Solo Siege'])assert.ok(page.includes(name));
 assert.ok(page.includes('href="/training/"'));
});
