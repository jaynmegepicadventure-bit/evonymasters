import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const directory=read('../src/pages/bosses/index.astro');
const monsters=JSON.parse(read('../src/data/monsters.json'));
const sitemap=read('../src/pages/sitemap.xml.ts');
const home=read('../src/pages/index.astro');
const header=read('../src/components/SiteHeader.astro');
const detail=read('../src/pages/bosses/[id].astro');

const sheetMonsters=JSON.parse(read('../src/data/monster-directory-sheet.json'));
test('directory uses the EVONYMASTERS MONSTER sheet and preserves all rows as HTML cards',()=>{
 assert.equal(sheetMonsters.length,195);
 assert.equal(sheetMonsters.some(m=>m.name.toLowerCase()==='airavata'),false);
 assert.ok(sheetMonsters.every(m=>m.name&&['Boss','Event','Regular'].includes(m.type)));
 assert.match(directory,/import monsters from '..\\/..\\/data\\/monster-directory-sheet\\.json'/);
 assert.match(directory,/sorted\\.map\\(monster=><article/);
 assert.match(directory,/monster\\.detailId/);
});
test('directory has usable name, type and sort controls and a safe static fallback',()=>{
 for(const id of ['boss-search','boss-type-filter','boss-sort','boss-reset','boss-results','result-count','no-boss-results'])
  assert.match(directory,new RegExp('id="'+id+'"'));
 for(const type of ['Boss','Event','Regular'])assert.match(directory,new RegExp('<option value="'+type+'">'));
 assert.match(directory,/search\.addEventListener\('input',update\)/);
 assert.match(directory,/type\.addEventListener\('change',update\)/);
 assert.doesNotMatch(directory,/fetch\(/);
 for(const match of directory.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  assert.doesNotThrow(()=>new Script(match[1]));
});
test('directory and all boss pages are linked for crawling',()=>{
 assert.match(sitemap,/'\/bosses\/'/);
 assert.match(sitemap,/for\(const monster of monsters\)paths\.add/);
 assert.match(home,/href:'\/bosses\/'/);
 assert.match(header,/label:'Boss Directory',key:'bosses'/);
 assert.match(detail,/<a href="\/bosses\/">← Boss Directory<\/a>/);
 assert.match(directory,/<SeoMetadata title=\{title\} description=\{description\}\/>/);
});

test('unverified Airavata entry is absent from catalog, directory and generated routes',()=>{
 assert.equal(monsters.some(monster=>monster.id==='airavata'),false);
 assert.equal(monsters.length,155);\n assert.equal(sheetMonsters.length,195);
});
