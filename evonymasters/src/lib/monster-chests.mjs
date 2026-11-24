// Exact, case-insensitive chest-name matching, with whitespace normalized.
// No fuzzy names: an unmatched chest cannot inherit another chest's contents.
export const chestKey=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');

export function chestMatches(rewardNames, boxes){
 const byName=new Map(boxes.map(box=>[chestKey(box.name),box]));
 const matched=[], missing=[], used=new Set();
 for(const name of rewardNames){
  const key=chestKey(name);
  if(!key||used.has(key))continue;
  used.add(key);
  const box=byName.get(key);
  if(box&&box.contents.length)matched.push(box);
  else if(/\b(?:chest|box)\b/i.test(String(name)))missing.push(String(name));
 }
 return {matched,missing};
}
