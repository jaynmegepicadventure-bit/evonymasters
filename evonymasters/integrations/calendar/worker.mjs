// Separate EvonyMasters calendar Worker. Bind CALENDAR KV and ADMIN_EMAILS.
// Protect /admin* and /api/admin/* using Cloudflare Access. Admin actions also
// require ctx.access and an exact email allowlist, even if Access is misconfigured.
const KEY="evonymasters:calendar:v1";
const ORIGIN="https://evonymasters.jaynmegepicadventure.workers.dev";
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const respond=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{...HEADERS,...headers}});
const txt=x=>String(x??"").trim();
const dates=/^\d{4}-\d{2}-\d{2}$/;
const times=/^([01]\d|2[0-3]):[0-5]\d$/;
const validDate=s=>dates.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const compare=(a,b)=>a.startDate.localeCompare(b.startDate)||a.startTime.localeCompare(b.startTime)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
async function read(env){if(!env.CALENDAR)throw Error("Missing CALENDAR KV");const raw=await env.CALENDAR.get(KEY);if(!raw)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error("Corrupt calendar");return rows}
async function write(env,rows){await env.CALENDAR.put(KEY,JSON.stringify(rows))}
function validate(obj,old){
 if(!obj||typeof obj!=="object"||Array.isArray(obj))throw Error("Invalid event record");
 const name=txt(obj.name),category=txt(obj.category||"Event"),status=txt(obj.status||"Confirmed");
 const startDate=txt(obj.startDate),endDate=txt(obj.endDate||startDate),startTime=txt(obj.startTime),endTime=txt(obj.endTime);
 const sourceUrl=txt(obj.sourceUrl),notes=txt(obj.notes),eventKey=txt(obj.eventKey);
 if(!name||name.length>150)throw Error("Enter an event name (max 150 characters)");
 if(!validDate(startDate)||!validDate(endDate)||endDate<startDate)throw Error("Enter valid start and end dates");
 if(startTime&&!times.test(startTime)||endTime&&!times.test(endTime))throw Error("Enter times as HH:MM UTC");
 if(startDate===endDate&&startTime&&endTime&&endTime<startTime)throw Error("End time precedes start time");
 if(!["Event","Boss","Activity"].includes(category)||!["Confirmed","Tentative"].includes(status))throw Error("Invalid category or confidence");
 if(notes.length>1000||eventKey.length>150)throw Error("Notes or event key too long");
 if(sourceUrl){let link;try{link=new URL(sourceUrl)}catch{throw Error("Invalid source link")}if(link.protocol!=="https:"||sourceUrl.length>500)throw Error("Source link must use HTTPS")}
 if(obj.published!==undefined&&typeof obj.published!=="boolean")throw Error("Published must be true or false");
 return {id:old?.id||crypto.randomUUID(),name,category,status,startDate,endDate,startTime,endTime,sourceUrl,notes,eventKey,published:obj.published??old?.published??false,updatedAt:new Date().toISOString()}
}
async function authorized(env,ctx){
 if(!ctx?.access||typeof ctx.access.getIdentity!=="function")return null;
 const permitted=txt(env.ADMIN_EMAILS).toLowerCase().split(",").map(x=>x.trim()).filter(Boolean);
 if(!permitted.length)return null;
 try{const person=await ctx.access.getIdentity(),email=txt(person?.email).toLowerCase();return permitted.includes(email)?email:null}catch{return null}
}
async function bodyJSON(req){
 if(Number(req.headers.get("content-length")||0)>12000)throw Error("Request too large");
 if(!req.headers.get("content-type")?.includes("application/json"))throw Error("Expected JSON");
 const source=await req.text();if(source.length>12000)throw Error("Request too large");
 return JSON.parse(source)
}

