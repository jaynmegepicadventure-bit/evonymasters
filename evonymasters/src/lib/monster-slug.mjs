// Consistent, readable static URLs for the master-sheet monster directory.
export function monsterSlug(monster){
  return [monster.type,monster.name,monster.level||'unknown']
    .join('-').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
