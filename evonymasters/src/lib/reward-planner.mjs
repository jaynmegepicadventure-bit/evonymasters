// Reward Planner calculation primitives. No guessed drop rates or chest contents.
export const RESOURCE_TYPES = ["Food","Wood","Stone","Ore"];
export const MILLION = 1000000;
// Safe resources contribute to the same resource target as their regular versions.
export const RESOURCE_ALIASES = Object.freeze({
  food:"Food", "safe food":"Food", "food safe":"Food",
  wood:"Wood", lumber:"Wood", "safe wood":"Wood", "safe lumber":"Wood", "wood safe":"Wood", "lumber safe":"Wood",
  stone:"Stone", "safe stone":"Stone", "stone safe":"Stone",
  ore:"Ore", "safe ore":"Ore", "ore safe":"Ore"
});
export const RSS_CHESTS = Object.freeze({
  "super resources chest": [MILLION,MILLION,MILLION,MILLION],
  "super resource chest": [MILLION,MILLION,MILLION,MILLION],
  "super safe resources chest": [MILLION,MILLION,MILLION,MILLION],
  "super safe resource chest": [MILLION,MILLION,MILLION,MILLION]
});
export function normalise(value) {
  return String(value ?? "").trim().toLowerCase().replace(/['’]/g,"").replace(/[^a-z0-9]+/g," ").trim();
}
export function parseAmount(value) {
  if(value===null || value===undefined || String(value).trim()==="")return null;
  const match=String(value).replace(/,/g,"").trim().match(/^(\d+(?:\.\d+)?)\s*([kmbt]?)$/i);
  if(!match)return null;
  const amount=Number(match[1])*({k:1e3,m:1e6,b:1e9,t:1e12}[match[2].toLowerCase()]||1);
  return Number.isSafeInteger(amount)&&amount>=0?amount:null;
}
export function resourcesFor(item,quantity) {
  const n=parseAmount(quantity);
  if(n===null || n===0)return null;
  const key=normalise(item),chest=RSS_CHESTS[key];
  if(chest)return Object.fromEntries(RESOURCE_TYPES.map((type,i)=>[type,chest[i]*n]));
  const resource=RESOURCE_ALIASES[key];
  if(resource)return Object.fromEntries(RESOURCE_TYPES.map(type=>[type,type===resource?n:0]));
  return null;
}
export function valueFor(item,quantity,target) {
  const resources=resourcesFor(item,quantity);
  if(target==="Combined Resources")return resources?Object.values(resources).reduce((s,n)=>s+n,0):0;
  const targetResource=RESOURCE_ALIASES[normalise(target)];
  if(targetResource)return resources?resources[targetResource]:0;
  return normalise(item)===normalise(target)?parseAmount(quantity)??0:0;
}
export function dayUTC(now=new Date()) { return now.toISOString().slice(0,10); }
export function dayAdd(day,delta) {return new Date(Date.parse(day+"T00:00:00Z")+delta*86400000).toISOString().slice(0,10);}
export function liveIndex(occurrences, day=dayUTC()) {
  const days=new Map(),today=new Set(),families=new Set();
  for(const event of occurrences) {
    if(!event || !event.date || !event.name || event.status!=="Confirmed")continue;
    const name=normalise(event.name),kind=event.kind;
    const key=kind+"|"+name;
    if(!days.has(key))days.set(key,new Set());
    if(event.family)families.add(key);
    days.get(key).add(event.date);
    if(event.date===day)today.add(key);
  }
  return {days,today,families,occurrences:occurrences.filter(event=>event?.date&&event?.name&&event.status==="Confirmed")};
}
export function isLive(index, kind, name, day=dayUTC()) {
  if(!index)return false;
  const key=kind+"|"+normalise(name);
  return Boolean(index.days.get(key)?.has(day));
}
export function scheduledDays(index, kind, name, start, count) {
  if(!index)return [];
  const dates=index.days.get(kind+"|"+normalise(name))||new Set();
  return Array.from({length:count},(_,i)=>dayAdd(start,i)).filter(x=>dates.has(x));
}
export function eligibleRecord(row,target,index,day=dayUTC()) {
  const sourceKind=row.source==="events"?"Event":row.source==="event-bosses"?"Event Boss":row.source==="regular"?"Regular Monster":"Boss";
  const directLive=isLive(index,sourceKind,row.title,day);
  const familyName=normalise(row.context?.event||"");
  const familyKey=sourceKind+"|"+familyName;
  const familyLive=Boolean(familyName && [...(index.days.get(familyKey)||[])].includes(day) && index.families?.has(familyKey));
  // The Calendar catalog identifies individual monster levels with
  // "Monster Name · Lv N", while reward search returns the family name and
  // level separately. Match the exact scheduled level or a confirmed family.
  const level=normalise(row.context?.level||"");
  const calendarLevelMatch=sourceKind!=="Event"&&Boolean(index?.occurrences?.some(event=>{
    if(event.kind!==sourceKind||event.date!==day)return false;
    const familyName=normalise(row.title);
    const actualName=normalise(event.name);
    const calendarName=actualName.replace(/ lv (?:level )?\d+$/,"").trim();
    if(calendarName!==familyName)return false;
    if(event.family)return true;
    const eventLevel=normalise(event.level||"");
    return !level||eventLevel===level||eventLevel==="level "+level;
  }));
  if(!directLive && !familyLive && !calendarLevelMatch)return null;
  // Direct quantified rewards only. Nested chest items are not a guaranteed payout.
  const rewards=(row.items||[])
    .filter(item=>Array.isArray(item.route) && item.route.length===1 && item.classification==="Guaranteed")
    .map(item=>({...item,value:valueFor(item.item,item.quantity,target)}))
    .filter(item=>item.value>0);
  if(!rewards.length)return null;
  // Search details can contain alternatives or multiple milestones, so keep
  // the highest recorded single reward, never sum them into an invented payout.
  const guaranteed=Math.max(...rewards.map(x=>x.value));
  const stamina=parseAmount(row.context?.stamina);
  return {id:row.source+"|"+row.title+"|"+JSON.stringify(row.context||{}),
    name:row.title,source:row.source,frequency:row.context?.frequency||"",
    detail:row.note||"",stamina,guaranteed,rewards};
}
export function rankRecords(records) {
  return [...records].sort((a,b)=>
    (b.guaranteed/Math.max(1,b.stamina||1))-(a.guaranteed/Math.max(1,a.stamina||1)) ||
    b.guaranteed-a.guaranteed || a.name.localeCompare(b.name));
}
export function plan(records,{target,quantity=null,stamina=null,days=null}={}) {
  const amount=parseAmount(quantity),budget=parseAmount(stamina),horizon=parseAmount(days);
  const events=rankRecords(records.filter(x=>x.source==="events"));
  const monsters=rankRecords(records.filter(x=>x.source!=="events"&&x.stamina>0));
  let remaining=budget,guaranteed=0;
  const allocation=[];
  if(remaining!==null && monsters.length) {
    const best=monsters[0],hunts=Math.floor(remaining/best.stamina);
    if(hunts>0) {
      remaining-=hunts*best.stamina;
      guaranteed=hunts*best.guaranteed;
      allocation.push({...best,hunts,totalStamina:hunts*best.stamina,guaranteedTotal:guaranteed});
    }
  }
  return {target,quantity:amount,stamina:budget,days:horizon,events,monsters,allocation,
    monsterGuaranteed:guaranteed,staminaRemaining:remaining,
    suggestedGuaranteedQuantity:budget===null?null:guaranteed,
    dailyGoal:amount!==null&&horizon?Math.ceil(amount/horizon):null,
    // No event income is assumed: rank, activity and milestone requirements vary.
    warning:"Showing confirmed LIVE schedules and quantified guaranteed reward entries only. Event payouts require completing the stated activities. Resource costs, repeats and chest mechanics remain unverified; completion dates are not estimated."};
}

/**
 * Build today's actionable checklist without automatically awarding event prizes.
 * A "completed" tick is an activity log, not proof that any reward was received.
 */
export function dailyChecklist(result, date=dayUTC()) {
  const items=[];
  for(const event of result.events||[]) {
    items.push({id:"event|"+date+"|"+event.id,category:"Event",
      name:event.name,detail:event.detail||"Complete the event requirements",
      recordedReward:event.guaranteed,stamina:0,
      note:"Recorded guaranteed reward is conditional on qualifying for the activity. Verify the actual prize."});
  }
  for(const monster of result.allocation||[]) {
    items.push({id:"monster|"+date+"|"+monster.id,category:"Monster",
      name:monster.name,detail:"Hunt up to "+monster.hunts+" times",
      recordedReward:monster.guaranteedTotal,stamina:monster.totalStamina,
      note:"Hunt quantity is a stamina-budget suggestion, not an automatic reward."});
  }
  return items;
}
export function remainingTarget(quantity,claimed) {
  const goal=parseAmount(quantity),earned=parseAmount(claimed);
  if(goal===null)return null;
  return Math.max(0,goal-(earned??0));
}

/**
 * A forecast, not a promised payout. Only one highest recorded guaranteed
 * milestone is counted for this named event on each confirmed Calendar date.
 * Every such payout still requires the player to qualify for the milestone.
 */
export function eventForecast(events,index,quantity,today=dayUTC(),horizon=60) {
 const goal=parseAmount(quantity);
 const top=[...(events||[])].filter(x=>x.guaranteed>0).sort((a,b)=>b.guaranteed-a.guaranteed)[0];
 if(!top)return null;
 const dates=scheduledDays(index,"Event",top.name,today,horizon);
 const reward=top.guaranteed;
 const claims=goal===null?null:Math.ceil(goal/reward);
 const when=claims!==null&&claims>0&&dates.length>=claims?dates[claims-1]:null;
 return {name:top.name,reward,dates,firstDate:dates[0]||null,
  opportunities:dates.length,goal,claimsNeeded:claims,completionDate:when,
  daysUntil:when===null?null:Math.round((Date.parse(when+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000)+1,
  forecastTotal:dates.length*reward};
}
export function monsterForecast(monsters,quantity,stamina=null) {
 const goal=parseAmount(quantity),budget=parseAmount(stamina);
 const top=rankRecords((monsters||[]).filter(x=>x.guaranteed>0&&x.stamina>0))[0];
 if(!top)return null;
 const huntsNeeded=goal===null?null:Math.ceil(goal/top.guaranteed);
 const staminaNeeded=huntsNeeded===null?null:huntsNeeded*top.stamina;
 const huntsInBudget=budget===null?null:Math.floor(budget/top.stamina);
 return {name:top.name,perHunt:top.guaranteed,staminaPerHunt:top.stamina,
  perStamina:top.guaranteed/top.stamina,goal,huntsNeeded,staminaNeeded,
  huntsInBudget,rewardInBudget:huntsInBudget===null?null:huntsInBudget*top.guaranteed,
  meetsGoal:huntsInBudget===null||goal===null?null:huntsInBudget*top.guaranteed>=goal};
}

export function hasBudgetedMonster(monster,goal) {
 return goal!==null && Number.isFinite(goal) &&
  monster!==null && monster!==undefined &&
  monster.rewardInBudget!==null && Number.isFinite(monster.rewardInBudget);
}
