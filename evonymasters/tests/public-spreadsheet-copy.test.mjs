import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('public boss and upgrade pages do not mention their source spreadsheets',()=>{
 const paths=[
  '../src/pages/bosses/index.astro',
  '../src/components/SheetMonsterPage.astro',
  '../src/components/LegacyMonsterPage.astro',
  '../src/pages/building-upgrades/index.astro'
 ];
 for(const path of paths){
  const code=read(path);
  assert.doesNotMatch(code,/EVONYMASTERS (?:Google )?spreadsheet|EVONYMASTERS master sheet|IN THE BOXES tab|MONSTER tab|source sheet|in the spreadsheet|EvonyMasters Building Upgrade Master/i,path);
 }
 const directory=read('../src/pages/bosses/index.astro');
 assert.ok(!directory.includes('directory-note'));
 assert.ok(!directory.includes('bottom-note">'));
});
