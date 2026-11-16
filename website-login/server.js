'use strict';
/**
 * server.js — Ads Manager Training Simulator (website thật có đăng nhập).
 *
 * Chạy:  npm install  →  npm start   (mặc định cổng 3000; Hostinger cấp cổng qua PORT)
 *
 * Luồng:
 *  - Chưa đăng nhập: mọi trang đều dẫn về /login (màn hình đăng nhập là cổng vào đầu tiên).
 *  - Chưa có tài khoản giáo viên: form đăng nhập hiện lối "Thiết lập lần đầu" để
 *    giáo viên tự đặt tài khoản + mật khẩu quản trị (KHÔNG có mật khẩu mặc định).
 *  - Giáo viên: /admin — tạo / đặt lại mật khẩu / vô hiệu hoá học viên, xem bài làm,
 *    đăng thông báo.
 *  - Học viên: /app — bản mô phỏng đầy đủ; số liệu case, đáp án đã xem, ghi chú,
 *    chiến dịch nháp đều lưu riêng theo tài khoản trên máy chủ (SQLite).
 *
 * Bản mô phỏng không kết nối Meta, không chạy quảng cáo thật (banner TEST ENVIRONMENT).
 */
const express = require('express');
const path = require('path');
const { db, hasTeacher } = require('./src/db');
const auth = require('./src/auth');

const app = express();
app.set('trust proxy', 1); // Hostinger kết thúc TLS ở proxy — cần để nhận diện HTTPS.
app.use(express.json({ limit: '1mb' }));

// --- Đọc cookie thủ công (không thêm dependency) ---
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    raw.split(';').forEach((part) => {
      const i = part.indexOf('=');
      if (i > 0) {
        try {
          req.cookies[part.slice(0, i).trim()] = decodeURIComponent(
            part.slice(i + 1).trim()
          );
        } catch (e) {
          /* bỏ qua cookie lỗi */
        }
      }
    });
  }
  next();
});

const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_DIR = path.join(PUBLIC_DIR, 'app');

// --- Giới hạn đăng nhập sai: 5 lần / 10 phút / IP ---
const loginFails = new Map(); // ip -> { n, firstAt }
function loginBlocked(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > 10 * 60 * 1000) {
    loginFails.delete(ip);
    return false;
  }
  return rec.n >= 5;
}
function noteLoginFail(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() - rec.firstAt > 10 * 60 * 1000) {
    loginFails.set(ip, { n: 1, firstAt: Date.now() });
  } else {
    rec.n += 1;
  }
}
function clearLoginFails(ip) {
  loginFails.delete(ip);
}

// --- Kiểm tra đầu vào ---
function validUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9._-]{3,40}$/.test(u.trim());
}
function validPassword(p) {
  return typeof p === 'string' && p.length >= 6 && p.length <= 128;
}
function validCaseId(id) {
  return typeof id === 'string' && /^case\d{1,3}$/.test(id);
}
function parseStateJson(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of Object.keys(v)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) return null;
    const n = v[k];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

