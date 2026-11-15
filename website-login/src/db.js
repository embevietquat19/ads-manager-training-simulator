'use strict';
/**
 * db.js — Lớp dữ liệu SQLite (file) cho Ads Manager Training Simulator.
 *
 * Dùng `node:sqlite` có sẵn trong Node.js 22+ (không cần cài thêm gói native,
 * không cần máy chủ MySQL riêng) — phù hợp gói Hostinger Business chạy Node 24.
 * File CSDL nằm ở DATA_DIR (mặc định ./data/app.db, đã gitignore) nên các lần
 * deploy bằng git pull không xoá dữ liệu học viên (file không nằm trong git).
 *
 * Bảng:
 *  meta                 — cờ hệ thống (ví dụ setup_done)
 *  users                — tài khoản giáo viên / học viên (mật khẩu dạng hash bcrypt)
 *  sessions             — phiên đăng nhập (token ngẫu nhiên, cookie httpOnly)
 *  announcements        — thông báo của giảng viên
 *  announcement_reads   — học viên nào đã đọc thông báo nào
 *  case_progress        — số liệu + đáp án đã xem + ghi chú từng case, theo tài khoản
 *  campaign_overrides   — tên / ngân sách học viên tự sửa ở campaign của case
 *  editor_draft         — bản nháp trình chỉnh sửa đang làm dở, theo tài khoản
 *  draft_campaigns      — chiến dịch học viên đã Publish (mô phỏng), theo tài khoản
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS announcement_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, announcement_id)
);
CREATE TABLE IF NOT EXISTS case_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  viewed_answer INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, case_id)
);
CREATE TABLE IF NOT EXISTS campaign_overrides (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  name TEXT,
  budget_amt TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, case_id)
);
CREATE TABLE IF NOT EXISTS editor_draft (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  draft_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS draft_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON draft_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_case_user ON case_progress(user_id);
`);

function getMeta(k) {
  const row = db.prepare('SELECT v FROM meta WHERE k = ?').get(k);
  return row ? row.v : null;
}
function setMeta(k, v) {
  db.prepare(
    `INSERT INTO meta (k, v) VALUES (?, ?)
     ON CONFLICT(k) DO UPDATE SET v = excluded.v`
  ).run(k, v);
}

/** true khi hệ thống đã có ít nhất 1 tài khoản giáo viên. */
function hasTeacher() {
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'teacher'"
  ).get();
  return row.n > 0;
}

module.exports = { db, DB_PATH, DATA_DIR, getMeta, setMeta, hasTeacher };
