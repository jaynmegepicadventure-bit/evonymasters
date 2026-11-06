// Private Google Sheets push receiver + narrowly-scoped public search.
// Deployment: separate Cloudflare Worker, NOT the existing evonymasters Worker.
// Bind DATA (KV namespace) and SYNC_SECRET (Worker secret).
const MAX_BYTES = 5_000_000;
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const PUBLIC_ORIGINS = new Set(['https://evonymasters.jaynmegepicadventure.workers.dev']);
const publicHeaders = origin => PUBLIC_ORIGINS.has(origin) ? {'access-control-allow-origin':origin,'vary':'Origin'} : {};
const reply = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: {...HEADERS,...headers} });
const clean = x => String(x ?? "").trim();
const norm = x => clean(x).toLocaleLowerCase("en").replace(/\s+/g, " ");
const fields = {
  events: ["LOCATION","EVENT","RECURRANCE","FEQUENCY","EVENT NAME","SUB EVENT","ACTIVITY TYPE","ITEM AVAILABILITY","STAMINA","DETAIL","LEVEL","ITEM","QUANTITY","GENERAL","CASTLE","Drop Classification"],
  monsters: ["Monster Type","Monster Level","Monster Name","Power","Stamina","Event","Reward Item (in-game)","Quantity","Drop Classification"],
  boxes: ["Box Name","Level","Reward Item (in-game)","Quantity","Drop Classification","Source","Notes"]
};
const asNumber = x => { const t = clean(x).replace(/,/g, ""); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
function convertTable(table, required, headerRow, optional=[]) {
  if (!Array.isArray(table) || table.length < headerRow || table.length > 15000) throw Error("Invalid tab rows");
  const heads = table[headerRow - 1].map(x => clean(x).toLowerCase());
  const cols = required.map(name => heads.indexOf(name.toLowerCase()));
  if (cols.some((i,j) => i < 0 && !optional.includes(required[j]))) throw Error("Missing expected columns: " + required.filter((name,i) => cols[i] < 0 && !optional.includes(name)).join(", "));
  return table.slice(headerRow).map((row, i) => ({
    sheetRow: i + headerRow + 1,
    fields: Object.fromEntries(required.map((name,j) => [name, clean(row[cols[j]])]))
  })).filter(x => Object.values(x.fields).some(Boolean));
}
// Accept the original sheet contract and the revised EVONYMASTERS workbook.
// Normalize to the canonical field names used by the existing search API.
function parseSnapshot(raw) {
  if (!raw || raw.version !== 1 || !raw.tabs || typeof raw.tabs !== "object") throw Error("Unsupported payload version");
  const isRevised = raw.schema === "evonymasters-2026-v2";
  if (!isRevised) {
    const events = convertTable(raw.tabs.events, fields.events, 2, ["Drop Classification"]);
    const monsters = convertTable(raw.tabs.monsters, fields.monsters, 1);
    const boxes = convertTable(raw.tabs.boxes, fields.boxes, 2);
    for (const r of monsters) if (!r.fields["Monster Name"] || !r.fields["Reward Item (in-game)"]) throw Error("Incomplete monster row " + r.sheetRow);
    for (const r of boxes) if (!r.fields["Box Name"] || !r.fields["Reward Item (in-game)"]) throw Error("Incomplete box row " + r.sheetRow);
    for (const r of events) if (!r.fields.ITEM || !r.fields["EVENT NAME"]) throw Error("Incomplete event row " + r.sheetRow);
    return {version:1, importedAt:new Date().toISOString(), counts:{events:events.length,monsters:monsters.length,boxes:boxes.length}, events, monsters, boxes};
  }
  function records(table, name, required) {
    if (!Array.isArray(table) || table.length < 1 || table.length > 15000) throw Error("Invalid " + name + " rows");
    const header = table[0].map(x => norm(x));
    const indexes = Object.fromEntries(required.map(k => [k,header.indexOf(norm(k))]));
    for (const k of required) if(indexes[k]<0) throw Error("Missing "+name+" header: "+k);
    return table.slice(1).map((values,i) => ({
      sheetRow:i+2,
      values:Object.fromEntries(header.map((h,j)=>[h,clean(values[j])]))
    })).filter(({values})=>Object.values(values).some(Boolean));
  }
  const ev = records(raw.tabs.events, "EVENTS", ["EVENT NAME","EVENT LOCATION","EVENT SEC LOCATION","FREQUENCY","PARTICIPATION","REWARD METHOD","DROP CLASSIFICATION","ITEM","QUANTITY"]);
  const mo = records(raw.tabs.monsters, "MONSTER", ["MONSTER NAME","MONSTER LEVEL","MONSGTER TYPE","ITEM","QUANTITY","DROP CLASSIFICATION"]);
  const bx = records(raw.tabs.boxes, "IN THE BOXES", ["CHEST NAME","TIER","DROP CLASSIFICATION","ITEM","QUANTITY"]);
  const value=(v,k)=>v[norm(k)]||"";
  const events=ev.filter(r=>value(r.values,"EVENT NAME")&&value(r.values,"ITEM")).map(({sheetRow,values:v})=>({
    sheetRow,fields:{
      "EVENT NAME":value(v,"EVENT NAME"),"LOCATION":value(v,"EVENT LOCATION"),
      "EVENT":value(v,"EVENT NAME"),"SUB EVENT":value(v,"EVENT SEC LOCATION"),
      "FEQUENCY":value(v,"FREQUENCY"),"RECURRANCE":"",
      "ACTIVITY TYPE":value(v,"PARTICIPATION"),"ITEM AVAILABILITY":value(v,"REWARD METHOD"),
      "STAMINA":value(v,"STAMINA"),"DETAIL":[value(v,"REWARD METHOD"),value(v,"RANKING TYPE"),value(v,"RANK"),value(v,"CHEST NAME")].filter(Boolean).join(" · "),
      "LEVEL":value(v,"RANK")||value(v,"TIER"),"ITEM":value(v,"ITEM"),"QUANTITY":value(v,"QUANTITY"),
      "GENERAL":value(v,"GENERAL"),"CASTLE":value(v,"CASTLE"),
      "Drop Classification":value(v,"DROP CLASSIFICATION")
    }
  }));
  const monsters=mo.filter(r=>value(r.values,"MONSTER NAME")&&value(r.values,"ITEM")).map(({sheetRow,values:v})=>({
    sheetRow,fields:{
      "Monster Name":value(v,"MONSTER NAME"),"Monster Level":value(v,"MONSTER LEVEL"),
      "Monster Type":value(v,"MONSGTER TYPE")||value(v,"MONSTER TYPE"),
      "Power":value(v,"POWER"),"Stamina":value(v,"STAMINA"),
      "Event":value(v,"EVENT NAME"),"Reward Item (in-game)":value(v,"ITEM"),
      "Quantity":value(v,"QUANTITY"),"Drop Classification":value(v,"DROP CLASSIFICATION")
    }
  }));
  const boxes=bx.filter(r=>value(r.values,"CHEST NAME")&&value(r.values,"ITEM")).map(({sheetRow,values:v})=>({
    sheetRow,fields:{
      "Box Name":value(v,"CHEST NAME"),"Level":value(v,"TIER"),
      "Reward Item (in-game)":value(v,"ITEM"),"Quantity":value(v,"QUANTITY"),
      "Drop Classification":value(v,"DROP CLASSIFICATION"),
      "Source":[value(v,"EVENT / BOSS NAME"),value(v,"ACTIVITY (EVENT/MONSTER)"),value(v,"PARTICIPATION")].filter(Boolean).join(" · "),
      "Notes":[value(v,"REWARD METHOD"),value(v,"RANKING TYPE"),value(v,"RANK"),value(v,"GEAR / BUFFS")].filter(Boolean).join(" · "),
      "Source Event":value(v,"EVENT / BOSS NAME"),
      "Source Kind":value(v,"ACTIVITY (EVENT/MONSTER)"),
      "Source Activity":value(v,"REWARD METHOD"),
      "Source Participation":value(v,"PARTICIPATION"),
      "Source Rank":value(v,"RANK"),
      "Source Ranking Type":value(v,"RANKING TYPE"),
      "Chest ID":value(v,"CHEST ID")
    }
  }));
  if (!events.length || !monsters.length || !boxes.length) throw Error("Revised workbook contains an empty reward tab");
  return {version:1, importedAt:new Date().toISOString(), counts:{events:events.length,monsters:monsters.length,boxes:boxes.length}, events,monsters,boxes};
}

async function validHmac(secret, stamp, body, signature) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(stamp + "." + body));
  const digest = [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
  // constant-time comparison of hex strings
  let diff = 0; for (let i = 0; i < 64; i++) diff |= digest.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}
