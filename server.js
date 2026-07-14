const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET;
const IS_STAGING = process.env.USERNODE_ENV === 'staging';

// All staging demo rows (see seed below) belong to this fake user id.
const DEMO_USER_ID = 900001;

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

// 5mb: import files can carry a whole workout history (see /api/import limits).
app.use(express.json({ limit: '5mb' }));

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_SECRET) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Browsers auto-request /favicon.ico with no platform token. Serve it as a
// public, non-401 route (an SVG with the app's weightlifter glyph) so the
// request resolves cleanly and doesn't fall through to the auth-gated
// catch-all — a stray 401 there trips the baseline "no console errors" check.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#7c3aed"/><text x="32" y="34" font-size="34" text-anchor="middle" dominant-baseline="central">🏋️</text></svg>`;
app.get('/favicon.ico', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(FAVICON_SVG);
});

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => res.status(500).json({ error: err.message }));

// GET routes may read the staging demo user's rows via ?demo=1 (staging
// only, strictly read-only — every write route uses req.user.id directly).
function readUserId(req) {
  return IS_STAGING && req.query.demo === '1' ? DEMO_USER_ID : req.user.id;
}

function idParam(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function cleanNote(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t.slice(0, 500) : null;
}

// Merge a set payload over an existing row (null for create) and validate.
// If set_type flips reps↔time, the new type's fields must be in the patch;
// the other type's fields are nulled to keep the populated-columns
// convention intact.
function buildSetValues(body, existing) {
  const has = (k) => body !== null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, k);
  const set_type = has('set_type') ? body.set_type : (existing ? existing.set_type : undefined);
  if (set_type !== 'reps' && set_type !== 'time') {
    return { error: 'set_type must be "reps" or "time"' };
  }
  const flipped = !!existing && set_type !== existing.set_type;
  const inherit = (k) => (existing && !flipped ? existing[k] : undefined);
  const out = { set_type, reps: null, weight: null, duration_seconds: null, effort: null };

  if (set_type === 'reps') {
    const repsSrc = has('reps') ? body.reps : inherit('reps');
    const weightSrc = has('weight') ? body.weight : inherit('weight');
    const reps = Number(repsSrc);
    if (repsSrc === undefined || repsSrc === null || repsSrc === '' || !Number.isInteger(reps) || reps < 1 || reps > 9999) {
      return { error: 'reps must be a whole number between 1 and 9999' };
    }
    const weight = Number(weightSrc);
    if (weightSrc === undefined || weightSrc === null || weightSrc === '' || !Number.isFinite(weight) || weight < 0 || weight > 99999) {
      return { error: 'weight must be a number ≥ 0 (use 0 for bodyweight)' };
    }
    out.reps = reps;
    out.weight = Math.round(weight * 100) / 100;
  } else {
    const durSrc = has('duration_seconds') ? body.duration_seconds : inherit('duration_seconds');
    const dur = Number(durSrc);
    if (durSrc === undefined || durSrc === null || durSrc === '' || !Number.isInteger(dur) || dur < 1 || dur > 86400) {
      return { error: 'duration_seconds must be a whole number between 1 and 86400' };
    }
    out.duration_seconds = dur;
    const effortSrc = has('effort') ? body.effort : inherit('effort');
    const effort = effortSrc === null || effortSrc === undefined ? null : String(effortSrc).trim().slice(0, 120);
    out.effort = effort || null;
  }
  // side / is_drop / note apply to both shapes, so they survive a reps↔time
  // flip: inherit straight from the existing row, not via type-scoped inherit().
  const sideSrc = has('side') ? body.side : (existing ? existing.side : null);
  if (sideSrc !== null && sideSrc !== undefined && sideSrc !== '' && sideSrc !== 'left' && sideSrc !== 'right') {
    return { error: 'side must be "left", "right", or null' };
  }
  out.side = sideSrc === 'left' || sideSrc === 'right' ? sideSrc : null;
  out.is_drop = has('is_drop') ? !!body.is_drop : !!(existing && existing.is_drop);
  out.note = has('note') ? cleanNote(body.note) : (existing ? existing.note : null);
  return { values: out };
}

