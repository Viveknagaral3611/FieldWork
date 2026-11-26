import {readFile,writeFile} from 'node:fs/promises';
import {DEFAULT_PROFILE} from '../src/store.mjs';
import {demoJobs,ORGANIZATIONS} from '../src/demo.mjs';
const root=new URL('../',import.meta.url);
const base={profile:DEFAULT_PROFILE,jobs:demoJobs(),sources:[],runs:[],schedule:{enabled:false,intervalHours:24},organizations:ORGANIZATIONS};
const css=await readFile(new URL('public/styles.css',root),'utf8');
let app=await readFile(new URL('public/app.js',root),'utf8');
const matching=(await readFile(new URL('src/matching.mjs',root),'utf8')).replaceAll('export ','');
const shim=`
+globalThis.FIELDWORK_PREVIEW=true;
+const previewBase=${JSON.stringify(base)};
+let previewDb;
+try{previewDb=JSON.parse(localStorage.getItem('fieldwork-preview-db'))||structuredClone(previewBase);}catch{previewDb=structuredClone(previewBase);}
+function previewSave(){try{localStorage.setItem('fieldwork-preview-db',JSON.stringify(previewDb));}catch{}}
+function previewResponse(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
+globalThis.fetch=async function(input,options={}){
+ const u=new URL(input,'http://preview.local'),method=options.method||'GET';
+ let data={};try{if(typeof options.body==='string')data=JSON.parse(options.body);}catch{}
+ if(u.pathname==='/api/state'){
+  const sample=u.searchParams.get('mode')==='demo';
+  return previewResponse({...previewDb,jobs:sample?previewDb.jobs.map(j=>({...j,match:matchJob(j,previewDb.profile),eligibility:eligibilityFor(j.description)})):[],skills:SKILLS,areas:Object.keys(AREAS),refreshing:false,mode:sample?'demo':'live'});
+ }
+ if(u.pathname==='/api/profile'){previewDb.profile={...data,confirmed:true};previewSave();return previewResponse({profile:previewDb.profile});}
+ if(u.pathname==='/api/suggest')return previewResponse(suggestProfile(data.text||''));
+ if(u.pathname.startsWith('/api/activity/')){const j=previewDb.jobs.find(j=>j.id===u.pathname.split('/').pop());if(j)Object.assign(j,data);previewSave();return previewResponse({ok:true});}
+ if(u.pathname==='/api/schedule'){previewDb.schedule=data;previewSave();return previewResponse({ok:true});}
+ if(u.pathname==='/api/extract'){
+  const filename=decodeURIComponent(options.headers['x-filename']||'file.txt');
+  if(!/\\.(txt|md)$/i.test(filename))return previewResponse({error:'PDF and DOCX import are available in the full local app. This sample preview supports TXT and Markdown.'},400);
+  const text=await options.body.text();return previewResponse({text,filename,suggestions:suggestProfile(text)});
+ }
+ return previewResponse({error:'This is the interactive sample preview. Start the included local app for live sources, real listings, and scheduled collection.'},400);
+};
+document.addEventListener('click',event=>{
+ const a=event.target.closest('a[href="/api/export"]');if(!a)return;
+ event.preventDefault();const blob=new Blob([JSON.stringify(previewDb,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='fieldwork-preview.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
+},true);
+` .split('\n').map(l=>l.startsWith('+')?l.slice(1):l).join('\n');
const icon='data:image/svg+xml,'+encodeURIComponent(await readFile(new URL('public/icon.svg',root),'utf8'));
app=app.replaceAll('src="/icon.svg"',`src="${icon}"`).replace('You’re exploring sample data.','Interactive sample preview.').replace('These fictional roles show how your workspace works.','Fictional roles. Run the full app for live collection.');
const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldwork — Interactive sample preview</title><link rel="icon" href="${icon}"><style>${css}</style></head><body><div id="app"><div class="loading">Opening Fieldwork…</div></div><dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toast" role="status" aria-live="polite"></div><script type="module">${matching}\n${shim}\n${app}</script></body></html>`;
await writeFile(new URL('Fieldwork_Preview.html',root),html);
console.log('Created self-contained preview');