const trimRow = (source, row, item, classification, route, quantity) => ({
  source, name: clean(source==="monster" ? row["Monster Name"] : source==="event" ? row["EVENT NAME"] : row["Box Name"]),
  item, quantity: clean(quantity ?? row.Quantity ?? row.QUANTITY), classification:clean(classification), route,
  level: clean(row["Monster Level"] ?? row.LEVEL ?? row.Level), event:clean(row.Event ?? row.EVENT),
  monsterType: clean(row["Monster Type"]), stamina: clean(row.Stamina ?? row.STAMINA),
});
function search(snapshot, query, sourceFilter = "", monsterType = "") {
  const q=norm(query); const found=[];const boxLookup=new Map();
  for(const entry of snapshot.boxes){const key=norm(entry.fields["Box Name"]);if(!boxLookup.has(key))boxLookup.set(key,[]);boxLookup.get(key).push(entry.fields);}
  function expand(name, classification, path, depth, seen) {
    if (depth > 8) return [];
    const key=norm(name); if(seen.has(key))return [];
    const result=[];const next=new Set([...seen,key]);
    for(const entry of boxLookup.get(key)||[]) {
      const child=entry["Reward Item (in-game)"];
      const category = clean(classification).toLowerCase()==="guaranteed" && clean(entry["Drop Classification"]).toLowerCase()==="guaranteed" ? "Guaranteed" : "Possible";
      if(norm(child).includes(q))result.push({item:child,quantity:entry.Quantity,classification:category,route:[...path,child]});
      result.push(...expand(child,category,[...path,child],depth+1,next));
      if (result.length>100) break;
    }
    return result;
  }
  function add(source, row, item, classification, valueRoute, matched) {
    const direct=norm(item).includes(q)||matched;
    if(direct)found.push(trimRow(source,row,item,classification,valueRoute));
    if(found.length>=50)return;
    for(const child of expand(item,classification,valueRoute,0,new Set())) {
      if(!norm(child.item).includes(q))continue;
      found.push(trimRow(source,row,child.item,child.classification,child.route,child.quantity));
      if(found.length>=50)break;
    }
  }
  if(sourceFilter !== "event") for(const entry of snapshot.monsters){
    const row=entry.fields;
    if(monsterType && norm(row["Monster Type"]) !== norm(monsterType)) continue;
    add("monster",row,row["Reward Item (in-game)"],row["Drop Classification"],[row["Reward Item (in-game)"]],norm(row["Monster Name"]).includes(q));
    if(found.length>=50)break;
  }
  if(sourceFilter !== "monster" && found.length<50)for(const entry of snapshot.events) {
    const row=entry.fields;add("event",row,row.ITEM,"Unspecified",[row.ITEM],norm(row["EVENT NAME"]).includes(q));
    if(found.length>=50)break;
  }
  return found.slice(0,30);
}

