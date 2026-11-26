import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { installStarterBoards } from './discovery.mjs';

const deriveKey = promisify(scrypt);
const sessionSeconds = 7 * 24 * 60 * 60;
const sessionCookie = 'fieldwork_session';
const digest = token => createHash('sha256').update(token).digest('hex');
const baseFile = process.env.FIELDWORK_DB || fileURLToPath(new URL('../data/fieldwork.sqlite', import.meta.url));

export function accountsFor(baseStore) {
  const { db } = baseStore;
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
      password_key TEXT NOT NULL, use_legacy_workspace INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      expires INTEGER NOT NULL
    );
  `);
  const stores = new Map();
  const attempts = new Map();
  const list = () => db.prepare('SELECT id, email, use_legacy_workspace FROM accounts').all();
  function workspace(account) {
    if (account.use_legacy_workspace) return baseStore;
    if (!stores.has(account.id)) {
      const filename = baseFile === ':memory:' ? baseFile : path.join(path.dirname(baseFile), 'accounts', account.id + '.sqlite');
      const store = openStore(filename, { starterProfile: false });
      installStarterBoards(store);
      stores.set(account.id, store);
    }
    return stores.get(account.id);
  }

  async function authenticate(action, input) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 256) {
      throw new Error('Enter a valid email and a password of 12 to 256 characters.');
    }
    const now = Date.now();
    for (const [address, attempt] of attempts) if (attempt.expires <= now) attempts.delete(address);
    const attempt = attempts.get(email) || { count: 0, expires: now + 15 * 60_000 };
    if (attempt.count >= 8 || attempts.size >= 256) {
      throw Object.assign(new Error('Too many attempts. Try again in 15 minutes.'), { status: 429 });
    }
    attempts.set(email, { ...attempt, count: attempt.count + 1 });
    let account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
    if (action === 'register') {
      const salt = randomBytes(24).toString('hex');
      const key = await deriveKey(password, salt, 64);
      const id = randomUUID();
      // Registration is local-only. The first PC account adopts the existing workspace.
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO accounts
        SELECT ?, ?, ?, ?, CASE WHEN EXISTS(SELECT 1 FROM accounts) THEN 0 ELSE 1 END
      `).run(id, email, salt, key.toString('hex'));
      if (!inserted.changes) throw Object.assign(new Error('That account already exists. Sign in instead.'), { status: 409 });
      account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
      workspace(account);
    } else {
      const key = await deriveKey(password, account?.salt || 'fieldwork-missing-account', 64);
      if (!account || !timingSafeEqual(key, Buffer.from(account.password_key, 'hex'))) {
        throw Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
      }
    }
    attempts.delete(email);
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), account.id, now + sessionSeconds * 1000);
    return { email, token };
  }

  function tokenFrom(req) {
    return /(?:^|;\s*)fieldwork_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  }

  function current(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    return db.prepare(`
      SELECT accounts.id, accounts.email, accounts.use_legacy_workspace
      FROM sessions JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.expires > ?
    `).get(digest(token), Date.now()) || null;
  }

  function logout(req) {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }

  function cookie(token = '') {
    return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? sessionSeconds : 0}`;
  }

  return { authenticate, current, logout, cookie, list, workspace, close() {
    for (const store of stores.values()) store.close();
    baseStore.close();
  } };
}
