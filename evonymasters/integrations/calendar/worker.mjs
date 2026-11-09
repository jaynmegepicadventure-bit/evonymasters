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
 if(Number(req.headers.get("content-length")||0)>100000)throw Error("Payload too large");
 const value=await req.text();if(value.length>100000)throw Error("Payload too large");return JSON.parse(value);
}
const ruleTypes=new Set(["dates","range","daily","weekly","interval","ongoing","always","weekends","alternate-weekends"]);
function validate(input,entries,existing){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid schedule");
 const rule=txt(input.rule),status=txt(input.status||"Confirmed");
 if(!ruleTypes.has(rule)||!["Confirmed","Tentative"].includes(status))throw Error("Choose a valid schedule and status");
 if(input.published!==undefined&&typeof input.published!=="boolean")throw Error("Published must be boolean");
 if(input.paused!==undefined&&typeof input.paused!=="boolean")throw Error("Paused must be boolean");
 if(!Array.isArray(input.targetIds)||!input.targetIds.length||input.targetIds.length>1500||new Set(input.targetIds).size!==input.targetIds.length)throw Error("Select 1–1500 distinct events or monsters");
 const index=new Map(entries.map(e=>[e.id,e])),targets=input.targetIds.map(id=>index.get(id));
 if(targets.some(t=>!t))throw Error("Some selected events or monsters are no longer in the catalog");
 const startDate=txt(input.startDate),reviewAfter=txt(input.reviewAfter),name=txt(input.name);
 const selectedDates=Array.isArray(input.selectedDates)?input.selectedDates:[],legacyInterval=rule==="interval"&&!selectedDates.length&&existing?.rule==="interval"&&validDate(startDate),endDate=rule==="interval"&&!legacyInterval?"":txt(input.endDate),excludedDates=Array.isArray(input.excludedDates)?input.excludedDates:[],daysOfWeek=Array.isArray(input.daysOfWeek)?input.daysOfWeek:[];
 const startTime=txt(input.startTime),endTime=txt(input.endTime),notes=txt(input.notes),sourceUrl=txt(input.sourceUrl),intervalDays=Number(input.intervalDays||1);
 if(["range","ongoing","alternate-weekends"].includes(rule)&&!validDate(startDate))throw Error("Enter a valid start date");
 if(endDate&&!validDate(endDate)||startDate&&endDate&&endDate<startDate)throw Error("Invalid end date");
 if(rule==="range"&&!endDate)throw Error("Date range requires an end date");
 
 if(reviewAfter&&(!validDate(reviewAfter)||startDate&&reviewAfter<startDate))throw Error("Invalid review date");
 if(startTime&&!ts.test(startTime)||endTime&&!ts.test(endTime)||startTime&&endTime&&endTime<startTime)throw Error("Enter valid UTC times, start before end");
 if(selectedDates.length>180||selectedDates.some(d=>typeof d!=="string"||!validDate(d))||["dates","interval"].includes(rule)&&!selectedDates.length&&!legacyInterval)throw Error("Choose valid individual dates");
 if(excludedDates.length>180||excludedDates.some(d=>typeof d!=="string"||!validDate(d)))throw Error("Invalid excluded dates");
 if(rule==="alternate-weekends"&&day(startDate).getUTCDay()!==6)throw Error("Choose a Saturday as the first active weekend");
  if(rule==="weekly"&&(!daysOfWeek.length||daysOfWeek.some(d=>!Number.isInteger(d)||d<0||d>6)))throw Error("Choose weekdays");
 if(rule==="interval"&&(!Number.isInteger(intervalDays)||intervalDays<2||intervalDays>365))throw Error("Interval must be between 2 and 365 days");
 if(name.length>150||notes.length>1000)throw Error("Title or notes too long");
 if(sourceUrl){let link;try{link=new URL(sourceUrl)}catch{throw Error("Invalid source URL")}if(link.protocol!=="https:"||sourceUrl.length>500)throw Error("Source URL must use HTTPS");}
 const unique=[...new Set(selectedDates)].sort();
 const ruleNames={dates:"Specific dates",daily:"Every day",weekends:"Every weekend","alternate-weekends":"Alternate weekends",weekly:"Selected weekdays",interval:"Every "+intervalDays+" days"};
  const title=name||targets.slice(0,2).map(t=>t.name).join(", ")+(targets.length>2?" +"+(targets.length-2):"")+" · "+(ruleNames[rule]||rule);
 return {id:existing?.id||crypto.randomUUID(),name:title,targets:targets.map(t=>({id:t.id,name:t.name,kind:t.kind,level:t.level||"",family:!!t.family})),rule,
 startDate:rule==="always"||rule==="daily"||rule==="weekends"||rule==="weekly"?"":["dates","interval"].includes(rule)&&unique.length?unique[0]:startDate,endDate:rule==="always"||rule==="daily"||rule==="weekends"||rule==="weekly"||rule==="interval"&&!legacyInterval?"":endDate,
 selectedDates:["dates","interval"].includes(rule)?unique:[],daysOfWeek:rule==="weekly"?[...new Set(daysOfWeek)].sort():[],
 intervalDays:rule==="interval"?intervalDays:1,excludedDates:[...new Set(excludedDates)].sort(),startTime,endTime,reviewAfter:rule==="always"?"":reviewAfter,
 status,notes,sourceUrl,published:input.published??true,paused:input.paused??existing?.paused??false,updatedAt:new Date().toISOString()};
}
function matches(s,dateValue){
 if(!s.published||s.paused||(s.excludedDates||[]).includes(dateValue))return false;
 if(s.rule==="always")return true;
 if(s.rule==="dates")return s.selectedDates.includes(dateValue);
 if(dateValue<s.startDate||s.endDate&&dateValue>s.endDate)return false;
 if(["range","daily","ongoing"].includes(s.rule))return true;
  if(s.rule==="weekends")return [0,6].includes(day(dateValue).getUTCDay());
  if(s.rule==="alternate-weekends"){const delta=Math.floor((day(dateValue)-day(s.startDate))/86400000);return delta>=0&&(delta%14===0||delta%14===1);}
 if(s.rule==="weekly")return s.daysOfWeek.includes(day(dateValue).getUTCDay());
 if(s.rule==="interval"){const anchors=s.selectedDates?.length?s.selectedDates:[s.startDate];return anchors.some(anchor=>dateValue>=anchor&&((day(dateValue)-day(anchor))/86400000)%s.intervalDays===0);}
 return false;
}
function occurrences(rows,from,to,kind,includeAlways){
 const events=[];for(let d=day(from);d<=day(to);d=plus(d,1)){
  const dateValue=date(d);
  for(const s of rows){if(s.rule==="always"&&!includeAlways||!matches(s,dateValue))continue;
   for(const source of s.targets){
    if(kind!=="all"&&kind!==source.kind)continue;
    events.push({id:s.id+"|"+source.id+"|"+dateValue,scheduleId:s.id,sourceId:source.id,name:source.name,kind:source.kind,level:source.level||"",family:!!source.family,rule:s.rule,
      date:dateValue,startDate:s.startDate||"",endDate:s.endDate||"",startTime:s.startTime,endTime:s.endTime,status:s.reviewAfter&&dateValue>s.reviewAfter?"Needs Review":s.status,notes:s.notes,sourceUrl:s.sourceUrl,reviewAfter:s.reviewAfter});
    if(events.length>=9000)return {events,truncated:true};
   }
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,undefined,{numeric:true}));
 return {events,truncated:false};
}

