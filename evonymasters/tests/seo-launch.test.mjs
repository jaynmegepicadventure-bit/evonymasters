import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const routes=['index.astro','resources/index.astro','chests/index.astro','calendar/index.astro','loot-compass/index.astro','troops/index.astro','training/index.astro','generals/index.astro','about/index.astro','privacy/index.astro','contact/index.astro','bosses/[id].astro','items/[id].astro','generals/[slug].astro'];
test('all indexable pages include centralized canonical metadata',()=>{
 for(const route of routes){
  const code=read('../src/pages/'+route);
  assert.match(code,/<SeoMetadata\s/,route);
  assert.match(code,/import SeoMetadata/,route);
 }
});
test('sitemap includes real route types but not obsolete redirects',()=>{
 const code=read('../src/pages/sitemap.xml.ts');
 for(const route of ['resources','chests','calendar','loot-compass','troops','training','generals','about','privacy','contact'])assert.ok(code.includes('/'+route+'/'),route);
 assert.match(code,/monsters/);
 assert.match(code,/items/);
 assert.match(code,/buffs/);
 assert.doesNotMatch(code,/['"]\/reward-planner\/['"]/);
 assert.doesNotMatch(code,/['"]\/events\/['"]/);
 assert.match(read('../public/robots.txt'),/Sitemap: https:\/\/evonymasters\.jaynmegepicadventure\.workers\.dev\/sitemap\.xml/);
});
test('metadata uses configured Astro site and homepage has website structured data',()=>{
 const seo=read('../src/components/SeoMetadata.astro');
 assert.match(seo,/Astro\.site/);
 assert.match(seo,/rel="canonical"/);
 assert.match(seo,/application\/ld\+json/);
 assert.match(read('../src/pages/index.astro'),/structured=\{true\}/);
});

test('Cloudflare Web Analytics uses automatic setup without a manually embedded beacon',()=>{
 const shared=read('../src/components/SeoMetadata.astro');
 assert.doesNotMatch(shared,/static\\.cloudflareinsights\\.com\\/beacon\\.min\\.js/);
 assert.doesNotMatch(shared,/data-cf-beacon/);
 const privacy=read('../src/pages/privacy/index.astro');
 assert.match(privacy,/Cloudflare Web Analytics is enabled/);
 assert.match(privacy,/Advertising is planned/);
});

test('production canonical and sitemap use the verified custom domain',()=>{
 const config=read('../astro.config.mjs');
 const production='https://www.evonymasters.com';
 assert.ok(config.includes(production));
 const sitemap=read('../src/pages/sitemap.xml.ts');
 assert.ok(sitemap.includes(production));
 const metadata=read('../src/components/SeoMetadata.astro');
 assert.ok(metadata.includes(production));
 assert.ok(!metadata.includes('https://evonymasters.pages.dev'));
});

test('Google Search Console verification is shared across site pages',()=>{
 const seo=read('../src/components/SeoMetadata.astro');
 assert.match(seo,/<meta name="google-site-verification" content="R4xVRIFk5hir7AyMRb6D4r7x6oFy9zWsSlzzgH6koTA"\s*\/>/);
 assert.equal((seo.match(/name="google-site-verification"/g)||[]).length,1);
});