// Kiểm tra danh sách Audiences do học viên tạo (chỉ metadata, không có nội
// dung file upload). Trả về bản đã làm sạch (chỉ giữ key cho phép) hoặc null
// nếu sai. Key cho phép: id, name, type, source, columns, rows, created và
// pct (riêng Lookalike: 1–10%). Tối đa 50 tệp.
const AUD_ALLOWED_KEYS = new Set([
  'id',
  'name',
  'type',
  'source',
  'columns',
  'rows',
  'created',
  'pct',
]);
const AUD_COLUMN_AS = new Set(['email', 'phone', 'first', 'last', 'skip']);
function parseAudiences(v) {
  if (!Array.isArray(v) || v.length > 50) return null;
  const out = [];
  for (const a of v) {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) return null;
    for (const k of Object.keys(a)) {
      if (!AUD_ALLOWED_KEYS.has(k)) return null;
    }
    if (typeof a.id !== 'string' || !a.id || a.id.length > 100) return null;
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200)
      return null;
    if (a.type !== 'custom' && a.type !== 'lookalike') return null;
    if (a.source !== undefined && (typeof a.source !== 'string' || a.source.length > 200))
      return null;
    let columns;
    if (a.columns !== undefined) {
      if (!Array.isArray(a.columns) || a.columns.length > 50) return null;
      columns = [];
      for (const c of a.columns) {
        if (c === null || typeof c !== 'object' || Array.isArray(c)) return null;
        for (const k of Object.keys(c)) {
          if (k !== 'col' && k !== 'as') return null;
        }
        if (typeof c.col !== 'string' || c.col.length > 100) return null;
        if (typeof c.as !== 'string' || !AUD_COLUMN_AS.has(c.as)) return null;
        columns.push({ col: c.col, as: c.as });
      }
    }
    if (
      a.rows !== undefined &&
      (!Number.isInteger(a.rows) || a.rows < 0 || a.rows > 200000000)
    )
      return null;
    if (a.created !== undefined && (typeof a.created !== 'string' || a.created.length > 50))
      return null;
    if (
      a.pct !== undefined &&
      (!Number.isInteger(a.pct) || a.pct < 1 || a.pct > 10)
    )
      return null;
    const clean = {
      id: a.id,
      name: a.name,
      type: a.type,
      source: a.source !== undefined ? a.source : '',
      rows: a.rows !== undefined ? a.rows : 0,
      created: a.created !== undefined ? a.created : '',
    };
    if (columns !== undefined) clean.columns = columns;
    if (a.pct !== undefined) clean.pct = a.pct;
    out.push(clean);
  }
  return out;
}

// =====================================================================
// TRANG (HTML)
// =====================================================================
app.get('/', (req, res) => {
  if (auth.userFromRequest(req)) return res.redirect('/app/');
  return res.redirect('/login');
});
app.get('/login', (req, res) => {
  if (auth.userFromRequest(req)) return res.redirect('/app/');
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});
app.get('/admin', (req, res) => {
  const user = auth.userFromRequest(req);
  if (!user) return res.redirect('/login');
  if (user.role !== 'teacher') return res.redirect('/app/');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});
// Toàn bộ /app (bản mô phỏng) yêu cầu đăng nhập; chưa đăng nhập -> về /login.
app.use('/app', (req, res, next) => {
  if (!auth.userFromRequest(req)) return res.redirect('/login');
  next();
});
app.use('/app', express.static(APP_DIR, { index: 'index.html' }));

// =====================================================================
// API — XÁC THỰC
// =====================================================================
app.get('/api/auth/state', (req, res) => {
  const user = auth.userFromRequest(req);
  res.json({
    ok: true,
    needsSetup: !hasTeacher(),
    loggedIn: !!user,
    user: user ? auth.publicUser(user) : null,
  });
});

/** Thiết lập lần đầu: chỉ chạy khi chưa có tài khoản giáo viên nào. */
app.post('/api/auth/setup', auth.sameOrigin, (req, res) => {
  if (hasTeacher())
    return res.status(403).json({ ok: false, error: 'already_setup' });
  const username = String(req.body.username || 'giaovien').trim();
  const displayName = String(req.body.displayName || 'Giáo viên').trim() || 'Giáo viên';
  const password = req.body.password;
  if (!validUsername(username))
    return res.status(400).json({
      ok: false,
      error: 'bad_username',
      message: 'Tên đăng nhập 3–40 ký tự, chỉ gồm chữ, số, dấu . _ -',
    });
  if (!validPassword(password))
    return res.status(400).json({
      ok: false,
      error: 'bad_password',
      message: 'Mật khẩu ít nhất 6 ký tự.',
    });
  try {
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)'
      )
      .run(username, displayName, auth.hashPassword(password), 'teacher');
    const user = auth.findUserById(Number(info.lastInsertRowid));
    const sess = auth.createSession(user.id);
    res.cookie('adsim_sid', sess.token, auth.sessionCookieOptions(req));
    res.json({ ok: true, user: auth.publicUser(user) });
  } catch (e) {
    res.status(400).json({ ok: false, error: 'username_taken' });
  }
});