const adminHTML="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>EvonyMasters | Calendar Admin</title><style>\n:root{font-family:system-ui,sans-serif;background:#0b192a;color:#eef4fc}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:32px auto;padding:0 18px}h1,h2{color:#f5cd80}a{color:#f0c978}.panel{background:#172e47;border:1px solid #466079;border-radius:14px;padding:22px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700;color:#f3d49a;font-size:.86rem}input,select,textarea{padding:11px;border:1px solid #667c94;border-radius:8px;background:#fafafa;color:#13283d;font:inherit;width:100%}textarea{min-height:85px}button{padding:10px 15px;border:1px solid #f5d390;background:#efc271;color:#182638;border-radius:8px;font:inherit;font-weight:800;cursor:pointer}.secondary{background:#233b56;color:#f9e8c5}.danger{background:#68353e;border-color:#ba8391;color:white}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.entry{padding:14px;border:1px solid #42607b;border-radius:10px;margin:10px 0}.meta{color:#bfd0e0;font-size:.87rem;line-height:1.5}.status{color:#ffdf9e}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #ffce77;outline-offset:2px}@media(max-width:650px){.grid{grid-template-columns:1fr}}\n</style></head><body><main><a href=\"https://evonymasters.jaynmegepicadventure.workers.dev/calendar/\">← Public calendar</a><h1>Event Calendar Admin</h1><p>Manage confirmed dates in UTC. Drafts are private until you publish them. Enter each occurrence of a repeating event separately.</p><p class=\"status\" id=\"status\">Checking admin access…</p>\n<section class=\"panel\"><h2 id=\"heading\">Add calendar event</h2><form id=\"form\"><div class=\"grid\">\n<label>Event name<input id=\"name\" required maxlength=\"150\"></label><label>Category<select id=\"category\"><option>Event</option><option>Boss</option><option>Activity</option></select></label>\n<label>Start date (UTC)<input id=\"startDate\" type=\"date\" required></label><label>End date (UTC, inclusive)<input id=\"endDate\" type=\"date\" required></label>\n<label>Start time (UTC, optional)<input id=\"startTime\" type=\"time\"></label><label>End time (UTC, optional)<input id=\"endTime\" type=\"time\"></label>\n<label>Confidence<select id=\"statusValue\"><option>Confirmed</option><option>Tentative</option></select></label>\n<label>Visibility<select id=\"published\"><option value=\"false\">Draft</option><option value=\"true\">Published</option></select></label>\n<label>Source link (optional)<input id=\"sourceUrl\" type=\"url\" placeholder=\"https://…\"></label><label>Event key (optional)<input id=\"eventKey\" maxlength=\"150\"></label>\n</div><label style=\"margin-top:14px\">Notes<textarea id=\"notes\" maxlength=\"1000\"></textarea></label><div class=\"actions\"><button id=\"save\" type=\"submit\">Save event</button><button id=\"cancel\" class=\"secondary\" type=\"button\" hidden>Cancel edit</button></div></form></section>\n<section class=\"panel\"><h2>Calendar entries</h2><div id=\"entries\"></div></section></main><script>\n(()=>{\"use strict\";const $=id=>document.getElementById(id),form=$(\"form\");let entries=[],editing=null;\nasync function api(path,opt={}){const r=await fetch(path,{credentials:\"same-origin\",...opt});const b=await r.json();if(!r.ok)throw Error(b.error||\"Request failed\");return b}\nfunction message(s){$(\"status\").textContent=s}\nfunction reset(){form.reset();editing=null;$(\"heading\").textContent=\"Add calendar event\";$(\"save\").textContent=\"Save event\";$(\"cancel\").hidden=true}\nfunction button(title,cls,fn){const b=document.createElement(\"button\");b.type=\"button\";b.className=cls;b.textContent=title;b.addEventListener(\"click\",fn);return b}\nfunction render(){const box=$(\"entries\");box.replaceChildren();if(!entries.length){box.textContent=\"No calendar entries yet.\";return}\nfor(const e of entries){const row=document.createElement(\"article\");row.className=\"entry\";\nconst h=document.createElement(\"strong\");h.textContent=e.name;row.append(h);\nconst line=document.createElement(\"p\");line.className=\"meta\";line.textContent=e.startDate+(e.endDate!==e.startDate?\" to \"+e.endDate:\"\")+(e.startTime?\" · \"+e.startTime+\" UTC\":\"\")+\" · \"+e.category+\" · \"+e.status+\" · \"+(e.published?\"Published\":\"Draft\");row.append(line);\nif(e.notes){const n=document.createElement(\"p\");n.textContent=e.notes;row.append(n)}\nconst actions=document.createElement(\"div\");actions.className=\"actions\";\nactions.append(button(\"Edit\",\"secondary\",()=>{editing=e.id;for(const k of [\"name\",\"category\",\"startDate\",\"endDate\",\"startTime\",\"endTime\",\"notes\",\"sourceUrl\",\"eventKey\"])$(k).value=e[k]||\"\";$(\"statusValue\").value=e.status;$(\"published\").value=String(e.published);$(\"heading\").textContent=\"Editing \"+e.name;$(\"save\").textContent=\"Update event\";$(\"cancel\").hidden=false;window.scrollTo({top:0,behavior:\"smooth\"})}));\nactions.append(button(e.published?\"Unpublish\":\"Publish\",\"secondary\",async()=>{try{await save(e.id,{...e,published:!e.published})}catch(err){message(err.message)}}));\nactions.append(button(\"Delete\",\"danger\",async()=>{if(!confirm(\"Delete \"+e.name+\"?\"))return;try{await api(\"/api/admin/events/\"+e.id,{method:\"DELETE\"});reset();await load()}catch(err){message(err.message)}}));\nrow.append(actions);box.append(row)}}\nasync function load(){try{const b=await api(\"/api/admin/events\");entries=b.events;render();message(\"Signed in as \"+b.admin+\" · \"+entries.length+\" entries\")}catch(e){message(e.message)}}\nasync function save(id,data){const path=\"/api/admin/events\"+(id?\"/\"+id:\"\");await api(path,{method:id?\"PUT\":\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify(data)});reset();await load()}\n$(\"cancel\").addEventListener(\"click\",reset);\nform.addEventListener(\"submit\",async e=>{e.preventDefault();const data={};for(const k of [\"name\",\"category\",\"startDate\",\"endDate\",\"startTime\",\"endTime\",\"notes\",\"sourceUrl\",\"eventKey\"])data[k]=$(k).value;data.status=$(\"statusValue\").value;data.published=$(\"published\").value===\"true\";$(\"save\").disabled=true;try{await save(editing,data)}catch(err){message(err.message)}finally{$(\"save\").disabled=false}});\nload()})();\n</script></body></html>";

