// Reward Planner calculation primitives. No guessed drop rates or chest contents.
export const RESOURCE_TYPES = ["Food","Wood","Stone","Ore"];
export const MILLION = 1000000;
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
  const resource=RESOURCE_TYPES.find(type=>normalise(type)===key || (type==="Wood"&&key==="lumber"));
  if(resource)return Object.fromEntries(RESOURCE_TYPES.map(type=>[type,type===resource?n:0]));
  return null;
}
export function valueFor(item,quantity,target) {
  const resources=resourcesFor(item,quantity);
  if(target==="Combined Resources")return resources?Object.values(resources).reduce((s,n)=>s+n,0):0;
  if(RESOURCE_TYPES.includes(target))return resources?resources[target]:0;
  return normalise(item)===normalise(target)?parseAmount(quantity)??0:0;
}
export function dayUTC(now=new Date()) { return now.toISOString().slice(0,10); }
export function dayAdd(day,delta) {return new Date(Date.parse(day+"T00:00:00Z")+delta*86400000).toISOString().slice(0,10);}
export function liveIndex(occurrences, day=dayUTC()) {
  const days=new Map(),today=new Set(),families=new Set();
  for(const event of occurrences) {
    if(!event || !event.date || !event.name || !["Confirmed","Tentative"].includes(event.status))continue;
    const name=normalise(event.name),kind=event.kind;
    const key=kind+"|"+name;
    if(!days.has(key))days.set(key,new Set());
    if(event.family)families.add(key);
    days.get(key).add(event.date);
    if(event.date===day)today.add(key);
  }
  return {days,today,families};
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
  if(!directLive && !familyLive)return null;
  // Search result nested paths describe potential box contents, not an owned chest.
  // Never multiply nested rewards without verified chest mechanics.
  const rewards=(row.items||[])
    .map(item=>({...item,value:valueFor(item.item,item.quantity,target),
      classification:(item.route||[]).length>1?"Possible":item.classification}))
    .filter(item=>item.value>0 && ["Guaranteed","Possible"].includes(item.classification));
  if(!rewards.length)return null;
  const guaranteed=rewards.filter(x=>x.classification==="Guaranteed").reduce((s,x)=>s+x.value,0);
  const possible=rewards.filter(x=>x.classification==="Possible").reduce((s,x)=>s+x.value,0);
  const stamina=parseAmount(row.context?.stamina);
  return {id:row.source+"|"+row.title+"|"+JSON.stringify(row.context||{}),name:row.title,source:row.source,frequency:row.context?.frequency||"",detail:row.note||"",stamina,guaranteed,possible,rewards};
}
export function rankRecords(records) {
  return [...records].sort((a,b)=> {
    const weight=x=>x.guaranteed>0?0:1;
    return weight(a)-weight(b) ||
      (b.guaranteed/Math.max(1,b.stamina||1))-(a.guaranteed/Math.max(1,a.stamina||1)) ||
      (b.possible/Math.max(1,b.stamina||1))-(a.possible/Math.max(1,a.stamina||1)) ||
      a.name.localeCompare(b.name);
  });
}
export function plan(records,{target,quantity=null,stamina=null,days=null}={}) {
  const amount=parseAmount(quantity),budget=parseAmount(stamina),horizon=parseAmount(days);
  const events=rankRecords(records.filter(x=>x.source==="events"));
  const monsters=rankRecords(records.filter(x=>x.source!=="events"&&x.stamina>0));
  let remaining=budget===null?null:budget,guaranteed=0,possible=0;
  const allocation=[];
  for(const monster of monsters) {
    if(remaining===null)break;
    const hunts=Math.floor(remaining/monster.stamina);
    if(hunts<=0)continue;
    const limited=hunts;remaining-=limited*monster.stamina;
    allocation.push({...monster,hunts:limited,totalStamina:limited*monster.stamina,guaranteedTotal:limited*monster.guaranteed,possibleTotal:limited*monster.possible});
    guaranteed+=limited*monster.guaranteed;
    possible+=limited*monster.possible;
    // Allocate all to the best qualifying monster. Other options remain visible separately.
    break;
  }
  return {target,quantity:amount,stamina:budget,days:horizon,events,monsters,allocation,monsterGuaranteed:guaranteed,monsterPossible:possible,staminaRemaining:remaining,\n    suggestedGuaranteedQuantity:budget===null?null:guaranteed, suggestedConditionalQuantity:budget===null?null:guaranteed+possible,
    dailyGoal:amount!==null&&horizon?Math.ceil(amount/horizon):null,
    warning:"Only verified LIVE sources are shown. Event milestones are not automatically counted as earned; possible rewards have unknown drop rates."};
}
