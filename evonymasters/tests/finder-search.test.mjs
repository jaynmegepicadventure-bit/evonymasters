import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function inlineScripts(source){
 return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
}
test('Item Finder has the new name in navigation and can select three rewards',()=>{
 const nav=file('../src/components/SiteHeader.astro');
 const home=file('../src/pages/index.astro');
 const page=file('../src/pages/resources/index.astro');
 assert.match(nav,/label:'Item Finder'/);
 assert.doesNotMatch(nav,/label:'Resource Finder'/);
 assert.match(home,/Item Finder/);
 assert.match(page,/id="add-search"/);
 assert.match(page,/id="selected-items"/);
 assert.match(page,/selectedItems\.length>=3/);
 assert.match(page,/selectedItems\.push\(value\)/);
 assert.match(page,/multiGroups\.set/);
 assert.match(page,/_matchedItems/);
 assert.match(page,/matchSchedule/);
 assert.match(page,/refreshCalendar/);
 assert.match(page,/evonymasters-calendar\.jaynmegepicadventure\.workers\.dev/);
 for(const script of inlineScripts(page))assert.doesNotThrow(()=>new Script(script));
});
test('Chest Finder supports three item chips alongside four-chest comparison',()=>{
 const page=file('../src/pages/chests/index.astro');
 assert.match(page,/id="add-item-search"/);
 assert.match(page,/id="search-items"/);
 assert.match(page,/selectedItems\.length===3/);
 assert.match(page,/Promise\.all\(list\.map/);
 assert.match(page,/shownChestIds/);
 assert.match(page,/selected\.size>=4/);
 for(const script of inlineScripts(page))assert.doesNotThrow(()=>new Script(script));
});
