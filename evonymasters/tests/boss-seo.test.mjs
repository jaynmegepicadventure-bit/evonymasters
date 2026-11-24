import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const page=read('../src/pages/bosses/[id].astro');
const monsters=JSON.parse(read('../src/data/monsters.json'));

test('boss template uses individual SEO metadata and standard description',()=>{
 assert.ok(page.includes('title={pageTitle} description={description}'));
 assert.ok(page.includes('<meta name="description" content={description}/>'));
 assert.ok(page.includes('<title>{pageTitle}</title>'));
 assert.ok(page.includes('Rewards & Chests | EvonyMasters'));
});

test('boss template includes useful explanatory copy and links to related boss pages',()=>{
 assert.ok(page.includes('Understanding {monster.name} rewards'));
 assert.ok(page.includes('A possible drop is not guaranteed'));
 assert.ok(page.includes('href={\'/bosses/\'+encodeURIComponent(other.id)+\'/\'}'));
 assert.ok(page.includes('Related Evony monsters'));
 assert.ok(page.includes('Recorded stamina cost'));
});

test('all retained monster pages have a unique slug and valid data',()=>{
 assert.equal(monsters.length,155);
 assert.equal(new Set(monsters.map(x=>x.id)).size,monsters.length);
 assert.ok(monsters.every(x=>Array.isArray(x.rewards)&&Array.isArray(x.chests)));
});
