export const AREAS = {
  'Robotics & controls': ['robotics', 'control systems', 'ros2', 'embedded systems', 'computer vision'],
  'Software engineering': ['software engineering', 'typescript', 'javascript', 'react', 'backend', 'distributed systems'],
  'Data & analytics': ['sql', 'data science', 'tableau', 'power bi', 'statistics'],
  'Finance & accounting': ['financial modeling', 'accounting', 'finance', 'audit', 'financial analysis'],
  'Marketing & communications': ['marketing', 'copywriting', 'seo', 'communications', 'content strategy'],
  'Design & user experience': ['figma', 'ux design', 'user research', 'product design'],
  'Fluid mechanics': ['fluid mechanics', 'fluid dynamics', 'turbulence', 'boundary layer', 'flow control', 'hydrodynamics'],
  'Aerodynamics': ['aerodynamic', 'wind tunnel', 'aeroacoustic'],
  'Thermal sciences': ['thermal', 'heat transfer', 'thermodynamic', 'cooling', 'combustion'],
  'Experimental research': ['experimental', 'experimentation', 'piv', 'particle image velocimetry', 'instrumentation', 'daq', 'measurement'],
  'Simulation & modeling': ['simulation', 'modeling', 'modelling', 'cfd', 'fea', 'finite element', 'ansys', 'computational fluid'],
  'Scientific computing': ['scientific computing', 'numerical', 'python', 'matlab', 'machine learning', 'data analysis'],
  'Design & testing': ['mechanical design', 'cad', 'solidworks', 'prototype', 'prototyping', 'test engineer', 'testing'],
  'Energy & manufacturing': ['energy', 'manufacturing', 'additive', 'battery', 'renewable', 'materials']
};
export const SKILLS = ['MATLAB', 'Python', 'ANSYS', 'PIV', 'CFD', 'FEA', 'SolidWorks', 'LabVIEW', 'C++', 'Machine learning', 'Data analysis', 'Wind tunnel', 'Instrumentation', 'Heat transfer', 'Fluid mechanics', 'Aerodynamics', 'Turbulence', 'Research and development', 'Experimental design', 'Finite element', 'Thermodynamics', 'CAD', 'Numerical methods', 'ROS2', 'Robotics', 'Control systems', 'Embedded systems', 'Computer vision', 'TypeScript', 'JavaScript', 'React', 'SQL', 'Tableau', 'Power BI', 'Financial modeling', 'Accounting', 'Financial analysis', 'SEO', 'Copywriting', 'Figma', 'UX design', 'User research'];
export function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(text);
}
export function tagsFor(text) {
  return Object.entries(AREAS).filter(([, words]) => words.some(w => hasTerm(text, w) || (w.endsWith('ic') && text.toLowerCase().includes(w)))).map(([tag]) => tag);
}
export function inferKind(title, employment = '', description = '') {
  if (/\b(?:intern(?:ship)?s?|co-?op|student|summer research|visiting graduate)\b/i.test(`${title} ${employment}`)) return 'internship';
  if (/full[ -]?time|regular|permanent/i.test(employment) || /\b(?:employment type|job type|schedule)\s*:\s*full[ -]?time\b/i.test(description)) return 'fulltime';
  return 'other';
}
export function eligibilityFor(text) {
  // Conservative evidence rules. This is screening, never a determination of work authorization.
  const sentences = text.split(/(?<!\bU\.S\.)(?<!\bU\.)(?<=[.!?;])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const evidence = [];
  let restricted = false, accepted = false;
  for (const sentence of sentences) {
    const s = sentence.toLowerCase();
    const citizenship = /(?:must|require[sd]?|only|limited|restricted|need to).{0,85}(?:u\.?s\.?|united states) citiz|(?:u\.?s\.?|united states) citizens? only|(?:citizenship|permanent residen\w*).{0,40}(?:is |are )?required/i.test(s);
    const barredTraining = /(?:cannot|do not|does not|will not|not able to|unable to).{0,55}(?:accept|consider|support|hire|eligible).{0,55}(?:cpt|opt|f-?1)|(?:cpt|opt|f-?1).{0,40}(?:not accepted|not eligible|ineligible|not supported)/i.test(s);
    const negatedRestriction = /(?:citizenship.{0,12}(?:is )?not required|no citizenship requirement|citizenship is not a requirement|(?:do|does) not require.{0,30}citizenship)/i.test(s);
    const positive = /(?:accept|welcome|eligible|consider|may apply|can apply|supported).{0,65}(?:\bcpt\b|\bf-?1\b)|(?:\bcpt\b|\bf-?1\b).{0,65}(?:accept|welcome|eligible|may apply|can apply|supported)/i.test(s);
    const caution = /sponsor|export.control|itar|ear\b|u\.?s\.? person|clearance|foreign national|citizenship|permanent residen|\bcpt\b|\bopt\b|f-?1|work authoriz/i.test(s);
    if ((citizenship && !negatedRestriction) || barredTraining) restricted = true;
    if (positive && !barredTraining && !/not eligible|ineligible|not accept/.test(s)) accepted = true;
    if (caution && evidence.length < 8) evidence.push(sentence.slice(0, 1200));
  }
  const ambiguousAccess = evidence.some(s => /export.control|itar|\bear\b|u\.?s\.? person|clearance|future.{0,35}sponsor|sponsor.{0,35}future|no sponsorship|not.{0,15}sponsor|without.{0,20}sponsor/i.test(s));
  return {
    status: restricted ? 'restricted' : accepted && !ambiguousAccess ? 'explicit' : 'review',
    evidence,
    note: restricted ? 'An explicit requirement appears to conflict with the stated F-1 profile. Check the original wording.' : accepted && !ambiguousAccess ? 'The posting explicitly mentions F-1/CPT acceptance. University authorization and all other requirements still apply.' : 'Employer acceptance or access requirements need verification. Missing information is not approval.'
  };
}
export function matchJob(job, profile) {
  const text = `${job.title} ${job.description} ${(job.tags || []).join(' ')}`;
  const skills = (profile.skills || []).filter(s => hasTerm(text, s));
  const jobTags = job.tags?.length ? job.tags : tagsFor(text);
  const areas = (profile.areas || []).filter(a => jobTags.includes(a));
  const total = Math.max(1, (profile.skills || []).length);
  const score = Math.min(100, Math.round(areas.length * 17 + Math.min(35, skills.length / Math.min(total, 5) * 35)));
  return { score, skills, areas, explanation: [...areas.map(a => `Related research: ${a}`), ...skills.map(s => `Skill mentioned: ${s}`)].slice(0, 8), gaps: (profile.skills || []).filter(s => !skills.includes(s)).slice(0, 5) };
}
export function suggestProfile(text) {
  return { skills: SKILLS.filter(s => hasTerm(text, s)), areas: tagsFor(text), words: text.split(/\s+/).length };
}
