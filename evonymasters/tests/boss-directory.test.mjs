import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const directory=read('../src/pages/bosses/index.astro');
const legacy=JSON.parse(read('../src/data/monsters.json'));
const monsters=JSON.parse(read('../src/data/monster-directory-sheet.json'));
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
 assert.ok(directory.includes('monster.detailId'));
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
 assert.ok(home.includes("href:'/bosses/'"));
 assert.ok(header.includes("label:'Boss Directory',key:'bosses'"));
 assert.ok(detail.includes('<a href="/bosses/">← Boss Directory</a>'));
 assert.ok(directory.includes('<SeoMetadata title={title} description={description}/>'));
});
test('Airavata remains excluded from all monster sources',()=>{
 assert.ok(legacy.every(m=>m.id!=='airavata'));
 assert.equal(legacy.length,155);
});
