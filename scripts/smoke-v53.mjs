const BASE=(process.env.BASE_URL||"http://localhost:5000").replace(/\/$/,"");
const EMAIL=process.env.ADMIN_EMAIL||"";
const PASSWORD=process.env.ADMIN_PASSWORD||"";
const results=[];
async function check(name,fn){const t=Date.now();try{const value=await fn();results.push({name,status:"PASS",ms:Date.now()-t,value});}catch(e){results.push({name,status:"FAIL",ms:Date.now()-t,error:e.message});}}
async function json(path,opts={}){const r=await fetch(BASE+path,opts);let body=null;try{body=await r.json()}catch{}return{r,body}}
await check("server version",async()=>{const{r,body}=await json("/api/system/v53/version");if(!r.ok||!body?.success)throw Error(`HTTP ${r.status}`);return body.data.release});
await check("public health",async()=>{const{r,body}=await json("/api/system/v52/health");if(![200,503].includes(r.status))throw Error(`HTTP ${r.status}`);return body?.data?.status||"unknown"});
await check("v54 readiness",async()=>{const{r,body}=await json("/api/system/v54/readiness");if(![200,503].includes(r.status))throw Error(`HTTP ${r.status}`);return {status:body?.data?.qa?.status,warnings:body?.data?.warnings||[]}});
await check("v55 integrity summary",async()=>{const{r,body}=await json("/api/system/v55/integrity-summary");if(![200,409].includes(r.status))throw Error(`HTTP ${r.status}`);return body?.data||{}});
let token="";
if(EMAIL&&PASSWORD){
 await check("admin login",async()=>{const{r,body}=await json("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:EMAIL,password:PASSWORD})});if(!r.ok||!body?.success)throw Error(`HTTP ${r.status}`);token=body.token||body.accessToken||body.data?.token||"";return token?"token received":"login ok; token field not detected"});
 if(token) await check("admin reliability",async()=>{const{r,body}=await json("/api/admin/system/v53/reliability",{headers:{Authorization:`Bearer ${token}`}});if(!r.ok||!body?.success)throw Error(`HTTP ${r.status}`);return body.data.status});
}else{
 results.push({name:"admin authenticated checks",status:"SKIP",ms:0,value:"Set ADMIN_EMAIL and ADMIN_PASSWORD to test protected routes"});
}
console.table(results);
const failed=results.filter(x=>x.status==="FAIL").length;
if(failed)process.exit(1);