async function findEntry(entryId, userId) {
  const { rows } = await pool.query(
    `SELECT se.id, se.session_id, se.exercise_id, se.note
     FROM session_exercises se
     JOIN workout_sessions s ON s.id = se.session_id
     WHERE se.id = $1 AND s.user_id = $2`,
    [entryId, userId]
  );
  return rows[0];
}

async function findSet(setId, userId) {
  const { rows } = await pool.query(
    `SELECT st.id, st.session_exercise_id, st.set_type, st.reps, st.weight,
            st.duration_seconds, st.effort, st.side, st.is_drop, st.note, st.created_at
     FROM sets st
     JOIN session_exercises se ON se.id = st.session_exercise_id
     JOIN workout_sessions s ON s.id = se.session_id
     WHERE st.id = $1 AND s.user_id = $2`,
    [setId, userId]
  );
  return rows[0];
}

// ---------- Sessions ----------

app.post('/api/sessions', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'INSERT INTO workout_sessions (user_id) VALUES ($1) RETURNING id, started_at',
    [req.user.id]
  );
  res.json(rows[0]);
}));

app.get('/api/sessions', wrap(async (req, res) => {
  const uid = readUserId(req);
  const { rows } = await pool.query(
    `SELECT s.id, s.started_at, s.note,
            COUNT(DISTINCT se.id)::int AS exercise_count,
            COUNT(st.id)::int AS set_count,
            (SELECT string_agg(e2.name, ', ' ORDER BY se2.created_at, se2.id)
             FROM session_exercises se2
             JOIN exercises e2 ON e2.id = se2.exercise_id
             WHERE se2.session_id = s.id) AS exercise_names
     FROM workout_sessions s
     LEFT JOIN session_exercises se ON se.session_id = s.id
     LEFT JOIN sets st ON st.session_exercise_id = se.id
     WHERE s.user_id = $1
     GROUP BY s.id
     ORDER BY s.started_at DESC, s.id DESC`,
    [uid]
  );
  res.json({ sessions: rows });
}));

app.get('/api/sessions/:id', wrap(async (req, res) => {
  const uid = readUserId(req);
  const sid = idParam(req.params.id);
  if (!sid) return res.status(404).json({ error: 'Session not found' });
  const s = (await pool.query(
    'SELECT id, started_at, note FROM workout_sessions WHERE id = $1 AND user_id = $2',
    [sid, uid]
  )).rows[0];
  if (!s) return res.status(404).json({ error: 'Session not found' });

  // Entries plus, per entry, the most recent EARLIER session's entry for the
  // same exercise ("last time") — only counting entries that have sets.
  const entries = (await pool.query(
    `SELECT se.id, se.exercise_id, se.note, e.name,
            lt.entry_id AS lt_entry_id, lt.lt_started_at
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     LEFT JOIN LATERAL (
       SELECT se2.id AS entry_id, s2.started_at AS lt_started_at
       FROM session_exercises se2
       JOIN workout_sessions s2 ON s2.id = se2.session_id
       WHERE se2.exercise_id = se.exercise_id
         AND s2.user_id = $2
         AND se2.session_id <> $1
         AND (s2.started_at, s2.id) < ($3::timestamptz, $1::integer)
         AND EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se2.id)
       ORDER BY s2.started_at DESC, s2.id DESC, se2.created_at DESC, se2.id DESC
       LIMIT 1
     ) lt ON true
     WHERE se.session_id = $1
     ORDER BY se.created_at, se.id`,
    [sid, uid, s.started_at]
  )).rows;

  const entryIds = entries.map((e) => e.id)
    .concat(entries.map((e) => e.lt_entry_id).filter(Boolean));
  const setsByEntry = {};
  if (entryIds.length) {
    const sets = (await pool.query(
      `SELECT id, session_exercise_id, set_type, reps, weight, duration_seconds, effort, side, is_drop, note, created_at
       FROM sets WHERE session_exercise_id = ANY($1::int[])
       ORDER BY created_at, id`,
      [entryIds]
    )).rows;
    for (const st of sets) {
      (setsByEntry[st.session_exercise_id] = setsByEntry[st.session_exercise_id] || []).push(st);
    }
  }

  res.json({
    id: s.id,
    started_at: s.started_at,
    note: s.note,
    entries: entries.map((e) => ({
      id: e.id,
      exercise_id: e.exercise_id,
      name: e.name,
      note: e.note,
      sets: setsByEntry[e.id] || [],
      last_time: e.lt_entry_id
        ? { started_at: e.lt_started_at, sets: setsByEntry[e.lt_entry_id] || [] }
        : null,
    })),
  });
}));

