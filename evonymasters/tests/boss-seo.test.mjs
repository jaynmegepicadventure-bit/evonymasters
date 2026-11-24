import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const page=read('../src/components/LegacyMonsterPage.astro');
const monsters=JSON.parse(read('../src/data/monsters.json'));

test('boss template uses individual SEO metadata and standard description',()=>{
 assert.ok(page.includes('title={pageTitle} description={description}'));
 assert.ok(page.includes('<meta name="description" content={description}/>'));
 assert.ok(page.includes('<title>{pageTitle}</title>'));
 assert.ok(page.includes('Rewards & Chests | EvonyMasters'));
});

test('boss template has ordered reward sections and links to related boss pages',()=>{
 assert.ok(!page.includes('Understanding {monster.name} rewards'));
 assert.ok(page.indexOf('<h2>Guaranteed rewards</h2>') < page.indexOf('<h2>Possible rewards</h2>'));
 assert.ok(page.indexOf('<h2>Possible rewards</h2>') < page.indexOf('<h2>Chest contents</h2>'));
 assert.ok(page.includes('chestMatches(chestNames,boxes)'));
 assert.ok(page.includes('href={\'/bosses/\'+encodeURIComponent(other.id)+\'/\'}'));
 assert.ok(page.includes('Related Evony monsters'));
 assert.ok(page.includes('monster-availability'));
});

test('all retained monster pages have a unique slug and valid data',()=>{
 assert.equal(monsters.length,155);
 assert.equal(new Set(monsters.map(x=>x.id)).size,monsters.length);
 assert.ok(monsters.every(x=>Array.isArray(x.rewards)&&Array.isArray(x.chests)));
});
