import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('homepage shows only one Loot Compass tool and current required-input description',()=>{
 const html=read('../src/pages/index.astro');
 assert.equal((html.match(/title:'Loot Compass \(Beta\)'/g)||[]).length,1);
 assert.match(html,/total stamina and number of days/);
 assert.doesNotMatch(html,/Set an optional goal/);
 assert.match(html,/href="\/about\/"/);
 assert.match(html,/href="\/privacy\/"/);
 assert.match(html,/href="\/contact\/"/);
});
test('public trust pages have navigation and non-invented AdSense status',()=>{
 const about=read('../src/pages/about/index.astro');
 const privacy=read('../src/pages/privacy/index.astro');
 const contact=read('../src/pages/contact/index.astro');
 assert.match(about,/not affiliated with/);
 assert.match(privacy,/Advertising is planned/);
 assert.match(privacy,/Cloudflare/);
 assert.match(contact,/github.com\/jaynmegepicadventure-bit\/evonymasters\/issues\/new/);
 assert.match(contact,/Reports are public/);
 const header=read('../src/components/SiteHeader.astro');
 assert.match(header,/href:'\/about\/'/);
 assert.match(header,/href:'\/contact\/'/);
});