app.post('/api/auth/login', auth.sameOrigin, (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginBlocked(ip))
    return res.status(429).json({
      ok: false,
      error: 'too_many_attempts',
      message: 'Đăng nhập sai quá nhiều lần. Thử lại sau 10 phút.',
    });
  const username = String(req.body.username || '').trim();
  const password = req.body.password || '';
  const user = auth.findUserByUsername(username);
  if (!user || !auth.checkPassword(password, user.password_hash)) {
    noteLoginFail(ip);
    return res
      .status(401)
      .json({ ok: false, error: 'bad_credentials', message: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  if (user.active !== 1) {
    noteLoginFail(ip);
    return res.status(403).json({
      ok: false,
      error: 'account_disabled',
      message: 'Tài khoản này đã bị vô hiệu hoá. Liên hệ giáo viên.',
    });
  }
  clearLoginFails(ip);
  const sess = auth.createSession(user.id);
  res.cookie('adsim_sid', sess.token, auth.sessionCookieOptions(req));
  res.json({ ok: true, user: auth.publicUser(user) });
});

app.post('/api/auth/logout', auth.sameOrigin, (req, res) => {
  const token = req.cookies && req.cookies.adsim_sid;
  auth.destroySession(token);
  res.clearCookie('adsim_sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json({ ok: true, user: auth.publicUser(req.user) });
});

// =====================================================================
// API — DỮ LIỆU HỌC VIÊN (theo tài khoản đang đăng nhập)
// =====================================================================
/** Một lần tải toàn bộ dữ liệu riêng của học viên khi mở app. */
app.get('/api/bootstrap', auth.requireAuth, (req, res) => {
  const uid = req.user.id;
  const cases = {};
  for (const r of db
    .prepare(
      'SELECT case_id, state_json, viewed_answer, notes FROM case_progress WHERE user_id = ?'
    )
    .all(uid)) {
    let state = {};
    try {
      state = JSON.parse(r.state_json) || {};
    } catch (e) {
      state = {};
    }
    cases[r.case_id] = {
      state,
      viewedAnswer: r.viewed_answer === 1,
      notes: r.notes || '',
    };
  }
  const overrides = {};
  for (const r of db
    .prepare(
      'SELECT case_id, name, budget_amt FROM campaign_overrides WHERE user_id = ?'
    )
    .all(uid)) {
    overrides[r.case_id] = { name: r.name || null, budgetAmt: r.budget_amt || null };
  }
  const draftRow = db
    .prepare('SELECT draft_json FROM editor_draft WHERE user_id = ?')
    .get(uid);
  let editorDraft = {};
  if (draftRow) {
    try {
      editorDraft = JSON.parse(draftRow.draft_json) || {};
    } catch (e) {
      editorDraft = {};
    }
  }
  const audRow = db
    .prepare('SELECT audiences_json FROM audiences WHERE user_id = ?')
    .get(uid);
  let audiences = [];
  if (audRow) {
    try {
      const parsed = JSON.parse(audRow.audiences_json);
      if (Array.isArray(parsed)) audiences = parsed;
    } catch (e) {
      audiences = [];
    }
  }
  const myDrafts = db
    .prepare(
      'SELECT id, name, objective, settings_json, created_at, updated_at FROM draft_campaigns WHERE user_id = ? ORDER BY updated_at DESC'
    )
    .all(uid)
    .map((d) => {
      let settings = {};
      try {
        settings = JSON.parse(d.settings_json) || {};
      } catch (e) {
        settings = {};
      }
      return {
        id: d.id,
        name: d.name,
        objective: d.objective,
        settings,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    });
  const anns = listAnnouncements(uid);
  res.json({
    ok: true,
    user: auth.publicUser(req.user),
    cases,
    overrides,
    editorDraft,
    audiences,
    myDrafts,
    announcements: anns.items,
    unreadCount: anns.unread,
  });
});

function upsertCaseProgress(uid, caseId, patch) {
  const cur = db
    .prepare('SELECT * FROM case_progress WHERE user_id = ? AND case_id = ?')
    .get(uid, caseId);
  const state = patch.state !== undefined
    ? JSON.stringify(patch.state)
    : cur ? cur.state_json : '{}';
  const viewed =
    patch.viewedAnswer !== undefined
      ? patch.viewedAnswer ? 1 : 0
      : cur ? cur.viewed_answer : 0;
  const notes = patch.notes !== undefined ? patch.notes : cur ? cur.notes : '';
  db.prepare(
    `INSERT INTO case_progress (user_id, case_id, state_json, viewed_answer, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, case_id) DO UPDATE SET
       state_json = excluded.state_json,
       viewed_answer = excluded.viewed_answer,
       notes = excluded.notes,
       updated_at = datetime('now')`
  ).run(uid, caseId, state, viewed, notes);
}

/** Lưu số liệu đã chỉnh trong 1 case. */
app.put('/api/case/:id', auth.requireAuth, auth.sameOrigin, (req, res) => {
  if (!validCaseId(req.params.id))
    return res.status(400).json({ ok: false, error: 'bad_case' });
  const state = parseStateJson(req.body.state);
  if (state === null)
    return res.status(400).json({ ok: false, error: 'bad_state' });
  upsertCaseProgress(req.user.id, req.params.id, { state });
  res.json({ ok: true });
});

/** Đánh dấu đã xem đáp án gợi ý của 1 case. */
app.post('/api/case/:id/answer', auth.requireAuth, auth.sameOrigin, (req, res) => {
  if (!validCaseId(req.params.id))
    return res.status(400).json({ ok: false, error: 'bad_case' });
  upsertCaseProgress(req.user.id, req.params.id, { viewedAnswer: true });
  res.json({ ok: true });
});

/** Lưu ghi chú của học viên trong 1 case (tối đa 5000 ký tự). */
app.put('/api/case/:id/notes', auth.requireAuth, auth.sameOrigin, (req, res) => {
  if (!validCaseId(req.params.id))
    return res.status(400).json({ ok: false, error: 'bad_case' });
  const notes = typeof req.body.notes === 'string' ? req.body.notes.slice(0, 5000) : '';
  upsertCaseProgress(req.user.id, req.params.id, { notes });
  res.json({ ok: true });
});

/** Lưu tên / ngân sách học viên tự sửa ở campaign của 1 case. */
app.put('/api/campaign-override/:caseId', auth.requireAuth, auth.sameOrigin, (req, res) => {
  if (!validCaseId(req.params.caseId))
    return res.status(400).json({ ok: false, error: 'bad_case' });
  const name =
    typeof req.body.name === 'string' ? req.body.name.slice(0, 200) : null;
  const budgetAmt =
    typeof req.body.budgetAmt === 'string'
      ? req.body.budgetAmt.slice(0, 100)
      : null;
  db.prepare(
    `INSERT INTO campaign_overrides (user_id, case_id, name, budget_amt, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, case_id) DO UPDATE SET
       name = COALESCE(excluded.name, campaign_overrides.name),
       budget_amt = COALESCE(excluded.budget_amt, campaign_overrides.budget_amt),
       updated_at = datetime('now')`
  ).run(req.user.id, req.params.caseId, name, budgetAmt);
  res.json({ ok: true });
});

/** Lưu bản nháp trình chỉnh sửa đang làm dở (ghi đè toàn bộ). */
app.put('/api/editor-draft', auth.requireAuth, auth.sameOrigin, (req, res) => {
  const draft = req.body.draft;
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft))
    return res.status(400).json({ ok: false, error: 'bad_draft' });
  db.prepare(
    `INSERT INTO editor_draft (user_id, draft_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       draft_json = excluded.draft_json, updated_at = datetime('now')`
  ).run(req.user.id, JSON.stringify(draft));
  res.json({ ok: true });
});

/** Lưu danh sách Audiences do học viên tạo (chỉ metadata, ghi đè toàn bộ). */
app.put('/api/audiences', auth.requireAuth, auth.sameOrigin, (req, res) => {
  const audiences = parseAudiences(req.body.audiences);
  if (audiences === null)
    return res.status(400).json({ ok: false, error: 'bad_audiences' });
  db.prepare(
    `INSERT INTO audiences (user_id, audiences_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       audiences_json = excluded.audiences_json, updated_at = datetime('now')`
  ).run(req.user.id, JSON.stringify(audiences));
  res.json({ ok: true });
});

/** Danh sách chiến dịch nháp (đã Publish mô phỏng) của chính mình. */
app.get('/api/drafts', auth.requireAuth, (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, name, objective, settings_json, created_at, updated_at FROM draft_campaigns WHERE user_id = ? ORDER BY updated_at DESC'
    )
    .all(req.user.id);
  res.json({
    ok: true,
    drafts: rows.map((d) => {
      let settings = {};
      try {
        settings = JSON.parse(d.settings_json) || {};
      } catch (e) {
        settings = {};
      }
      return {
        id: d.id,
        name: d.name,
        objective: d.objective,
        settings,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    }),
  });
});

/** Publish (mô phỏng) trong editor -> lưu chiến dịch nháp theo tài khoản. */
app.post('/api/drafts', auth.requireAuth, auth.sameOrigin, (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 200) : '';
  const objective =
    typeof req.body.objective === 'string' ? req.body.objective.slice(0, 100) : '';
  const settings = req.body.settings;
  if (!name || !objective || settings === null || typeof settings !== 'object')
    return res.status(400).json({ ok: false, error: 'bad_draft' });
  const info = db
    .prepare(
      'INSERT INTO draft_campaigns (user_id, name, objective, settings_json) VALUES (?, ?, ?, ?)'
    )
    .run(req.user.id, name, objective, JSON.stringify(settings));
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

/** Xoá 1 chiến dịch nháp của chính mình. */
app.delete('/api/drafts/:id', auth.requireAuth, auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ ok: false, error: 'bad_id' });
  const r = db
    .prepare('DELETE FROM draft_campaigns WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);
  if (r.changes === 0)
    return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});

// =====================================================================
// API — THÔNG BÁO (học viên đọc; giáo viên quản lý ở /api/admin/*)
// =====================================================================
function listAnnouncements(uid) {
  const rows = db
    .prepare(
      `SELECT a.*, CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS is_read
       FROM announcements a
       LEFT JOIN announcement_reads r
         ON r.announcement_id = a.id AND r.user_id = ?
       ORDER BY a.created_at DESC, a.id DESC`
    )
    .all(uid);
  const items = rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    read: a.is_read === 1,
  }));
  return { items, unread: items.filter((a) => !a.read).length };
}

