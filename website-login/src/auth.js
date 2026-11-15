'use strict';
/**
 * auth.js — Mật khẩu (hash bcrypt, không lưu plaintext), phiên đăng nhập
 * (token ngẫu nhiên trong cookie httpOnly) và middleware phân quyền.
 *
 * - Giáo viên (teacher): quản trị học viên + thông báo + xem bài làm.
 * - Học viên (student): chỉ truy cập dữ liệu của chính mình; mọi endpoint
 *   giáo viên đều chặn học viên (403). Tài khoản bị vô hiệu hoá (active=0)
 *   không đăng nhập được và mọi phiên cũ của tài khoản đó bị vô hiệu.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./db');

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const BCRYPT_ROUNDS = 10;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}
function checkPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch (e) {
    return false;
  }
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    active: u.active === 1,
    createdAt: u.created_at,
  };
}

function findUserByUsername(username) {
  return db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(String(username).trim());
}
function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const expStr = expires.toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, userId, expStr);
  return { token, expires };
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function destroyAllSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Đọc phiên từ cookie; trả về user (đã kiểm tra active + hạn) hoặc null. */
function userFromRequest(req) {
  const token = req.cookies && req.cookies.adsim_sid;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.*, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (row.active !== 1) {
    destroySession(token);
    return null;
  }
  // Hết hạn (so sánh chuỗi datetime SQLite 'YYYY-MM-DD HH:MM:SS' — khớp thứ tự thời gian).
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (row.expires_at < nowStr) {
    destroySession(token);
    return null;
  }
  return {
    id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
  };
}

/** Cookie phiên: httpOnly, SameSite=Lax; Secure khi chạy production (HTTPS). */
function sessionCookieOptions(req) {
  const secure =
    process.env.NODE_ENV === 'production' || req.secure === true;
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.user = user;
  next();
}

function requireTeacher(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (user.role !== 'teacher')
    return res.status(403).json({ ok: false, error: 'forbidden' });
  req.user = user;
  next();
}

/** Chặn CSRF cơ bản cho các yêu cầu thay đổi dữ liệu: Origin (nếu có) phải cùng host. */
function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const o = new URL(origin);
    if (o.host === req.headers.host) return next();
  } catch (e) {
    /* origin không parse được -> chặn */
  }
  return res.status(403).json({ ok: false, error: 'bad_origin' });
}

module.exports = {
  hashPassword,
  checkPassword,
  publicUser,
  findUserByUsername,
  findUserById,
  createSession,
  destroySession,
  destroyAllSessions,
  userFromRequest,
  sessionCookieOptions,
  requireAuth,
  requireTeacher,
  sameOrigin,
  SESSION_TTL_DAYS,
};
