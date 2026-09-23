#!/usr/bin/env node
// Build a single-file, no-server edition of the canvas.
//
//   node tools/build-standalone.js [out.html]
//
// Reads index.html + data/*.json, embeds the cards as a seed and injects a
// fetch() shim that serves every /api/ route from localStorage. Open the
// result with file:// in Chrome. The seed is merged into the browser's local
// store on every load: new cards appear, positions/edits/done state made in
// the browser are kept. Re-run this after feeding data/ (./todo add …).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = process.argv[2] || '/Users/sam/REAL/SAM-TodoCanva/index.html';

const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return null; } };
const seed = {
  builtAt: new Date().toISOString(),
  pages: { 1: rd('entries.json') || [], 2: rd('entries-2.json') || [], 3: rd('entries-3.json') || [] },
  done: rd('done.json') || [],
  settings: rd('settings.json') || { floating: true },
};

const shim = `
<script>
// ---- standalone shim: serves /api/* from localStorage, seeded at build time ----
(function () {
  const SEED = __SEED__;
  const KEY = 'cfra.standalone.v2';
  const PAGES = [1, 2, 3];
  let S = null;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!S || !S.pages) S = { pages: { 1: [], 2: [], 3: [] }, done: [], settings: SEED.settings || { floating: true }, tomb: [] };
  S.tomb = S.tomb || [];
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));

  // merge the seed: add unknown cards, refresh text/date when the seed is newer,
  // never resurrect what the human crossed out or deleted, never move a card already here.
  const doneIds = new Set(S.done.map(d => d.id));
  const tomb = new Set(S.tomb);
  for (const p of PAGES) {
    const list = S.pages[p] = S.pages[p] || [];
    const idx = new Map(list.map((e, i) => [e.id, i]));
    for (const s of (SEED.pages[p] || [])) {
      if (doneIds.has(s.id) || tomb.has(s.id)) continue;
      const i = idx.get(s.id);
      if (i === undefined) list.push({ ...s });   // first import keeps the position the human gave it on the server copy
      else {
        const l = list[i];
        if (String(s.updatedAt || s.createdAt || '') > String(l.updatedAt || l.createdAt || '')) {
          l.text = s.text; l.date = s.date; l.updatedAt = s.updatedAt;
        }
      }
    }
  }
  for (const d of (SEED.done || [])) {
    if (!doneIds.has(d.id) && !PAGES.some(p => S.pages[p].some(e => e.id === d.id)) && !tomb.has(d.id)) S.done.push(d);
  }
  S.seededAt = SEED.builtAt;
  save();

  const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const valid = e => e && typeof e.text === 'string' && e.text.trim() && /^\\d{4}-\\d{2}-\\d{2}$/.test(e.date || '');
  const now = () => new Date().toISOString();
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  function route(method, U, body) {
    const p = U.pathname;
    const page = Number(U.searchParams.get('page') || 1);
    if (p === '/api/health') return json(200, { ok: true, dir: 'localStorage', counts: { 1: S.pages[1].length, 2: S.pages[2].length, 3: S.pages[3].length }, done: S.done.length, settings: S.settings, standalone: true, seededAt: S.seededAt });
    if (p === '/api/settings') {
      if (method === 'GET') return json(200, S.settings);
      if (method === 'PUT') { if (typeof body.floating === 'boolean') S.settings.floating = body.floating; save(); return json(200, S.settings); }
      return json(405, { error: 'method not allowed' });
    }
    if (p === '/api/done') {
      if (method === 'GET') return json(200, S.done.slice().sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''))));
      return json(405, { error: 'method not allowed' });
    }
    let m;
    if ((m = p.match(/^\\/api\\/done\\/([^/]+)\\/revert$/))) {
      const rec = S.done.find(e => e.id === m[1]); if (!rec) return json(404, { error: 'not found' });
      const pg = Number(rec.page); if (!PAGES.includes(pg)) return json(400, { error: 'invalid page on record' });
      const restored = { id: rec.id, text: rec.text, date: rec.date, createdAt: rec.createdAt, updatedAt: now() };
      if (typeof rec.x === 'number') restored.x = rec.x; if (typeof rec.y === 'number') restored.y = rec.y;
      if (!S.pages[pg].some(e => e.id === rec.id)) S.pages[pg].push(restored);
      S.done = S.done.filter(e => e.id !== rec.id); save();
      return json(200, { page: pg, entry: restored });
    }
    if ((m = p.match(/^\\/api\\/done\\/([^/]+)$/))) {
      if (method !== 'DELETE') return json(405, { error: 'method not allowed' });
      const n = S.done.filter(e => e.id !== m[1]); if (n.length === S.done.length) return json(404, { error: 'not found' });
      S.done = n; S.tomb.push(m[1]); save(); return json(200, { ok: true });
    }
    if ((m = p.match(/^\\/api\\/entries\\/([^/]+)\\/done$/))) {
      if (method !== 'POST') return json(405, { error: 'method not allowed' });
      if (!PAGES.includes(page)) return json(400, { error: 'page must be 1, 2 or 3' });
      const list = S.pages[page]; const f = list.find(e => e.id === m[1]); if (!f) return json(404, { error: 'not found' });
      const d = { id: f.id, text: f.text, date: f.date, page, createdAt: f.createdAt, doneAt: now() };
      if (f.updatedAt) d.updatedAt = f.updatedAt;
      const x = typeof body.x === 'number' ? body.x : f.x, y = typeof body.y === 'number' ? body.y : f.y;
      if (typeof x === 'number') d.x = x; if (typeof y === 'number') d.y = y;
      S.done = [...S.done.filter(e => e.id !== d.id), d]; S.pages[page] = list.filter(e => e.id !== f.id); save();
      return json(200, d);
    }
    if ((m = p.match(/^\\/api\\/entries(?:\\/([^/]+))?$/))) {
      const id = m[1];
      if (!PAGES.includes(page)) return json(400, { error: 'page must be 1, 2 or 3' });
      const list = S.pages[page];
      if (method === 'GET' && !id) return json(200, list);
      if (method === 'POST' && !id) {
        if (!valid(body)) return json(400, { error: 'text and date (YYYY-MM-DD) required' });
        const e = { id: newId(), text: body.text.trim(), date: body.date, createdAt: now() };
        if (typeof body.x === 'number') e.x = body.x; if (typeof body.y === 'number') e.y = body.y;
        list.push(e); save(); return json(201, e);
      }
      if (method === 'PUT' && !id) {
        if (!Array.isArray(body)) return json(400, { error: 'array expected' });
        for (const r of body) if (!valid(r)) return json(400, { error: 'invalid entry' });
        const t = now(); const idx = new Map(list.map((e, i) => [e.id, i]));
        for (const r of body) {
          const i = r.id ? idx.get(r.id) : undefined;
          const base = i !== undefined ? list[i] : { id: r.id || newId(), createdAt: t };
          const e = { ...base, text: r.text.trim(), date: r.date, updatedAt: t };
          if (typeof r.x === 'number') e.x = r.x; else delete e.x;
          if (typeof r.y === 'number') e.y = r.y; else delete e.y;
          if (i !== undefined) list[i] = e; else { idx.set(e.id, list.length); list.push(e); }
        }
        save(); return json(200, list);
      }
      if (method === 'PUT' && id) {
        const i = list.findIndex(e => e.id === id); if (i < 0) return json(404, { error: 'not found' });
        const merged = { ...list[i], ...body, id }; if (!valid(merged)) return json(400, { error: 'invalid' });
        merged.text = merged.text.trim(); merged.updatedAt = now(); list[i] = merged; save(); return json(200, merged);
      }
      if (method === 'DELETE' && id) {
        const n = list.filter(e => e.id !== id); if (n.length === list.length) return json(404, { error: 'not found' });
        S.pages[page] = n; S.tomb.push(id); save(); return json(200, { ok: true });
      }
      return json(405, { error: 'method not allowed' });
    }
    return json(404, { error: 'not found' });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts = {}) {
    const u = String(url);
    if (!/^(https?:\\/\\/localhost:8790)?\\/api\\//.test(u)) return realFetch(url, opts);
    const U = new URL(u, 'http://localhost:8790');
    let body = {}; try { body = opts.body ? JSON.parse(opts.body) : {}; } catch {}
    try { return route((opts.method || 'GET').toUpperCase(), U, body); }
    catch (e) { return json(500, { error: String(e && e.message || e) }); }
  };

  // corner badge: what this file is, when it was last fed, and an export of the local store
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('a');
    b.href = '#'; b.title = 'Click to export this browser\\'s cards as JSON';
    b.textContent = 'LOCAL FILE · fed ' + String(SEED.builtAt).slice(0, 16).replace('T', ' ');
    b.style.cssText = 'position:fixed;left:12px;bottom:10px;font:11px/1 system-ui,sans-serif;letter-spacing:.04em;opacity:.45;text-decoration:none;color:inherit;z-index:50';
    b.addEventListener('click', e => {
      e.preventDefault();
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cfra-local-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    });
    document.body.appendChild(b);
  });
})();
</script>
`;

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const seedJs = JSON.stringify(seed).replace(/<\/script/gi, '<\\/script');
const marker = '<script>';
const at = html.indexOf(marker);
if (at < 0) throw new Error('no <script> in index.html');
html = html.slice(0, at) + shim.replace('__SEED__', seedJs) + html.slice(at);
html = html.replace('<title>', '<!-- standalone build ' + seed.builtAt + ' — generated by tools/build-standalone.js, do not edit -->\n<title>');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const n = p => seed.pages[p].length;
console.log(`wrote ${OUT}  (cards: ${n(1)} / ${n(2)} / ${n(3)}, done ${seed.done.length}, built ${seed.builtAt})`);
