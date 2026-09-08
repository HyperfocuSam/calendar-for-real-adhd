#!/usr/bin/env node
// TodoCanva backend — zero dependencies, Node 18+.
// Serves index.html and a small JSON API. Data lives in data/entries.json.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8790;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PAGES = [1, 2, 3];
// Page 1 keeps the original file name so existing data carries over.
const dataFile = page => path.join(DATA_DIR, page === 1 ? 'entries.json' : `entries-${page}.json`);

// ---------- storage ----------
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Corrupt file: keep it aside rather than silently losing it.
      const bad = path.join(BACKUP_DIR, `corrupt-${path.basename(file)}-${Date.now()}.json`);
      try { fs.renameSync(file, bad); } catch {}
      console.error(`${file} unreadable, moved to ${bad}`);
    }
    return fallback;
  }
}
function readEntries(page) {
  const parsed = readJson(dataFile(page), []);
  return Array.isArray(parsed) ? parsed : [];
}
function readSettings() {
  const s = readJson(SETTINGS_FILE, {});
  return { floating: true, ...(s && typeof s === 'object' ? s : {}) };
}

let writeQueue = Promise.resolve();
function writeJson(file, value) {
  // Serialise writes; write to a temp file then rename so a crash mid-write
  // can never leave a half-written file.
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    const tmp = file + '.tmp';
    fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8', err => {
      if (err) return reject(err);
      fs.rename(tmp, file, err2 => err2 ? reject(err2) : resolve());
    });
  }));
  return writeQueue;
}
const writeEntries = (page, entries) => writeJson(dataFile(page), entries);

// Daily backup copy so an accidental mass delete is recoverable.
function dailyBackup() {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    for (const page of PAGES) {
      const src = dataFile(page);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(BACKUP_DIR, `page${page}-${stamp}.json`);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
      // keep the last 30 backups per page
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`page${page}-`)).sort();
      files.slice(0, Math.max(0, files.length - 30)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    }
  } catch (e) { console.error('backup failed', e); }
}
dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000);

// ---------- helpers ----------
function send(res, status, body, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
    // Allow the page to work when opened directly as file://index.html
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function validEntry(e) {
  return e && typeof e.text === 'string' && e.text.trim().length > 0 &&
    typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    (e.x === undefined || typeof e.x === 'number') &&
    (e.y === undefined || typeof e.y === 'number');
}
function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const m = url.pathname.match(/^\/api\/entries(?:\/([^/]+))?$/);

  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }); return res.end(); }
    if (m) {
      const id = m[1];
      const page = Number(url.searchParams.get('page') || 1);
      if (!PAGES.includes(page)) return send(res, 400, { error: 'page must be 1, 2 or 3' });
      let entries = readEntries(page);

      if (req.method === 'GET' && !id) return send(res, 200, entries);

      if (req.method === 'POST' && !id) {
        const body = await readBody(req);
        if (!validEntry(body)) return send(res, 400, { error: 'text and date (YYYY-MM-DD) required' });
        const entry = {
          id: newId(),
          text: body.text.trim(),
          date: body.date,
          createdAt: new Date().toISOString(),
        };
        if (typeof body.x === 'number') entry.x = body.x;
        if (typeof body.y === 'number') entry.y = body.y;
        entries.push(entry);
        await writeEntries(page, entries);
        return send(res, 201, entry);
      }

      // Bulk save: upsert every entry in the list (text, date, position).
      // Entries NOT in the list are left untouched, so a stale tab can never
      // wipe records added elsewhere. Deleting is only done via DELETE.
      if (req.method === 'PUT' && !id) {
        const body = await readBody(req);
        if (!Array.isArray(body)) return send(res, 400, { error: 'array expected' });
        for (const raw of body) {
          if (!validEntry(raw)) return send(res, 400, { error: 'invalid entry: ' + JSON.stringify(raw) });
        }
        const now = new Date().toISOString();
        const index = new Map(entries.map((e, i) => [e.id, i]));
        for (const raw of body) {
          const i = raw.id ? index.get(raw.id) : undefined;
          const base = i !== undefined ? entries[i] : { id: raw.id || newId(), createdAt: now };
          const e = { ...base, text: raw.text.trim(), date: raw.date, updatedAt: now };
          if (typeof raw.x === 'number') e.x = raw.x; else delete e.x;
          if (typeof raw.y === 'number') e.y = raw.y; else delete e.y;
          if (i !== undefined) entries[i] = e; else { index.set(e.id, entries.length); entries.push(e); }
        }
        await writeEntries(page, entries);
        return send(res, 200, entries);
      }

      if (req.method === 'PUT' && id) {
        const body = await readBody(req);
        const i = entries.findIndex(e => e.id === id);
        if (i < 0) return send(res, 404, { error: 'not found' });
        const merged = { ...entries[i], ...body, id };
        if (!validEntry(merged)) return send(res, 400, { error: 'invalid' });
        merged.text = merged.text.trim();
        merged.updatedAt = new Date().toISOString();
        entries[i] = merged;
        await writeEntries(page, entries);
        return send(res, 200, merged);
      }

      if (req.method === 'DELETE' && id) {
        const next = entries.filter(e => e.id !== id);
        if (next.length === entries.length) return send(res, 404, { error: 'not found' });
        await writeEntries(page, next);
        return send(res, 200, { ok: true });
      }

      return send(res, 405, { error: 'method not allowed' });
    }

    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') return send(res, 200, readSettings());
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const next = { ...readSettings() };
        if (typeof body.floating === 'boolean') next.floating = body.floating;
        await writeJson(SETTINGS_FILE, next);
        return send(res, 200, next);
      }
      return send(res, 405, { error: 'method not allowed' });
    }

    if (url.pathname === '/api/health') {
      const counts = {};
      PAGES.forEach(p => counts[p] = readEntries(p).length);
      return send(res, 200, { ok: true, dir: DATA_DIR, counts, settings: readSettings() });
    }

    // Static: only index.html is served.
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(ROOT, 'index.html'));
      return send(res, 200, html, 'text/html');
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TodoCanva running at http://localhost:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
});
