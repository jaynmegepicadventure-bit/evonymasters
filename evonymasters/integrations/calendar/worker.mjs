// Separate EvonyMasters calendar Worker. Bind CALENDAR KV and ADMIN_EMAILS.
// Protect /admin* and /api/admin/* using Cloudflare Access. Admin actions also
// require ctx.access and an exact email allowlist, even if Access is misconfigured.
// Bulk calendar schedules for the current Events and Monster catalog.
// Keep admin routes behind Cloudflare Access and an explicit email allowlist.
const KEY="evonymasters:schedules:v2", SITE="https://evonymasters.jaynmegepicadventure.workers.dev";
const CATALOG_URL="https://evonymasters-sheet-sync.jaynmegepicadventure.workers.dev/v4/calendar/catalog";
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const respond=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...HEADERS,...headers}});
const txt=x=>String(x??"").trim();
const ds=/^\d{4}-\d{2}-\d{2}$/,ts=/^([01]\d|2[0-3]):[0-5]\d$/;
const validDate=s=>ds.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const day=s=>new Date(s+"T00:00:00Z"),date=d=>d.toISOString().slice(0,10),plus=(d,n)=>new Date(d.getTime()+n*86400000);
const sort=(a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
async function read(env){if(!env.CALENDAR)throw Error("Missing CALENDAR KV");const raw=await env.CALENDAR.get(KEY);const rows=raw?JSON.parse(raw):[];if(!Array.isArray(rows))throw Error("Corrupt schedule data");return rows;}
async function write(env,rows){await env.CALENDAR.put(KEY,JSON.stringify(rows));}
async function catalog(env){
 const response=env.CATALOG_SERVICE?await env.CATALOG_SERVICE.fetch(new Request(CATALOG_URL)):await fetch(txt(env.CATALOG_URL)||CATALOG_URL);
 if(!response.ok)throw Error("Reward catalog unavailable: deploy updated sheet-sync Worker");
 const data=await response.json();if(!Array.isArray(data.entries))throw Error("Invalid reward catalog");
 return data.entries;
}
async function authorized(env,ctx){
 if(!ctx?.access||typeof ctx.access.getIdentity!=="function")return null;
 const permitted=txt(env.ADMIN_EMAILS).toLowerCase().split(",").map(x=>x.trim()).filter(Boolean);
 if(!permitted.length)return null;
 try{const identity=await ctx.access.getIdentity(),email=txt(identity?.email).toLowerCase();return permitted.includes(email)?email:null;}catch{return null;}
}
async function bodyJSON(req){
 if(!req.headers.get("content-type")?.toLowerCase().includes("application/json"))throw Error("Expected JSON");
 if(Number(req.headers.get("content-length")||0)>25000)throw Error("Payload too large");
 const value=await req.text();if(value.length>25000)throw Error("Payload too large");return JSON.parse(value);
}
const ruleTypes=new Set(["dates","range","daily","weekly","interval","ongoing","always"]);
function validate(input,entries,existing){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid schedule");
 const rule=txt(input.rule),status=txt(input.status||"Confirmed");
 if(!ruleTypes.has(rule)||!["Confirmed","Tentative"].includes(status))throw Error("Choose a valid schedule and status");
 if(input.published!==undefined&&typeof input.published!=="boolean")throw Error("Published must be boolean");
 if(input.paused!==undefined&&typeof input.paused!=="boolean")throw Error("Paused must be boolean");
 if(!Array.isArray(input.targetIds)||!input.targetIds.length||input.targetIds.length>150||new Set(input.targetIds).size!==input.targetIds.length)throw Error("Select 1–150 distinct events or monsters");
 const index=new Map(entries.map(e=>[e.id,e])),targets=input.targetIds.map(id=>index.get(id));
 if(targets.some(t=>!t))throw Error("Some selected events or monsters are no longer in the catalog");
 const startDate=txt(input.startDate),endDate=txt(input.endDate),reviewAfter=txt(input.reviewAfter),name=txt(input.name);
 const selectedDates=Array.isArray(input.selectedDates)?input.selectedDates:[],excludedDates=Array.isArray(input.excludedDates)?input.excludedDates:[],daysOfWeek=Array.isArray(input.daysOfWeek)?input.daysOfWeek:[];
 const startTime=txt(input.startTime),endTime=txt(input.endTime),notes=txt(input.notes),sourceUrl=txt(input.sourceUrl),intervalDays=Number(input.intervalDays||1);
 if(!["always","dates"].includes(rule)&&!validDate(startDate))throw Error("Enter a valid start date");
 if(endDate&&!validDate(endDate)||startDate&&endDate&&endDate<startDate)throw Error("Invalid end date");
 if(rule==="range"&&!endDate)throw Error("Date range requires an end date");
 if(!["always","dates"].includes(rule)&&!endDate&&!validDate(reviewAfter))throw Error("Open-ended recurring events require a review date");
 if(reviewAfter&&(!validDate(reviewAfter)||startDate&&reviewAfter<startDate))throw Error("Invalid review date");
 if(startTime&&!ts.test(startTime)||endTime&&!ts.test(endTime)||startTime&&endTime&&endTime<startTime)throw Error("Enter valid UTC times, start before end");
 if(selectedDates.length>180||selectedDates.some(d=>typeof d!=="string"||!validDate(d))||rule==="dates"&&!selectedDates.length)throw Error("Choose valid individual dates");
 if(excludedDates.length>180||excludedDates.some(d=>typeof d!=="string"||!validDate(d)))throw Error("Invalid excluded dates");
 if(rule==="weekly"&&(!daysOfWeek.length||daysOfWeek.some(d=>!Number.isInteger(d)||d<0||d>6)))throw Error("Choose weekdays");
 if(rule==="interval"&&(!Number.isInteger(intervalDays)||intervalDays<2||intervalDays>365))throw Error("Interval must be between 2 and 365 days");
 if(name.length>150||notes.length>1000)throw Error("Title or notes too long");
 if(sourceUrl){let link;try{link=new URL(sourceUrl)}catch{throw Error("Invalid source URL")}if(link.protocol!=="https:"||sourceUrl.length>500)throw Error("Source URL must use HTTPS");}
 const unique=[...new Set(selectedDates)].sort();
 const title=name||targets.slice(0,2).map(t=>t.name).join(", ")+(targets.length>2?" +"+(targets.length-2):"");
 return {id:existing?.id||crypto.randomUUID(),name:title,targets:targets.map(t=>({id:t.id,name:t.name,kind:t.kind,level:t.level||"",family:!!t.family})),rule,
 startDate:rule==="always"?"":rule==="dates"?unique[0]:startDate,endDate:rule==="always"?"":endDate,
 selectedDates:rule==="dates"?unique:[],daysOfWeek:rule==="weekly"?[...new Set(daysOfWeek)].sort():[],
 intervalDays:rule==="interval"?intervalDays:1,excludedDates:[...new Set(excludedDates)].sort(),startTime,endTime,reviewAfter:rule==="always"?"":reviewAfter,
 status,notes,sourceUrl,published:input.published??existing?.published??false,paused:input.paused??existing?.paused??false,updatedAt:new Date().toISOString()};
}
function matches(s,dateValue){
 if(!s.published||s.paused||(s.excludedDates||[]).includes(dateValue))return false;
 if(s.rule==="always")return true;
 if(s.rule==="dates")return s.selectedDates.includes(dateValue);
 if(dateValue<s.startDate||s.endDate&&dateValue>s.endDate)return false;
 if(["range","daily","ongoing"].includes(s.rule))return true;
 if(s.rule==="weekly")return s.daysOfWeek.includes(day(dateValue).getUTCDay());
 if(s.rule==="interval")return (day(dateValue)-day(s.startDate))/86400000%s.intervalDays===0;
 return false;
}
function occurrences(rows,from,to,kind,includeAlways){
 const events=[];for(let d=day(from);d<=day(to);d=plus(d,1)){
  const dateValue=date(d);
  for(const s of rows){if(s.rule==="always"&&!includeAlways||!matches(s,dateValue))continue;
   for(const source of s.targets){
    if(kind!=="all"&&kind!==source.kind)continue;
    events.push({id:s.id+"|"+source.id+"|"+dateValue,scheduleId:s.id,sourceId:source.id,name:source.name,kind:source.kind,level:source.level||"",family:!!source.family,rule:s.rule,
      date:dateValue,startDate:s.startDate||"",endDate:s.endDate||"",startTime:s.startTime,endTime:s.endTime,status:s.status,notes:s.notes,sourceUrl:s.sourceUrl,reviewAfter:s.reviewAfter});
    if(events.length>=9000)return {events,truncated:true};
   }
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,undefined,{numeric:true}));
 return {events,truncated:false};
}
const adminHTML="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>EvonyMasters | Calendar Admin</title><style>\n:root{font-family:system-ui,sans-serif;background:#0b192a;color:#eef4fc}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:32px auto;padding:0 18px}h1,h2{color:#f5cd80}a{color:#f0c978}.panel{background:#172e47;border:1px solid #466079;border-radius:14px;padding:22px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700;color:#f3d49a;font-size:.86rem}input,select,textarea{padding:11px;border:1px solid #667c94;border-radius:8px;background:#fafafa;color:#13283d;font:inherit;width:100%}textarea{min-height:85px}button{padding:10px 15px;border:1px solid #f5d390;background:#efc271;color:#182638;border-radius:8px;font:inherit;font-weight:800;cursor:pointer}.secondary{background:#233b56;color:#f9e8c5}.danger{background:#68353e;border-color:#ba8391;color:white}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.entry{padding:14px;border:1px solid #42607b;border-radius:10px;margin:10px 0}.meta{color:#bfd0e0;font-size:.87rem;line-height:1.5}.status{color:#ffdf9e}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #ffce77;outline-offset:2px}@media(max-width:650px){.grid{grid-template-columns:1fr}}\n</style></head><body><main><a href=\"https://evonymasters.jaynmegepicadventure.workers.dev/calendar/\">← Public calendar</a><h1>Event Calendar Admin</h1><p>Manage confirmed dates in UTC. Drafts are private until you publish them. Enter each occurrence of a repeating event separately.</p><p class=\"status\" id=\"status\">Checking admin access…</p>\n<section class=\"panel\"><h2 id=\"heading\">Add calendar event</h2><form id=\"form\"><div class=\"grid\">\n<label>Event name<input id=\"name\" required maxlength=\"150\"></label><label>Category<select id=\"category\"><option>Event</option><option>Boss</option><option>Activity</option></select></label>\n<label>Start date (UTC)<input id=\"startDate\" type=\"date\" required></label><label>End date (UTC, inclusive)<input id=\"endDate\" type=\"date\" required></label>\n<label>Start time (UTC, optional)<input id=\"startTime\" type=\"time\"></label><label>End time (UTC, optional)<input id=\"endTime\" type=\"time\"></label>\n<label>Confidence<select id=\"statusValue\"><option>Confirmed</option><option>Tentative</option></select></label>\n<label>Visibility<select id=\"published\"><option value=\"false\">Draft</option><option value=\"true\">Published</option></select></label>\n<label>Source link (optional)<input id=\"sourceUrl\" type=\"url\" placeholder=\"https://…\"></label><label>Event key (optional)<input id=\"eventKey\" maxlength=\"150\"></label>\n</div><label style=\"margin-top:14px\">Notes<textarea id=\"notes\" maxlength=\"1000\"></textarea></label><div class=\"actions\"><button id=\"save\" type=\"submit\">Save event</button><button id=\"cancel\" class=\"secondary\" type=\"button\" hidden>Cancel edit</button></div></form></section>\n<section class=\"panel\"><h2>Calendar entries</h2><div id=\"entries\"></div></section></main><script>\n(()=>{\"use strict\";const $=id=>document.getElementById(id),form=$(\"form\");let entries=[],editing=null;\nasync function api(path,opt={}){const r=await fetch(path,{credentials:\"same-origin\",...opt});const b=await r.json();if(!r.ok)throw Error(b.error||\"Request failed\");return b}\nfunction message(s){$(\"status\").textContent=s}\nfunction reset(){form.reset();editing=null;$(\"heading\").textContent=\"Add calendar event\";$(\"save\").textContent=\"Save event\";$(\"cancel\").hidden=true}\nfunction button(title,cls,fn){const b=document.createElement(\"button\");b.type=\"button\";b.className=cls;b.textContent=title;b.addEventListener(\"click\",fn);return b}\nfunction render(){const box=$(\"entries\");box.replaceChildren();if(!entries.length){box.textContent=\"No calendar entries yet.\";return}\nfor(const e of entries){const row=document.createElement(\"article\");row.className=\"entry\";\nconst h=document.createElement(\"strong\");h.textContent=e.name;row.append(h);\nconst line=document.createElement(\"p\");line.className=\"meta\";line.textContent=e.startDate+(e.endDate!==e.startDate?\" to \"+e.endDate:\"\")+(e.startTime?\" · \"+e.startTime+\" UTC\":\"\")+\" · \"+e.category+\" · \"+e.status+\" · \"+(e.published?\"Published\":\"Draft\");row.append(line);\nif(e.notes){const n=document.createElement(\"p\");n.textContent=e.notes;row.append(n)}\nconst actions=document.createElement(\"div\");actions.className=\"actions\";\nactions.append(button(\"Edit\",\"secondary\",()=>{editing=e.id;for(const k of [\"name\",\"category\",\"startDate\",\"endDate\",\"startTime\",\"endTime\",\"notes\",\"sourceUrl\",\"eventKey\"])$(k).value=e[k]||\"\";$(\"statusValue\").value=e.status;$(\"published\").value=String(e.published);$(\"heading\").textContent=\"Editing \"+e.name;$(\"save\").textContent=\"Update event\";$(\"cancel\").hidden=false;window.scrollTo({top:0,behavior:\"smooth\"})}));\nactions.append(button(e.published?\"Unpublish\":\"Publish\",\"secondary\",async()=>{try{await save(e.id,{...e,published:!e.published})}catch(err){message(err.message)}}));\nactions.append(button(\"Delete\",\"danger\",async()=>{if(!confirm(\"Delete \"+e.name+\"?\"))return;try{await api(\"/api/admin/events/\"+e.id,{method:\"DELETE\"});reset();await load()}catch(err){message(err.message)}}));\nrow.append(actions);box.append(row)}}\nasync function load(){try{const b=await api(\"/api/admin/events\");entries=b.events;render();message(\"Signed in as \"+b.admin+\" · \"+entries.length+\" entries\")}catch(e){message(e.message)}}\nasync function save(id,data){const path=\"/api/admin/events\"+(id?\"/\"+id:\"\");await api(path,{method:id?\"PUT\":\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify(data)});reset();await load()}\n$(\"cancel\").addEventListener(\"click\",reset);\nform.addEventListener(\"submit\",async e=>{e.preventDefault();const data={};for(const k of [\"name\",\"category\",\"startDate\",\"endDate\",\"startTime\",\"endTime\",\"notes\",\"sourceUrl\",\"eventKey\"])data[k]=$(k).value;data.status=$(\"statusValue\").value;data.published=$(\"published\").value===\"true\";$(\"save\").disabled=true;try{await save(editing,data)}catch(err){message(err.message)}finally{$(\"save\").disabled=false}});\nload()})();\n</script></body></html>";

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname,origin=request.headers.get("origin")||"";
  const cors=origin===SITE?{"access-control-allow-origin":origin,"vary":"Origin"}:{};
  if(path==="/api/events"){
   if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"access-control-allow-methods":"GET, OPTIONS"}});
   if(request.method!=="GET")return respond({error:"Method not allowed"},405,cors);
   const from=txt(url.searchParams.get("from")),to=txt(url.searchParams.get("to")),kind=txt(url.searchParams.get("kind"))||"all",includeAlways=url.searchParams.get("includeAlways")==="true";
   if(!validDate(from)||!validDate(to)||to<from||day(to)-day(from)>93*86400000||!["all","Event","Boss","Event Boss","Regular Monster"].includes(kind))return respond({error:"Select a valid date range (up to 93 days) and category"},400,cors);
   try{return respond(occurrences((await read(env)).filter(s=>s.published),from,to,kind,includeAlways),200,cors)}
   catch{return respond({error:"Calendar unavailable"},503,cors)}
  }
  const protectedRoute=["/admin","/admin/","/api/admin/catalog","/api/admin/schedules"].includes(path)||/^\/api\/admin\/schedules\/[a-f0-9-]{36}$/i.test(path);
  if(!protectedRoute)return respond({error:"Not found"},404);
  const email=await authorized(env,ctx);if(!email)return respond({error:"Admin access denied. Configure Cloudflare Access and ADMIN_EMAILS."},403);
  if(path==="/admin"||path==="/admin/"){
   if(request.method!=="GET")return respond({error:"Method not allowed"},405);
   return new Response(adminHTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if(["POST","PUT","DELETE"].includes(request.method)&&origin!==url.origin)return respond({error:"Invalid write origin"},403);
  try{
   if(path==="/api/admin/catalog"&&request.method==="GET")return respond({entries:await catalog(env)});
   let rows=await read(env);
   if(path==="/api/admin/schedules"&&request.method==="GET")return respond({schedules:rows,admin:email});
   if(path==="/api/admin/schedules"&&request.method==="POST"){
    if(rows.length>=1500)return respond({error:"Schedule limit reached"},400);
    const input=await bodyJSON(request),schedule=validate(input,await catalog(env));
    if(input.replace===true){const ids=new Set(schedule.targets.map(t=>t.id));rows=rows.map(r=>({...r,targets:r.targets.filter(t=>!ids.has(t.id))})).filter(r=>r.targets.length);}
    rows.push(schedule);await write(env,rows);return respond({schedule},201);
   }
   const matched=path.match(/^\/api\/admin\/schedules\/([a-f0-9-]{36})$/i);
   if(!matched)return respond({error:"Not found"},404);
   const pos=rows.findIndex(r=>r.id===matched[1]);if(pos<0)return respond({error:"Schedule not found"},404);
   if(request.method==="PUT"){
    const input=await bodyJSON(request),schedule=validate(input,await catalog(env),rows[pos]);
    rows[pos]=schedule;
    if(input.replace===true){const ids=new Set(schedule.targets.map(t=>t.id));rows=rows.map(r=>r.id===schedule.id?r:{...r,targets:r.targets.filter(t=>!ids.has(t.id))}).filter(r=>r.targets.length);}
    await write(env,rows);return respond({schedule});
   }
   if(request.method==="DELETE"){rows.splice(pos,1);await write(env,rows);return respond({ok:true});}
   return respond({error:"Method not allowed"},405);
  }catch(e){return respond({error:txt(e.message).slice(0,150)},/catalog|unavailable|Missing/i.test(txt(e.message))?503:400);}
 }
};