app.patch('/api/sessions/:id', wrap(async (req, res) => {
  const sid = idParam(req.params.id);
  if (!sid) return res.status(404).json({ error: 'Session not found' });
  const owned = (await pool.query(
    'SELECT id FROM workout_sessions WHERE id = $1 AND user_id = $2',
    [sid, req.user.id]
  )).rows[0];
  if (!owned) return res.status(404).json({ error: 'Session not found' });
  const note = cleanNote(req.body && req.body.note);
  await pool.query('UPDATE workout_sessions SET note = $2 WHERE id = $1', [sid, note]);
  res.json({ id: sid, note });
}));

app.delete('/api/sessions/:id', wrap(async (req, res) => {
  const sid = idParam(req.params.id);
  if (!sid) return res.status(404).json({ error: 'Session not found' });
  const { rowCount } = await pool.query(
    'DELETE FROM workout_sessions WHERE id = $1 AND user_id = $2',
    [sid, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true });
}));

// ---------- Exercises ----------

// Returns the user's FULL exercise list (MRU-first, no LIMIT) — the picker
// fetches once and filters client-side, so a row cap silently hides older
// exercises from search.
app.get('/api/exercises', wrap(async (req, res) => {
  const uid = readUserId(req);
  const q = String(req.query.q || '').trim();
  const pattern = '%' + q.replace(/([\\%_])/g, '\\$1') + '%';
  const { rows } = await pool.query(
    `SELECT e.id, e.name
     FROM exercises e
     LEFT JOIN session_exercises se ON se.exercise_id = e.id
     WHERE e.user_id = $1 AND e.name ILIKE $2
     GROUP BY e.id
     ORDER BY GREATEST(e.created_at, COALESCE(MAX(se.created_at), e.created_at)) DESC, e.id DESC`,
    [uid, pattern]
  );
  res.json({ exercises: rows });
}));

app.post('/api/exercises', wrap(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'Exercise name is required' });
  if (name.length > 120) return res.status(400).json({ error: 'Exercise name must be 120 characters or fewer' });
  // Create-or-get: the no-op DO UPDATE makes RETURNING yield the existing
  // row on a case-insensitive duplicate, keeping its original casing.
  const { rows } = await pool.query(
    `INSERT INTO exercises (user_id, name) VALUES ($1, $2)
     ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = exercises.name
     RETURNING id, name`,
    [req.user.id, name]
  );
  res.json(rows[0]);
}));

// ---------- Session exercises (entries) ----------

app.post('/api/sessions/:id/exercises', wrap(async (req, res) => {
  const sid = idParam(req.params.id);
  const exId = idParam(req.body && req.body.exercise_id);
  if (!sid) return res.status(404).json({ error: 'Session not found' });
  if (!exId) return res.status(400).json({ error: 'exercise_id is required' });
  const owned = (await pool.query(
    'SELECT id FROM workout_sessions WHERE id = $1 AND user_id = $2',
    [sid, req.user.id]
  )).rows[0];
  if (!owned) return res.status(404).json({ error: 'Session not found' });
  const ex = (await pool.query(
    'SELECT id, name FROM exercises WHERE id = $1 AND user_id = $2',
    [exId, req.user.id]
  )).rows[0];
  if (!ex) return res.status(404).json({ error: 'Exercise not found' });
  const { rows } = await pool.query(
    'INSERT INTO session_exercises (session_id, exercise_id) VALUES ($1, $2) RETURNING id',
    [sid, exId]
  );
  res.json({ id: rows[0].id, exercise_id: ex.id, name: ex.name });
}));

