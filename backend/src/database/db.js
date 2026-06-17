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

async function initDatabase() {
  if (db) return db;
  SQL = await initSqlJs();
  let fileBuffer = null;
  if (fs.existsSync(dbPath)) {
    fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

let _skipSave = false;

function _normalizeParams(params) {
  if (!params) return params;
  return params.map((v) => (v === undefined ? null : v));
}

function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const normParams = _normalizeParams(params);
  let stmt;
  try {
    stmt = db.prepare(sql);
    if (normParams && normParams.length > 0) {
      stmt.bind(normParams);
    }
    stmt.step();
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    if (stmt) stmt.free();
  }
  const changes = db.getRowsModified() || 0;
  const lastInsertRowid =
    db.exec('SELECT last_insert_rowid() as id')[0]?.values?.[0]?.[0] ?? 0;
  if (!_skipSave) {
    saveDatabase();
  }
  return { changes, lastInsertRowid };
}

function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const normParams = _normalizeParams(params);
  let stmt;
  const results = [];
  try {
    stmt = db.prepare(sql);
    if (normParams && normParams.length > 0) {
      stmt.bind(normParams);
    }
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    if (stmt) stmt.free();
  }
  return results;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

function transaction(fn) {
  if (!db) throw new Error('Database not initialized');
  const prevSkip = _skipSave;
  _skipSave = true;
  try {
    db.exec('BEGIN TRANSACTION');
    const result = fn({ run, all, get });
    db.exec('COMMIT');
    saveDatabase();
    return result;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    saveDatabase();
    throw e;
  } finally {
    _skipSave = prevSkip;
  }
}

function exec(sql) {
  if (!db) throw new Error('Database not initialized');
  db.exec(sql);
  saveDatabase();
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
