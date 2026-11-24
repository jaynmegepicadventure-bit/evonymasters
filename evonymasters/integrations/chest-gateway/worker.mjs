// Same-origin gateway for Chest Finder. Attach this Worker only to
// www.evonymasters.com/api/chests* and evonymasters.com/api/chests*.
// Cloudflare service binding SHEET_SYNC must target evonymasters-sheet-sync.
// No sheet secrets or private bulk data are exposed by this gateway.
const ROUTES=new Map([
 ["/api/chests","/v4/chests"],
 ["/api/chests/events","/v4/chests/events"],
 ["/api/chests/compare","/v4/chests/compare"]
]);
export default {
 async fetch(request,env){
  const url=new URL(request.url),upstreamPath=ROUTES.get(url.pathname);
  if(!upstreamPath)return new Response("Not found",{status:404});
  if(request.method!=="GET")return new Response("Method not allowed",{status:405,headers:{"allow":"GET"}});
  if(!env.SHEET_SYNC||typeof env.SHEET_SYNC.fetch!=="function")
   return new Response(JSON.stringify({error:"Chest service binding is not configured"}),{status:503,headers:{"content-type":"application/json"}});
  const target=new URL("https://evonymasters-sheet-sync.jaynmegepicadventure.workers.dev"+upstreamPath+url.search);
  try{
   // Service binding is required to connect to a Worker in the same account
   // without a public Worker-to-Worker fetch dependency.
   const upstream=await env.SHEET_SYNC.fetch(new Request(target,{method:"GET"}));
   return new Response(upstream.body,{status:upstream.status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
   }});
  }catch(error){
   // Log the internal error so Cloudflare Observability can identify the
   // service-binding failure. Do not expose implementation details to visitors.
   console.error("Chest gateway upstream failure",{
    name:error?.name||"Unknown",
    message:String(error?.message||error).slice(0,400)
   });
   return new Response(JSON.stringify({error:"Chest data service temporarily unavailable"}),{status:502,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  }
 }
};
