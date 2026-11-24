import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const page=readFileSync(new URL('../src/pages/chests/index.astro',import.meta.url),'utf8');
test('Chest Finder uses Monsters, Events, All Chests tabs',()=>{
 for(const tab of ['monsters','events','all'])assert.match(page,new RegExp('data-tab="'+tab+'"'));
 assert.match(page,/role="tablist"/);
 assert.match(page,/source:"bosses"/);
 assert.match(page,/source:"events"/);
 assert.match(page,/source:"all"/);
});
test('Chest Finder searches one reward and fetches only one page at a time',()=>{
 assert.match(page,/Search one chest or reward at a time/);
 assert.match(page,/id="add-item-search"[^>]*>Search<\/button>/);
 assert.doesNotMatch(page,/id="search-items"/);
 assert.doesNotMatch(page,/selectedItems/);
 assert.doesNotMatch(page,/\/v2\/suggest\?q=/);
 assert.doesNotMatch(page,/verifyFullRewards/);
 assert.match(page,/function terms\(\)\{return \[activeQuery\];\}/);
 assert.match(page,/const data=await fetchChestPage\(params,request\.signal\)/);
 assert.match(page,/page=hasMore\?requestedPage\+1:requestedPage/);
 assert.match(page,/more\.addEventListener\("click",\(\)=>\{if\(hasMore\)load\(true\);\}\)/);
 assert.doesNotMatch(page,/while\(morePages/);
 assert.doesNotMatch(page,/Promise\.all\(list\.map/);
});
test('Filters, full reward table, comparison dock and autocomplete are available',()=>{
 for(const id of ['drop-type','live-filter','comparison-dock','compare','reset'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(page,/id="search-items"/);
 assert.match(page,/View chest contents/);
 assert.match(page,/\["Reward","Quantity","Chance"\]/);
 assert.match(page,/Compare chests/);
 assert.match(page,/selected\.size>=4/);
 assert.doesNotMatch(page,/\/v2\/suggest\?q=/);
});
test('Inline browser scripts are valid JavaScript',()=>{
 for(const match of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  assert.doesNotThrow(()=>new Script(match[1]));
});

test('Single page search renders without automatic detail verification',()=>{
 assert.doesNotMatch(page,/verifyFullRewards/);
 assert.match(page,/renderResults\(\);/);
 assert.match(page,/Highest recorded amounts first among loaded results/);
});
test('Legacy Wood searches use Lumber without changing the user input label',()=>{
 const start=page.indexOf('const resourceSearchTerm=');
 const end=page.indexOf('function terms()',start);
 assert.ok(start>=0&&end>start);
 const resolver=new Function(page.slice(start,end)+'return resourceSearchTerm;')();
 for(const name of ['Wood','WOOD','Wood / Lumber'])assert.equal(resolver(name),'Lumber');
 assert.equal(resolver('Safe Wood'),'Safe Lumber');
 assert.equal(resolver('Lumber'),'Lumber');
 assert.equal(resolver('Refining Stone'),'Refining Stone');
});
test('Chest search retries transient errors and bypasses cached API replies',()=>{
 assert.match(page,/async function fetchChestPage\(params,signal\)/);
 assert.match(page,/cache:"no-store"/);
 assert.match(page,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
 assert.match(page,/const data=await fetchChestPage\(params,request\.signal\)/);
});

test('Chest Finder retains previous results and reports actual request failure details',()=>{
 assert.match(page,/const requestedPage=append\?page:0/);
 assert.match(page,/const nextResults=append\?new Map\(allFound\):new Map\(\)/);
 assert.match(page,/allFound=nextResults/);
 assert.match(page,/const reason=\/HTTP \[0-9\]\{3\}\//);
 assert.match(page,/Previous results are still shown/);
 assert.match(page,/Chest request failed/);
 assert.doesNotMatch(page,/Chest reward data could not be loaded\. Please retry/);
});
test('Event dropdown is loaded only on demand',()=>{
 assert.match(page,/let eventChoicesLoaded=false,eventChoicesLoading=false/);
 assert.match(page,/if\(show\)loadEventChoices\(\)/);
 assert.doesNotMatch(page,/activeQuery=resourceSearchTerm\(q.value\);loadEventChoices\(\)/);
});

test('Chest Finder restores item dropdown without additional API requests',()=>{
 assert.match(page,/import itemCatalog from '..\/..\/data\/items\.json'/);
 assert.match(page,/id="chest-suggestions"/);
 assert.match(page,/list="chest-suggestions"/);
 assert.match(page,/itemCatalog\.map\(item => <option value=\{item\.name\} \/>\)/);
 assert.match(page,/for\(const chest of allFound\.values\(\)\)/);
 assert.doesNotMatch(page,/\/v2\/suggest\?q=/);
 assert.doesNotMatch(page,/selectedItems/);
});
test('Chest Finder removes redundant controls while retaining Live only',()=>{
 assert.match(page,/id="live-filter"/);
 assert.doesNotMatch(page,/<option value="live">Live first<\/option>/);
 assert.doesNotMatch(page,/id="monster-level"/);
 assert.doesNotMatch(page,/class="source-control"/);
 assert.match(page,/id="source" type="hidden" value="all"/);
 assert.match(page,/id="sort-order"/);
 assert.match(page,/sortOrder\.value==="name"/);
});
test('Live only matches calendar monster names as well as scheduled events',()=>{
 const start=page.indexOf('const sourceKey=value=>'),end=page.indexOf('function paintAvailability(',start);
 assert.ok(start>=0&&end>start);
 assert.match(page,/entry\.kind==="Event Boss"&&entry\.live&&type==="Event"/);
 assert.match(page,/compatibleSource\(entry\.kind,type\)/);
 assert.match(page,/availableNow\(chest\)\{return liveMatches\(chest\)\.length>0/);
 assert.match(page,/Live calendar unavailable/);
 assert.match(page,/No recorded live sources match these chests today/);
});
