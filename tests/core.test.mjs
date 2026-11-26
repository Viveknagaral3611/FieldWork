import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibilityFor, matchJob, inferKind, suggestProfile } from '../src/matching.mjs';
import { openStore, DEFAULT_PROFILE } from '../src/store.mjs';
import { fetchSource, refreshAll, validateSource, normalizeJob, plainText } from '../src/sources.mjs';
import { extractDocument } from '../src/documents.mjs';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

test('missing policy and generic work authorization never become confirmed acceptance',()=>{
  for(const text of ['No policy provided.','Must be authorized to work in the US.','International students are welcome.','No citizenship requirement.'])assert.equal(eligibilityFor(text).status,'review',text);
});
test('explicit CPT acceptance is supported by retained evidence',()=>{
  const e=eligibilityFor('Use MATLAB for analysis. F-1 students with approved CPT are eligible to apply.');
  assert.equal(e.status,'explicit');assert.equal(e.evidence.length,1);assert.match(e.evidence[0],/CPT/);
});
test('citizenship conflicts override positive CPT language',()=>{
  assert.equal(eligibilityFor('CPT students are eligible. This role requires U.S. citizenship.').status,'restricted');
  assert.equal(eligibilityFor('Applicants must be a U.S. citizen or permanent resident.').status,'restricted');
});
test('negated citizenship requirement does not become an exclusion',()=>{
  assert.equal(eligibilityFor('U.S. citizenship is not required.').status,'review');
  assert.equal(eligibilityFor('This role does not require U.S. citizenship.').status,'review');
});
test('export control and no-sponsorship language require review despite CPT acceptance',()=>{
  for(const tail of ['Subject to export control requirements.','No sponsorship is available.','Applicants must be U.S. persons.','A security clearance is required.'])assert.equal(eligibilityFor(`CPT students are eligible. ${tail}`).status,'review');
});
test('explicit training exclusions and negated acceptance are not accepted',()=>{
  assert.equal(eligibilityFor('F-1 students are not eligible for this role.').status,'restricted');
  assert.equal(eligibilityFor('We cannot accept CPT students.').status,'restricted');
});
test('internships remain internships even if the description says full-time',()=>{
  assert.equal(inferKind('Summer Research Intern','Full-time'),'internship');
  assert.equal(inferKind('Research Engineer','Full-time'),'fulltime');
  assert.equal(inferKind('Research Engineer',''),'other');
});
test('profile suggestions recognize specialist skills and match explanations respond to profile changes',()=>{
  const p=suggestProfile('PIV experiments and MATLAB analysis in a wind tunnel with Python.');
  assert.ok(p.skills.includes('PIV'));assert.ok(p.areas.includes('Experimental research'));
  const job={title:'Thermal Research',description:'Python heat transfer modeling',tags:['Thermal sciences']};
  assert.ok(matchJob(job,DEFAULT_PROFILE).score>matchJob(job,{skills:['SolidWorks'],areas:['Aerodynamics']}).score);
});
const source={id:'s1',provider:'greenhouse',slug:'acme',company:'Acme',organization:'Industry',enabled:true};
const raw=(id,title='Research Intern')=>({id,title,content:'F-1 CPT students are eligible. MATLAB fluid mechanics.',location:{name:'Tempe, AZ'},absolute_url:`https://example.com/jobs/${id}`});
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('successful refresh upserts without duplicates and preserves saved notes',async()=>{
  const s=openStore(':memory:');s.saveSource(source);
  const fake=async()=>response({jobs:[raw(1)],meta:{total:1}});
  await refreshAll(s,fake);const id=s.jobs()[0].id;s.activity(id,'applied','Follow up Friday');
  await refreshAll(s,fake);assert.equal(s.jobs().length,1);assert.equal(s.jobs()[0].id,id);assert.equal(s.jobs()[0].notes,'Follow up Friday');assert.equal(s.jobs()[0].status,'applied');s.close();
});
test('failed and malformed refreshes preserve availability; successful empty board closes listings',async()=>{
  const s=openStore(':memory:');s.saveSource(source);
  await refreshAll(s,async()=>response({jobs:[raw(1)],meta:{total:1}}));
  await refreshAll(s,async()=>new Response('rate limited',{status:429}));assert.equal(s.jobs()[0].active,true);
  await refreshAll(s,async()=>response({jobs:[raw(2)],meta:{total:2}}));assert.equal(s.jobs()[0].active,true);assert.equal(s.jobs().length,1);
  await refreshAll(s,async()=>response({jobs:[],meta:{total:0}}));assert.equal(s.jobs()[0].active,false);s.close();
});
test('Ashby unlisted postings are not ingested',async()=>{
  const s={...source,provider:'ashby'};
  const jobs=await fetchSource(s,async()=>response({jobs:[{id:'a',title:'Research Intern',jobUrl:'https://example.com/a',isListed:true},{id:'b',title:'Hidden',jobUrl:'https://example.com/b',isListed:false}]}));
  assert.equal(jobs.length,1);assert.equal(jobs[0].externalId,'a');
});
test('Lever pagination collects all pages before replacing source inventory',async()=>{
  let calls=0;
  const jobs=await fetchSource({...source,provider:'lever'},async url=>{calls++;const skip=Number(new URL(url).searchParams.get('skip'));return response(Array.from({length:skip===0?100:1},(_,i)=>({id:String(skip+i),text:'Research Intern',hostedUrl:`https://example.com/${skip+i}`,categories:{location:'US',commitment:'Intern'}})));});
  assert.equal(calls,2);assert.equal(jobs.length,101);
});
test('untrusted source URLs and unsafe application URLs are rejected',()=>{
  assert.throws(()=>validateSource({...source,slug:'http://localhost:22/'}));
  assert.throws(()=>validateSource({...source,slug:'https://evil.example/company'}));
  assert.equal(validateSource({...source,slug:'https://job-boards.greenhouse.io/acme/jobs/123'}).slug,'acme');
  assert.throws(()=>normalizeJob({...raw(1),absolute_url:'javascript:alert(1)'},source));
});
test('normalization strips executable HTML and does not treat updated date as posted date',()=>{
  assert.equal(plainText('<script>alert(1)</script><p>Safe &amp; sound.</p>'),'Safe & sound.');
  const j=normalizeJob({...raw(1),updated_at:'2026-11-24'},source);assert.equal(j.postedAt,null);
});
test('document import supports text and rejects oversized and unsupported documents',async()=>{
  assert.equal(await extractDocument('cv.txt',Buffer.from('PIV MATLAB Research')),'PIV MATLAB Research');
  await assert.rejects(extractDocument('cv.exe',Buffer.from('oops')),/Supported formats/);
  await assert.rejects(extractDocument('cv.txt',Buffer.alloc(11*1024*1024)),/10 MB/);
});
test('bundled PDF reader and DOCX extractor read actual documents',async()=>{
  for(const ext of ['pdf','docx']) {
    const text=await extractDocument(`cv.${ext}`,readFileSync(new URL(`fixtures/cv.${ext}`,import.meta.url)));
    assert.match(text,/PIV, MATLAB, Python and fluid mechanics/);
  }
});
test('same URL across boards keeps application notes and active availability',()=>{
  const s=openStore(':memory:');const j=normalizeJob(raw(1),source);
  s.ingest(source,[j],'2026-11-22T10:00:00.000Z');const original=s.jobs()[0].id;s.activity(original,'applied','Mentor contact');
  s.ingest({id:'second'},[j],'2026-11-24T10:00:00.000Z');s.ingest(source,[],'2026-11-24T11:00:00.000Z');
  const jobs=s.jobs();assert.equal(jobs.length,1);assert.equal(jobs[0].id,original);assert.equal(jobs[0].notes,'Mentor contact');assert.equal(jobs[0].active,true);s.close();
});
test('profile and application activity survive database reopen',()=>{
  const dir=mkdtempSync(path.resolve('.test-workspace-'));
  try {
    const file=path.join(dir,'data.sqlite');const a=openStore(file);a.set('profile',{...DEFAULT_PROFILE,name:'Persistent researcher'});a.activity('demo-1','saved','Keep this');a.close();
    const b=openStore(file);assert.equal(b.setting('profile',{}).name,'Persistent researcher');assert.equal(b.jobs(true)[0].notes,'Keep this');b.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('discovery queries use profile keywords and never send CV text or notes', async()=>{
  const {discoveryQueries}=await import('../src/discovery.mjs');
  const queries=discoveryQueries({areas:['Thermal sciences'],skills:['CFD'],resumeText:'Private resume'});
  assert.ok(queries.some(query=>query.term==='thermal engineering'));
  assert.ok(queries.some(query=>query.term==='computational fluid dynamics'));
  assert.doesNotMatch(JSON.stringify(queries),/Private resume/);
});

test('Adzuna returns distinct employers and deduplicates across queries',async()=>{
  const requests=[];
  const jobs=await fetchSource({provider:'adzuna',company:'Adzuna',credentials:{appId:'test',appKey:'test'},queries:[{term:'aerodynamics'},{term:'research engineer',fullTime:true}]}, async value=>{
    const url=new URL(value);
    requests.push(url);
    return response({results:[
      {id:1,title:'Aerodynamics Intern',company:{display_name:'Example University'},redirect_url:'http://www.adzuna.com/job/1'},
      {id:2,title:'Thermal Scientist',company:{display_name:'Example National Laboratory'},redirect_url:'https://www.adzuna.com/job/2',contract_time:'full_time'}
    ]});
  });
  assert.equal(jobs.length,2);
  assert.equal(jobs[0].organization,'Academia');
  assert.equal(jobs[1].organization,'National laboratory');
  assert.equal(jobs[1].kind,'fulltime');
  assert.equal(requests[1].searchParams.get('full_time'),'1');
});
