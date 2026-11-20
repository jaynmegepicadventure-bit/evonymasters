import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('homepage exposes the real tool destinations and the redesigned hero',()=>{
 const html=read('../src/pages/index.astro');
 assert.equal((html.match(/title:'Loot Compass'/g)||[]).length,1);
 for(const path of ['/resources/','/chests/','/calendar/','/loot-compass/','/troops/','/training/','/qa/'])assert.ok(html.includes("href:'"+path+"'"),path);
 assert.match(html,/Strategy tools for Evony players/);
 assert.match(html,/class="feature-art"/);
 assert.match(html,/id="live-results"/);
 assert.match(html,/href="\/about\/"/);
 assert.match(html,/href="\/privacy\/"/);
 assert.match(html,/href="\/contact\/"/);
});

test('public trust pages accurately describe the independent site and secure feedback form',()=>{
 const about=read('../src/pages/about/index.astro');
 const privacy=read('../src/pages/privacy/index.astro');
 const contact=read('../src/pages/contact/index.astro');
 assert.match(about,/not affiliated with/);
 assert.match(privacy,/Google AdSense verification code is installed/);
 assert.match(privacy,/Cloudflare/);
 assert.match(contact,/Turnstile|turnstile/i);
 assert.match(contact,/feedback/i);
 const header=read('../src/components/SiteHeader.astro');
 assert.match(header,/href:'\/about\/'/);
 assert.match(header,/href:'\/contact\/'/);
 assert.match(header,/class="site-desktop-nav"/);
 assert.match(header,/viewBox="0 0 24 24"/);
});