// March preset calculator engine and workbook defaults. The public endpoint returns
// quantities only; editable percentages are exposed exclusively to authorized admins.
// March preset worksheet model, derived from the supplied "Troop Layers 2024.xlsx"
// March Layers sheet. Workbook has no T16 column, so T16 allocations are explicitly
// an extrapolation from the workbook's highest-tier (T15) share.
const TYPES=["Ranged","Cavalry","Ground","Siege"];
const PRESETS={
 ranged:{label:"Ranged",type:"Ranged",mode:"weighted",reserve:unlocked=>650000+10000*(hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")+hasTop(unlocked,"Siege")),withTop:[[15,15],[14,20],[13,30],[12,35]],withoutTop:[[14,20],[13,35],[12,45]],sample:7393200,source:"March Layers!D4:D16"},
 cavalry:{label:"Cavalry",type:"Cavalry",mode:"weighted",reserve:unlocked=>680000+10000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Ground")+hasTop(unlocked,"Siege")),withTop:[[15,15],[14,20],[13,30],[12,35]],withoutTop:[[14,25],[13,35],[12,40]],sample:7480700,source:"March Layers!E4:E16"},
 ground:{label:"Ground",type:"Ground",mode:"weighted",reserve:unlocked=>605000+10000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Siege"))+500000*hasTop(unlocked,"Ground"),withTop:[[15,40],[14,40],[13,20]],withoutTop:[[14,40],[13,40],[12,20]],sample:7486400,source:"March Layers!F4:F16"},
 bigSiege:{label:"Big Siege",type:"Siege",mode:"weighted",reserve:unlocked=>54000+1000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")),withTop:[[15,10],[14,25],[13,65]],withoutTop:[[14,25],[13,75]],sample:6013200,source:"March Layers!G4:G16"},
 smallSiege:{label:"Small Siege",type:"Siege",mode:"small",fixed:[[15,50000],[14,50000],[13,50000],[12,50000],[10,50000],[9,50000]],reserve:unlocked=>50000+1000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")),sample:5749450,source:"March Layers!H4:H16"},
 soloSiege:{label:"Solo Siege",type:"Siege",mode:"weighted",reserve:unlocked=>50000+1000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")),withTop:[[15,5],[14,10],[13,50],[12,35]],withoutTop:[[14,15],[13,50],[12,35]],sample:5549800,source:"March Layers!I4:I16"}
};
const makeUnlocks=()=>Object.fromEntries(TYPES.map(type=>[type,{13:true,14:true,15:false,16:false}]));
function hasTop(unlocked,type){return Number(!!(unlocked?.[type]?.[15]||unlocked?.[type]?.[16]));}
function available(unlocked,type,tier){return tier<=12||!!unlocked?.[type]?.[tier];}
function targetTier(unlocked,type,tier){
 if(tier<=12)return tier;
 for(let t=Math.min(16,tier);t>=12;t--)if(available(unlocked,type,t))return t;
 return 12;
}
function allocateByWeights(total,weights){
 const entries=[...weights].filter(([,n])=>n>0).sort((a,b)=>b[0]-a[0]);
 const sum=entries.reduce((v,[,weight])=>v+weight,0);
 if(!sum||!total)return [];
 const rows=entries.map(([tier,weight])=>({tier,count:Math.floor(total*weight/sum),fraction:total*weight%sum}));
 let remaining=total-rows.reduce((n,row)=>n+row.count,0);
 for(const row of [...rows].sort((a,b)=>b.fraction-a.fraction||b.tier-a.tier)){if(!remaining)break;row.count++;remaining--;}
 return rows.sort((a,b)=>b.tier-a.tier).filter(row=>row.count>0).map(({tier,count})=>({tier,count}));
}
function calculatePreset({marchSize,preset="ranged",unlocked=makeUnlocks()},profiles=PRESETS){
 const profile=profiles[preset];if(!profile)throw new Error("Unknown march preset");
 const size=Number(marchSize);
 if(!Number.isSafeInteger(size)||size<1||size>100000000)throw new Error("Enter a march size between 1 and 100,000,000.");
 const warnings=[],top=hasTop(unlocked,profile.type),sourceReserve=profile.reserve(unlocked);
 // The sheet uses fixed-size support layers; for small marches there is no
 // source-grounded percentage rule. Leave a conservative 40% cap and flag it.
 const reserve=sourceReserve>size?Math.min(sourceReserve,Math.floor(size*.4)):sourceReserve;
 if(sourceReserve>size)warnings.push("Your march is smaller than the workbook's fixed layer allocation ("+sourceReserve.toLocaleString()+"). Support layers are reduced to 40% as a provisional fallback, not a workbook formula.");
 const budget=size-reserve;
 let allocations=[];
 if(profile.mode==="small"){
  // Small Siege workbook reserves 50K each for T14, T13, T12, T10 and T9
  // (and optionally T15), then assigns all remaining units to T11.
  const baseFixed=profile.fixed||[[15,50000],[14,50000],[13,50000],[12,50000],[10,50000],[9,50000]];
  const fixed=baseFixed.filter(([tier])=>tier!==15||top);
  const sumFixed=fixed.reduce((n,[,value])=>n+value,0);
  const chosen=sumFixed>budget?allocateByWeights(budget,fixed):fixed.map(([tier,count])=>({tier,count}));
  const map=new Map();
  for(const row of chosen){const tier=targetTier(unlocked,profile.type,row.tier);map.set(tier,(map.get(tier)||0)+row.count);}
  if(sumFixed>budget)warnings.push("March capacity is too small for all fixed 50,000 Small Siege tier allocations. Those values were proportionally reduced.");
  else map.set(11,(map.get(11)||0)+(budget-sumFixed));
  allocations=[...map].sort((a,b)=>b[0]-a[0]).map(([tier,count])=>({tier,count}));
 }else{
  const weights=top?profile.withTop:profile.withoutTop;
  const byTier=new Map();
  for(const [tier,weight] of weights){
   if(tier===15&&unlocked?.[profile.type]?.[16]){
    const split15=unlocked[profile.type][15]?40:0;
    byTier.set(16,(byTier.get(16)||0)+weight*(100-split15)/100);
    if(split15)byTier.set(15,(byTier.get(15)||0)+weight*split15/100);
   }else{
    const fallback=targetTier(unlocked,profile.type,tier);
    byTier.set(fallback,(byTier.get(fallback)||0)+weight);
   }
  }
  allocations=allocateByWeights(budget,[...byTier]);
 }
 if(unlocked?.[profile.type]?.[16])warnings.push("T16 is not in the 2024 workbook. Its main-tier share is extrapolated from T15"+(unlocked[profile.type][15]?" (60% to T16, 40% to T15).":"."));
 if(!unlocked?.[profile.type]?.[13]||!unlocked?.[profile.type]?.[14])warnings.push("A workbook tier is unavailable in your selection. Its share has been reassigned to the nearest lower available tier (T12 is assumed unlocked).");
 const combined=allocations.reduce((n,row)=>n+row.count,0);
 if(combined+reserve!==size)throw new Error("Preset allocation does not match march size");
 return {preset,label:profile.label,type:profile.type,marchSize:size,sourceReserve,reserve,mainTroops:combined,allocations,rows:[...allocations.map(row=>({type:profile.type,tier:row.tier,count:row.count})),{type:"All troop types",tier:null,count:reserve,label:"Supporting layers / lower tiers"}],warnings,source:profile.source,sourceSample:profile.sample,assumptions:["2024 workbook fixed support layers are aggregated because the workbook does not break every support-layer slot into individual troop counts.","Lower-tier support assumes T1–T12 are available. T13–T16 availability controls apply to the main troop allocation.","This is a workbook-derived template, not a guarantee of battle effectiveness."]};
}

const MARCH_KEY="evonymasters:march-preset-rules:v1";
const marchDefaults=()=>Object.fromEntries(Object.entries(PRESETS).map(([name,p])=>[name,p.mode==="small"?{fixed:p.fixed.map(([t,c])=>[t,c])}:{withTop:p.withTop.map(row=>[...row]),withoutTop:p.withoutTop.map(row=>[...row])}]));
function validateMarchConfig(body){
 if(!body||typeof body!=="object"||Array.isArray(body)||!body.presets||typeof body.presets!=="object")throw Error("Invalid troop calculation settings");
 const defaults=marchDefaults(),saved={};
 for(const [name,standard] of Object.entries(defaults)){
  const value=body.presets[name];if(!value||typeof value!=="object")throw Error("Missing preset: "+name);
  saved[name]={};
  for(const [mode,template] of Object.entries(standard)){
   const rows=value[mode];if(!Array.isArray(rows)||rows.length!==template.length)throw Error("Invalid "+name+" "+mode+" rows");
   let total=0;
   saved[name][mode]=rows.map((row,i)=>{
    if(!Array.isArray(row)||Number(row[0])!==template[i][0]||!Number.isInteger(Number(row[1]))||Number(row[1])<0)throw Error("Invalid "+name+" "+mode+" tier "+template[i][0]);
    const amount=Number(row[1]);if(mode==="fixed"&&amount>10000000||mode!=="fixed"&&amount>100)throw Error("Value outside allowed range");
    total+=amount;return [template[i][0],amount];
   });
   if(mode!=="fixed"&&total!==100)throw Error(name+" "+mode+" percentages must total exactly 100% (currently "+total+"%).");
  }
 }
 return {presets:saved};
}
async function marchRules(env){if(!env.CALENDAR)throw Error("Missing CALENDAR KV");const raw=await env.CALENDAR.get(MARCH_KEY);return raw?validateMarchConfig(JSON.parse(raw)):{presets:marchDefaults()};}
function resolvedMarchProfiles(config){return Object.fromEntries(Object.entries(PRESETS).map(([name,profile])=>[name,{...profile,...config.presets[name]}]));}

const adminHTML="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>EvonyMasters · Bulk Calendar Admin</title><style>\n:root{font:15px system-ui,sans-serif;background:#0c1728;color:#eef3fa}*{box-sizing:border-box}body{margin:0}header{padding:18px 5%;border-bottom:1px solid #907449;background:#10253c}a{color:#f4d18d}.wrap{max-width:1250px;margin:auto;padding:25px 18px 75px}h1,h2{color:#f5cd84;margin:8px 0 13px}h1{font-size:clamp(1.75rem,4vw,2.6rem)}h2{font-size:1.25rem}p{color:#c0d3e4;line-height:1.6}.admin-tabs{display:flex;gap:9px;flex-wrap:wrap;margin:0 0 18px}.admin-tab{cursor:pointer;padding:12px 17px;background:#203e58;color:#e9eff6;border:1px solid #617d95;border-radius:10px;font-weight:800}.admin-tab[aria-selected=true]{background:#ecc477;color:#142b40;border-color:#ecc477}[hidden]{display:none!important}.calc-table{width:100%;border-collapse:collapse;margin:15px 0}.calc-table th,.calc-table td{padding:10px;border-bottom:1px solid #47647a;text-align:left}.calc-table input{max-width:130px}.calc-grid{display:flex;gap:9px;flex-wrap:wrap}.calc-picker{cursor:pointer;background:#1e425f;border:1px solid #7292a9;color:#f4e2bf;border-radius:8px;padding:9px 11px;font-weight:750}.calc-picker[aria-pressed=true]{background:#edc574;color:#17283b}.calc-hint{color:#bcd0e0;font-size:.82rem;line-height:1.6}.grid{display:grid;grid-template-columns:1.1fr 1fr;gap:19px}.panel{background:#142b43;border:1px solid #405e79;border-radius:13px;padding:18px;margin-bottom:18px}.panel h2{margin-top:0}\nlabel{display:grid;gap:6px;margin:10px 0;font-size:.85rem;color:#f1d9a9;font-weight:750}\ninput,select,textarea{width:100%;background:#f7fafc;color:#132537;border-radius:8px;border:1px solid #7d93a5;padding:10px 11px;font:inherit}input[type=checkbox]{width:auto;accent-color:#f0be6b}textarea{min-height:75px}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.btn{cursor:pointer;border:1px solid #e5bf79;border-radius:9px;background:#edc574;color:#17283b;padding:10px 13px;font:inherit;font-weight:800}.btn.alt{background:#1d3b58;color:#f3dfa9;border-color:#6588a2}.btn.danger{background:#592d36;border-color:#be7b7b;color:#fff}.btn:disabled{opacity:.5;cursor:not-allowed}\n.catalog-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 138px;align-items:center;gap:8px;padding:9px 12px;background:#213e57;border:1px solid #42617a;border-radius:9px 9px 0 0;font-size:.8rem;font-weight:800}.sort-status{width:100%;border:1px solid #7295af;background:#304f69;color:#fff5dc;border-radius:7px;padding:8px 6px;text-align:left;font:inherit;font-size:.76rem;cursor:pointer}.sort-status[aria-pressed=true]{border-color:#f0c775;color:#f0c775}.totals{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}.total-pill{padding:9px 12px;border-radius:9px;border:1px solid #57728b;background:#1b3851;font-size:.81rem}.total-pill strong{color:#f2d493}.item{display:grid!important;grid-template-columns:minmax(0,1fr) 138px;gap:8px!important;align-items:center!important}.item-main{display:flex;gap:10px;align-items:flex-start;min-width:0}.item-name{min-width:0;overflow-wrap:anywhere}.status-cell{display:grid;gap:5px;justify-items:start}.status-pill{font-weight:800;border-radius:99px;padding:5px 8px;font-size:.71rem;border:1px solid #7c8496;background:#33465b;color:#d4e1eb}.status-pill.scheduled{color:#a9f4c3;background:#1a563d;border-color:#5caa7b}.schedule-details{background:transparent;color:#f3d393;border:0;padding:0;text-decoration:underline;font-size:.73rem;cursor:pointer;text-align:left}.schedule-info{margin:7px 0;padding:12px;background:#203f59;border:1px solid #526f87;border-radius:9px;color:#e3edf5;font-size:.78rem;line-height:1.5}.schedule-info[hidden]{display:none!important}.catalog{max-height:620px;overflow:auto;border:1px solid #42617a;border-radius:9px;padding:8px;background:#10263e}.item{display:flex;gap:9px;padding:9px;border-bottom:1px solid #314c64;align-items:start;font-size:.88rem}.item small{display:block;color:#a9c5d7;font-size:.72rem;margin-top:2px}.item input{margin-top:3px}.small{font-size:.8rem;color:#b7cbdc}.badge{font-size:.7rem;color:#f5d28a;border:1px solid #8e7752;padding:3px 7px;border-radius:99px}.entry{border:1px solid #47637f;border-radius:10px;padding:14px;margin:9px 0;background:#1a344d}.entry strong{color:#f2d493}.entry p{font-size:.82rem;margin:7px 0}.weekdays{display:flex;gap:8px;flex-wrap:wrap}.weekdays label{display:flex;align-items:center;gap:6px;margin:3px;font-size:.8rem}\n.level-switch{display:flex;align-items:center;gap:10px;font-size:.85rem}dialog{max-width:min(430px,90vw);background:#17324b;color:#eef3fa;border:1px solid #e3b96e;border-radius:13px;padding:24px;box-shadow:0 16px 50px #0008}dialog::backdrop{background:#0009}.picker{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.date-btn{background:#28455e;border:1px solid #526c82;color:#e7eef8;padding:8px 0;border-radius:6px;cursor:pointer}.date-btn.active{background:#f0c775;color:#142a3d;font-weight:850}.date-btn:disabled{visibility:hidden}.month-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:9px 0}\n#status{color:#ffe3a1;min-height:22px}#schedule-fields[hidden],#individual-picker[hidden],#week-fields[hidden],#interval-fields[hidden]{display:none!important}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #f0c778;outline-offset:2px}\n@media(max-width:850px){.grid,.two{grid-template-columns:1fr}}@media(max-width:550px){.wrap{padding:18px 12px}.picker{gap:2px}.date-btn{padding:6px 0}}\n</style></head><body><header><a href=\"https://evonymasters.jaynmegepicadventure.workers.dev/calendar/\">← Public Calendar</a></header><main class=\"wrap\">\n<h1>Events &amp; Monsters · Calendar Admin</h1><p>Choose existing records, then assign one schedule to all of them. All dates and times use Evony server time (UTC). Unverified dates should remain drafts or be clearly marked tentative.</p><p id=\"status\" role=\"status\">Loading the event and monster catalog…</p>\n<nav class=\"admin-tabs\" aria-label=\"Admin sections\"><button class=\"admin-tab\" data-admin-tab=\"calendar\" aria-selected=\"true\" type=\"button\">Calendar Schedules</button><button class=\"admin-tab\" data-admin-tab=\"troops\" aria-selected=\"false\" type=\"button\">Troop Calculations</button></nav><div id=\"calendar-admin\"><div class=\"grid\"><section class=\"panel\"><h2>1 · Select events and monsters</h2>\n<div class=\"two\"><label>Category<select id=\"kind\"><option value=\"all\">All records</option><option>Event</option><option>Boss</option><option>Event Boss</option><option>Regular Monster</option></select></label>\n<label>Show<select id=\"availability\"><option value=\"all\">All</option><option value=\"unscheduled\">Unscheduled only</option><option value=\"scheduled\">Scheduled only</option></select></label></div>\n<label>Search by name or unique ID<input id=\"search\" type=\"search\" placeholder=\"e.g. Ymir, Maya, Cerberus…\"></label>\n<div class=\"actions\"><button type=\"button\" id=\"select-visible\" class=\"btn alt\">Select all</button><button type=\"button\" id=\"clear\" class=\"btn alt\">Clear selection</button></div>\n<label class=\"level-switch\"><input id=\"show-levels\" type=\"checkbox\"> Show individual monster levels</label><div id=\"schedule-totals\" class=\"totals\" aria-live=\"polite\"></div><p id=\"selection\" class=\"small\">0 selected</p><div class=\"catalog-toolbar\"><span>Event / Monster</span><button type=\"button\" class=\"sort-status\" id=\"sort-status\" aria-pressed=\"false\" title=\"Sort by scheduled status\">Schedule Status ↕</button></div><div id=\"catalog\" class=\"catalog\"></div></section>\n<section class=\"panel\"><h2 id=\"form-title\">2 · Schedule selected records</h2><form id=\"schedule-form\">\n<label>Schedule type<select id=\"rule\"><option value=\"daily\">Every day</option><option value=\"dates\">Specific dates (click multiple)</option><option value=\"weekends\">Every weekend (Saturday & Sunday)</option><option value=\"alternate-weekends\">Alternate weekends</option><option value=\"weekly\">Selected weekdays</option><option value=\"interval\">Every X days</option></select></label>\n<div id=\"individual-picker\"><p class=\"small\" id=\"picker-help\">Select the dates on which this schedule runs.</p><div class=\"month-head\"><button type=\"button\" id=\"month-prev\" class=\"btn alt\">‹</button><strong id=\"month-name\"></strong><button type=\"button\" id=\"month-next\" class=\"btn alt\">›</button></div>\n<div id=\"date-grid\" class=\"picker\"></div><p id=\"selected-days\" class=\"small\">No days selected</p></div>\n<div id=\"schedule-fields\" hidden><label>First active Saturday (UTC)<input id=\"startDate\" type=\"date\"></label><input id=\"endDate\" type=\"hidden\">\n<div id=\"week-fields\" hidden><p class=\"small\">Repeat on:</p><div class=\"weekdays\" id=\"weekdays\"></div></div>\n</div>\n<div id=\"interval-fields\" hidden><label>Repeat each selected date every X days<input id=\"intervalDays\" type=\"number\" min=\"2\" max=\"365\" value=\"14\"></label><p class=\"small\">Each selected date repeats every X days indefinitely. No end date is needed.</p></div>\n<div class=\"actions\"><button type=\"submit\" class=\"btn\" id=\"save\">Save and publish</button><button type=\"button\" id=\"cancel\" class=\"btn alt\" hidden>Cancel edit</button></div></form></section></div>\n<section class=\"panel\"><h2>3 · Manage existing schedules</h2><div id=\"schedules\"></div></section></div><div id=\"troops-admin\" hidden><section class=\"panel\"><h2>Troop calculation settings</h2><p>Change the tier allocation percentages used by the public March Preset Builder. These values are private to the Admin Dashboard. Changes take effect on the public calculator only when you click Save troop calculations.</p><div class=\"calc-grid\" id=\"calc-picker\"></div><p id=\"calc-mode-note\" class=\"calc-hint\"></p><div id=\"calc-rules\"></div><div class=\"actions\"><button id=\"calc-save\" class=\"btn\" type=\"button\">Save troop calculations</button><button id=\"calc-reset\" class=\"btn alt\" type=\"button\">Reload saved settings</button></div><p id=\"calc-status\" class=\"small\" role=\"status\">Open the Troop Calculations tab to load settings.</p></section></div></main><dialog id=\"error-dialog\" aria-labelledby=\"error-heading\"><h3 id=\"error-heading\">Unable to complete action</h3><p id=\"error-text\"></p><form method=\"dialog\"><button class=\"btn\" autofocus>OK</button></form></dialog>\n<script>\n(()=>{\"use strict\";\nconst $=id=>document.getElementById(id),keys=new Set(),days=new Set();\nlet records=[],schedules=[],editing=null,statusSort=\"name\",month=new Date();month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),1));\nconst dateString=d=>d.toISOString().slice(0,10);\nconst popup=t=>{const dialog=$(\"error-dialog\");$(\"error-text\").textContent=t;dialog.showModal();};\nconst option=(value,label)=>{const e=document.createElement(\"option\");e.value=value;e.textContent=label;return e};\nasync function api(path,options={}){const r=await fetch(path,{credentials:\"same-origin\",...options});let body;try{body=await r.json()}catch{throw Error(\"Unexpected response (\"+r.status+\")\")}if(!r.ok)throw Error(body.error||\"Request failed\");return body}\nconst message=t=>$(\"status\").textContent=t;\nfunction scheduleIds(){return new Set(schedules.flatMap(s=>s.targets.map(t=>t.id)))}\nfunction schedulesFor(id){return schedules.filter(s=>s.targets.some(t=>t.id===id))}\nfunction filtered(){\n const term=$(\"search\").value.trim().toLowerCase(),kind=$(\"kind\").value,filter=$(\"availability\").value,active=scheduleIds(),showLevels=$(\"show-levels\").checked;\n const visible=records.filter(e=>(showLevels||!e.familyId)&&(kind===\"all\"||e.kind===kind)&&(!term||(e.name+\" \"+e.id).toLowerCase().includes(term)));\n const countScheduled=visible.filter(e=>active.has(e.id)).length;\n const totals=$(\"schedule-totals\");totals.replaceChildren();\n for(const [name,count] of [[\"Scheduled\",countScheduled],[\"Unscheduled\",visible.length-countScheduled]]){const pill=document.createElement(\"span\");pill.className=\"total-pill\";pill.textContent=name+\" · \";const strong=document.createElement(\"strong\");strong.textContent=String(count);pill.append(strong);totals.append(pill)}\n const rows=visible.filter(e=>filter===\"all\"||(filter===\"scheduled\"?active.has(e.id):!active.has(e.id)));\n const cmp=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:\"base\"})||a.id.localeCompare(b.id);\n rows.sort((a,b)=>statusSort===\"name\"?cmp(a,b):(statusSort===\"scheduled\"?Number(active.has(b.id))-Number(active.has(a.id)):Number(active.has(a.id))-Number(active.has(b.id)))||cmp(a,b));\n $(\"sort-status\").textContent=\"Schedule Status \"+(statusSort===\"scheduled\"?\"↓\":statusSort===\"unscheduled\"?\"↑\":\"↕\");\n $(\"sort-status\").setAttribute(\"aria-pressed\",String(statusSort!==\"name\"));\n $(\"sort-status\").setAttribute(\"aria-label\",statusSort===\"scheduled\"?\"Schedule Status: scheduled first. Click for unscheduled first.\":statusSort===\"unscheduled\"?\"Schedule Status: unscheduled first. Click for name order.\":\"Schedule Status: sort scheduled first.\");\n return rows;\n}\nfunction renderCatalog(){\n const container=$(\"catalog\");container.replaceChildren();\n const rows=filtered();\n for(const record of rows.slice(0,1500)){\n  const schedulesHere=schedulesFor(record.id),active=schedulesHere.length>0;\n  const row=document.createElement(\"div\");row.className=\"item\";\n  const main=document.createElement(\"label\");main.className=\"item-main\";\n  const cb=document.createElement(\"input\");cb.type=\"checkbox\";cb.checked=keys.has(record.id);cb.addEventListener(\"change\",()=>{cb.checked?keys.add(record.id):keys.delete(record.id);countSelection()});\n  const info=document.createElement(\"span\");info.className=\"item-name\";info.textContent=record.name;\n  const detail=document.createElement(\"small\");detail.textContent=record.kind+(record.family?\" · All levels\":record.level?\" · Level \"+record.level:\"\")+\" · \"+record.id;\n  info.append(detail);main.append(cb,info);row.append(main);\n  const cell=document.createElement(\"div\");cell.className=\"status-cell\";\n  const pill=document.createElement(\"span\");pill.className=\"status-pill\"+(active?\" scheduled\":\"\");pill.textContent=active?\"✓ Scheduled\":\"Unscheduled\";cell.append(pill);\n  if(active){\n   const btn=document.createElement(\"button\");btn.className=\"schedule-details\";btn.type=\"button\";btn.textContent=\"View schedule\";btn.setAttribute(\"aria-expanded\",\"false\");\n   const details=document.createElement(\"div\");details.className=\"schedule-info\";details.hidden=true;\n   const ruleLabel=s=>s.rule===\"interval\"?\"Every \"+s.intervalDays+\" days\":({daily:\"Every day\",dates:\"Specific dates\",weekends:\"Every weekend\",\"alternate-weekends\":\"Alternate weekends\",weekly:\"Selected weekdays\",always:\"Always\",range:\"Date range\",ongoing:\"Ongoing\"})[s.rule]||s.rule;\n   for(const s of schedulesHere){\n    const line=document.createElement(\"div\");line.textContent=ruleLabel(s)+(s.rule===\"dates\"||s.rule===\"interval\"?\" · \"+(s.selectedDates?.length?s.selectedDates.join(\", \"):s.startDate||\"\"):\"\")+(s.endDate?\" · until \"+s.endDate:\"\")+(s.paused?\" · Paused\":s.published?\" · Published\":\" · Unpublished\");\n    details.append(line);\n   }\n   btn.addEventListener(\"click\",()=>{details.hidden=!details.hidden;btn.setAttribute(\"aria-expanded\",String(!details.hidden));btn.textContent=details.hidden?\"View schedule\":\"Hide schedule\"});\n   cell.append(btn,details);\n  }\n  row.append(cell);container.append(row);\n }\n if(!container.childElementCount)container.textContent=\"No matching records. Check the search or catalog connection.\";\n countSelection();\n}\nfunction countSelection(){$(\"selection\").textContent=keys.size+\" selected · Select an entire boss family to schedule all its levels together.\"}\nfunction renderDates(){const grid=$(\"date-grid\");grid.replaceChildren();$(\"month-name\").textContent=month.toLocaleDateString(\"en-GB\",{month:\"long\",year:\"numeric\",timeZone:\"UTC\"});for(const d of [\"M\",\"T\",\"W\",\"T\",\"F\",\"S\",\"S\"]){const h=document.createElement(\"span\");h.textContent=d;h.className=\"small\";h.style.textAlign=\"center\";grid.append(h)}\n const offset=(month.getUTCDay()+6)%7,max=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();\n for(let i=0;i<42;i++){const n=i-offset+1,b=document.createElement(\"button\");b.type=\"button\";b.className=\"date-btn\";if(n<1||n>max){b.disabled=true}else{const d=dateString(new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),n)));b.textContent=String(n);b.classList.toggle(\"active\",days.has(d));b.addEventListener(\"click\",()=>{days.has(d)?days.delete(d):days.add(d);renderDates()})}grid.append(b)}\n $(\"selected-days\").textContent=days.size?days.size+\" days: \"+[...days].sort().slice(0,6).join(\", \")+(days.size>6?\" …\":\"\"):\"No dates selected\";\n}\nfunction updateRule(){const value=$(\"rule\").value;$(\"individual-picker\").hidden=![\"dates\",\"interval\"].includes(value);$(\"picker-help\").textContent=value===\"interval\"?\"Select one or more active dates. Each repeats every X days forever.\":\"Select the individual dates on which this schedule runs.\";$(\"schedule-fields\").hidden=value!==\"alternate-weekends\";$(\"week-fields\").hidden=value!==\"weekly\";$(\"interval-fields\").hidden=value!==\"interval\";$(\"startDate\").required=value===\"alternate-weekends\";$(\"endDate\").required=false;}\nconst dayNames=[\"Sun\",\"Mon\",\"Tue\",\"Wed\",\"Thu\",\"Fri\",\"Sat\"];for(let d=0;d<7;d++){const label=document.createElement(\"label\"),cb=document.createElement(\"input\");cb.type=\"checkbox\";cb.value=String(d);label.append(cb,document.createTextNode(dayNames[d]));$(\"weekdays\").append(label)}\nfunction reset(){editing=null;keys.clear();days.clear();$(\"schedule-form\").reset();$(\"form-title\").textContent=\"2 · Schedule selected records\";$(\"save\").textContent=\"Save and publish\";$(\"cancel\").hidden=true;renderDates();updateRule();renderCatalog();}\nfunction renderSchedules(){const area=$(\"schedules\");area.replaceChildren();if(!schedules.length){area.textContent=\"No schedules saved yet.\";return}\nfor(const s of schedules){const article=document.createElement(\"article\"),title=document.createElement(\"strong\");article.className=\"entry\";title.textContent=s.name;article.append(title);\nconst details=document.createElement(\"p\");details.textContent=s.rule+\" · \"+(s.rule===\"interval\"?((s.selectedDates?.length?s.selectedDates:[s.startDate]).filter(Boolean).join(\", \")+\" · Every \"+s.intervalDays+\" days indefinitely\"):(s.startDate||\"Repeats indefinitely\")+(s.endDate?\" to \"+s.endDate:\"\"))+\" · \"+s.targets.length+\" records · \"+(s.published?\"Published\":\"Unpublished\")+\" · \"+(s.paused?\"Paused\":\"Active\");article.append(details);\n const sources=document.createElement(\"p\");sources.textContent=s.targets.slice(0,6).map(t=>t.name).join(\", \")+(s.targets.length>6?\" +\"+(s.targets.length-6)+\" more\":\"\");article.append(sources);\n const actions=document.createElement(\"div\");actions.className=\"actions\";\n const button=(name,cls,fn)=>{const el=document.createElement(\"button\");el.className=\"btn \"+cls;el.type=\"button\";el.textContent=name;el.addEventListener(\"click\",fn);actions.append(el)};\n button(\"Edit\",\"alt\",()=>{editing=s.id;keys.clear();s.targets.forEach(t=>keys.add(t.id));days.clear();s.selectedDates.forEach(d=>days.add(d));if(s.rule===\"interval\"&&!days.size&&s.startDate)days.add(s.startDate);\nfor(const [id,value] of Object.entries({rule:s.rule,startDate:s.startDate,endDate:s.endDate,intervalDays:s.intervalDays}))$(id).value=value??\"\";\n for(const box of $(\"weekdays\").querySelectorAll(\"input\"))box.checked=s.daysOfWeek.includes(Number(box.value));\n $(\"form-title\").textContent=\"Editing \"+s.name;$(\"save\").textContent=\"Save changes\";$(\"cancel\").hidden=false;renderCatalog();renderDates();updateRule();window.scrollTo({top:0,behavior:\"smooth\"})});\n button(s.paused?\"Resume\":\"Pause\",\"alt\",()=>save(s.id,{...s,targetIds:s.targets.map(t=>t.id),paused:!s.paused,replace:false}));\n button(s.published?\"Unpublish\":\"Publish\",\"alt\",()=>save(s.id,{...s,targetIds:s.targets.map(t=>t.id),published:!s.published,replace:false}));\n button(\"Delete\",\"danger\",async()=>{if(!confirm(\"Delete schedule \"+s.name+\"?\"))return;try{await api(\"/api/admin/schedules/\"+s.id,{method:\"DELETE\"});reset();await load()}catch(e){popup(e.message)}});\n article.append(actions);area.append(article)}}\nasync function load(){try{const [c,r]=await Promise.all([api(\"/api/admin/catalog\"),api(\"/api/admin/schedules\")]);records=c.entries;schedules=r.schedules;renderCatalog();renderSchedules();message(\"Signed in as \"+r.admin+\" · \"+records.length+\" unique records · \"+schedules.length+\" schedules\")}catch(e){popup(e.message);message(\"Unable to load calendar data\")}}\nasync function save(id,data){try{const path=\"/api/admin/schedules\"+(id?\"/\"+id:\"\");await api(path,{method:id?\"PUT\":\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify(data)});reset();await load();message(\"Schedule saved and published.\")}catch(e){popup(e.message)}}\n$(\"month-prev\").addEventListener(\"click\",()=>{month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()-1,1));renderDates()});\n$(\"month-next\").addEventListener(\"click\",()=>{month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,1));renderDates()});\n$(\"sort-status\").addEventListener(\"click\",()=>{statusSort=statusSort===\"name\"?\"scheduled\":statusSort===\"scheduled\"?\"unscheduled\":\"name\";renderCatalog()});$(\"kind\").addEventListener(\"change\",renderCatalog);$(\"availability\").addEventListener(\"change\",renderCatalog);$(\"search\").addEventListener(\"input\",renderCatalog);$(\"show-levels\").addEventListener(\"change\",renderCatalog);\n$(\"select-visible\").addEventListener(\"click\",()=>{for(const e of filtered().slice(0,1500))keys.add(e.id);renderCatalog()});\n$(\"clear\").addEventListener(\"click\",()=>{keys.clear();renderCatalog()});\n$(\"rule\").addEventListener(\"change\",updateRule);$(\"cancel\").addEventListener(\"click\",reset);\n$(\"schedule-form\").addEventListener(\"submit\",async e=>{e.preventDefault();if(!keys.size){popup(\"Select at least one event or monster\");return}\nconst input={targetIds:[...keys],rule:$(\"rule\").value,startDate:$(\"startDate\").value,endDate:$(\"endDate\").value,\nselectedDates:[...days],daysOfWeek:[...$(\"weekdays\").querySelectorAll(\"input:checked\")].map(x=>Number(x.value)),\nintervalDays:Number($(\"intervalDays\").value),status:\"Confirmed\",published:true,replace:true};\n if(editing){const old=schedules.find(s=>s.id===editing);input.paused=old?.paused||false}\n $(\"save\").disabled=true;await save(editing,input);$(\"save\").disabled=false;\n});\n// Troop Calculations is a separate protected admin tab; calendar forms are not altered.\nlet calcConfig=null,calcPreset=\"ranged\",calcLoaded=false;\nconst calcNames={ranged:\"Archer / Ranged\",cavalry:\"Cavalry\",ground:\"Ground\",bigSiege:\"Big Siege\",smallSiege:\"Small Siege\",soloSiege:\"Solo Siege\"};\nconst calcModes={withTop:\"T15 unlocked\",withoutTop:\"T15 not unlocked\",fixed:\"Fixed troop quantities\"};\nfunction renderCalc(){\n const picker=$(\"calc-picker\"),rules=$(\"calc-rules\");picker.replaceChildren();rules.replaceChildren();\n if(!calcConfig)return;\n for(const key of Object.keys(calcNames)){const button=document.createElement(\"button\");button.type=\"button\";button.className=\"calc-picker\";button.textContent=calcNames[key];button.setAttribute(\"aria-pressed\",String(key===calcPreset));button.addEventListener(\"click\",()=>{calcPreset=key;renderCalc()});picker.append(button)}\n const current=calcConfig.presets[calcPreset];\n $(\"calc-mode-note\").textContent=calcPreset===\"smallSiege\"?\"This workbook preset uses fixed tier quantities. There are no percentages to edit for Small Siege.\":\"The T15-unlocked and non-T15 patterns are edited separately. Each percentage group must add up to 100%. T16 uses the documented T15 extrapolation.\";\n for(const [mode,values] of Object.entries(current)){\n  const heading=document.createElement(\"h3\");heading.textContent=calcModes[mode]||mode;rules.append(heading);\n  const table=document.createElement(\"table\");table.className=\"calc-table\";const head=document.createElement(\"tr\");for(const t of [\"Tier\",mode===\"fixed\"?\"Troop count\":\"Allocation %\"]){const th=document.createElement(\"th\");th.textContent=t;head.append(th)}table.append(head);\n  for(const pair of values){const tr=document.createElement(\"tr\"),tier=document.createElement(\"td\"),cell=document.createElement(\"td\"),input=document.createElement(\"input\");tier.textContent=\"T\"+pair[0];input.type=\"number\";input.min=\"0\";input.max=mode===\"fixed\"?\"10000000\":\"100\";input.step=\"1\";input.value=String(pair[1]);input.setAttribute(\"aria-label\",calcNames[calcPreset]+\" \"+calcModes[mode]+\" T\"+pair[0]);input.addEventListener(\"input\",()=>{pair[1]=Number(input.value);refreshCalcTotals()});cell.append(input);tr.append(tier,cell);table.append(tr)}rules.append(table);\n  if(mode!==\"fixed\"){const total=document.createElement(\"p\");total.className=\"calc-hint\";total.dataset.total=mode;rules.append(total)}\n }refreshCalcTotals();\n}\nfunction refreshCalcTotals(){if(!calcConfig)return;for(const el of $(\"calc-rules\").querySelectorAll(\"[data-total]\")){const value=calcConfig.presets[calcPreset][el.dataset.total].reduce((n,r)=>n+r[1],0);el.textContent=\"Total: \"+value+\"%\"+(value===100?\" ✓\":\" · Must equal 100%\");el.style.color=value===100?\"#a5e8bc\":\"#ffacac\"}}\nasync function loadCalc(){try{const data=await api(\"/api/admin/march-presets\");calcConfig=data;calcLoaded=true;renderCalc();$(\"calc-status\").textContent=\"Loaded saved calculation settings.\"}catch(e){popup(e.message);$(\"calc-status\").textContent=\"Could not load troop settings.\"}}\n$(\"calc-save\").addEventListener(\"click\",async()=>{if(!calcConfig)return;try{await api(\"/api/admin/march-presets\",{method:\"PUT\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify(calcConfig)});$(\"calc-status\").textContent=\"Troop calculations saved. Public recommendations now use these settings.\";await loadCalc()}catch(e){popup(e.message)}});\n$(\"calc-reset\").addEventListener(\"click\",loadCalc);\nfor(const button of document.querySelectorAll(\"[data-admin-tab]\"))button.addEventListener(\"click\",()=>{const on=button.dataset.adminTab;for(const tab of document.querySelectorAll(\"[data-admin-tab]\"))tab.setAttribute(\"aria-selected\",String(tab===button));$(\"calendar-admin\").hidden=on!==\"calendar\";$(\"troops-admin\").hidden=on!==\"troops\";if(on===\"troops\"&&!calcLoaded)loadCalc()});\nrenderDates();updateRule();load();\n})();\n</script></body></html>";
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
  if(path==="/api/march-presets/calculate"){
   if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"}});
   if(request.method!=="POST")return respond({error:"Method not allowed"},405,cors);
   if(origin!==SITE)return respond({error:"Origin not allowed"},403,cors);
   try{const input=await bodyJSON(request),config=await marchRules(env);const result=calculatePreset(input,resolvedMarchProfiles(config));return respond({preset:result.preset,label:result.label,type:result.type,marchSize:result.marchSize,mainTroops:result.mainTroops,reserve:result.reserve,rows:result.rows,warnings:result.warnings},200,cors)}
   catch(e){return respond({error:txt(e.message).slice(0,160)},400,cors)}
  }
  const protectedRoute=["/admin","/admin/","/api/admin/catalog","/api/admin/schedules","/api/admin/march-presets"].includes(path)||/^\/api\/admin\/schedules\/[a-f0-9-]{36}$/i.test(path);
  if(!protectedRoute)return respond({error:"Not found"},404);
  const email=await authorized(env,ctx);if(!email)return respond({error:"Admin access denied. Configure Cloudflare Access and ADMIN_EMAILS."},403);
  if(path==="/admin"||path==="/admin/"){
   if(request.method!=="GET")return respond({error:"Method not allowed"},405);
   return new Response(adminHTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if(["POST","PUT","DELETE"].includes(request.method)&&origin!==url.origin)return respond({error:"Invalid write origin"},403);
  try{
   if(path==="/api/admin/march-presets"){
    if(request.method==="GET")return respond(await marchRules(env));
    if(request.method==="PUT"){const validated=validateMarchConfig(await bodyJSON(request));await env.CALENDAR.put(MARCH_KEY,JSON.stringify(validated));return respond({ok:true});}
    return respond({error:"Method not allowed"},405);
   }
   if(path==="/api/admin/catalog"&&request.method==="GET")return respond({entries:await catalog(env)});
   let rows=await read(env);
   if(path==="/api/admin/schedules"&&request.method==="GET")return respond({schedules:rows,admin:email});
   if(path==="/api/admin/schedules"&&request.method==="POST"){
    if(rows.length>=1500)return respond({error:"Schedule limit reached"},400);
    const input=await bodyJSON(request),schedule=validate(input,await catalog(env));
    if(input.replace!==false){const ids=new Set(schedule.targets.map(t=>t.id));rows=rows.map(r=>({...r,targets:r.targets.filter(t=>!ids.has(t.id))})).filter(r=>r.targets.length);}
    rows.push(schedule);await write(env,rows);return respond({schedule},201);
   }
   const matched=path.match(/^\/api\/admin\/schedules\/([a-f0-9-]{36})$/i);
   if(!matched)return respond({error:"Not found"},404);
   const pos=rows.findIndex(r=>r.id===matched[1]);if(pos<0)return respond({error:"Schedule not found"},404);
   if(request.method==="PUT"){
    const input=await bodyJSON(request),schedule=validate(input,await catalog(env),rows[pos]);
    rows[pos]=schedule;
    if(input.replace!==false){const ids=new Set(schedule.targets.map(t=>t.id));rows=rows.map(r=>r.id===schedule.id?r:{...r,targets:r.targets.filter(t=>!ids.has(t.id))}).filter(r=>r.targets.length);}
    await write(env,rows);return respond({schedule});
   }
   if(request.method==="DELETE"){rows.splice(pos,1);await write(env,rows);return respond({ok:true});}
   return respond({error:"Method not allowed"},405);
  }catch(e){return respond({error:txt(e.message).slice(0,150)},/^Reward catalog unavailable|^Invalid reward catalog|^Missing CALENDAR KV|^Corrupt schedule data/i.test(txt(e.message))?503:400);}
 }
};
