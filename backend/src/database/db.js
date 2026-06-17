const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'aquaculture.db');

let SQL = null;
let db = null;
let _skipSave = false;
let _inTransaction = false;

async function initDatabase() {
  if (db) return db;
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  return db;
}

function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.error('Failed to save database:', e.message);
    }
  }
}

function _norm(params) {
  if (!params) return [];
  return params.map((v) => (v === undefined ? null : v));
}

function run(sql, params) {
  if (!db) throw new Error('Database not initialized');
  const p = _norm(params || []);
  try {
    db.run(sql, p);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  const changes = db.getRowsModified() || 0;
  let lastInsertRowid = 0;
  try {
    const rows = db.exec('SELECT last_insert_rowid() as id');
    if (rows && rows.length > 0 && rows[0].values && rows[0].values.length > 0) {
      lastInsertRowid = rows[0].values[0][0] || 0;
    }
  } catch (_) {}
  if (!_skipSave) {
    saveDatabase();
  }
  return { changes, lastInsertRowid };
}

function all(sql, params) {
  if (!db) throw new Error('Database not initialized');
  const p = _norm(params || []);
  const results = [];
  let stmt;
  try {
    stmt = db.prepare(sql);
    if (p.length > 0) {
      stmt.bind(p);
    }
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    if (stmt) {
      try { stmt.free(); } catch (_) {}
    }
  }
  return results;
}

function get(sql, params) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

function transaction(fn) {
  if (!db) throw new Error('Database not initialized');
  if (_inTransaction) {
    return fn({ run, all, get });
  }
  const prevSkip = _skipSave;
  _skipSave = true;
  _inTransaction = true;
  try {
    db.run('BEGIN TRANSACTION');
    const result = fn({ run, all, get });
    db.run('COMMIT');
    _inTransaction = false;
    _skipSave = prevSkip;
    saveDatabase();
    return result;
  } catch (e) {
    _inTransaction = false;
    _skipSave = prevSkip;
    try { db.run('ROLLBACK'); } catch (_) {}
    saveDatabase();
    throw e;
  }
}

function exec(sql) {
  if (!db) throw new Error('Database not initialized');
  try {
    db.exec(sql);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  if (!_skipSave) {
    saveDatabase();
  }
}

module.exports = {
  initDatabase,
  saveDatabase,
  run,
  all,
  get,
  transaction,
  exec
};
