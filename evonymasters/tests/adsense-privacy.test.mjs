import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const privacy=read('../src/pages/privacy/index.astro');
const seo=read('../src/components/SeoMetadata.astro');

test('privacy notice accurately discloses installed AdSense script',()=>{
 assert.match(seo,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
 assert.match(privacy,/Google AdSense verification code is installed/);
 assert.match(privacy,/not currently displaying AdSense ad placements/);
 assert.doesNotMatch(privacy,/Google AdSense and Google Analytics are not installed/);
});
test('privacy notice explains ad vendors, cookies and opt-out options',()=>{
 assert.match(privacy,/third-party advertising vendors/);
 assert.match(privacy,/cookies/);
 assert.match(privacy,/myadcenter\.google\.com/);
 assert.match(privacy,/aboutads\.info/);
 assert.match(privacy,/consent management solution/);
});
test('About, Contact, Privacy and main calculator routes remain linked',()=>{
 const header=read('../src/components/SiteHeader.astro');
 for(const path of ['/about/','/contact/','/privacy/','/troops/','/training/','/building-upgrades/','/qa/']){
  assert.ok(header.includes(path)||privacy.includes(path),path);
 }
});