app.get('/api/announcements', auth.requireAuth, (req, res) => {
  const anns = listAnnouncements(req.user.id);
  res.json({ ok: true, announcements: anns.items, unreadCount: anns.unread });
});

app.post('/api/announcements/:id/read', auth.requireAuth, auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ ok: false, error: 'bad_id' });
  const exists = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ ok: false, error: 'not_found' });
  db.prepare(
    'INSERT OR IGNORE INTO announcement_reads (user_id, announcement_id) VALUES (?, ?)'
  ).run(req.user.id, id);
  res.json({ ok: true });
});

// =====================================================================
// API — QUẢN TRỊ (chỉ giáo viên)
// =====================================================================
function studentSummary(u) {
  const cases = db
    .prepare('SELECT COUNT(*) AS n FROM case_progress WHERE user_id = ?')
    .get(u.id).n;
  const answers = db
    .prepare(
      'SELECT COUNT(*) AS n FROM case_progress WHERE user_id = ? AND viewed_answer = 1'
    )
    .get(u.id).n;
  const drafts = db
    .prepare('SELECT COUNT(*) AS n FROM draft_campaigns WHERE user_id = ?')
    .get(u.id).n;
  const last = db
    .prepare(
      `SELECT MAX(t) AS t FROM (
         SELECT MAX(updated_at) AS t FROM case_progress WHERE user_id = ?
         UNION ALL SELECT MAX(updated_at) AS t FROM draft_campaigns WHERE user_id = ?
         UNION ALL SELECT MAX(updated_at) AS t FROM editor_draft WHERE user_id = ?
       )`
    )
    .get(u.id, u.id, u.id).t;
  return {
    ...auth.publicUser(u),
    casesDone: cases,
    answersViewed: answers,
    draftsCount: drafts,
    lastActive: last || null,
  };
}

