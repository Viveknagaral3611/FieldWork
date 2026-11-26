import { randomUUID } from 'node:crypto';
import { tagsFor, inferKind, matchJob } from './matching.mjs';
import { searchSource } from './discovery.mjs';
export function plainText(html = '') {
  let text = String(html);
  for (let i = 0; i < 2; i++) text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<\/(?:p|div|li|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_,n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '').replace(/\n{3,}/g, '\n\n').trim();
}
export function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.toString() : ''; } catch { return ''; }
}
const boardHosts = {
  greenhouse: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
  lever: ['jobs.lever.co'],
  ashby: ['jobs.ashbyhq.com']
};
export function careerBoardFromUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste the HTTPS URL of a supported career board.'); }
  if (url.hostname === 'jobright.ai' || url.hostname.endsWith('.jobright.ai')) {
    throw new Error('This URL opens Jobright. Open a job there and copy the employer’s application URL. If it is on Greenhouse, Lever, or Ashby, paste it here to search that employer’s board.');
  }
  const provider = Object.keys(boardHosts).find(key => boardHosts[key].includes(url.hostname));
  if (url.protocol !== 'https:' || !provider) {
    throw new Error('Career board search supports public Greenhouse, Lever, and Ashby pages.');
  }
  const slug = boardSlug(provider, url.href);
  return { provider, slug, company: slug, organization: 'Industry' };
}

export async function searchCareerBoard(board, profile, { kind = 'all', keyword = '' } = {}, fetcher = fetch) {
  const all = await fetchSource(board, fetcher);
  const matches = all
    .filter(job => kind === 'all' || job.kind === kind)
    .filter(job => !keyword || `${job.title} ${job.description} ${job.location}`.toLowerCase().includes(keyword.toLowerCase()))
    .map(job => ({
      title: job.title, kind: job.kind, location: job.location, url: job.url,
      match: matchJob(job, profile)
    }))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));
  return { company: board.company, total: matches.length, jobs: matches.slice(0, 100) };
}

