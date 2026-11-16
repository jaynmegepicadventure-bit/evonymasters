import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('shared SEO head loads the provided AdSense publisher verification script once',()=>{
 const component=readFileSync(new URL('../src/components/SeoMetadata.astro',import.meta.url),'utf8');
 const script='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5307207484105791';
 assert.equal(component.split(script).length-1,1);
 assert.match(component,/<script is:inline async src=/);
 assert.match(component,/crossorigin="anonymous"/);
});

test('home and building upgrade pages include shared metadata',()=>{
 for(const path of ['../src/pages/index.astro','../src/pages/building-upgrades/index.astro']){
  const page=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(page,/<SeoMetadata\s/);
 }
});