// V3: query all matched sources, aggregate quantities and sort before pagination.
// The master spreadsheet remains private, and no bulk-download endpoint is provided.
const validTypes = new Set(["all","events","tasks","bosses","all-bosses","regular","event-bosses","boxes"]);
const validSorts = new Set(["suggested","source","type","quantity","frequency","chance","notes"]);
const normalizeDrop = value => {
  const v=norm(value);
  if(v==="guaranteed")return "Guaranteed";
  if(v==="redeem")return "Redeem";
  if(v==="possible"||v==="chance"||v==="random")return "Possible";
  return "Unspecified";
};
function queryScore(name, q){
  const n=norm(name);
  if(n===q)return 0;
  if(n.startsWith(q))return 1;
  if(n.includes(q))return 2;
  return -1;
}
const numericQuantity = raw => {
  const n=clean(raw).replace(/,/g,"");
  return /^\d+(?:\.\d+)?$/.test(n) ? Number(n) : null;
};
const taskEvent = row => /\b(task|tasks|quest|quests|daily activit(?:y|ies))\b/i.test(
  [row["EVENT NAME"],row["SUB EVENT"],row.DETAIL,row["ACTIVITY TYPE"]].join(" ")
);
function groupSearch(snapshot, {query,type="all",drop="all",page=0,sort="suggested",direction="asc",activity="all"}){
  const q=norm(query), grouped=new Map(), boxMap=new Map();
  for(const box of snapshot.boxes){
    const r=box.fields, id=norm(r["Box Name"]);
    if(!boxMap.has(id))boxMap.set(id,[]);
    boxMap.get(id).push(r);
  }
  function descendants(name,classification,path,visited,depth){
    if(depth>7)return [];
    const id=norm(name);if(visited.has(id))return [];
    const following=new Set([...visited,id]),result=[];
    for(const row of boxMap.get(id)||[]){
      const item=row["Reward Item (in-game)"], childDrop=normalizeDrop(row["Drop Classification"]);
      const effectiveDrop=classification==="Possible" ? "Possible" : classification==="Unspecified" ? "Unspecified" : childDrop;
      const child={item,quantity:row.Quantity,classification:effectiveDrop,route:[...path,item],details:{boxName:name,boxLevel:row.Level,boxSource:row.Source,boxNotes:row.Notes}};
      result.push(child);
      result.push(...descendants(item,effectiveDrop,child.route,following,depth+1));
      if(result.length>200)break;
    }
    return result;
  }
  function add(source,key,title,context,reward){
    if(drop!=="all"&&reward.classification!==drop)return;
    const score=queryScore(reward.item,q), titleScore=queryScore(title,q);
    if(score<0&&titleScore<0)return;
    const id=source+":"+key;
    let g=grouped.get(id);
    if(!g){g={source,title,context,items:[],score:99,matchingRewards:0};grouped.set(id,g);}
    const itemKey=[reward.item,reward.quantity,reward.classification,reward.route.join(">"),JSON.stringify(reward.details||{})].join("|").toLowerCase();
    if(!g._seen)g._seen=new Set();
    if(g._seen.has(itemKey))return;
    g._seen.add(itemKey);g.matchingRewards++;
    // Keep a bounded detail list, but quantity aggregation includes all distinct matches.
    if(g.items.length<12)g.items.push(reward);
    if(!g._quantities)g._quantities=new Set();
    const n=numericQuantity(reward.quantity);
    if(n!==null)g._quantities.add(n);
    if(!g._classes)g._classes=new Set();
    g._classes.add(reward.classification);
    g.score=Math.min(g.score,score>=0?score:3+titleScore);
  }
  if(["all","bosses","all-bosses","regular","event-bosses"].includes(type)){
    for(const {fields:r} of snapshot.monsters){
      const mt=norm(r["Monster Type"]);
      const classification=mt==="regular"?"regular":mt==="event"?"event-bosses":"bosses";
      if(type!=="all"&&type!==classification&&!(type==="all-bosses"&&["bosses","event-bosses"].includes(classification)))continue;
      const name=r["Monster Name"], id=[mt,norm(name),norm(r["Monster Level"]),norm(r.Event)].join("|");
      const context={level:r["Monster Level"],stamina:r.Stamina,event:r.Event,monsterType:r["Monster Type"],power:r.Power};
      const direct={item:r["Reward Item (in-game)"],quantity:r.Quantity,classification:normalizeDrop(r["Drop Classification"]),route:[r["Reward Item (in-game)"]]};
      add(classification,id,name,context,direct);
      for(const child of descendants(direct.item,direct.classification,direct.route,new Set(),0))add(classification,id,name,context,child);
    }
  }
  if(["all","events","tasks"].includes(type)){
    for(const {fields:r} of snapshot.events){
      const kind=taskEvent(r)?"tasks":"events";
      if(type!=="all"&&type!==kind)continue;
      if(activity!=="all" && (activity==="alliance"?!/alliance/i.test(r["ACTIVITY TYPE"]):!/personal/i.test(r["ACTIVITY TYPE"])))continue;
      const title=r["EVENT NAME"],id=[norm(title),norm(r["SUB EVENT"]),norm(r.DETAIL),norm(r["ACTIVITY TYPE"])].join("|");
      const context={subEvent:r["SUB EVENT"],activity:r["ACTIVITY TYPE"],frequency:r.FEQUENCY,recurrence:r.RECURRANCE,detail:r.DETAIL,location:r.LOCATION,event:r.EVENT,level:r.LEVEL,stamina:r.STAMINA,availability:r["ITEM AVAILABILITY"],general:r.GENERAL,castle:r.CASTLE};
      const reward={item:r.ITEM,quantity:r.QUANTITY,classification:normalizeDrop(r["Drop Classification"]),route:[r.ITEM],details:{location:r.LOCATION,event:r.EVENT,subEvent:r["SUB EVENT"],activity:r["ACTIVITY TYPE"],frequency:r.FEQUENCY,recurrence:r.RECURRANCE,detail:r.DETAIL,level:r.LEVEL,stamina:r.STAMINA,availability:r["ITEM AVAILABILITY"],general:r.GENERAL,castle:r.CASTLE}};
      add(kind,id,title,context,reward);
      for(const child of descendants(reward.item,reward.classification,reward.route,new Set(),0))add(kind,id,title,context,child);
    }
  }
  if(type==="all"||type==="boxes"){
    for(const [id,entries] of boxMap){
      const title=entries[0]["Box Name"], context={sourceNote:entries[0].Source};
      for(const row of entries){
        const reward={item:row["Reward Item (in-game)"],quantity:row.Quantity,classification:normalizeDrop(row["Drop Classification"]),route:[title,row["Reward Item (in-game)"]],details:{boxName:title,boxLevel:row.Level,boxSource:row.Source,boxNotes:row.Notes}};
        add("boxes",id,title,context,reward);
        for(const child of descendants(reward.item,reward.classification,reward.route,new Set([id]),0))add("boxes",id,title,context,child);
      }
    }
  }
  const sourcePriority={tasks:0,events:1,bosses:2,"event-bosses":3,regular:4,boxes:5};
  const chancePriority={Guaranteed:0,Redeem:1,Possible:2,Unspecified:3};
  const groups=[...grouped.values()].map(g=>{
    const quantities=[...(g._quantities||[])].sort((a,b)=>a-b);
    const classes=[...(g._classes||[])];
    // A range indicates recorded alternatives, NOT a sum or promised minimum.
    const quantityDisplay=quantities.length===0?"Variable":quantities.length===1?quantities[0].toLocaleString("en-US"):quantities[0].toLocaleString("en-US")+"–"+quantities.at(-1).toLocaleString("en-US");
    const chance=classes.length===1?classes[0]:"Mixed";
    const frequency=clean(g.context.frequency||g.context.recurrence||"Not specified");
    const note=clean([g.context.subEvent,g.context.detail,g.context.sourceNote].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(" · "))
      || (g.source==="boxes"?"Box contents":g.source==="bosses"||g.source==="event-bosses"||g.source==="regular"?"Defeat monster":"Reward conditions vary");
    const { _seen,_quantities,_classes,...rest}=g;
    return {...rest,quantityDisplay,quantityMax:quantities.at(-1)??null,chance,frequency,note};
  });
  const collator=(a,b)=>a.localeCompare(b,"en",{numeric:true,sensitivity:"base"});
  const compare=(a,b)=>{
    switch(sort){
      case "source":return collator(a.title,b.title);
      case "type":return collator(a.source,b.source)||collator(a.title,b.title);
      case "quantity":{
        if(a.quantityMax===null||b.quantityMax===null)return a.quantityMax===null?(b.quantityMax===null?0:1):-1;
        return b.quantityMax-a.quantityMax||collator(a.title,b.title);
      }
      case "frequency":return collator(a.frequency,b.frequency)||collator(a.title,b.title);
      case "chance":return (chancePriority[a.chance]??3)-(chancePriority[b.chance]??3)||collator(a.title,b.title);
      case "notes":return collator(a.note,b.note)||collator(a.title,b.title);
      default:return a.score-b.score||sourcePriority[a.source]-sourcePriority[b.source]||collator(a.title,b.title);
    }
  };
  // Quantity descending and other headers ascending by default; flipping reverses results.
  groups.sort((a,b)=>direction==="desc"?-compare(a,b):compare(a,b));
  const LIMIT=15,offset=page*LIMIT;
  return {total:groups.length,page,hasMore:offset+LIMIT<groups.length,groups:groups.slice(offset,offset+LIMIT)};
}