app.get('/api/admin/students', auth.requireTeacher, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM users WHERE role = 'student' ORDER BY created_at ASC")
    .all();
  res.json({ ok: true, students: rows.map(studentSummary) });
});

/** Tạo tài khoản học viên. */
app.post('/api/admin/students', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const username = String(req.body.username || '').trim();
  const displayName = String(req.body.displayName || '').trim();
  const password = req.body.password;
  if (!validUsername(username))
    return res.status(400).json({
      ok: false,
      error: 'bad_username',
      message: 'Tên đăng nhập 3–40 ký tự, chỉ gồm chữ, số, dấu . _ -',
    });
  if (!displayName || displayName.length > 100)
    return res.status(400).json({ ok: false, error: 'bad_display_name' });
  if (!validPassword(password))
    return res.status(400).json({
      ok: false,
      error: 'bad_password',
      message: 'Mật khẩu ít nhất 6 ký tự.',
    });
  try {
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)'
      )
      .run(username, displayName, auth.hashPassword(password), 'student');
    res.status(201).json({
      ok: true,
      student: auth.publicUser(auth.findUserById(Number(info.lastInsertRowid))),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: 'username_taken', message: 'Tên đăng nhập đã tồn tại.' });
  }
});

/** Đặt lại mật khẩu học viên (đồng thời đăng xuất mọi phiên của học viên đó). */
app.post('/api/admin/students/:id/reset-password', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  const password = req.body.password;
  if (!Number.isInteger(id))
    return res.status(400).json({ ok: false, error: 'bad_id' });
  if (!validPassword(password))
    return res.status(400).json({
      ok: false,
      error: 'bad_password',
      message: 'Mật khẩu ít nhất 6 ký tự.',
    });
  const u = auth.findUserById(id);
  if (!u || u.role !== 'student')
    return res.status(404).json({ ok: false, error: 'not_found' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    auth.hashPassword(password),
    id
  );
  auth.destroyAllSessions(id);
  res.json({ ok: true });
});

