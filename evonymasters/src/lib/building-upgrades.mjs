// Draft, deterministic upgrade-cost engine. No live data or game login required.
const COST_KEYS=['food','lumber','stone','ore'];
export function buildIndex(source){
 const index=new Map(),nameMap=new Map();
 for(const name of source.buildings||[])nameMap.set(name.toLowerCase(),name);
 for(const row of source.rows||[]){
  if(!index.has(row.building))index.set(row.building,new Map());
  if(index.get(row.building).has(row.level))throw Error('Duplicate level: '+row.building+' '+row.level);
  index.get(row.building).set(row.level,row);
 }
 const names=[...index.keys()].sort((a,b)=>b.length-a.length);
 const escaped=names.map(s=>s.replace(/[\^$.*+?()[\]{}|\\]/g,'\\$&'));
 const expression=new RegExp('(^|[^A-Za-z])('+escaped.join('|')+')\\s*(?:Lv(?:el)?\\.?\\s*)?(\\d{1,2})(?!\\d)','gi');
 return {index,nameMap,expression,names:names.sort()};
}
export function parseRequirements(raw,catalog){
 const text=String(raw||'').trim();
 if(!text||/^[–—-]$/.test(text))return {buildings:[],special:[]};
 const buildings=new Map(),special=[];
 for(const fragment of text.split(/\n/)){
  const line=fragment.trim();if(!line||/^[–—-]$/.test(line))continue;
  let remainder='',cursor=0;
  catalog.expression.lastIndex=0;
  for(let match;(match=catalog.expression.exec(line));){
   const start=match.index+match[1].length;
   remainder+=line.slice(cursor,start);cursor=catalog.expression.lastIndex;
   const name=catalog.nameMap.get(match[2].toLowerCase()),level=Number(match[3]);
   if(name&&level>0)buildings.set(name,Math.max(level,buildings.get(name)||0));
  }
  remainder+=line.slice(cursor);
  const remaining=remainder.replace(/^[\s,;():=–—-]+|[\s,;():=–—-]+$/g,'').trim();
  if(remaining&&/[A-Za-z0-9]/.test(remaining))special.push(remaining);
 }
 return {buildings:[...buildings].map(([building,level])=>({building,level})),special:[...new Set(special)]};
}
export function calculateUpgradePlan(source,{building,currentLevel=0,targetLevel,currentLevels={}}){
 const catalog=buildIndex(source);
 if(!catalog.index.has(building))throw Error('Unknown building');
 const target=Number(targetLevel),ownCurrent=Number(currentLevel);
 const max=Math.max(...catalog.index.get(building).keys());
 if(!Number.isInteger(target)||!Number.isInteger(ownCurrent)||ownCurrent<0||target<ownCurrent||target>max)throw Error('Invalid current or target level');
 const levels={};
 for(const [name,value] of Object.entries(currentLevels||{})){
  if(!catalog.index.has(name))continue;
  const n=Number(value);
  if(!Number.isInteger(n)||n<0||n>Math.max(...catalog.index.get(name).keys()))throw Error('Invalid current level: '+name);
  levels[name]=n;
 }
 levels[building]=ownCurrent;
 const targets=new Map([[building,target]]),parsed=new Map(),missing=new Set(),warnings=[];
 let changed=true,pass=0;
 while(changed){
  if(++pass>2500)throw Error('Prerequisite expansion did not converge');
  changed=false;
  for(const [name,need] of [...targets]){
   const current=levels[name]||0;
   for(let lv=current+1;lv<=need;lv++){
    const row=catalog.index.get(name)?.get(lv);
    if(!row){missing.add(name+' '+lv);continue}
    const key=name+'|'+lv;
    let req=parsed.get(key);
    if(!req){req=parseRequirements(row.requirements,catalog);parsed.set(key,req)}
    for(const dep of req.buildings){
     const depMax=Math.max(...(catalog.index.get(dep.building)?.keys()||[0]));
     if(dep.level>depMax){missing.add(dep.building+' '+dep.level+' required by '+name+' '+lv);continue}
     if(dep.level>(targets.get(dep.building)||levels[dep.building]||0)){targets.set(dep.building,dep.level);changed=true}
    }
   }
  }
 }
 const tasks=[],totals=[0,0,0,0],seen=new Set(),visiting=new Set(),cycles=new Set(),specialMap=new Map();
 function visit(name,level){
  if(level<=(levels[name]||0))return;
  const key=name+'|'+level;
  if(seen.has(key))return;
  if(visiting.has(key)){cycles.add(key);return}
  visiting.add(key);
  if(level>1)visit(name,level-1);
  const row=catalog.index.get(name)?.get(level);
  if(!row){missing.add(name+' '+level);visiting.delete(key);return}
  const req=parsed.get(key)||parseRequirements(row.requirements,catalog);
  for(const dep of req.buildings)visit(dep.building,dep.level);
  for(const note of req.special){
   if(!specialMap.has(note))specialMap.set(note,new Set());
   specialMap.get(note).add(name+' Lv'+level);
  }
  for(let i=0;i<4;i++){
   if(row.cost[i]===null||!Number.isSafeInteger(row.cost[i]))missing.add('Resource data: '+name+' '+level+' '+COST_KEYS[i]);
   else totals[i]+=row.cost[i];
  }
  tasks.push({building:name,level,cost:row.cost,requirements:row.requirements,sourceRow:row.sourceRow,selected:name===building});
  seen.add(key);visiting.delete(key);
 }
 for(const [name,needed] of targets)for(let lv=(levels[name]||0)+1;lv<=needed;lv++)visit(name,lv);
 const specials=[...specialMap].map(([requirement,usedIn])=>({requirement,usedIn:[...usedIn],confirmed:false}));
 if(missing.size)warnings.push('Some required levels or resource costs are missing. The total may be incomplete.');
 if(cycles.size)warnings.push('Source requirements include a dependency cycle. Review the upgrade sequence.');
 if(specials.length)warnings.push('Some research, formations, achievements or other conditions require confirmation. Their costs are not included.');
 const selected=tasks.filter(x=>x.selected),prerequisite=tasks.filter(x=>!x.selected);
 const sum=arr=>COST_KEYS.map((_,i)=>arr.reduce((n,x)=>n+(x.cost[i]||0),0));
 return {building,currentLevel:ownCurrent,targetLevel:target,levels,requiredLevels:Object.fromEntries(targets),tasks,selected,prerequisite,totals,selectedTotals:sum(selected),prerequisiteTotals:sum(prerequisite),specials,warnings,missing:[...missing],cycles:[...cycles],complete:missing.size===0&&cycles.size===0,source:source.source,resourceLabels:COST_KEYS};
}
