/** @typedef {{itemId:string,quantity:number|null,unit:string|null,kind:'guaranteed'|'possible',notes:string|null}} Reward */
/** @typedef {{id:string,name:string,type:string,level:number|null,power:number|null,stamina:number|null,image:string|null,event:string|null,updatedAt:string|null,rewards:Reward[]}} Monster */
export function searchMonsters(monsters, { query = '', item = '', type = '', sort = 'name' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  const result = monsters.filter(monster => {
    const matchesText = !term || [monster.name, monster.type, monster.event || ''].some(v => v.toLocaleLowerCase().includes(term));
    return matchesText && (!item || monster.rewards.some(r => r.itemId === item)) && (!type || monster.type === type);
  });
  const number = (value) => value == null ? Number.POSITIVE_INFINITY : value;
  return result.sort((a,b) => sort === 'stamina' ? number(a.stamina)-number(b.stamina) || a.name.localeCompare(b.name) : sort === 'power' ? number(a.power)-number(b.power) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
}
export function suggestions(monsters, items, term) {
  const q = term.trim().toLocaleLowerCase();
  if (!q) return [];
  return [...new Set([...monsters.map(m => m.name), ...items.map(i => i.name)].filter(n => n.toLocaleLowerCase().includes(q)))].slice(0, 7);
}