function chestCatalog(snapshot){
  const byKey=new Map(),byName=new Map();
  const addSource=(chest,source)=>{
    const id=[source.type,source.name,source.subEvent||"",source.level||"",source.rank||"",source.activity||""].map(norm).join("|");
    if(!chest.sources.some(s=>s._id===id))chest.sources.push({_id:id,...source});
  };
  for(const {fields:r} of snapshot.boxes){
    const name=clean(r["Box Name"]),level=clean(r.Level),rank=clean(r["Source Rank"]);
    // Identically named ranking chests can carry different rewards at each rank.
    const sourceKind=norm(r["Source Kind"]),sourceName=clean(r["Source Event"]);
    // Keep similarly named event chests from unrelated events separate.
    const key=[norm(name),norm(level),norm(rank),sourceKind==="event"?norm(sourceName):""].join("|");
    if(!byKey.has(key))byKey.set(key,{id:encodeURIComponent(key),name,level,rank,items:[],sources:[],sourceNotes:[]});
    const chest=byKey.get(key);
    chest.items.push({item:r["Reward Item (in-game)"],quantity:r.Quantity,classification:normalizeDrop(r["Drop Classification"]),notes:r.Notes});
    if(clean(r.Source)&&!chest.sourceNotes.includes(clean(r.Source)))chest.sourceNotes.push(clean(r.Source));
    // Preserve the direct, explicit event or boss source from the revised workbook.
    if(sourceName)addSource(chest,{
      type:sourceKind==="boss"||sourceKind==="monster"?"Boss":"Event",name:sourceName,
      activity:clean(r["Source Activity"]),participation:clean(r["Source Participation"]),
      rankingType:clean(r["Source Ranking Type"]),rank,
      level:sourceKind==="boss"||sourceKind==="monster"?level:"",
      detail:clean(r.Notes)
    });
  }
  for(const chest of byKey.values()){
    const k=norm(chest.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(chest);
  }
  // Explicit chest awards supplement source metadata without mixing distinct ranks.
  for(const {fields:r} of snapshot.monsters){
    for(const chest of byName.get(norm(r["Reward Item (in-game)"]))||[]){
      const known=chest.sources.filter(s=>s.type==="Boss");
      if(known.length&&!known.some(s=>norm(s.name)===norm(r["Monster Name"])))continue;
      addSource(chest,{type:"Boss",name:r["Monster Name"],level:r["Monster Level"],event:r.Event,stamina:r.Stamina});
    }
  }
  for(const {fields:r} of snapshot.events){
    for(const chest of byName.get(norm(r.ITEM))||[]){
      const known=chest.sources.filter(s=>s.type==="Event");
      if(known.length&&!known.some(s=>norm(s.name)===norm(r["EVENT NAME"])))continue;
      if(chest.rank&&norm(chest.rank)!==norm(r.LEVEL))continue;
      addSource(chest,{type:"Event",name:r["EVENT NAME"],subEvent:r["SUB EVENT"],location:r.LOCATION,activity:r["ACTIVITY TYPE"],detail:r.DETAIL,rank:chest.rank});
    }
  }
  function nested(chest,seen,depth){
    if(depth>6||seen.has(chest.id))return [];
    const next=new Set([...seen,chest.id]),found=[];
    for(const item of chest.items){
      const childList=byName.get(norm(item.item))||[];
      // Do not imply that an ambiguous chest variant has deterministic contents.
      if(childList.length!==1)continue;
      for(const child of childList){
        for(const reward of child.items){
          const classification=item.classification==="Possible"?"Possible":item.classification==="Unspecified"?"Unspecified":reward.classification;
          found.push({...reward,classification,via:[chest.name,child.name]});
        }
        for(const reward of nested(child,next,depth+1))
          found.push({...reward,classification:item.classification==="Possible"?"Possible":item.classification==="Unspecified"?"Unspecified":reward.classification,via:[chest.name,...reward.via]});
        if(found.length>300)return found.slice(0,300);
      }
    }
    return found;
  }
  for(const chest of byKey.values())chest.nestedItems=nested(chest,new Set(),0);
  for(const chest of byKey.values())chest.sources=chest.sources.map(({_id,...rest})=>rest);
  return [...byKey.values()];
}
function chestSearch(snapshot,{q="",source="all",event="",participation="all",rank="",page=0}){
  const list=chestCatalog(snapshot);
  const matching=list.filter(c=>{
    const sources=c.sources;
    const hasSource=source==="all"||source==="unlinked"&&!sources.length
      ||source==="bosses"&&sources.some(s=>s.type==="Boss")
      ||source==="events"&&sources.some(s=>s.type==="Event")
      ||source==="activities"&&sources.some(s=>s.type==="Event"&&(s.activity||s.participation||s.subEvent||"").length>0);
    if(!hasSource)return false;
    const eventSources=sources.filter(s=>s.type==="Event");
    if(event&&!eventSources.some(s=>norm(s.name)===norm(event)))return false;
    if(participation!=="all"&&!eventSources.some(s=>norm(s.participation).includes(norm(participation))))return false;
    if(rank&&!eventSources.some(s=>norm(s.rank)===norm(rank)))return false;
    const query=norm(q);
    if(query&&!([c.name,c.level,c.rank,...sources.map(s=>s.name),...sources.map(s=>s.subEvent),...c.items.map(i=>i.item),...c.nestedItems.map(i=>i.item)].some(x=>norm(x).includes(query))))return false;
    return true;
  }).sort((a,b)=>a.name.localeCompare(b.name)||a.level.localeCompare(b.level)||a.rank.localeCompare(b.rank,undefined,{numeric:true}));
  const LIMIT=15,offset=page*LIMIT;
  return {total:matching.length,page,hasMore:offset+LIMIT<matching.length,
    chests:matching.slice(offset,offset+LIMIT).map(c=>({...c,items:c.items.slice(0,12),itemCount:c.items.length,nestedCount:c.nestedItems.length,sources:c.sources.slice(0,12)})),
    updatedAt:snapshot.importedAt};
}
function chestEvents(snapshot){
  const events=new Map();
  for(const chest of chestCatalog(snapshot))for(const source of chest.sources){
    if(source.type!=="Event")continue;
    const name=clean(source.name),key=norm(name);
    if(!events.has(key))events.set(key,{name,chests:new Set()});
    events.get(key).chests.add(chest.id);
  }
  return {events:[...events.values()].map(e=>({name:e.name,count:e.chests.size})).sort((a,b)=>a.name.localeCompare(b.name)),updatedAt:snapshot.importedAt};
}
function compareChests(snapshot,ids){
  const catalog=chestCatalog(snapshot),list=ids.map(id=>catalog.find(c=>c.id===id));
  if(list.some(c=>!c))return null;
  return {chests:list.map(c=>({id:c.id,name:c.name,level:c.level,rank:c.rank,items:c.items,nestedItems:c.nestedItems,sources:c.sources,sourceNotes:c.sourceNotes})),updatedAt:snapshot.importedAt};
}

function suggestedItems(snapshot, query){
  const q=norm(query);const options=new Map();
  const consider = name => {
    const score=queryScore(name,q);
    if(score<0)return;
    const key=norm(name);
    if(!options.has(key)||score<options.get(key).score)options.set(key,{name:clean(name),score});
  };
  for(const row of snapshot.monsters)consider(row.fields["Reward Item (in-game)"]);
  for(const row of snapshot.events)consider(row.fields.ITEM);
  for(const row of snapshot.boxes)consider(row.fields["Reward Item (in-game)"]);
  return [...options.values()].sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name)).slice(0,10).map(x=>x.name);
}

