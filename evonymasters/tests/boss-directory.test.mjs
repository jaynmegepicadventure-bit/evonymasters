import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script} from 'node:vm';
import {monsterSlug} from '../src/lib/monster-slug.mjs';
import {bossPageId,bossPagePath} from '../src/lib/boss-page-path.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const directory=read('../src/pages/bosses/index.astro');
const legacy=JSON.parse(read('../src/data/monsters.json'));
const monsters=JSON.parse(read('../src/data/monster-directory-sheet.json'));
const rewardPages=JSON.parse(read('../src/data/monster-rewards-sheet.json'));
const rewardTemplate=read('../src/components/SheetMonsterPage.astro');
const sitemap=read('../src/pages/sitemap.xml.ts');
const home=read('../src/pages/index.astro');
const header=read('../src/components/SiteHeader.astro');
const detail=read('../src/pages/bosses/[id].astro');
const redirects=read('../public/_redirects').trim().split('\n').filter(s=>!s.startsWith('#'));

test('directory source is the master MONSTER sheet with no Airavata',()=>{
 assert.equal(monsters.length,195);
 assert.equal(legacy.length,155);
 assert.ok(legacy.every(m=>m.id!=='airavata'));
 assert.ok(monsters.every(m=>m.name&&['Boss','Event','Regular'].includes(m.type)));
 assert.ok(directory.includes("import monsters from '../../data/monster-directory-sheet.json'"));
 assert.ok(directory.includes('sorted.map(monster=><article'));
 assert.ok(directory.includes('See reward data →'));
 assert.ok(directory.includes('/v4/monsters'));
});
test('directory filtering works without API and keeps a single gold reward link',()=>{
 for(const id of ['boss-search','boss-type-filter','boss-sort','boss-reset','boss-results','result-count','no-boss-results'])
  assert.ok(directory.includes('id="'+id+'"'),id);
 for(const type of ['Boss','Event','Regular'])assert.ok(directory.includes('<option value="'+type+'">'));
 assert.ok(directory.includes("search.addEventListener('input',update)"));
 assert.ok(directory.includes("type.addEventListener('change',update)"));
 assert.ok(directory.includes('.boss-meta dd a{color:#f3cd84'));
 assert.ok(!directory.includes('View rewards & chests →'));
 for(const match of directory.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  assert.doesNotThrow(()=>new Script(match[1]));
});
test('all sheet monsters have unique canonical routes, retaining known historic URLs',()=>{
 assert.equal(rewardPages.length,195);
 const sheetKeys=rows=>new Set(rows.map(m=>[m.name.toLowerCase(),m.type,String(m.level)].join('|')));
 assert.deepEqual(sheetKeys(monsters),sheetKeys(rewardPages));
 const paths=rewardPages.map(m=>bossPagePath(m,monsters));
 assert.equal(new Set(paths).size,195);
 assert.ok(paths.every(p=>p.startsWith('/bosses/')&&!p.includes('/catalog/')));
 assert.equal(bossPagePath(rewardPages.find(m=>m.name==='Behemoth'),monsters),'/bosses/behemoth/');
 assert.equal(bossPagePath(rewardPages.find(m=>m.name==='Junior Cerberus'),monsters),'/bosses/cerberus-1/');
 assert.ok(rewardPages.every(m=>Array.isArray(m.rewards)));
 assert.ok(rewardTemplate.includes('monster.rewards'));
 assert.ok(detail.includes('SheetMonsterPage'));
 assert.ok(detail.includes('sheetRecords.map'));
 assert.ok(directory.includes('bossPagePath(monster,monsters)'));
 assert.ok(sitemap.includes('for(const monster of sheetMonsters)paths.add(bossPagePath(monster,directory))'));
});
test('old catalog URLs are redirected to a single sitemap canonical, not re-generated',()=>{
 assert.equal(redirects.length,195);
 const expected=rewardPages.map(m=>'/bosses/catalog/'+monsterSlug(m)+'/ '+bossPagePath(m,monsters)+' 301');
 assert.deepEqual(redirects,expected);
 assert.ok(!existsSync(new URL('../src/pages/bosses/catalog/[slug].astro',import.meta.url)));
 assert.ok(!sitemap.includes("'/bosses/catalog/'"));
 assert.ok(!directory.includes("'/bosses/catalog/'"));
 assert.ok(rewardTemplate.includes('Rewards & Chests | EvonyMasters'));
 assert.ok(rewardTemplate.includes('Understanding {monster.name} rewards'));
});
test('directory links remain navigable and SEO metadata intact',()=>{
 assert.ok(sitemap.includes("'/bosses/'"));
 assert.ok(sitemap.includes('for(const monster of monsters)paths.add'));
 assert.ok(home.includes("href:'/bosses/'"));
 assert.ok(header.includes("label:'Boss Directory',key:'bosses'"));
 assert.ok(detail.includes('<a href="/bosses/">← Boss Directory</a>'));
 assert.ok(directory.includes('<SeoMetadata title={title} description={description}/>'));
});
