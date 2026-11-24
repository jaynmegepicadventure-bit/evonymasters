import {monsterSlug} from './monster-slug.mjs';

// Keep the URL Google already discovered whenever the master-sheet record
// maps to an existing legacy boss page. Otherwise create one /bosses/ URL.
export function bossPageId(monster, directory) {
  const match = directory.find(row =>
    row.type === monster.type &&
    String(row.level || '') === String(monster.level || '') &&
    row.name.trim().toLocaleLowerCase('en') === monster.name.trim().toLocaleLowerCase('en')
  );
  // Two spreadsheet aliases can point at one old detail page. Keep that URL\n  // for the first record only so every generated path stays unique.\n  const firstWithId = match?.detailId && directory.find(row => row.detailId === match.detailId);\n  return match?.detailId && firstWithId === match ? match.detailId : monsterSlug(monster);
}
export function bossPagePath(monster, directory) {
  return '/bosses/' + encodeURIComponent(bossPageId(monster, directory)) + '/';
}
