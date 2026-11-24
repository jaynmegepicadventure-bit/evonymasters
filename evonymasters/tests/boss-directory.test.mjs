import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {monsterSlug} from '../src/lib/monster-slug.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const directory=read('../src/pages/bosses/index.astro');
const legacy=JSON.parse(read('../src/data/monsters.json'));
const monsters=JSON.parse(read('../src/data/monster-directory-sheet.json'));
const rewardPages=JSON.parse(read('../src/data/monster-rewards-sheet.json'));
const rewardTemplate=read('../src/pages/bosses/catalog/[slug].astro');
const sitemap=read('../src/pages/sitemap.xml.ts');
const home=read('../src/pages/index.astro');
const header=read('../src/components/SiteHeader.astro');
const detail=read('../src/pages/bosses/[id].astro');

test('directory catalog is generated from EVONYMASTERS MONSTER tab',()=>{
 assert.equal(monsters.length,195);
 assert.equal(monsters.some(monster=>monster.name.toLowerCase()==='airavata'),false);
 assert.ok(monsters.every(monster=>monster.name&&['Boss','Event','Regular'].includes(monster.type)));
 assert.ok(directory.includes("import monsters from '../../data/monster-directory-sheet.json'"));
 assert.ok(directory.includes('sorted.map(monster=><article'));
 assert.ok(directory.includes('monsterSlug(monster)'));
 assert.ok(directory.includes("See reward data →"));
 assert.ok(directory.includes('/v4/monsters'));
});
test('filters and static fallback work without requiring a live API response',()=>{
 for(const id of ['boss-search','boss-type-filter','boss-sort','boss-reset','boss-results','result-count','no-boss-results'])
  assert.ok(directory.includes('id="'+id+'"'),id);
 for(const type of ['Boss','Event','Regular']) assert.ok(directory.includes('<option value="'+type+'">'));
 assert.ok(directory.includes("search.addEventListener('input',update)"));
 assert.ok(directory.includes("type.addEventListener('change',update)"));
 for(const match of directory.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  assert.doesNotThrow(()=>new Script(match[1]));
});
test('boss directory and detail pages remain linked through navigation and sitemap',()=>{
 assert.ok(sitemap.includes("'/bosses/'"));
 assert.ok(sitemap.includes('for(const monster of monsters)paths.add'));
 assert.ok(sitemap.includes('for(const monster of sheetMonsters)paths.add'));
 assert.ok(rewardTemplate.includes('monster.rewards'));
 assert.ok(rewardTemplate.includes('getStaticPaths'));
 assert.ok(home.includes("href:'/bosses/'"));
 assert.ok(header.includes("label:'Boss Directory',key:'bosses'"));
 assert.ok(detail.includes('<a href="/bosses/">← Boss Directory</a>'));
 assert.ok(directory.includes('<SeoMetadata title={title} description={description}/>'));
});
test('Airavata remains excluded from all monster sources',()=>{
 assert.ok(legacy.every(m=>m.id!=='airavata'));
 assert.equal(legacy.length,155);
});

test('all 195 directory rows have unique static reward pages with matching spreadsheet fields',()=>{
 assert.equal(rewardPages.length,195);
 const keys=records=>new Set(records.map(m=>[m.name.toLowerCase(),m.type,String(m.level)].join('|')));
 assert.deepEqual(keys(monsters),keys(rewardPages));
 const slugs=rewardPages.map(monsterSlug);
 assert.equal(new Set(slugs).size,rewardPages.length);
 assert.ok(slugs.every(slug=>slug&&!slug.includes('/')));
 assert.ok(rewardPages.some(m=>m.rewards.length>0));
 assert.ok(rewardPages.every(m=>Array.isArray(m.rewards)));
 assert.ok(rewardTemplate.includes("import {monsterSlug} from '../../../lib/monster-slug.mjs'"));
 assert.ok(directory.includes("'/bosses/catalog/'+monsterSlug(monster)+'/'"));
 assert.ok(sitemap.includes("'/bosses/catalog/'+monsterSlug(monster)+'/'"));
});

test('directory cards have only one gold reward link in both static and live cards',()=>{
 assert.ok(directory.includes('.boss-meta dd a{color:#f3cd84'));
 assert.ok(directory.includes('See reward data →'));
 assert.ok(!directory.includes('View rewards & chests →'));
 assert.ok(!directory.includes('Reward page pending publication'));
 assert.ok(!directory.includes('Reward detail page not yet available'));
 assert.ok(directory.includes("const reward=dl.querySelectorAll('dd')[3]"));
});