app.patch('/api/session-exercises/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Entry not found' });
  const entry = await findEntry(id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const note = cleanNote(req.body && req.body.note);
  await pool.query('UPDATE session_exercises SET note = $2 WHERE id = $1', [id, note]);
  res.json({ id, note });
}));

app.delete('/api/session-exercises/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Entry not found' });
  const entry = await findEntry(id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  await pool.query('DELETE FROM session_exercises WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ---------- Sets ----------

app.post('/api/session-exercises/:id/sets', wrap(async (req, res) => {
  const entryId = idParam(req.params.id);
  if (!entryId) return res.status(404).json({ error: 'Entry not found' });
  const entry = await findEntry(entryId, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const { error, values } = buildSetValues(req.body || {}, null);
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `INSERT INTO sets (session_exercise_id, set_type, reps, weight, duration_seconds, effort, side, is_drop, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, session_exercise_id, set_type, reps, weight, duration_seconds, effort, side, is_drop, note, created_at`,
    [entryId, values.set_type, values.reps, values.weight, values.duration_seconds, values.effort, values.side, values.is_drop, values.note]
  );
  res.json(rows[0]);
}));

app.patch('/api/sets/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Set not found' });
  const existing = await findSet(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Set not found' });
  const { error, values } = buildSetValues(req.body || {}, existing);
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `UPDATE sets SET set_type = $2, reps = $3, weight = $4, duration_seconds = $5, effort = $6, side = $7, is_drop = $8, note = $9
     WHERE id = $1
     RETURNING id, session_exercise_id, set_type, reps, weight, duration_seconds, effort, side, is_drop, note, created_at`,
    [id, values.set_type, values.reps, values.weight, values.duration_seconds, values.effort, values.side, values.is_drop, values.note]
  );
  res.json(rows[0]);
}));

