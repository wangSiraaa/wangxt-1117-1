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

function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  stmt.step();
  stmt.free();
  saveDatabase();
  return { changes: db.getRowsModified() || 0, lastInsertRowid: db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] };
}

function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

function transaction(fn) {
  run('BEGIN TRANSACTION');
  try {
    const result = fn({ run, all, get });
    run('COMMIT');
    return result;
  } catch (e) {
    run('ROLLBACK');
    throw e;
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
