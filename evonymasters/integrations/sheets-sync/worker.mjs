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
  events: ["LOCATION","EVENT","RECURRANCE","FEQUENCY","EVENT NAME","SUB EVENT","ACTIVITY TYPE","ITEM AVAILABILITY","STAMINA","DETAIL","LEVEL","ITEM","QUANTITY","GENERAL","CASTLE"],
  monsters: ["Monster Type","Monster Level","Monster Name","Power","Stamina","Event","Reward Item (in-game)","Quantity","Drop Classification"],
  boxes: ["Box Name","Level","Reward Item (in-game)","Quantity","Drop Classification","Source","Notes"]
};
const asNumber = x => { const t = clean(x).replace(/,/g, ""); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
function convertTable(table, required, headerRow) {
  if (!Array.isArray(table) || table.length < headerRow || table.length > 15000) throw Error("Invalid tab rows");
  const heads = table[headerRow - 1].map(x => clean(x).toLowerCase());
  const cols = required.map(name => heads.indexOf(name.toLowerCase()));
  if (cols.some(i => i < 0)) throw Error("Missing expected columns: " + required.filter((_,i) => cols[i] < 0).join(", "));
  return table.slice(headerRow).map((row, i) => ({
    sheetRow: i + headerRow + 1,
    fields: Object.fromEntries(required.map((name,j) => [name, clean(row[cols[j]])]))
  })).filter(x => Object.values(x.fields).some(Boolean));
}
function parseSnapshot(raw) {
  if (!raw || raw.version !== 1 || !raw.tabs || typeof raw.tabs !== "object") throw Error("Unsupported payload version");
  const events = convertTable(raw.tabs.events, fields.events, 2);
  const monsters = convertTable(raw.tabs.monsters, fields.monsters, 1);
  const boxes = convertTable(raw.tabs.boxes, fields.boxes, 2);
  for (const r of monsters) if (!r.fields["Monster Name"] || !r.fields["Reward Item (in-game)"]) throw Error("Incomplete monster row " + r.sheetRow);
  for (const r of boxes) if (!r.fields["Box Name"] || !r.fields["Reward Item (in-game)"]) throw Error("Incomplete box row " + r.sheetRow);
  for (const r of events) if (!r.fields.ITEM || !r.fields["EVENT NAME"]) throw Error("Incomplete event row " + r.sheetRow);
  return {version:1, importedAt:new Date().toISOString(), counts:{events:events.length,monsters:monsters.length,boxes:boxes.length}, events, monsters, boxes};
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
function search(snapshot, query) {
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
  for(const entry of snapshot.monsters){
    const row=entry.fields;
    add("monster",row,row["Reward Item (in-game)"],row["Drop Classification"],[row["Reward Item (in-game)"]],norm(row["Monster Name"]).includes(q));
    if(found.length>=50)break;
  }
  if(found.length<50)for(const entry of snapshot.events) {
    const row=entry.fields;add("event",row,row.ITEM,"Unspecified",[row.ITEM],norm(row["EVENT NAME"]).includes(q));
    if(found.length>=50)break;
  }
  return found.slice(0,30);
}
export default {
 async fetch(request, env) {
  const url=new URL(request.url);
  const origin=request.headers.get("origin")||"";
  if(url.pathname==="/v1/search" && request.method==="OPTIONS") {
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
  if(url.pathname==="/v1/search"&&request.method==="GET"){
    const q=clean(url.searchParams.get("q"));
    if(q.length<3||q.length>100)return reply({error:"Query must be 3–100 characters"},400,publicHeaders(origin));
    const raw=await env.DATA.get("latest");
    if(!raw)return reply({error:"No validated data available"},503,publicHeaders(origin));
    const snapshot=JSON.parse(raw);
    return reply({results:search(snapshot,q),updatedAt:snapshot.importedAt},200,publicHeaders(origin));
  }
  return reply({error:"Not found"},404);
 }
};