export default {
 async fetch(request, env) {
  const url=new URL(request.url);
  const origin=request.headers.get("origin")||"";
  if((url.pathname==="/v1/search"||url.pathname==="/v2/search"||url.pathname==="/v3/search"||url.pathname==="/v4/chests"||url.pathname==="/v4/chests/events"||url.pathname==="/v4/chests/compare"||url.pathname==="/v2/suggest") && request.method==="OPTIONS") {
    if(!PUBLIC_ORIGINS.has(origin)) return new Response(null,{status:403});
    return new Response(null,{status:204,headers:{...publicHeaders(origin),"access-control-allow-methods":"GET, OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"3600"}});
  }
  if(url.pathname==="/health" && request.method==="GET")return reply({status:"ok"});
  if(!env.DATA || !env.SYNC_SECRET)return reply({error:"Worker is not configured"},503);
  if(url.pathname==="/v1/sync" && request.method==="POST"){
    const stamp=request.headers.get("x-sync-timestamp")||"";
    const sig=request.headers.get("x-sync-signature")||"";
    const epoch=Number(stamp);
    if(!/^\d{10,13}$/.test(stamp)||!Number.isFinite(epoch)||Math.abs(Date.now()-epoch)>300000)return reply({error:"Invalid timestamp"},401);
    if(Number(request.headers.get("content-length")||0)>MAX_BYTES)return reply({error:"Payload too large"},413);
    const body=await request.text();
    if(new TextEncoder().encode(body).length>MAX_BYTES)return reply({error:"Payload too large"},413);
    if(!(await validHmac(env.SYNC_SECRET,stamp,body,sig)))return reply({error:"Unauthorized"},401);
    let snapshot;try{snapshot=parseSnapshot(JSON.parse(body));}catch(e){return reply({error:"Validation failed",detail:String(e.message).slice(0,160)},422);}
    await env.DATA.put("latest",JSON.stringify(snapshot));
    return reply({ok:true,counts:snapshot.counts});
  }
  if((url.pathname==="/v4/chests"||url.pathname==="/v4/chests/events"||url.pathname==="/v4/chests/compare") && request.method==="GET"){
    const raw=await env.DATA.get("latest");if(!raw)return reply({error:"No validated data available"},503,publicHeaders(origin));
    const snapshot=JSON.parse(raw);
    if(url.pathname==="/v4/chests/compare"){
      const ids=url.searchParams.getAll("id");
      if(!ids.length||ids.length>4||ids.some(id=>id.length>250)||new Set(ids).size!==ids.length)
        return reply({error:"Select between one and four distinct chests"},400,publicHeaders(origin));
      const compared=compareChests(snapshot,ids);
      return compared?reply(compared,200,publicHeaders(origin)):reply({error:"Chest not found"},404,publicHeaders(origin));
    }
    if(url.pathname==="/v4/chests/events")return reply(chestEvents(snapshot),200,publicHeaders(origin));
    const q=clean(url.searchParams.get("q")),source=clean(url.searchParams.get("source"))||"all",
      event=clean(url.searchParams.get("event")),participation=clean(url.searchParams.get("participation"))||"all",
      rank=clean(url.searchParams.get("rank")),page=Number(url.searchParams.get("page")||0);
    if(q.length>100||event.length>120||rank.length>50||!["all","bosses","events","activities","unlinked"].includes(source)||!["all","personal","alliance"].includes(participation)||!Number.isSafeInteger(page)||page<0||page>1000)
      return reply({error:"Invalid chest search parameters"},400,publicHeaders(origin));
    return reply(chestSearch(snapshot,{q,source,event,participation,rank,page}),200,publicHeaders(origin));
  }
  if(url.pathname==="/v3/search" && request.method==="GET"){
    const q=clean(url.searchParams.get("q"));
    const type=clean(url.searchParams.get("type"))||"all";
    const activity=clean(url.searchParams.get("activity"))||"all";
    const drop=clean(url.searchParams.get("drop"))||"all";
    const sort=clean(url.searchParams.get("sort"))||"suggested";
    const direction=clean(url.searchParams.get("direction"))||"asc";
    const page=Number(url.searchParams.get("page")||0);
    if(q.length<2||q.length>100||!validTypes.has(type)||!["all","alliance","personal"].includes(activity)||!["all","Guaranteed","Possible","Redeem","Unspecified"].includes(drop)||
       !validSorts.has(sort)||!["asc","desc"].includes(direction)||!Number.isSafeInteger(page)||page<0||page>1000)
      return reply({error:"Invalid search parameters"},400,publicHeaders(origin));
    const raw=await env.DATA.get("latest");
    if(!raw)return reply({error:"No validated data available"},503,publicHeaders(origin));
    const snapshot=JSON.parse(raw);
    return reply({...groupSearch(snapshot,{query:q,type,drop,page,sort,direction,activity}),updatedAt:snapshot.importedAt},200,publicHeaders(origin));
  }
  if((url.pathname==="/v2/search"||url.pathname==="/v2/suggest")&&request.method==="GET"){
    const q=clean(url.searchParams.get("q"));
    if(q.length<2||q.length>100)return reply({error:"Query must be 2–100 characters"},400,publicHeaders(origin));
    const raw=await env.DATA.get("latest");
    if(!raw)return reply({error:"No validated data available"},503,publicHeaders(origin));
    const snapshot=JSON.parse(raw);
    if(url.pathname==="/v2/suggest")return reply({items:suggestedItems(snapshot,q)},200,publicHeaders(origin));
    const type=clean(url.searchParams.get("type"))||"all";
    const drop=clean(url.searchParams.get("drop"))||"all";
    const page=Number(url.searchParams.get("page")||0);
    if(!validTypes.has(type)||!["all","Guaranteed","Possible","Unspecified"].includes(drop)||!Number.isSafeInteger(page)||page<0||page>1000)
      return reply({error:"Invalid filters"},400,publicHeaders(origin));
    return reply({...groupSearch(snapshot,{query:q,type,drop,page}),updatedAt:snapshot.importedAt},200,publicHeaders(origin));
  }
  if(url.pathname==="/v1/search"&&request.method==="GET"){
    const q=clean(url.searchParams.get("q"));
    if(q.length<3||q.length>100)return reply({error:"Query must be 3–100 characters"},400,publicHeaders(origin));
    const sourceFilter=clean(url.searchParams.get("source"));
    const monsterType=clean(url.searchParams.get("monsterType"));
    if(!["","event","monster"].includes(sourceFilter) || !["","Regular","Boss","Event"].includes(monsterType))return reply({error:"Invalid search filter"},400,publicHeaders(origin));
    const raw=await env.DATA.get("latest");
    if(!raw)return reply({error:"No validated data available"},503,publicHeaders(origin));
    const snapshot=JSON.parse(raw);
    return reply({results:search(snapshot,q,sourceFilter,monsterType),updatedAt:snapshot.importedAt},200,publicHeaders(origin));
  }
  return reply({error:"Not found"},404);
 }
};
