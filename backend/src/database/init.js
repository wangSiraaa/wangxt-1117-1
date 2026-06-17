const { initDatabase, run, transaction, exec } = require('./db');
const dayjs = require('dayjs');

async function main() {
  await initDatabase();

  exec(`
    CREATE TABLE IF NOT EXISTS ponds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pond_code TEXT UNIQUE NOT NULL,
      pond_name TEXT NOT NULL,
      area REAL,
      species TEXT,
      stock_date TEXT,
      stock_quantity INTEGER,
      locked INTEGER DEFAULT 0,
      lock_reason TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS drugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_code TEXT UNIQUE NOT NULL,
      drug_name TEXT NOT NULL,
      manufacturer TEXT,
      specification TEXT,
      withdrawal_period INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      usage_instructions TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS medication_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_no TEXT UNIQUE NOT NULL,
      pond_id INTEGER NOT NULL,
      drug_id INTEGER NOT NULL,
      dosage REAL NOT NULL,
      unit TEXT,
      usage_method TEXT,
      medication_date TEXT NOT NULL,
      operator TEXT NOT NULL,
      remark TEXT,
      audit_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (pond_id) REFERENCES ponds(id),
      FOREIGN KEY (drug_id) REFERENCES drugs(id)
    );

    CREATE TABLE IF NOT EXISTS audit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL,
      auditor TEXT NOT NULL,
      audit_result TEXT NOT NULL,
      audit_opinion TEXT,
      audit_date TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (medication_id) REFERENCES medication_records(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_no TEXT UNIQUE NOT NULL,
      pond_id INTEGER NOT NULL,
      sample_date TEXT NOT NULL,
      inspector TEXT NOT NULL,
      inspection_items TEXT,
      inspection_result TEXT NOT NULL,
      unqualified_items TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (pond_id) REFERENCES ponds(id)
    );

    CREATE TABLE IF NOT EXISTS harvest_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_no TEXT UNIQUE NOT NULL,
      pond_id INTEGER NOT NULL,
      plan_date TEXT NOT NULL,
      plan_quantity INTEGER,
      operator TEXT,
      status TEXT DEFAULT 'planned',
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (pond_id) REFERENCES ponds(id)
    );
  `);

  const drugs = [
    ['D001', '青霉素钾', '华北制药', '100万IU/瓶', 14, 0, '稀释后全池泼洒'],
    ['D002', '土霉素', '齐鲁制药', '500g/袋', 21, 0, '拌饵投喂'],
    ['D003', '敌百虫', '南通江山', '90%晶体', 10, 0, '溶解后全池泼洒'],
    ['D004', '孔雀石绿', '—', '—', 0, 1, '禁用药物，严禁使用'],
    ['D005', '氯霉素', '—', '—', 0, 1, '禁用药物，严禁使用'],
    ['D006', '聚维酮碘', '江苏艾津', '10%溶液', 7, 0, '稀释后全池泼洒'],
    ['D007', '硫酸铜', '江西铜业', '96%晶体', 15, 0, '溶解后全池泼洒']
  ];

  for (const item of drugs) {
    try {
      run(
        `INSERT OR IGNORE INTO drugs (drug_code, drug_name, manufacturer, specification, withdrawal_period, is_banned, usage_instructions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        item
      );
    } catch (e) {}
  }

  const ponds = [
    ['P001', '1号塘', 5.0, '南美白对虾', '2026-03-15', 80000],
    ['P002', '2号塘', 6.5, '南美白对虾', '2026-03-20', 100000],
    ['P003', '3号塘', 4.0, '草鱼', '2026-02-10', 5000],
    ['P004', '4号塘', 8.0, '鲫鱼', '2026-02-15', 8000]
  ];

  for (const item of ponds) {
    try {
      run(
        `INSERT OR IGNORE INTO ponds (pond_code, pond_name, area, species, stock_date, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)`,
        item
      );
    } catch (e) {}
  }

  console.log('数据库初始化完成！');
  console.log(`数据文件位置: ${require('path').join(__dirname, '..', '..', 'data', 'aquaculture.db')}`);
  console.log(`已预置 ${drugs.length} 种药品，${ponds.length} 个池塘`);
}

main().catch(console.error);