/** Đổi mật khẩu giáo viên (tài khoản đang đăng nhập). Đổi xong đăng xuất mọi phiên — giáo viên đăng nhập lại bằng mật khẩu mới. */
app.post('/api/teacher/change-password', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;
  if (typeof currentPassword !== 'string' || !currentPassword)
    return res.status(400).json({
      ok: false,
      error: 'bad_current_password',
      message: 'Nhập mật khẩu hiện tại.',
    });
  if (!validPassword(newPassword))
    return res.status(400).json({
      ok: false,
      error: 'bad_password',
      message: 'Mật khẩu mới ít nhất 6 ký tự.',
    });
  if (currentPassword === newPassword)
    return res.status(400).json({
      ok: false,
      error: 'same_password',
      message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
    });
  const u = auth.findUserById(req.user.id);
  if (!u || u.role !== 'teacher')
    return res.status(404).json({ ok: false, error: 'not_found' });
  if (!auth.checkPassword(currentPassword, u.password_hash))
    return res.status(400).json({
      ok: false,
      error: 'wrong_current_password',
      message: 'Mật khẩu hiện tại không đúng.',
    });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    auth.hashPassword(newPassword),
    u.id
  );
  auth.destroyAllSessions(u.id);
  res.json({ ok: true });
});

/** Vô hiệu hoá / kích hoạt lại học viên. Vô hiệu hoá đồng thời đăng xuất học viên đó. */
app.post('/api/admin/students/:id/set-active', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  const active = req.body.active === true || req.body.active === 1;
  if (!Number.isInteger(id))
    return res.status(400).json({ ok: false, error: 'bad_id' });
  const u = auth.findUserById(id);
  if (!u || u.role !== 'student')
    return res.status(404).json({ ok: false, error: 'not_found' });
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  if (!active) auth.destroyAllSessions(id);
  res.json({ ok: true, active });
});

/** Xem toàn bộ bài làm của 1 học viên (chỉ giáo viên). */
app.get('/api/admin/students/:id/work', auth.requireTeacher, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ ok: false, error: 'bad_id' });
  const u = auth.findUserById(id);
  if (!u || u.role !== 'student')
    return res.status(404).json({ ok: false, error: 'not_found' });
  const cases = db
    .prepare(
      'SELECT case_id, state_json, viewed_answer, notes, updated_at FROM case_progress WHERE user_id = ? ORDER BY case_id'
    )
    .all(id)
    .map((r) => {
      let state = {};
      try {
        state = JSON.parse(r.state_json) || {};
      } catch (e) {
        state = {};
      }
      return {
        caseId: r.case_id,
        state,
        viewedAnswer: r.viewed_answer === 1,
        notes: r.notes || '',
        updatedAt: r.updated_at,
      };
    });
  const overrides = db
    .prepare(
      'SELECT case_id, name, budget_amt, updated_at FROM campaign_overrides WHERE user_id = ? ORDER BY case_id'
    )
    .all(id)
    .map((r) => ({
      caseId: r.case_id,
      name: r.name,
      budgetAmt: r.budget_amt,
      updatedAt: r.updated_at,
    }));
  const drafts = db
    .prepare(
      'SELECT id, name, objective, settings_json, created_at, updated_at FROM draft_campaigns WHERE user_id = ? ORDER BY updated_at DESC'
    )
    .all(id)
    .map((d) => {
      let settings = {};
      try {
        settings = JSON.parse(d.settings_json) || {};
      } catch (e) {
        settings = {};
      }
      return {
        id: d.id,
        name: d.name,
        objective: d.objective,
        settings,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    });
  const ed = db.prepare('SELECT draft_json, updated_at FROM editor_draft WHERE user_id = ?').get(id);
  let editorDraft = null;
  if (ed) {
    try {
      editorDraft = JSON.parse(ed.draft_json) || {};
    } catch (e) {
      editorDraft = {};
    }
  }
  res.json({
    ok: true,
    student: studentSummary(u),
    cases,
    overrides,
    drafts,
    editorDraft,
    editorDraftUpdatedAt: ed ? ed.updated_at : null,
  });
});