export function boardSlug(provider, value) {
  let slug = value.trim();
  if (/^https:\/\//.test(slug)) {
    const u = new URL(slug);
    if (!boardHosts[provider]?.includes(u.hostname)) throw new Error('Use the public career-board URL for the selected provider.');
    slug = u.pathname.split('/').filter(Boolean)[0] || '';
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) throw new Error('Enter a company board name, such as acme, or its public career-board URL.');
  return slug;
}
export function validateSource(input) {
  if (!['greenhouse','lever','ashby'].includes(input.provider)) throw new Error('Choose Greenhouse, Lever, or Ashby.');
  if (!input.company?.trim() || input.company.length > 160) throw new Error('Enter an organization name of 1–160 characters.');
  if (!['Industry','Academia','National laboratory'].includes(input.organization)) throw new Error('Choose an organization type.');
  return { id: randomUUID(), provider: input.provider, company: input.company.trim(), organization: input.organization, slug: boardSlug(input.provider, input.slug || ''), enabled: true, createdAt: new Date().toISOString(), lastSuccess: null, error: null };
}
async function fetchJSON(url, fetcher, timeout = 25000) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeout), headers: {'Accept':'application/json','User-Agent':'Fieldwork/1.0 (personal research careers dashboard)'}, redirect: 'error' });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}. Check the board name or try again later.`);
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  let size = 0; const chunks = [];
  while (true) { const {done,value} = await reader.read(); if(done) break; size += value.length; if (size > 25 * 1024 * 1024) { await reader.cancel(); throw new Error('Source response exceeded the 25 MB limit.'); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function normalizeJob(raw, source) {
  let title, description, location, url, externalId, employment, postedAt, compensation, applyUrl;
  if (source.provider === 'greenhouse') {
    ({title, id:externalId} = raw); description = plainText(raw.content); location = raw.location?.name; url = raw.absolute_url;
    employment = (raw.metadata || []).filter(v => /employment|commitment|type/i.test(v.name)).map(v => v.value).join(' ');
    // Greenhouse updated_at is not the original posting date.
    postedAt = null;
  } else if (source.provider === 'lever') {
    title = raw.text; externalId = raw.id; location = raw.categories?.location; employment = raw.categories?.commitment;
    description = [raw.descriptionPlain || plainText(raw.description), ...(raw.lists || []).map(l => `${l.text}\n${plainText(l.content)}`), raw.additionalPlain || plainText(raw.additional)].filter(Boolean).join('\n\n');
    url = raw.hostedUrl || raw.applyUrl; applyUrl = raw.applyUrl; postedAt = raw.createdAt ? new Date(raw.createdAt).toISOString() : null;
    compensation = raw.salaryDescriptionPlain || plainText(raw.salaryDescription);
  } else if (source.provider === 'jobicy') {
    title = raw.jobTitle;
    externalId = raw.id;
    description = plainText(raw.jobDescription || raw.jobExcerpt);
    location = raw.jobGeo;
    url = raw.url;
    employment = Array.isArray(raw.jobType) ? raw.jobType.join(' ') : raw.jobType;
    employment = (employment || '').replace(/[-_]/g, ' ');
    postedAt = raw.pubDate || null;
  } else if (source.provider === 'adzuna') {
    title = raw.title;
    externalId = raw.id;
    description = plainText(raw.description);
    location = raw.location?.display_name;
    url = raw.redirect_url?.replace(/^http:\/\//i, 'https://');
    employment = raw.contract_time?.replaceAll('_', ' ');
    postedAt = raw.created || null;
  } else {
    title = raw.title; url = raw.jobUrl || raw.applyUrl; applyUrl = raw.applyUrl; externalId = raw.id || url; location = raw.location; employment = raw.employmentType;
    description = raw.descriptionPlain || plainText(raw.descriptionHtml); postedAt = raw.publishedAt || null; compensation = raw.compensation?.compensationTierSummary;
  }
  if (!title || !externalId || !safeURL(url)) throw new Error('Source returned an incomplete job record; previous listings were preserved.');
  const text = `${title} ${description}`;
  const year = /\b(20\d{2})\b/.exec(title)?.[1] || (/summer.{0,25}\b(20\d{2})\b/i.exec(description)?.[1]);
  return { externalId: String(externalId), company: raw.companyName || raw.company?.display_name || source.company, organization: ['adzuna','jobicy'].includes(source.provider) ? classifyEmployer(raw.companyName || raw.company?.display_name || '') : source.organization, provider: source.provider, title, description: description || 'Description not supplied by the source. Check the original posting.', location: location || 'Not specified', url: safeURL(url), applyUrl: safeURL(applyUrl) || safeURL(url), kind: inferKind(title, employment || '', description), season: /summer/i.test(text) ? 'Summer' : 'Not specified', year: year ? Number(year) : null, tags: tagsFor(text), degree: /(?:undergraduate|bachelor'?s?).{0,30}only/i.test(text) ? 'Undergraduate only' : /ph\.?d|doctoral|graduate|master'?s?/i.test(text) ? 'Graduate' : 'Not specified', workplace: /hybrid/i.test(location || '') ? 'Hybrid' : source.provider === 'jobicy' || raw.isRemote || /remote/i.test(location || '') ? 'Remote' : 'Not specified', compensation: compensation || 'Not specified', postedAt, deadline: null };
}
function classifyEmployer(company) {
  if (/national (?:lab|laborator)|\b(?:argonne|nrel|sandia|ornl|pnnl|brookhaven|netl|fermilab)\b/i.test(company)) return 'National laboratory';
  if (/university|college|school of/i.test(company)) return 'Academia';
  return 'Not specified';
}

async function fetchAdzuna(source, fetcher) {
  const jobs = new Map();
  for (const query of source.queries) {
    const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1');
    url.search = new URLSearchParams({
      app_id: source.credentials.appId,
      app_key: source.credentials.appKey,
      what: query.term,
      results_per_page: '35',
      sort_by: 'date',
      'content-type': 'application/json',
      ...(query.fullTime ? { full_time: '1' } : {})
    });
    let data;
    try {
      data = await fetchJSON(url.toString(), fetcher, 8000);
    } catch {
      throw new Error('Adzuna request failed. Check your credentials, connection, and API limits.');
    }
    if (!Array.isArray(data.results)) throw new Error('Unexpected Adzuna response.');
    for (const raw of data.results) {
      const job = normalizeJob(raw, source);
      jobs.set(job.externalId, job);
    }
  }
  return [...jobs.values()];
}

const jobicyCache = new WeakMap();
const jobicyInterval = 60 * 60_000;
async function fetchJobicy(source, fetcher) {
  // Workspaces share one refresh per hour for this public feed.
  const cached = jobicyCache.get(fetcher);
  if (cached && cached.until > Date.now()) return cached.jobs;
  const jobs = (async () => {
    const data = await fetchJSON('https://jobicy.com/api/jobs?count=100&geo=usa', fetcher, 12000);
    if (!Array.isArray(data.jobs)) throw new Error('Unexpected Jobicy response.');
    return data.jobs.map(raw => {
      const job = normalizeJob(raw, source);
      if (new URL(job.url).hostname !== 'jobicy.com') throw new Error('Jobicy did not return a canonical listing link.');
      return job;
    });
  })();
  jobicyCache.set(fetcher, { jobs, until: Date.now() + jobicyInterval });
  return jobs;
}

export async function fetchSource(source, fetcher = fetch) {
  if (source.provider === 'jobicy') return fetchJobicy(source, fetcher);
  if (source.provider === 'adzuna') return fetchAdzuna(source, fetcher);
  const token = encodeURIComponent(source.slug);
  if (source.provider === 'greenhouse') {
    const data = await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, fetcher);
    if (!Array.isArray(data.jobs) || (typeof data.meta?.total === 'number' && data.meta.total !== data.jobs.length)) throw new Error('Incomplete or unexpected Greenhouse response.');
    return data.jobs.map(r => normalizeJob(r, source));
  }
  if (source.provider === 'ashby') {
    const data = await fetchJSON(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`, fetcher);
    if (!Array.isArray(data.jobs)) throw new Error('Unexpected Ashby response.');
    return data.jobs.filter(r => r.isListed !== false).map(r => normalizeJob(r, source));
  }
  const jobs = [];
  for (let skip = 0; skip < 10000; skip += 100) {
    const batch = await fetchJSON(`https://api.lever.co/v0/postings/${token}?mode=json&limit=100&skip=${skip}`, fetcher);
    if (!Array.isArray(batch)) throw new Error('Unexpected Lever response.');
    jobs.push(...batch.map(r => normalizeJob(r, source)));
    if (batch.length < 100) return jobs;
  }
  throw new Error('Board exceeded pagination limit; previous listings were preserved.');
}
export async function refreshAll(store, fetcher = fetch) {
  const id = randomUUID(); store.startRun(id);
  const results = [];
  const sources = store.sources().filter(source => source.enabled);
  const discovery = searchSource(store);
  if (discovery) sources.push(discovery);
  async function refreshSource(source) {
    function record(update) {
      if (source.provider === 'adzuna') store.set('adzunaStatus', update);
      else store.saveSource({ ...source, ...update });
    }
    try {
      const jobs = await fetchSource(source, fetcher);
      const now = new Date().toISOString();
      const counts = store.ingest(source, jobs, now);
      record({lastAttempt:now, lastSuccess:now, error:null, total:counts.total});
      results.push({ company: source.company, sourceId:source.id, ok:true, ...counts });
    } catch (e) {
      const error = e.message?.slice(0, 350) || 'Could not reach source.';
      record({lastSuccess:source.lastSuccess || null, lastAttempt:new Date().toISOString(), error});
      results.push({ company:source.company, sourceId:source.id, ok:false, error });
    }
  }
  for (let offset = 0; offset < sources.length; offset += 5) {
    await Promise.all(sources.slice(offset, offset + 5).map(refreshSource));
  }
  const result = { results, added: results.reduce((n,r) => n+(r.added||0),0), succeeded:results.filter(r=>r.ok).length, failed:results.filter(r=>!r.ok).length };
  store.finishRun(id, result); return result;
}
