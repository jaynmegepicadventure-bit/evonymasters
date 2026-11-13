// EvonyMasters feedback bridge. No R2, Brevo, or Google credentials in the browser.
// Secrets: TURNSTILE_SECRET, APPS_SCRIPT_URL, FEEDBACK_SHARED_SECRET.
// Plain environment variable: TURNSTILE_SITE_KEY.
// Deploy on a dedicated Worker: evonymasters-feedback.
const WEBSITE="https://www.evonymasters.com";
const MAX_FILE=2*1024*1024, MAX_TOTAL=8*1024*1024, MAX_REQUEST=9*1024*1024;
const TYPES=new Map([["image/png",".png"],["image/jpeg",".jpg"],["image/webp",".webp"],["application/pdf",".pdf"],["text/plain",".txt"]]);
const CATEGORIES=new Set(["data","bug","idea","question","other"]);
const cors=o=>o===WEBSITE?{"access-control-allow-origin":WEBSITE,"vary":"Origin","access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"600"}:{};
const respond=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
const clean=(s,max)=>typeof s==="string"?s.trim().slice(0,max):"";
const validEmail=e=>!e||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=200);
const ready=env=>Boolean(env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY&&env.APPS_SCRIPT_URL&&env.FEEDBACK_SHARED_SECRET&&env.FEEDBACK_SHARED_SECRET.length>=32&&/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env.APPS_SCRIPT_URL));
async function turnstile(token,request,env){
 if(!token||token.length>2048)return false;
 const body=new FormData();
 body.set("secret",env.TURNSTILE_SECRET);body.set("response",token);
 const ip=request.headers.get("CF-Connecting-IP");if(ip)body.set("remoteip",ip);
 try{
  const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body});
  if(!r.ok)return false;
  const data=await r.json();
  return data.success===true&&data.hostname==="www.evonymasters.com";
 }catch{return false}
}
function toBase64(data){
 const bytes=new Uint8Array(data);let s="";
 // Build binary string in bounded chunks rather than applying a huge array as function args.
 for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(s);
}
async function forward(request,env){
 if(!ready(env))return respond({error:"Feedback form setup is incomplete; please email us instead."},503);
 if(request.headers.get("origin")!==WEBSITE)return respond({error:"Origin not permitted."},403);
 if(Number(request.headers.get("content-length")||0)>MAX_REQUEST)return respond({error:"Submission is too large."},413);
 if(!(request.headers.get("content-type")||"").startsWith("multipart/form-data;"))return respond({error:"Invalid submission format."},415);
 let data;try{data=await request.formData()}catch{return respond({error:"Unable to read submission."},400)}
 const category=clean(data.get("category"),40),name=clean(data.get("name"),100),email=clean(data.get("email"),200),
 page=clean(data.get("page"),300),message=clean(data.get("message"),4000);
 if(clean(data.get("website"),100))return respond({error:"Submission rejected."},400);
 if(!CATEGORIES.has(category)||message.length<15||message.length>4000||!validEmail(email))return respond({error:"Choose a category, enter at least 15 characters and check the optional email."},400);
 const files=data.getAll("files").filter(f=>f&&typeof f!=="string"&&f.size>0);
 if(files.length>5)return respond({error:"Maximum five attachments."},400);
 let sum=0;
 for(const f of files){
  sum+=f.size;
  if(f.size>MAX_FILE||!TYPES.has(f.type)||f.name.length>160||!/^[\p{L}\p{N} ._()\-]+$/u.test(f.name))
   return respond({error:"Use PNG/JPG/WebP/PDF/TXT, max 2 MB per attachment, simple filenames."},400);
 }
 if(sum>MAX_TOTAL)return respond({error:"Maximum combined attachment size is 8 MB."},413);
 if(!await turnstile(clean(data.get("cf-turnstile-response"),2048),request,env))return respond({error:"Security check failed or expired. Please try again."},403);
 const attachments=[];
 for(const f of files)attachments.push({name:f.name,mimeType:f.type,size:f.size,base64:toBase64(await f.arrayBuffer())});
 const id=crypto.randomUUID();
 try{
  const outbound={secret:env.FEEDBACK_SHARED_SECRET,submission:{id,createdAt:new Date().toISOString(),category,name,email,page,message,attachments}};
  const r=await fetch(env.APPS_SCRIPT_URL,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify(outbound),redirect:"follow"});
  if(!r.ok)return respond({error:"Google couldn't accept the submission. Please try again or use email."},502);
  const raw=await r.text();
  let answer;try{answer=JSON.parse(raw)}catch{return respond({error:"Google returned an unexpected response. Please use email."},502)}
  if(answer.ok!==true||answer.id!==id)return respond({error:"Google did not confirm the submission. Please use email if needed."},502);
  return respond({ok:true,id,emailNotified:answer.emailNotified===true},201);
 }catch{return respond({error:"Feedback service is unavailable. Please use email for now."},503)}
}
// Public, read-only Q&A proxy. Google Apps Script never receives the visitor's browser request.
async function publicQA(env,headers){
 if(!env.APPS_SCRIPT_URL||!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env.APPS_SCRIPT_URL))
  return respond({ok:false,error:"Q&A is not configured."},503,headers);
 try{
  const r=await fetch(env.APPS_SCRIPT_URL+"?action=qa",{method:"GET",redirect:"follow"});
  if(!r.ok)return respond({ok:false,error:"Q&A could not be loaded."},502,headers);
  const raw=await r.text();
  if(raw.length>1200000)return respond({ok:false,error:"Q&A response is too large."},502,headers);
  const payload=JSON.parse(raw);
  if(payload.ok!==true||!Array.isArray(payload.questions))return respond({ok:false,error:"Q&A is temporarily unavailable."},502,headers);
  // Output allowlist: explicitly discard any unexpected private fields.
  const questions=payload.questions.slice(0,500).filter(q=>q&&typeof q==="object"&&q.question&&q.answer).map(q=>({
   id:clean(q.id,100),category:clean(q.category,100),question:clean(q.question,400),
   answer:clean(q.answer,6000),source:clean(q.source,500),lastUpdated:clean(q.lastUpdated,100),
   relatedTool:typeof q.relatedTool==="string"&&/^\/(?!\/)[A-Za-z0-9/_-]*\/?(?:#[A-Za-z0-9_-]+)?$/.test(q.relatedTool)?q.relatedTool:""
  }));
  return respond({ok:true,questions},200,{...headers,"cache-control":"public, max-age=300"});
 }catch{return respond({ok:false,error:"Q&A is temporarily unavailable."},502,headers)}
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get("origin")||"";
  const headers=cors(origin);
  if(url.pathname==="/api/config"&&request.method==="GET"){
   if(origin&&origin!==WEBSITE)return respond({error:"Origin not permitted"},403);
   return respond({enabled:ready(env),siteKey:ready(env)?env.TURNSTILE_SITE_KEY:null},200,headers);
  }
  if(url.pathname==="/api/qa"&&request.method==="GET"){
   if(origin&&origin!==WEBSITE)return respond({error:"Origin not permitted"},403);
   return publicQA(env,headers);
  }
  if(origin!==WEBSITE)return respond({error:"Origin not permitted"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(url.pathname==="/api/feedback"&&request.method==="POST"){
   const response=await forward(request,env);
   const out=new Headers(response.headers);
   Object.entries(headers).forEach(([key,value])=>out.set(key,value));
   return new Response(response.body,{status:response.status,headers:out});
  }
  return respond({error:"Not found"},404,headers);
 }
};