export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url),path=url.pathname,origin=req.headers.get("origin")||"";
  const cors=origin===ORIGIN?{"access-control-allow-origin":ORIGIN,"vary":"Origin"}:{};
  if(path==="/api/events"){
   if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"access-control-allow-methods":"GET, OPTIONS","access-control-allow-headers":"content-type"}});
   if(req.method!=="GET")return respond({error:"Method not allowed"},405,cors);
   try{const records=await read(env);return respond({events:records.filter(x=>x.published).sort(compare)},200,cors)}
   catch{return respond({error:"Calendar unavailable"},503,cors)}
  }
  if(!["/admin","/admin/","/api/admin/events"].includes(path)&&!/^\/api\/admin\/events\/[a-f0-9-]{36}$/i.test(path))return respond({error:"Not found"},404);
  const email=await authorized(env,ctx);if(!email)return respond({error:"Admin access denied. Configure Cloudflare Access and ADMIN_EMAILS."},403);
  if(path==="/admin"||path==="/admin/"){
   if(req.method!=="GET")return respond({error:"Method not allowed"},405);
   return new Response(adminHTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if(["POST","PUT","DELETE"].includes(req.method)&&origin!==url.origin)return respond({error:"Invalid write origin"},403);
  try{
   const records=await read(env);
   if(path==="/api/admin/events"&&req.method==="GET")return respond({events:records.sort(compare),admin:email});
   if(path==="/api/admin/events"&&req.method==="POST"){
    if(records.length>=1500)return respond({error:"Calendar is full"},400);
    let event;try{event=validate(await bodyJSON(req))}catch(e){return respond({error:e.message},400)}
    records.push(event);await write(env,records);return respond({event},201);
   }
   const found=path.match(/^\/api\/admin\/events\/([a-f0-9-]{36})$/i);
   if(!found)return respond({error:"Not found"},404);
   const i=records.findIndex(x=>x.id===found[1]);if(i<0)return respond({error:"Event not found"},404);
   if(req.method==="PUT"){
    let event;try{event=validate(await bodyJSON(req),records[i])}catch(e){return respond({error:e.message},400)}
    records[i]=event;await write(env,records);return respond({event});
   }
   if(req.method==="DELETE"){records.splice(i,1);await write(env,records);return respond({ok:true})}
   return respond({error:"Method not allowed"},405);
  }catch{return respond({error:"Calendar operation failed"},503)}
 }
};
