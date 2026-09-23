export function validateData(monsters,items){
  const errors=[];const ids=new Set();const itemIds=new Set(items.map(i=>i.id));
  if(itemIds.size!==items.length)errors.push('Duplicate item ID');
  for(const m of monsters){
    if(!m.id||!m.name)errors.push('Monster missing ID or name');
    if(ids.has(m.id))errors.push(`Duplicate monster ID: ${m.id}`);ids.add(m.id);
    if(!['Regular','Boss','Event'].includes(m.type))errors.push(`Invalid type for ${m.id}`);
    for(const key of ['level','power','stamina'])if(m[key]!=null&&(!Number.isInteger(m[key])||m[key]<0))errors.push(`Invalid ${key} for ${m.id}`);
    if(!Array.isArray(m.rewards))errors.push(`Missing rewards array for ${m.id}`);
    for(const r of m.rewards||[]){if(!itemIds.has(r.itemId))errors.push(`Unknown reward ${r.itemId} for ${m.id}`);if(!['guaranteed','possible'].includes(r.kind))errors.push(`Invalid reward kind for ${m.id}`);if(r.quantity!=null&&(!Number.isFinite(r.quantity)||r.quantity<0))errors.push(`Invalid quantity for ${m.id}`);}
  }return errors;
}
