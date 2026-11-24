import {monsterSlug} from './monster-slug.mjs';

// Reuse URLs already discovered by Google. A shared historic ID belongs to
// only its first matching spreadsheet record; other aliases get unique URLs.
export function bossPageId(monster, directory) {
 const match=directory.find(row=>
  row.type===monster.type &&
  String(row.level||'')===String(monster.level||'') &&
  row.name.trim().toLowerCase()===monster.name.trim().toLowerCase()
 );
 const firstWithId=match?.detailId && directory.find(row=>row.detailId===match.detailId);
 return match?.detailId && firstWithId===match ? match.detailId : monsterSlug(monster);
}
export function bossPagePath(monster,directory) {
 return '/bosses/'+encodeURIComponent(bossPageId(monster,directory))+'/';
}
