const express = require('express');
const router = express.Router();
const { run, all, get, transaction, initDatabase } = require('../database/db');
const dayjs = require('dayjs');

const genCode = (prefix) => {
  return `${prefix}${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
};

router.get('/ponds', (req, res) => {
  try {
    const ponds = all('SELECT * FROM ponds ORDER BY pond_code');
    const rows = ponds.map((p) => {
      const mc = get(
        'SELECT COUNT(*) as cnt FROM medication_records WHERE pond_id = ?',
        [p.id]
      );
      const ic = get(
        'SELECT COUNT(*) as cnt FROM inspection_records WHERE pond_id = ?',
        [p.id]
      );
      return {
        ...p,
        medication_count: mc?.cnt || 0,
        inspection_count: ic?.cnt || 0
      };
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/ponds/:id', (req, res) => {
  try {
    const pond = get('SELECT * FROM ponds WHERE id = ?', [req.params.id]);
    if (!pond) {
      return res.status(404).json({ success: false, message: '池塘不存在' });
    }

    const latestMedication = get(
      `SELECT m.*, d.drug_name, d.withdrawal_period,
        DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date
      FROM medication_records m
      JOIN drugs d ON m.drug_id = d.id
      WHERE m.pond_id = ? AND m.audit_status = 'approved'
      ORDER BY m.medication_date DESC
      LIMIT 1`,
      [req.params.id]
    );

    let withdrawalInfo = null;
    if (latestMedication && latestMedication.withdrawal_end_date) {
      const endDate = dayjs(latestMedication.withdrawal_end_date);
      const today = dayjs().startOf('day');
      const daysRemaining = endDate.diff(today, 'day');
      withdrawalInfo = {
        ...latestMedication,
        days_remaining: daysRemaining > 0 ? daysRemaining : 0,
        is_withdrawal_active: daysRemaining > 0
      };
    }

    pond.withdrawal_info = withdrawalInfo;
    res.json({ success: true, data: pond });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ponds', (req, res) => {
  try {
    const { pond_code, pond_name, area, species, stock_date, stock_quantity } = req.body;
    const info = run(
      `INSERT INTO ponds (pond_code, pond_name, area, species, stock_date, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)`,
      [pond_code, pond_name, area, species, stock_date, stock_quantity]
    );
    res.json({ success: true, data: { id: info.lastInsertRowid } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/ponds/:id', (req, res) => {
  try {
    const { pond_name, area, species, stock_date, stock_quantity } = req.body;
    run(
      `UPDATE ponds SET pond_name=?, area=?, species=?, stock_date=?, stock_quantity=?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [pond_name, area, species, stock_date, stock_quantity, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ponds/:id/lock', (req, res) => {
  try {
    const { locked, lock_reason } = req.body;
    run(
      `UPDATE ponds SET locked=?, lock_reason=?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [locked ? 1 : 0, lock_reason || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/drugs', (req, res) => {
  try {
    const { include_banned } = req.query;
    const rows =
      include_banned === 'true'
        ? all('SELECT * FROM drugs ORDER BY drug_code')
        : all('SELECT * FROM drugs WHERE is_banned = 0 ORDER BY drug_code');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/drugs', (req, res) => {
  try {
    const { drug_code, drug_name, manufacturer, specification, withdrawal_period, is_banned, usage_instructions } = req.body;
    const info = run(
      `INSERT INTO drugs (drug_code, drug_name, manufacturer, specification, withdrawal_period, is_banned, usage_instructions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [drug_code, drug_name, manufacturer, specification, withdrawal_period || 0, is_banned ? 1 : 0, usage_instructions]
    );
    res.json({ success: true, data: { id: info.lastInsertRowid } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/medications', (req, res) => {
  try {
    const { pond_id, audit_status } = req.query;
    let sql = `
      SELECT m.*, p.pond_code, p.pond_name, d.drug_name, d.withdrawal_period, d.is_banned,
        DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date,
        a.auditor as audit_auditor, a.audit_result, a.audit_opinion, a.audit_date
      FROM medication_records m
      JOIN ponds p ON m.pond_id = p.id
      JOIN drugs d ON m.drug_id = d.id
      LEFT JOIN audit_records a ON a.medication_id = m.id
    `;
    const conditions = [];
    const params = [];
    if (pond_id) {
      conditions.push('m.pond_id = ?');
      params.push(pond_id);
    }
    if (audit_status) {
      conditions.push('m.audit_status = ?');
      params.push(audit_status);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY m.created_at DESC';
    const rows = all(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/medications', (req, res) => {
  try {
    const { pond_id, drug_id, dosage, unit, usage_method, medication_date, operator, remark } = req.body;

    const drug = get('SELECT * FROM drugs WHERE id = ?', [drug_id]);
    if (!drug) {
      return res.status(400).json({ success: false, message: '药品不存在' });
    }
    if (drug.is_banned === 1) {
      return res.status(400).json({ success: false, message: `药品【${drug.drug_name}】为禁用药物，不能提交用药记录` });
    }

    const pond = get('SELECT * FROM ponds WHERE id = ?', [pond_id]);
    if (!pond) {
      return res.status(400).json({ success: false, message: '池塘不存在' });
    }
    if (pond.locked === 1) {
      return res.status(400).json({ success: false, message: `池塘【${pond.pond_name}】已被锁定，无法登记用药` });
    }

    const record_no = genCode('MED');
    const info = run(
      `INSERT INTO medication_records (record_no, pond_id, drug_id, dosage, unit, usage_method, medication_date, operator, remark, audit_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [record_no, pond_id, drug_id, dosage, unit, usage_method, medication_date, operator, remark]
    );
    res.json({ success: true, data: { id: info.lastInsertRowid, record_no } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/medications/:id/audit', (req, res) => {
  try {
    const { auditor, audit_result, audit_opinion } = req.body;
    if (!['approved', 'rejected'].includes(audit_result)) {
      return res.status(400).json({ success: false, message: '审核结果无效' });
    }
    const record = get('SELECT * FROM medication_records WHERE id = ?', [req.params.id]);
    if (!record) {
      return res.status(404).json({ success: false, message: '用药记录不存在' });
    }

    transaction(() => {
      run('UPDATE medication_records SET audit_status = ? WHERE id = ?', [audit_result, req.params.id]);
      run(
        `INSERT INTO audit_records (medication_id, auditor, audit_result, audit_opinion) VALUES (?, ?, ?, ?)`,
        [req.params.id, auditor, audit_result, audit_opinion || null]
      );
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/inspections', (req, res) => {
  try {
    const { pond_id, inspection_result } = req.query;
    let sql = `SELECT i.*, p.pond_code, p.pond_name FROM inspection_records i JOIN ponds p ON i.pond_id = p.id`;
    const conditions = [];
    const params = [];
    if (pond_id) { conditions.push('i.pond_id = ?'); params.push(pond_id); }
    if (inspection_result) { conditions.push('i.inspection_result = ?'); params.push(inspection_result); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY i.created_at DESC';
    const rows = all(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/inspections', (req, res) => {
  try {
    const { pond_id, sample_date, inspector, inspection_items, inspection_result, unqualified_items, remark } = req.body;
    if (!['qualified', 'unqualified'].includes(inspection_result)) {
      return res.status(400).json({ success: false, message: '抽检结果无效' });
    }
    const pond = get('SELECT * FROM ponds WHERE id = ?', [pond_id]);
    if (!pond) return res.status(400).json({ success: false, message: '池塘不存在' });

    const inspection_no = genCode('INS');

    transaction(() => {
      run(
        `INSERT INTO inspection_records (inspection_no, pond_id, sample_date, inspector, inspection_items, inspection_result, unqualified_items, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [inspection_no, pond_id, sample_date, inspector, inspection_items || null, inspection_result, unqualified_items || null, remark || null]
      );
      if (inspection_result === 'unqualified') {
        const lockReason = `抽检不合格：${unqualified_items || '多项指标不合格'}，抽检编号：${inspection_no}`;
        run(`UPDATE ponds SET locked = 1, lock_reason = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`, [lockReason, pond_id]);
      }
    });

    res.json({ success: true, data: { inspection_no, pond_locked: inspection_result === 'unqualified' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/harvests', (req, res) => {
  try {
    const rows = all(`
      SELECT h.*, p.pond_code, p.pond_name, p.locked, p.lock_reason,
        (SELECT MAX(DATE(m.medication_date, '+' || d.withdrawal_period || ' days'))
         FROM medication_records m
         JOIN drugs d ON m.drug_id = d.id
         WHERE m.pond_id = h.pond_id AND m.audit_status = 'approved') as withdrawal_end_date
      FROM harvest_plans h
      JOIN ponds p ON h.pond_id = p.id
      ORDER BY h.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/harvests', (req, res) => {
  try {
    const { pond_id, plan_date, plan_quantity, operator, remark } = req.body;
    const pond = get('SELECT * FROM ponds WHERE id = ?', [pond_id]);
    if (!pond) return res.status(400).json({ success: false, message: '池塘不存在' });
    if (pond.locked === 1) {
      return res.status(400).json({ success: false, message: `池塘【${pond.pond_name}】已被锁定（${pond.lock_reason || '原因未知'}），无法安排出塘` });
    }

    const latestApprovedMedication = get(
      `SELECT m.*, d.drug_name, d.withdrawal_period,
        DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date
      FROM medication_records m
      JOIN drugs d ON m.drug_id = d.id
      WHERE m.pond_id = ? AND m.audit_status = 'approved'
      ORDER BY m.medication_date DESC
      LIMIT 1`,
      [pond_id]
    );

    if (latestApprovedMedication && latestApprovedMedication.withdrawal_end_date) {
      const withdrawalEnd = dayjs(latestApprovedMedication.withdrawal_end_date);
      const planDay = dayjs(plan_date);
      if (planDay.isBefore(withdrawalEnd)) {
        const daysLeft = withdrawalEnd.diff(planDay, 'day') + 1;
        return res.status(400).json({
          success: false,
          message: `停药期未满：药品【${latestApprovedMedication.drug_name}】停药期截止到 ${latestApprovedMedication.withdrawal_end_date}，计划出塘日 ${plan_date} 距离停药期结束还有 ${daysLeft} 天，不能安排出塘`
        });
      }
    }

    const plan_no = genCode('HVT');
    const info = run(
      `INSERT INTO harvest_plans (plan_no, pond_id, plan_date, plan_quantity, operator, status, remark) VALUES (?, ?, ?, ?, ?, 'planned', ?)`,
      [plan_no, pond_id, plan_date, plan_quantity, operator, remark || null]
    );
    res.json({ success: true, data: { id: info.lastInsertRowid, plan_no } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/harvests/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['planned', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: '状态无效' });
    }
    run('UPDATE harvest_plans SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/statistics/summary', (req, res) => {
  try {
    const pondCount = get('SELECT COUNT(*) as cnt FROM ponds')?.cnt || 0;
    const lockedPondCount = get('SELECT COUNT(*) as cnt FROM ponds WHERE locked = 1')?.cnt || 0;
    const pendingAuditCount = get("SELECT COUNT(*) as cnt FROM medication_records WHERE audit_status = 'pending'")?.cnt || 0;
    const drugCount = get('SELECT COUNT(*) as cnt FROM drugs WHERE is_banned = 0')?.cnt || 0;
    const bannedDrugCount = get('SELECT COUNT(*) as cnt FROM drugs WHERE is_banned = 1')?.cnt || 0;

    const today = dayjs().format('YYYY-MM-DD');
    const activeWithdrawal = get(
      `SELECT COUNT(DISTINCT m.pond_id) as cnt
       FROM medication_records m
       JOIN drugs d ON m.drug_id = d.id
       WHERE m.audit_status = 'approved'
         AND DATE(m.medication_date, '+' || d.withdrawal_period || ' days') >= ?`,
      [today]
    )?.cnt || 0;

    res.json({
      success: true,
      data: {
        pond_count: pondCount,
        locked_pond_count: lockedPondCount,
        pending_audit_count: pendingAuditCount,
        drug_count: drugCount,
        banned_drug_count: bannedDrugCount,
        active_withdrawal_count: activeWithdrawal
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
