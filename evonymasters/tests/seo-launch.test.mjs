import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const routes=['index.astro','resources/index.astro','chests/index.astro','calendar/index.astro','loot-compass/index.astro','troops/index.astro','training/index.astro','generals/index.astro','about/index.astro','privacy/index.astro','contact/index.astro','bosses/[id].astro','items/[id].astro','generals/[slug].astro'];

test('all indexable pages include centralized canonical metadata',()=>{
 for(const route of routes){
  const code=read('../src/pages/'+route);
  assert.ok(code.includes('<SeoMetadata '),route);
  assert.ok(code.includes('import SeoMetadata'),route);
 }
});

test('sitemap includes real routes and the verified custom domain',()=>{
 const code=read('../src/pages/sitemap.xml.ts');
 for(const route of ['resources','chests','calendar','loot-compass','troops','training','generals','about','privacy','contact'])assert.ok(code.includes('/'+route+'/'),route);
 for(const item of ['monsters','items','buffs'])assert.ok(code.includes(item),item);
 assert.ok(!code.includes("'/reward-planner/'"));
 assert.ok(!code.includes("'/events/'"));
 assert.ok(read('../public/robots.txt').includes('Sitemap: https://www.evonymasters.com/sitemap.xml'));
});

test('metadata uses configured Astro site and homepage has structured data',()=>{
 const seo=read('../src/components/SeoMetadata.astro');
 for(const marker of ['Astro.site','rel="canonical"','application/ld+json'])assert.ok(seo.includes(marker),marker);
 assert.ok(read('../src/pages/index.astro').includes('structured={true}'));
});

test('Cloudflare automatic analytics does not duplicate a manual beacon',()=>{
 const shared=read('../src/components/SeoMetadata.astro');
 assert.ok(!shared.includes('static.cloudflareinsights.com/beacon.min.js'));
 assert.ok(!shared.includes('data-cf-beacon'));
 const privacy=read('../src/pages/privacy/index.astro');
 assert.ok(privacy.includes('Cloudflare Web Analytics is enabled'));
 assert.ok(privacy.includes('Advertising is planned'));
});

test('production canonical and sitemap use the verified custom domain',()=>{
 const production='https://www.evonymasters.com';
 assert.ok(read('../astro.config.mjs').includes(production));
 assert.ok(read('../src/pages/sitemap.xml.ts').includes(production));
 const seo=read('../src/components/SeoMetadata.astro');
 assert.ok(seo.includes(production));
 assert.ok(!seo.includes('https://evonymasters.pages.dev'));
});

test('Google Search Console verification is shared across site pages',()=>{
 const seo=read('../src/components/SeoMetadata.astro');
 assert.ok(seo.includes('name="google-site-verification" content="R4xVRIFk5hir7AyMRb6D4r7x6oFy9zWsSlzzgH6koTA"'));
 assert.equal(seo.split('name="google-site-verification"').length-1,1);
});
