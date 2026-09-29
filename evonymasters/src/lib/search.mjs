/** @typedef {{itemId:string,quantity:number|null,unit:string|null,kind:'guaranteed'|'possible',notes:string|null}} Reward */
/** @typedef {{name:string,quantity:number|null,unit?:string}} ChestContent */
/** @typedef {{name:string,quantity:number|null,contents:ChestContent[],sourceUrl:string}} Chest */
/** @typedef {{id:string,name:string,type:string,level:number|null,power:number|null,stamina:number|null,image:string|null,event:string|null,updatedAt:string|null,rewards:Reward[],chests?:Chest[]}} Monster */
export function searchMonsters(monsters, { query = '', item = '', type = '', sort = 'name', items = [] } = {}) {
  const term = query.trim().toLocaleLowerCase();
  const itemMatches = new Set(items.filter(i=>i.name.toLocaleLowerCase().includes(term)||i.id.toLocaleLowerCase().includes(term)).map(i=>i.id));
  const result = monsters.filter(monster => {
    const chestMatches=(monster.chests||[]).some(c=>[c.name,...c.contents.map(x=>x.name)].some(v=>v.toLocaleLowerCase().includes(term)));
    const matchesText = !term || [monster.name, monster.type, monster.event || ''].some(v => v.toLocaleLowerCase().includes(term)) || monster.rewards.some(r=>itemMatches.has(r.itemId)) || chestMatches;
    return matchesText && (!item || monster.rewards.some(r => r.itemId === item) || (monster.chests||[]).some(c=>c.contents.some(x=>x.name.toLocaleLowerCase().includes(items.find(i=>i.id===item)?.name.toLocaleLowerCase()||'___')))) && (!type || monster.type === type);
  });
  const number = (value) => value == null ? Number.POSITIVE_INFINITY : value;
  return result.sort((a,b) => sort === 'stamina' ? number(a.stamina)-number(b.stamina) || a.name.localeCompare(b.name) : sort === 'power' ? number(a.power)-number(b.power) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
}
export function suggestions(monsters, items, term) {
  const q = term.trim().toLocaleLowerCase();
  if (!q) return [];
  return [...new Set([...monsters.map(m => m.name), ...items.map(i => i.name),...monsters.flatMap(m=>(m.chests||[]).flatMap(c=>[c.name,...c.contents.map(x=>x.name)]))].filter(n => n.toLocaleLowerCase().includes(q)))].slice(0, 7);
}