/** Tạo thông báo (giáo viên). */
app.post('/api/admin/announcements', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!title || title.length > 200 || !body || body.length > 5000)
    return res.status(400).json({ ok: false, error: 'bad_announcement' });
  const info = db
    .prepare(
      'INSERT INTO announcements (title, body, created_by) VALUES (?, ?, ?)'
    )
    .run(title, body, req.user.id);
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

/** Sửa thông báo (giáo viên). */
app.put('/api/admin/announcements/:id', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || !title || title.length > 200 || !body || body.length > 5000)
    return res.status(400).json({ ok: false, error: 'bad_announcement' });
  const r = db
    .prepare(
      "UPDATE announcements SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(title, body, id);
  if (r.changes === 0)
    return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});

/** Xoá thông báo (giáo viên). */
app.delete('/api/admin/announcements/:id', auth.requireTeacher, auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ ok: false, error: 'bad_id' });
  const r = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  if (r.changes === 0)
    return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});

/** Xuất toàn bộ dữ liệu lớp học (JSON) để sao lưu. */
app.get('/api/admin/export', auth.requireTeacher, (req, res) => {
  const students = db
    .prepare("SELECT * FROM users WHERE role = 'student' ORDER BY created_at ASC")
    .all();
  const out = {
    exportedAt: new Date().toISOString(),
    app: 'ads-manager-training-simulator',
    version: '2.0.0',
    students: students.map((u) => {
      const cases = db
        .prepare(
          'SELECT case_id, state_json, viewed_answer, notes, updated_at FROM case_progress WHERE user_id = ? ORDER BY case_id'
        )
        .all(u.id)
        .map((r) => {
          let state = {};
          try {
            state = JSON.parse(r.state_json) || {};
          } catch (e) {
            state = {};
          }
          return {
            caseId: r.case_id,
            state,
            viewedAnswer: r.viewed_answer === 1,
            notes: r.notes || '',
            updatedAt: r.updated_at,
          };
        });
      const overrides = db
        .prepare(
          'SELECT case_id, name, budget_amt, updated_at FROM campaign_overrides WHERE user_id = ? ORDER BY case_id'
        )
        .all(u.id);
      const drafts = db
        .prepare(
          'SELECT id, name, objective, settings_json, created_at, updated_at FROM draft_campaigns WHERE user_id = ? ORDER BY updated_at DESC'
        )
        .all(u.id)
        .map((d) => {
          let settings = {};
          try {
            settings = JSON.parse(d.settings_json) || {};
          } catch (e) {
            settings = {};
          }
          return {
            id: d.id,
            name: d.name,
            objective: d.objective,
            settings,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          };
        });
      return { user: auth.publicUser(u), cases, overrides, drafts };
    }),
    announcements: db
      .prepare('SELECT * FROM announcements ORDER BY created_at DESC')
      .all(),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="lop-hoc-ads-manager-backup.json"'
  );
  res.send(JSON.stringify(out, null, 2));
});

// =====================================================================
// 404 + LỖI
// =====================================================================
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed')
    return res.status(400).json({ ok: false, error: 'bad_json' });
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ ok: false, error: 'server_error' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(
    `Ads Manager Training Simulator (login) đang chạy tại http://localhost:${PORT} — DB: ${require('./src/db').DB_PATH}`
  );
});
