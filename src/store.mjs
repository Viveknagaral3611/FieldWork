import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { demoJobs } from './demo.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PROFILE = { name: 'Sample researcher', headline: 'Graduate researcher · Mechanical engineering', university: '', degree: 'PhD', visa: '', targetYear: 2027, skills: ['MATLAB', 'Python', 'PIV', 'ANSYS', 'Data analysis', 'Wind tunnel', 'Instrumentation'], areas: ['Fluid mechanics', 'Aerodynamics', 'Experimental research', 'Thermal sciences'], projects: '', resumeText: '', confirmed: false };
const BLANK_PROFILE = { ...DEFAULT_PROFILE, name: '', headline: '', university: '', degree: 'Other', visa: '', skills: [], areas: [] };
export function openStore(filename = process.env.FIELDWORK_DB || path.join(root, 'data', 'fieldwork.sqlite'), { starterProfile = true } = {}) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, external_id TEXT NOT NULL, url TEXT, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, UNIQUE(source_id, external_id));
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity (job_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, payload TEXT NOT NULL);
  `);
  const setting = (k, fallback) => { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return row ? JSON.parse(row.value) : fallback; };
  const set = (k, v) => db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  if (!setting('profile', null)) set('profile', starterProfile ? DEFAULT_PROFILE : BLANK_PROFILE);
  if (!setting('schedule', null)) set('schedule', { enabled: true, intervalHours: 24 });
  function jobs(demo = false) {
    const rows = demo ? demoJobs() : db.prepare('SELECT * FROM jobs ORDER BY first_seen DESC').all().map(r => ({ ...JSON.parse(r.payload), active: Boolean(r.active), firstSeen: r.first_seen, lastSeen: r.last_seen }));
    const activity = new Map(db.prepare('SELECT * FROM activity').all().map(a => [a.job_id, a]));
    const canonical = new Map();
    for (const j of rows) {
      const key = demo ? j.id : j.url || `${j.company.toLowerCase()}|${j.title.toLowerCase()}|${j.location.toLowerCase()}`;
      const old = canonical.get(key);
      if (!old) canonical.set(key, j);
      else {
        const a=activity.get(old.id), b=activity.get(j.id);
        const preferred=b&&(!a||b.updated_at>a.updated_at)?j:a?old:old.firstSeen<=j.firstSeen?old:j;
        canonical.set(key,{...preferred,active:old.active||j.active,firstSeen:old.firstSeen<j.firstSeen?old.firstSeen:j.firstSeen,lastSeen:old.lastSeen>j.lastSeen?old.lastSeen:j.lastSeen});
      }
    }
    return [...canonical.values()].map(j => ({...j, status: activity.get(j.id)?.status || 'new', notes: activity.get(j.id)?.notes || ''}));
  }
  const sources = () => db.prepare('SELECT payload FROM sources').all().map(r => JSON.parse(r.payload));
  const saveSource = s => { db.prepare('INSERT INTO sources VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(s.id, JSON.stringify(s)); return s; };
  function ingest(source, incoming, now = new Date().toISOString()) {
    const seen = new Set();
    let added = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const job of incoming) {
        const externalId = String(job.externalId);
        if (seen.has(externalId)) continue;
        seen.add(externalId);
        const existing = db.prepare('SELECT id FROM jobs WHERE source_id=? AND external_id=?').get(source.id, externalId);
        const id = existing?.id || randomUUID();
        if (!existing) added++;
        const payload = {...job, id, sourceId: source.id, demo: false};
        db.prepare(`INSERT INTO jobs VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(source_id, external_id) DO UPDATE SET url=excluded.url,payload=excluded.payload,active=1,last_seen=excluded.last_seen`).run(id, source.id, externalId, job.url, JSON.stringify(payload), now, now);
      }
      // Only call ingest after a complete, validated successful fetch. Missing entries then mean closed.
      for (const row of db.prepare('SELECT id,external_id FROM jobs WHERE source_id=? AND active=1').all(source.id)) {
        if (!seen.has(row.external_id)) db.prepare('UPDATE jobs SET active=0 WHERE id=?').run(row.id);
      }
      db.exec('COMMIT');
      return { added, total: seen.size };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return { db, setting, set, jobs, sources, saveSource, ingest,
    deleteSource(id) { db.exec('BEGIN'); try { db.prepare('UPDATE jobs SET active=0 WHERE source_id=?').run(id); db.prepare('DELETE FROM sources WHERE id=?').run(id); db.exec('COMMIT'); } catch(e) {db.exec('ROLLBACK');throw e;} },
    activity(id, status, notes) { db.prepare('INSERT INTO activity VALUES (?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at').run(id, status, notes, new Date().toISOString()); },
    startRun(id) { db.prepare('INSERT INTO runs VALUES (?,?,NULL,?)').run(id, new Date().toISOString(), '{}'); },
    finishRun(id, result) { db.prepare('UPDATE runs SET finished_at=?,payload=? WHERE id=?').run(new Date().toISOString(), JSON.stringify(result), id); },
    runs() { return db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 12').all().map(r => ({...r, ...JSON.parse(r.payload)})); },
    close() { db.close(); }
  };
}
