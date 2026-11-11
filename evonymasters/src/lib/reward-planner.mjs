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
// Calendar and Sheet Sync share stable catalog source IDs. Use those IDs
// before falling back to display names, which can differ by level and punctuation.
export function calendarSourceIds(row) {
 const kind=row.source==="events"?"Event":row.source==="event-bosses"?"Event Boss":row.source==="regular"?"Regular Monster":"Boss";
 const key=value=>String(value??"").trim().toLocaleLowerCase("en").replace(/\s+/g," ");
 const name=key(row.title),level=key(row.context?.level);
 if(!name)return [];
 if(kind==="Event")return ["event:"+encodeURIComponent(name)];
 const base=key(kind)+"|"+name;
 return [...(level?["monster:"+encodeURIComponent(base+"|"+level)]:[]),"family:"+encodeURIComponent(base)];
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
  const ids=new Set(calendarSourceIds(row));
  const catalogLive=Boolean(index?.occurrences?.some(event=>
    event.date===day&&event.kind===sourceKind&&ids.has(event.sourceId)
  ));
  if(!directLive && !familyLive && !calendarLevelMatch && !catalogLive)return null;
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
    name:row.title,source:row.source,calendarIds:calendarSourceIds(row),frequency:row.context?.frequency||"",
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
 const confirmed=new Set((index?.occurrences||[])
  .filter(event=>event.kind==="Event"&&(top.calendarIds||[]).includes(event.sourceId))
  .map(event=>event.date));
 const dates=Array.from({length:horizon},(_,i)=>dayAdd(today,i))
  .filter(date=>confirmed.has(date)||isLive(index,"Event",top.name,date));
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

/**
 * Period yield scenarios. Stamina is a single total budget, never daily.
 * One qualifying direct award per event per confirmed date; separate events
 * may have overlapping requirements, so event totals are conditional only.
 */
export function periodYield(records,index,{stamina,days,start=dayUTC(),checkedDays=days}={}) {
 const budget=parseAmount(stamina),horizon=parseAmount(days),covered=parseAmount(checkedDays);
 if(budget===null||horizon===null||horizon<1||horizon>60||covered===null||covered<1)return null;
 const coverage=Math.min(horizon,covered);
 const entries=(records||[]).filter(record=>record?.guaranteed>0);
 const events=entries.filter(record=>record.source==="events");
 const monsters=rankRecords(entries.filter(record=>record.source!=="events"&&record.stamina>0));
 const monster=monsters[0]||null;
 const hunts=monster?Math.floor(budget/monster.stamina):0;
 const monsterTotal=monster?hunts*monster.guaranteed:0;
 const bestPerEvent=new Map();
 for(const record of events) {
  const key=record.calendarIds?.[0]||"Event|"+normalise(record.name);
  const previous=bestPerEvent.get(key);
  if(!previous||record.guaranteed>previous.guaranteed)bestPerEvent.set(key,record);
 }
 const opportunities=[];
 for(const event of bestPerEvent.values()) {
  const sourceIds=new Set(event.calendarIds||[]);
  const dates=Array.from({length:coverage},(_,i)=>dayAdd(start,i)).filter(date=>
    (index?.occurrences||[]).some(entry=>entry.kind==="Event"&&entry.date===date&&
      (sourceIds.has(entry.sourceId)||normalise(entry.name)===normalise(event.name)))
  );
  if(!dates.length)continue;
  opportunities.push({name:event.name,perCompletion:event.guaranteed,dates,
    occurrences:dates.length,conditionalTotal:dates.length*event.guaranteed,
    staminaCostKnown:event.stamina>0,staminaPerCompletion:event.stamina||null});
 }
 opportunities.sort((a,b)=>b.conditionalTotal-a.conditionalTotal||a.name.localeCompare(b.name));
 const eventConditionalTotal=opportunities.reduce((sum,event)=>sum+event.conditionalTotal,0);
 return {stamina:budget,days:horizon,checkedDays:coverage,complete:coverage===horizon,
  monster:monster?{name:monster.name,staminaPerHunt:monster.stamina,
    rewardPerHunt:monster.guaranteed,hunts,staminaUsed:hunts*monster.stamina,
    remainingStamina:budget-hunts*monster.stamina,total:monsterTotal}:null,
  events:opportunities,eventConditionalTotal,monsterTotal,
  illustrativeCombined:monsterTotal+eventConditionalTotal,
  // Event eligibility, mutual exclusions, required tasks and stamina costs
  // are not verified, so the combined figure must NOT be labelled guaranteed.
  hasConditionalEvents:opportunities.length>0};
}

/**
 * The event subtotal is composed of distinct confirmed Calendar events.
 * Within each event, keep one qualifying award per recorded activity, rather
 * than stacking alternative ranking prizes or chest tiers. First place is
 * selected where rank is explicit; among tiers select the highest published N.
 * All event amounts remain conditional on satisfying the reward requirements.
 */
export function rewardQualification(record) {
 const ctx=record.context||{};
 const details=[ctx.detail,ctx.rewardActivity,ctx.subEvent,record.detail].filter(Boolean).join(" · ");
 const text=normalise(details);
 const rankLabel=String(ctx.rank||ctx.ranking||"").trim();
 const tierLabel=String(ctx.tier||"").trim();
 const rankTerms=/(?:rank(?:ing)?|place|position|leaderboard|top\s*\d+)/i.test(details);
 const ranking=rankTerms||Boolean(rankLabel);
 const first=/(?:^|[^a-z0-9])(?:rank\s*(?:1|one)|1st\s*place|first\s*place|top\s*1|no\.?\s*1)(?:$|[^a-z0-9])/i.test(details+" "+rankLabel)
   ||/^1(?:st)?$/i.test(rankLabel);
 const explicitlyLower=/(?:rank\s*(?:[2-9]|\d{2,})|(?:[2-9]|\d{2,})(?:nd|rd|th)\s*place|top\s*(?:[2-9]|\d{2,}))/i.test(details)
  || /^(?:[2-9]|\d{2,})(?:nd|rd|th)?$/i.test(rankLabel);
 const tierMatch=(details+" "+tierLabel).match(/\btier\s*(?:n\s*)?(\d+)\b/i);
 const tier=tierMatch?Number(tierMatch[1]):null;
 // An explicit ranking prize not shown as first place cannot be projected as
 // the requested first-place outcome.
 return {ranked:ranking,first:first&&!explicitlyLower,eligible:!ranking||(first&&!explicitlyLower),tier,
   activity:normalise([ctx.subEvent,ctx.activity,ctx.rewardActivity].filter(Boolean).join("|"))||"event"};
}
export function periodBreakdown(records,index,{stamina,days,start=dayUTC(),checkedDays=days}={}) {
 const budget=parseAmount(stamina),horizon=parseAmount(days),coverageRaw=parseAmount(checkedDays);
 if(budget===null||horizon===null||!Number.isInteger(horizon)||horizon<1||horizon>60||coverageRaw===null||coverageRaw<1)return null;
 const coverage=Math.min(horizon,coverageRaw);
 const all=(records||[]).filter(row=>row?.guaranteed>0);
 const dates=Array.from({length:coverage},(_,i)=>dayAdd(start,i));
 const eventGroups=new Map();
 for(const row of all.filter(x=>x.source==="events")) {
  const qual=rewardQualification(row);
  if(!qual.eligible)continue;
  const eventId=row.calendarIds?.[0]||"event:"+normalise(row.name);
  if(!eventGroups.has(eventId))eventGroups.set(eventId,{name:row.name,id:eventId,activities:new Map()});
  const group=eventGroups.get(eventId);
  const activityKey=qual.activity;
  if(!group.activities.has(activityKey))group.activities.set(activityKey,[]);
  group.activities.get(activityKey).push({...row,qualification:qual});
 }
 const events=[];
 for(const group of eventGroups.values()) {
  const validDates=dates.filter(date=>(index?.occurrences||[]).some(entry=>
   entry.kind==="Event"&&entry.date===date&&entry.status==="Confirmed"&&
   (entry.sourceId===group.id||normalise(entry.name)===normalise(group.name))
  ));
  if(!validDates.length)continue;
  const awards=[];
  for(const candidates of group.activities.values()) {
   const maxTier=Math.max(...candidates.map(x=>x.qualification.tier).filter(x=>x!==null),-1);
   const matching=candidates.filter(x=>maxTier<0||x.qualification.tier===null||x.qualification.tier===maxTier);
   matching.sort((a,b)=>b.guaranteed-a.guaranteed);
   if(matching.length)awards.push(matching[0]);
  }
  const perCompletion=awards.reduce((total,row)=>total+row.guaranteed,0);
  if(perCompletion<=0)continue;
  events.push({name:group.name,dates:validDates,occurrences:validDates.length,
    activities:awards.length,perCompletion,conditionalTotal:perCompletion*validDates.length,
    assumptions:"Complete the eligible activity; highest recorded tier and first place where ranking applies"});
 }
 events.sort((a,b)=>b.conditionalTotal-a.conditionalTotal||a.name.localeCompare(b.name));
 const eventTotal=events.reduce((total,row)=>total+row.conditionalTotal,0);
 // Each monster row is an ALTERNATIVE way to spend the same stamina.
 // Never add the top-ten yields together.
 const monsters=all.filter(x=>x.source!=="events"&&x.stamina>0)
  .map(row=>{
   const hunts=Math.floor(budget/row.stamina);
   return {name:row.name,level:row.level||row.context?.level||"",
    staminaPerKill:row.stamina,staminaUsed:hunts*row.stamina,staminaRemaining:budget-hunts*row.stamina,
    kills:hunts,perKill:row.guaranteed,total:hunts*row.guaranteed,
    source:row.source};
  }).sort((a,b)=>b.total-a.total||b.perKill/b.staminaPerKill-a.perKill/a.staminaPerKill||a.name.localeCompare(b.name));
 const unique=new Map();
 for(const monster of monsters){
  const key=[monster.source,normalise(monster.name),normalise(monster.level)].join("|");
  if(!unique.has(key))unique.set(key,monster);
 }
 const topMonsters=[...unique.values()].slice(0,10);
 return {days:horizon,checkedDays:coverage,complete:coverage===horizon,stamina:budget,
   events,eventTotal,monsters:topMonsters,topMonster:topMonsters[0]||null};
}
