import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openStore } from './store.mjs';
import { AREAS, SKILLS, matchJob, eligibilityFor, suggestProfile, tagsFor } from './matching.mjs';
import { ORGANIZATIONS } from './demo.mjs';
import { refreshAll, validateSource, safeURL } from './sources.mjs';
import { ADZUNA_ID, installStarterBoards, publicDiscovery, searchSource } from './discovery.mjs';
import { extractDocument } from './documents.mjs';
import { accountsFor } from './accounts.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseStore = openStore(undefined, { starterProfile: false });
installStarterBoards(baseStore);
const accounts = accountsFor(baseStore);
const port = Number(process.env.PORT || 3000);
const refreshingStores = new Set();
const statuses = ['new','saved','applied','interview','offer','rejected','dismissed'];
function send(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req, raw=false) {
  let size=0;const parts=[];
  for await(const chunk of req){size+=chunk.length;if(size>11*1024*1024){throw Object.assign(new Error('Request exceeds 11 MB.'),{status:413});}parts.push(chunk);}
  const bytes=Buffer.concat(parts);if(raw)return bytes;
  try{return JSON.parse(bytes.toString('utf8')||'{}');}catch{throw new Error('Invalid JSON request.');}
}
async function refresh(store){
  if(refreshingStores.has(store)) return null;
  refreshingStores.add(store);
  try { return await refreshAll(store); }
  finally { refreshingStores.delete(store); }
}
function state(store, demo=false){
  const profile=store.setting('profile',{});
  return {profile, jobs:store.jobs(demo).map(j=>({...j,match:matchJob(j,profile),eligibility:j.provider==='adzuna'?{status:'review',evidence:profile.visa==='F-1'?eligibilityFor(j.description):{status:'review',evidence:eligibilityFor(j.description).evidence,note:'Check the posting for work authorization and access requirements.'}.evidence,note:'Adzuna supplies a short excerpt. Read the full posting to verify work authorization and other requirements.'}:profile.visa==='F-1'?eligibilityFor(j.description):{status:'review',evidence:eligibilityFor(j.description).evidence,note:'Check the posting for work authorization and access requirements.'}})), sources:store.sources(),discovery:publicDiscovery(store),runs:store.runs(),schedule:store.setting('schedule',{}),refreshing:refreshingStores.has(store),areas:Object.keys(AREAS),skills:SKILLS,organizations:ORGANIZATIONS,mode:demo?'demo':'live'};
}
const files = {'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/icon.svg':'icon.svg'};
const server=http.createServer(async(req,res)=>{
  try{
    const host=req.headers.host||'';
    if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return send(res,403,{error:'This private app accepts local connections only.'});
    const url=new URL(req.url,`http://${host}`);
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${host}`)return send(res,403,{error:'Cross-origin writes are not allowed.'});
    const account = accounts.current(req);
    if (url.pathname === '/api/session' && req.method === 'GET') {
      return send(res, 200, { email: account?.email || null });
    }
    if (req.method === 'POST' && ['/api/login', '/api/register', '/api/logout'].includes(url.pathname)) {
      if (url.pathname === '/api/logout') {
        accounts.logout(req);
        res.setHeader('Set-Cookie', accounts.cookie());
        return send(res, 200, { email: null });
      }
      const session = await accounts.authenticate(url.pathname.slice(5), await body(req));
      accounts.logout(req);
      res.setHeader('Set-Cookie', accounts.cookie(session.token));
      return send(res, 200, { email: session.email });
    }
    if (url.pathname.startsWith('/api/') && !account) {
      return send(res, 401, { error: 'Sign in to open your workspace.' });
    }
    const store = account ? accounts.workspace(account) : null;
    const refreshing = refreshingStores.has(store);
    if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,state(store, url.searchParams.get('mode')==='demo'));
    if(req.method==='POST'&&url.pathname==='/api/refresh'){
      if(refreshing)return send(res,409,{error:'A refresh is already running.'});
      if(!store.sources().some(s=>s.enabled)&&!searchSource(store))return send(res,400,{error:'Enable a starter board or configure Adzuna in Sources & updates.'});
      return send(res,200,await refresh(store));
    }
    if(url.pathname==='/api/discovery' && ['PUT','DELETE'].includes(req.method)){
      if(refreshing)return send(res,409,{error:'Wait for the current search to finish.'});
      if(req.method==='DELETE'){
        store.set('adzunaCredentials', {});
        store.set('adzunaStatus', {});
        store.deleteSource(ADZUNA_ID);
      } else {
        const input=await body(req);
        const appId=typeof input.appId==='string'?input.appId.trim():'';
        const appKey=typeof input.appKey==='string'?input.appKey.trim():'';
        if(!/^[a-zA-Z0-9_-]{1,200}$/.test(appId)||!/^[a-zA-Z0-9_-]{1,200}$/.test(appKey)){
          throw new Error('Enter your Adzuna application ID and key.');
        }
        store.set('adzunaCredentials', { appId, appKey });
        store.set('adzunaStatus', {});
      }
      return send(res,200,publicDiscovery(store));
    }
    if(req.method==='PUT'&&url.pathname==='/api/profile'){
      const p=await body(req);
      for(const key of ['skills','areas'])if(!Array.isArray(p[key])||p[key].length>100||p[key].some(s=>typeof s!=='string'||s.length>150))throw new Error(`Invalid ${key}.`);
      for(const key of ['name','headline','university','degree','visa','projects','resumeText'])if(typeof p[key]!=='string'||p[key].length>(key==='resumeText'?400000:key==='projects'?100000:250))throw new Error(`Invalid ${key}.`);
      if(p.searchTerms !== undefined && (!Array.isArray(p.searchTerms) || p.searchTerms.length > 6 || p.searchTerms.some(term => typeof term !== 'string' || !/^[\p{L}\p{N} .+#/&()'-]{2,64}$/u.test(term)))) throw new Error('Enter up to six plain job titles or search phrases.');
      if(!Number.isInteger(p.targetYear)||p.targetYear<2026||p.targetYear>2040)throw new Error('Choose a target year between 2026 and 2040.');
      const before = JSON.stringify(publicDiscovery(store).terms);
      const profile={...p,resumeText:p.keepResumeText===true?p.resumeText:'',confirmed:true,updatedAt:new Date().toISOString()};
      store.set('profile',profile);
      if (before !== JSON.stringify(publicDiscovery(store).terms)) {
        store.set('adzunaStatus', {});
        if (searchSource(store)) void scheduleWorkspace(store).catch(console.error);
      }
      return send(res,200,{profile});
    }
    if(req.method==='POST'&&url.pathname==='/api/extract'){
      const filename=decodeURIComponent(req.headers['x-filename']||'resume.txt');
      const text=await extractDocument(filename,await body(req,true));
      if(text.length>400000)throw new Error('Extracted text is too large.');
      return send(res,200,{text,suggestions:suggestProfile(text),filename});
    }
    if(req.method==='POST'&&url.pathname==='/api/suggest'){
      const input=await body(req);return send(res,200,suggestProfile(String(input.text||'').slice(0,400000)));
    }
    if(req.method==='POST'&&url.pathname==='/api/sources'){
      if(store.sources().length>=50)throw new Error('This local edition supports up to 50 connected boards.');
      const source=validateSource(await body(req));
      if(store.sources().some(s=>s.provider===source.provider&&s.slug.toLowerCase()===source.slug.toLowerCase()))throw new Error('This board is already connected.');
      return send(res,201,store.saveSource(source));
    }
    if(url.pathname.startsWith('/api/sources/')){
      const id=url.pathname.split('/').pop();const source=store.sources().find(s=>s.id===id);
      if(!source)return send(res,404,{error:'Source not found.'});
      if(refreshing)return send(res,409,{error:'Wait for the refresh to finish before changing sources.'});
      if(req.method==='DELETE'){store.deleteSource(id);return send(res,200,{ok:true});}
      if(req.method==='PATCH'){const {enabled}=await body(req);if(typeof enabled!=='boolean')throw new Error('Invalid source setting.');return send(res,200,store.saveSource({...source,enabled}));}
    }
    if(req.method==='PUT'&&url.pathname==='/api/schedule'){
      const s=await body(req);if(typeof s.enabled!=='boolean'||![6,12,24].includes(s.intervalHours))throw new Error('Invalid schedule.');
      store.set('schedule',{enabled:s.enabled,intervalHours:s.intervalHours});return send(res,200,{ok:true});
    }
    if(req.method==='PUT'&&url.pathname.startsWith('/api/activity/')){
      const id=url.pathname.split('/').pop();const a=await body(req);
      if(!statuses.includes(a.status)||typeof a.notes!=='string'||a.notes.length>20000)throw new Error('Invalid application status or notes.');
      if(![...store.jobs(),...store.jobs(true)].some(j=>j.id===id))return send(res,404,{error:'Job not found.'});
      store.activity(id,a.status,a.notes);return send(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/jobs'){
      const j=await body(req);
      if(!j.title?.trim()||!j.company?.trim()||!safeURL(j.url)||!j.description?.trim())throw new Error('Title, organization, description, and an HTTPS application URL are required.');
      if(!['Industry','Academia','National laboratory'].includes(j.organization)||!['internship','fulltime','other'].includes(j.kind))throw new Error('Choose a valid organization and role type.');
      if(j.description.length>150000||j.title.length>250||j.company.length>160)throw new Error('One of the fields is too long.');
      const source={id:'manual'};
      const old=store.jobs().filter(v=>v.sourceId==='manual');
      store.ingest(source,[...old,{...j,url:safeURL(j.url),externalId:randomUUID(),location:j.location||'Not specified',tags:tagsFor(`${j.title} ${j.description}`),year:Number(j.year)||null,season:j.season||'Not specified',degree:j.degree||'Not specified',compensation:'Not specified',workplace:'Not specified',postedAt:null,deadline:j.deadline||null}]);
      return send(res,201,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/export'){
      res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="fieldwork-backup.json"','Cache-Control':'no-store'});
      return res.end(JSON.stringify({...state(store, false),demoActivity:store.jobs(true).filter(j=>j.status!=='new'),exportedAt:new Date().toISOString(),formatVersion:1},null,2));
    }
    if((req.method==='GET'||req.method==='HEAD')&&files[url.pathname]){
      const file=files[url.pathname];const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html';
      const bytes=await readFile(path.join(root,'public',file));
      res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
      return res.end(req.method==='HEAD'?undefined:bytes);
    }
    send(res,404,{error:'Not found.'});
  }catch(e){console.error(e.message);if(!res.headersSent)send(res,e.status||400,{error:e.message||'Request failed.'});}
});
server.requestTimeout=120000;
server.listen(port,'127.0.0.1',()=>console.log(`\n  Fieldwork is ready → http://localhost:${port}\n  Private local workspace. Press Ctrl+C to stop.\n`));
async function scheduleWorkspace(store){
  const refreshing = refreshingStores.has(store);
  const schedule=store.setting('schedule',{});
  if(!schedule.enabled||refreshing||(!store.sources().some(s=>s.enabled)&&!searchSource(store)))return;
  const last=store.runs().find(r=>r.finished_at);
  const unchecked = store.sources().some(source => source.enabled && !source.lastAttempt) || Boolean(searchSource(store) && !publicDiscovery(store).lastAttempt);
  if(unchecked||!last||Date.now()-Date.parse(last.finished_at)>=schedule.intervalHours*3600000)await refresh(store);
}
let scheduling = false;
async function scheduled() {
  if (scheduling) return;
  scheduling = true;
  try {
    for (const account of accounts.list()) {
      await scheduleWorkspace(accounts.workspace(account));
    }
  } finally {
    scheduling = false;
  }
}
const timer=setInterval(()=>scheduled().catch(console.error),60000);timer.unref();
setTimeout(()=>scheduled().catch(console.error),2500).unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{accounts.close();process.exit(0);});});
