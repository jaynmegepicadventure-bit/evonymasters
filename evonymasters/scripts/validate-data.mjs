import { readFileSync } from 'node:fs';
import { validateData } from './validation.mjs';
const monsters=JSON.parse(readFileSync(new URL('../src/data/monsters.json',import.meta.url)));
const items=JSON.parse(readFileSync(new URL('../src/data/items.json',import.meta.url)));
const errors=validateData(monsters,items);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Data valid: ${monsters.length} monsters, ${items.length} items`);
