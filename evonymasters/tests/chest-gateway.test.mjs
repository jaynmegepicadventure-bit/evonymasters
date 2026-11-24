import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import gateway from '../integrations/chest-gateway/worker.mjs';

const site=readFileSync(new URL('../src/pages/chests/index.astro',import.meta.url),'utf8');

test('Chest Finder uses same-origin gateway only with no cross-origin fallback',()=>{
 assert.match(site,/fetch\("\/api\/chests"\+path\+query/);
 assert.doesNotMatch(site,/fetch\(API\+"\/v4\/chests"\+path\+query/);
 assert.doesNotMatch(site,/chestGatewayAvailable/);
 assert.match(site,/fetchChestRoute\("",params,signal\)/);
 assert.match(site,/fetchChestRoute\("\/compare",params\)/);
 assert.match(site,/fetchChestRoute\("\/events"\)/);
});
test('Gateway HTTP errors do not cause a cross-origin retry',async()=>{
 const start=site.indexOf('async function fetchChestRoute(');
 const end=site.indexOf('async function load(append=false)',start);
 assert.ok(start>=0&&end>start);
 const urls=[];
 const client=new Function('fetch','URLSearchParams','AbortSignal',site.slice(start,end)+'\nreturn fetchChestPage;')(
  async url=>{urls.push(url);return {ok:false,status:503};},
  URLSearchParams,AbortSignal
 );
 await assert.rejects(client(new URLSearchParams({q:'Lumber'}),new AbortController().signal),/HTTP 503/);
 assert.ok(urls.length>0);
 assert.ok(urls.every(url=>url.startsWith('/api/chests?')));
});
test('Gateway forwards only approved GET paths through a service binding',async()=>{
 const observed=[];
 const env={SHEET_SYNC:{fetch:async request=>{
  observed.push(new URL(request.url));
  return new Response(JSON.stringify({total:1,chests:[]}),{status:200,headers:{'content-type':'application/json'}});
 }}};
 const response=await gateway.fetch(new Request('https://www.evonymasters.com/api/chests?q=Lumber&page=0'),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
 assert.equal(observed.length,1);
 assert.equal(observed[0].pathname,'/v4/chests');
 assert.equal(observed[0].searchParams.get('q'),'Lumber');
 const compare=await gateway.fetch(new Request('https://www.evonymasters.com/api/chests/compare?id=123'),env);
 assert.equal(compare.status,200);
 assert.equal(observed[1].pathname,'/v4/chests/compare');
 const events=await gateway.fetch(new Request('https://www.evonymasters.com/api/chests/events'),env);
 assert.equal(events.status,200);
 assert.equal(observed[2].pathname,'/v4/chests/events');
});
test('Gateway rejects unrelated paths, write methods and missing service bindings',async()=>{
 const fake={SHEET_SYNC:{fetch:async()=>{throw Error('should not call upstream')}}};
 assert.equal((await gateway.fetch(new Request('https://www.evonymasters.com/api/chests/secret'),fake)).status,404);
 assert.equal((await gateway.fetch(new Request('https://www.evonymasters.com/api/chests',{method:'POST'}),fake)).status,405);
 assert.equal((await gateway.fetch(new Request('https://www.evonymasters.com/api/chests'),{})).status,503);
 assert.equal((await gateway.fetch(new Request('https://www.evonymasters.com/api/chests'),fake)).status,502);
});