app.delete('/api/sets/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Set not found' });
  const existing = await findSet(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Set not found' });
  await pool.query('DELETE FROM sets WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ---------- Import / export ----------

const EXPORT_FORMAT = 'gym-tracker-export';
const MAX_IMPORT_SESSIONS = 1000;
const MAX_IMPORT_SETS = 20000;

function exportSet(st) {
  const out = st.set_type === 'reps'
    ? { type: 'reps', reps: st.reps, weight: st.weight === null ? null : parseFloat(st.weight) }
    : { type: 'time', duration_seconds: st.duration_seconds, effort: st.effort };
  out.side = st.side;
  out.drop = st.is_drop;
  out.note = st.note;
  out.created_at = st.created_at;
  return out;
}

app.get('/api/export', wrap(async (req, res) => {
  const uid = readUserId(req);
  const sessions = (await pool.query(
    'SELECT id, started_at, note FROM workout_sessions WHERE user_id = $1 ORDER BY started_at DESC, id DESC',
    [uid]
  )).rows;
  const entries = (await pool.query(
    `SELECT se.id, se.session_id, se.note, e.name
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     JOIN workout_sessions s ON s.id = se.session_id
     WHERE s.user_id = $1
     ORDER BY se.created_at, se.id`,
    [uid]
  )).rows;
  const sets = (await pool.query(
    `SELECT st.session_exercise_id, st.set_type, st.reps, st.weight,
            st.duration_seconds, st.effort, st.side, st.is_drop, st.note, st.created_at
     FROM sets st
     JOIN session_exercises se ON se.id = st.session_exercise_id
     JOIN workout_sessions s ON s.id = se.session_id
     WHERE s.user_id = $1
     ORDER BY st.created_at, st.id`,
    [uid]
  )).rows;

  const setsByEntry = {};
  for (const st of sets) {
    (setsByEntry[st.session_exercise_id] = setsByEntry[st.session_exercise_id] || []).push(st);
  }
  const entriesBySession = {};
  for (const en of entries) {
    (entriesBySession[en.session_id] = entriesBySession[en.session_id] || []).push(en);
  }

  const day = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="gym-tracker-export-${day}.json"`);
  res.json({
    format: EXPORT_FORMAT,
    version: 1,
    exported_at: new Date().toISOString(),
    sessions: sessions.map((s) => ({
      started_at: s.started_at,
      note: s.note,
      exercises: (entriesBySession[s.id] || []).map((en) => ({
        name: en.name,
        note: en.note,
        sets: (setsByEntry[en.id] || []).map(exportSet),
      })),
    })),
  });
}));

// Accepts a string parseable as a date; returns a Date or null.
function parseImportDate(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Validate the whole payload up front (all-or-nothing — nothing is written
// if any part is invalid), returning either { error } with a JSON-path-style
// pointer or the parsed sessions ready to insert.
function parseImportPayload(body) {
  const sessions = Array.isArray(body)
    ? body
    : (body && typeof body === 'object' && Array.isArray(body.sessions) ? body.sessions : null);
  if (!sessions) return { error: 'Expected a gym-tracker export with a sessions array' };
  if (sessions.length > MAX_IMPORT_SESSIONS) {
    return { error: `Too many sessions: ${sessions.length} (max ${MAX_IMPORT_SESSIONS} per import)` };
  }

  const parsed = [];
  let totalSets = 0;
  for (let i = 0; i < sessions.length; i++) {
    const at = `sessions[${i}]`;
    const s = sessions[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: `${at}: expected an object` };
    const started_at = parseImportDate(s.started_at);
    if (!started_at) return { error: `${at}.started_at: must be a valid date string` };
    const exercises = s.exercises === undefined || s.exercises === null ? [] : s.exercises;
    if (!Array.isArray(exercises)) return { error: `${at}.exercises: must be an array` };

    const outExercises = [];
    for (let j = 0; j < exercises.length; j++) {
      const exAt = `${at}.exercises[${j}]`;
      const ex = exercises[j];
      if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return { error: `${exAt}: expected an object` };
      const name = String(ex.name || '').trim().replace(/\s+/g, ' ');
      if (!name) return { error: `${exAt}.name: exercise name is required` };
      if (name.length > 120) return { error: `${exAt}.name: exercise name must be 120 characters or fewer` };
      const rawSets = ex.sets === undefined || ex.sets === null ? [] : ex.sets;
      if (!Array.isArray(rawSets)) return { error: `${exAt}.sets: must be an array` };

      const outSets = [];
      for (let k = 0; k < rawSets.length; k++) {
        const setAt = `${exAt}.sets[${k}]`;
        const st = rawSets[k];
        if (!st || typeof st !== 'object' || Array.isArray(st)) return { error: `${setAt}: expected an object` };
        // The export format says `type`/`drop`; also accept `set_type` /
        // `is_drop` verbatim. buildSetValues validates side and is_drop.
        const { error, values } = buildSetValues({
          ...st,
          set_type: st.set_type !== undefined ? st.set_type : st.type,
          is_drop: st.is_drop !== undefined ? st.is_drop : st.drop,
        }, null);
        if (error) return { error: `${setAt}: ${error}` };
        if (st.created_at !== undefined && st.created_at !== null) {
          const d = parseImportDate(st.created_at);
          if (!d) return { error: `${setAt}.created_at: must be a valid date string` };
          values.created_at = d;
        }
        outSets.push(values);
        totalSets++;
      }
      outExercises.push({ name, note: cleanNote(ex.note), sets: outSets });
    }
    parsed.push({ started_at, note: cleanNote(s.note), exercises: outExercises });
  }
  if (totalSets > MAX_IMPORT_SETS) {
    return { error: `Too many sets: ${totalSets} (max ${MAX_IMPORT_SETS} per import)` };
  }
  return { parsed };
}

app.post('/api/import', wrap(async (req, res) => {
  const { error, parsed } = parseImportPayload(req.body);
  if (error) return res.status(400).json({ error });

  // Duplicate-skip by exact started_at: re-importing your own export is
  // idempotent. The set also dedupes repeats within the file itself.
  const existing = (await pool.query(
    'SELECT started_at FROM workout_sessions WHERE user_id = $1',
    [req.user.id]
  )).rows;
  const seen = new Set(existing.map((r) => r.started_at.getTime()));

  let imported = 0;
  let skipped = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exerciseIds = new Map(); // lowercased name -> id, per import
    for (const s of parsed) {
      const key = s.started_at.getTime();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const sid = (await client.query(
        'INSERT INTO workout_sessions (user_id, started_at, note, created_at) VALUES ($1, $2, $3, $2) RETURNING id',
        [req.user.id, s.started_at, s.note]
      )).rows[0].id;
      for (const en of s.exercises) {
        const nameKey = en.name.toLowerCase();
        let exId = exerciseIds.get(nameKey);
        if (!exId) {
          exId = (await client.query(
            `INSERT INTO exercises (user_id, name) VALUES ($1, $2)
             ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = exercises.name
             RETURNING id`,
            [req.user.id, en.name]
          )).rows[0].id;
          exerciseIds.set(nameKey, exId);
        }
        // Entry/set created_at defaults to the session's started_at (not
        // NOW()) so bulk-importing old history doesn't flood the exercise
        // picker's most-recently-used ordering; sequential ids preserve
        // array order within equal timestamps.
        const entryId = (await client.query(
          'INSERT INTO session_exercises (session_id, exercise_id, note, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
          [sid, exId, en.note, s.started_at]
        )).rows[0].id;
        for (const v of en.sets) {
          await client.query(
            `INSERT INTO sets (session_exercise_id, set_type, reps, weight, duration_seconds, effort, side, is_drop, note, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [entryId, v.set_type, v.reps, v.weight, v.duration_seconds, v.effort, v.side, v.is_drop, v.note, v.created_at || s.started_at]
          );
        }
      }
      imported++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  res.json({ imported, skipped });
}));

