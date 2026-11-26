import { SKILLS } from './matching.mjs';

export const ADZUNA_ID = 'discovery-adzuna';

const starterBoards = [
  ['greenhouse', 'formlabsinternships', 'Formlabs Internships'],
  ['greenhouse', 'sharkninjaoperatingllc', 'SharkNinja'],
  ['greenhouse', 'lotusworks', 'LotusWorks'],
  ['greenhouse', 'pacificfusion', 'Pacific Fusion'],
  ['lever', 'xcimer', 'Xcimer Energy'],
  ['greenhouse', 'metoxinternationalinc', 'MetOx International'],
  ['greenhouse', 'kairospower', 'Kairos Power'],
  ['greenhouse', 'redwoodmaterials', 'Redwood Materials'],
  ['greenhouse', 'figureai', 'Figure'],
  ['lever', 'loftorbital', 'Loft Orbital']
];

export function installStarterBoards(store) {
  if (store.setting('starterBoardsV3', false)) return;
  const previousStarterBoards = store.setting('starterBoardsV2', false);
  for (const [provider, slug, company] of (previousStarterBoards ? starterBoards.slice(5) : starterBoards)) {
    if (store.sources().some(source => source.provider === provider && source.slug.toLowerCase() === slug)) continue;
    store.saveSource({
      id: `starter-${provider}-${slug}`,
      provider, slug, company, organization: 'Industry',
      enabled: true, starter: true, lastSuccess: null, error: null
    });
  }
  store.saveSource({
    id: 'starter-jobicy-us', provider: 'jobicy', slug: 'us-remote',
    company: 'Jobicy · US remote', organization: 'Not specified',
    enabled: true, starter: true, lastSuccess: null, error: null
  });
  store.set('starterBoardsV2', true);
  store.set('starterBoardsV3', true);
}

const researchTerms = {
  'Robotics & controls': 'robotics controls',
  'Software engineering': 'software engineer',
  'Data & analytics': 'data analyst',
  'Finance & accounting': 'financial analyst',
  'Marketing & communications': 'marketing communications',
  'Design & user experience': 'user experience design',
  'Fluid mechanics': 'fluid dynamics',
  'Aerodynamics': 'aerodynamics',
  'Thermal sciences': 'thermal engineering',
  'Experimental research': 'experimental mechanics',
  'Simulation & modeling': 'engineering simulation',
  'Scientific computing': 'scientific computing',
  'Design & testing': 'mechanical test engineering',
  'Energy & manufacturing': 'advanced manufacturing'
};

export function discoveryQueries(profile) {
  const areas = (profile.areas || []).filter(area => Object.hasOwn(researchTerms, area)).map(area => researchTerms[area]);
  const skillTerms = new Map([
    ['piv', 'particle image velocimetry'], ['wind tunnel', 'wind tunnel'],
    ['ansys', 'finite element analysis'], ['cfd', 'computational fluid dynamics'],
    ['instrumentation', 'instrumentation'], ['machine learning', 'applied machine learning'],
    ['heat transfer', 'heat transfer']
  ]);
  const knownSkills = new Map(SKILLS.map(skill => [skill.toLowerCase(), skill]));
  const skills = (profile.skills || []).map(skill => {
    const key = skill.toLowerCase();
    return skillTerms.get(key) || knownSkills.get(key);
  }).filter(Boolean);
  const reviewed = (profile.searchTerms || []).filter(term => typeof term === 'string' && /^[\p{L}\p{N} .+#/&()'-]{2,64}$/u.test(term));
  const requested = [...new Set([...reviewed, ...areas, ...skills].map(term => term.toLowerCase()))].slice(0, 6);
  return requested.flatMap(term => [
    { term: /\bintern(?:ship)?\b/i.test(term) ? term : term + ' intern' },
    { term, fullTime: true },
  ]);
}

export function searchSource(store) {
  const credentials = store.setting('adzunaCredentials', {});
  if (!credentials.appId || !credentials.appKey) return null;
  const queries = discoveryQueries(store.setting('profile', {}));
  if (!queries.length) return null;
  return {
    id: ADZUNA_ID, provider: 'adzuna', company: 'Adzuna', enabled: true,
    ...store.setting('adzunaStatus', {}),
    credentials,
    queries
  };
}

export function publicDiscovery(store) {
  const source = searchSource(store);
  return {
    configured: Boolean(store.setting('adzunaCredentials', {}).appId),
    terms: discoveryQueries(store.setting('profile', {})).map(query => query.term),
    ...store.setting('adzunaStatus', {})
  };
}
