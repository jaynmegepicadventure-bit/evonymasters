import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../src/pages/troops/index.astro',import.meta.url),'utf8');
test('march formation headings use distinct icons and corrected Big Siege spelling',()=>{
 for(const name of ['Ranged','Cavalry','Ground','Big Siege','Small Siege','Solo Siege'])assert.ok(page.includes("label:'"+name+"'"),name);
 assert.doesNotMatch(page,/BIG Siege/);
 const icons=[...page.matchAll(/\{id:'(?:ranged|mounted|ground|bigSiege|smallSiege|soloSiege)',label:'[^']+',icon:'([^']+)'/g)].map(x=>x[1]);
 assert.equal(icons.length,6);
 assert.equal(new Set(icons).size,6);
});
test('top summary has exactly two plain labels, before the tier rows',()=>{
 const a=page.indexOf('<div class="results">');
 const b=page.indexOf('class="rows"',a);
 const section=page.slice(a,b);
 assert.match(section,/Main troop formation/);
 assert.match(section,/Other troop layers/);
 assert.ok(section.indexOf('Main troop formation')<section.indexOf('Calculated layers'));
 assert.ok(section.indexOf('Other troop layers')<section.indexOf('Calculated layers'));
 assert.doesNotMatch(page,/Own T1–T9 defaults|Additional Excel layer reserve|Extra fixed layers|Total march<\/span>/);
});
test('summary shows own troop sum and one other-type layer size',()=>{
 assert.match(page,/result\.rows\.reduce\(\(sum,row\)=>sum\+row\.count,0\)/);
 assert.match(page,/result\.otherLayers\/\(3\*Math\.max\(9,\.\.\.result\.tiers\)\)/);
});

test('Enki_007 pro tip sits beneath quick tips and before calculator controls',()=>{
 const quick=page.indexOf('class="preset-tips"');
 const pro=page.indexOf('class="enki-pro-tip"');
 const mode=page.indexOf('class="mode-selector"');
 assert.ok(quick>=0&&quick<pro&&pro<mode);
 for(const text of ['Enki_007','Sea Rush','Kingdom Arena','Everything left','300K','200K','10K layers','maximum allowed layers'])
  assert.ok(page.includes(text),text);
});