// ---------- Settings ----------

// Weights are always STORED in kg; weight_unit only controls how the client
// displays them (and which unit its weight inputs accept).
app.get('/api/settings', wrap(async (req, res) => {
  const uid = readUserId(req);
  const { rows } = await pool.query(
    'SELECT weight_unit FROM user_settings WHERE user_id = $1',
    [uid]
  );
  res.json({ weight_unit: rows[0] ? rows[0].weight_unit : 'kg' });
}));

app.patch('/api/settings', wrap(async (req, res) => {
  const unit = req.body && req.body.weight_unit;
  if (unit !== 'kg' && unit !== 'lbs') {
    return res.status(400).json({ error: 'weight_unit must be "kg" or "lbs"' });
  }
  await pool.query(
    `INSERT INTO user_settings (user_id, weight_unit) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET weight_unit = EXCLUDED.weight_unit`,
    [req.user.id, unit]
  );
  res.json({ weight_unit: unit });
}));

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works. Every other
// tokenless case (iframe loads with an expired token, old browsers
// without Sec-Fetch-*) gets the "open in Usernode" landing page instead
// of a redirect, so the platform shell is never loaded INSIDE its own
// app iframe and stray visits still don't reveal the app.
app.get('*', (req, res) => {
  if (!req.user) {
    if (req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, 'https://social-vibecoding.usernodelabs.org/#app/gym-tracker-9de81f/full');
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Usernode</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Usernode</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="https://social-vibecoding.usernodelabs.org/#app/gym-tracker-9de81f/full" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Usernode</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exercises (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS exercises_user_lower_name_idx
    ON exercises (user_id, lower(name))
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS note TEXT`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS workout_sessions_user_started_idx
    ON workout_sessions (user_id, started_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_exercises (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS session_exercises_session_idx ON session_exercises (session_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS session_exercises_exercise_idx ON session_exercises (exercise_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sets (
      id SERIAL PRIMARY KEY,
      session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
      set_type VARCHAR(10) NOT NULL CHECK (set_type IN ('reps', 'time')),
      reps INTEGER,
      weight NUMERIC(7,2),
      duration_seconds INTEGER,
      effort VARCHAR(120),
      side TEXT CHECK (side IN ('left', 'right')),
      is_drop BOOLEAN NOT NULL DEFAULT FALSE,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE sets ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('left', 'right'))`);
  await pool.query(`ALTER TABLE sets ADD COLUMN IF NOT EXISTS is_drop BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS sets_entry_idx ON sets (session_exercise_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lbs'))
    )
  `);
  // Every row is per-user workout content the UI gates to its owner, so the
  // whole chain is private (staging gets schema only, no prod rows).
  await pool.query(`COMMENT ON TABLE exercises IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE user_settings IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE workout_sessions IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE session_exercises IS 'staging:private'`);
  await pool.query(`COMMENT ON TABLE sets IS 'staging:private'`);
}

// Idempotent staging-only demo data under fake user 900001 — surfaced to
// testers via the read-only ?demo=1 overlay on GET routes. The bench press
// appears in BOTH sessions so the newer one exercises the "Last time" panel.
async function seedStagingDemo() {
  if (!IS_STAGING) return;
  await pool.query(`
    INSERT INTO exercises (id, user_id, name) VALUES
      (900001, 900001, 'Staging demo bench press'),
      (900002, 900001, 'Staging demo squat'),
      (900003, 900001, 'Staging demo plank'),
      (900004, 900001, 'Staging demo split squat')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO workout_sessions (id, user_id, started_at, note) VALUES
      (900001, 900001, NOW() - INTERVAL '3 days', NULL),
      (900002, 900001, NOW() - INTERVAL '2 hours', 'Staging demo workout note — deload week')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO session_exercises (id, session_id, exercise_id, note, created_at) VALUES
      (900001, 900001, 900001, NULL, NOW() - INTERVAL '3 days'),
      (900002, 900001, 900002, NULL, NOW() - INTERVAL '3 days' + INTERVAL '10 minutes'),
      (900003, 900002, 900001, 'Staging demo note — felt strong', NOW() - INTERVAL '2 hours'),
      (900004, 900002, 900003, NULL, NOW() - INTERVAL '2 hours' + INTERVAL '10 minutes'),
      (900005, 900002, 900004, NULL, NOW() - INTERVAL '2 hours' + INTERVAL '20 minutes')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO sets (id, session_exercise_id, set_type, reps, weight, duration_seconds, effort, side, is_drop, note, created_at) VALUES
      (900001, 900001, 'reps', 8, 60,   NULL, NULL,      NULL,    FALSE, NULL,                    NOW() - INTERVAL '3 days'),
      (900002, 900001, 'reps', 8, 60,   NULL, NULL,      NULL,    FALSE, NULL,                    NOW() - INTERVAL '3 days' + INTERVAL '3 minutes'),
      (900003, 900002, 'reps', 5, 80,   NULL, NULL,      NULL,    FALSE, 'Staging demo set note', NOW() - INTERVAL '3 days' + INTERVAL '12 minutes'),
      (900004, 900003, 'reps', 8, 62.5, NULL, NULL,      NULL,    FALSE, NULL,                    NOW() - INTERVAL '2 hours'),
      (900005, 900003, 'reps', 7, 62.5, NULL, NULL,      NULL,    FALSE, NULL,                    NOW() - INTERVAL '2 hours' + INTERVAL '3 minutes'),
      (900007, 900003, 'reps', 6, 50,   NULL, NULL,      NULL,    TRUE,  NULL,                    NOW() - INTERVAL '2 hours' + INTERVAL '4 minutes'),
      (900006, 900004, 'time', NULL, NULL, 60, 'level 8', NULL,   FALSE, NULL,                    NOW() - INTERVAL '2 hours' + INTERVAL '12 minutes'),
      (900008, 900005, 'reps', 10, 20,  NULL, NULL,      'left',  FALSE, NULL,                    NOW() - INTERVAL '2 hours' + INTERVAL '20 minutes'),
      (900009, 900005, 'reps', 10, 20,  NULL, NULL,      'right', FALSE, NULL,                    NOW() - INTERVAL '2 hours' + INTERVAL '22 minutes')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO user_settings (user_id, weight_unit) VALUES (900001, 'kg')
    ON CONFLICT (user_id) DO NOTHING
  `);
}

async function start() {
  await migrate();
  await seedStagingDemo();
  app.listen(port, () => console.log(`Listening on :${port}`));
}

start().catch(err => { console.error(err); process.exit(1); });
