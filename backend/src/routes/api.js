const express = require('express');
const router = express.Router();
const { run, all, get, transaction, initDatabase } = require('../database/db');
const dayjs = require('dayjs');

const genCode = (prefix) => {
  return `${prefix}${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
};

function getDrugSubstitutes(bannedDrugId) {
  return all(
    `SELECT ds.*, d.drug_code as substitute_code, d.drug_name as substitute_name,
            d.withdrawal_period, d.usage_instructions
     FROM drug_substitutes ds
     JOIN drugs d ON ds.substitute_drug_id = d.id
     WHERE ds.banned_drug_id = ? AND d.is_banned = 0
     ORDER BY ds.priority ASC`,
    [bannedDrugId]
  );
}

function getPondUnlockCheckResult(pondId) {
  const pond = get('SELECT * FROM ponds WHERE id = ?', [pondId]);
  if (!pond) return { error: '池塘不存在' };
  if (pond.locked !== 1) return { can_unlock: true, conditions: null };

  const latestApprovedMedication = get(
    `SELECT m.*, d.drug_name, d.withdrawal_period,
      DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date
     FROM medication_records m
     JOIN drugs d ON m.drug_id = d.id
     WHERE m.pond_id = ? AND m.audit_status = 'approved'
     ORDER BY m.medication_date DESC LIMIT 1`,
    [pondId]
  );

  const today = dayjs().startOf('day');
  let withdrawalPassed = true;
  let withdrawalInfo = null;
  if (latestApprovedMedication && latestApprovedMedication.withdrawal_end_date) {
    const endDate = dayjs(latestApprovedMedication.withdrawal_end_date);
    withdrawalPassed = !today.isBefore(endDate);
    const daysRemaining = endDate.diff(today, 'day');
    withdrawalInfo = {
      drug_name: latestApprovedMedication.drug_name,
      medication_date: latestApprovedMedication.medication_date,
      withdrawal_end_date: latestApprovedMedication.withdrawal_end_date,
      days_remaining: daysRemaining > 0 ? daysRemaining : 0
    };
  }

  const unqualifiedInspections = all(
    `SELECT * FROM inspection_records
     WHERE pond_id = ? AND inspection_result = 'unqualified'
     ORDER BY created_at DESC`,
    [pondId]
  );

  let reInspectionPassed = true;
  let reInspectionInfo = [];
  for (const insp of unqualifiedInspections) {
    const followup = get(
      `SELECT * FROM inspection_records
       WHERE parent_inspection_id = ? AND is_reinspection = 1 AND inspection_result = 'qualified'
       ORDER BY created_at DESC LIMIT 1`,
      [insp.id]
    );
    if (!followup) {
      reInspectionPassed = false;
      reInspectionInfo.push({
        inspection_no: insp.inspection_no,
        sample_date: insp.sample_date,
        unqualified_items: insp.unqualified_items,
        has_reinspection: false
      });
    } else {
      reInspectionInfo.push({
        inspection_no: insp.inspection_no,
        sample_date: insp.sample_date,
        unqualified_items: insp.unqualified_items,
        has_reinspection: true,
        reinspection_no: followup.inspection_no,
        reinspection_date: followup.sample_date
      });
    }
  }

  const activeHarvestPlans = all(
    `SELECT * FROM harvest_plans WHERE pond_id = ? AND status = 'planned'`,
    [pondId]
  );

  let harvestRecalculated = true;
  let harvestInfo = [];
  if (withdrawalInfo) {
    for (const plan of activeHarvestPlans) {
      const planDate = dayjs(plan.plan_date);
      const withdrawalEnd = dayjs(withdrawalInfo.withdrawal_end_date);
      if (planDate.isBefore(withdrawalEnd)) {
        harvestRecalculated = false;
        harvestInfo.push({
          plan_no: plan.plan_no,
          plan_date: plan.plan_date,
          plan_quantity: plan.plan_quantity,
          issue: `计划出塘日早于停药期结束日（${withdrawalInfo.withdrawal_end_date}）`
        });
      }
    }
  }
  if (unqualifiedInspections.length > 0) {
    for (const plan of activeHarvestPlans) {
      const already = harvestInfo.find((h) => h.plan_no === plan.plan_no);
      if (!already) {
        harvestInfo.push({
          plan_no: plan.plan_no,
          plan_date: plan.plan_date,
          plan_quantity: plan.plan_quantity,
          issue: '存在抽检不合格记录，建议重新评估出塘计划'
        });
        harvestRecalculated = false;
      }
    }
  }

  const canUnlock = withdrawalPassed && reInspectionPassed && harvestRecalculated;

  return {
    can_unlock: canUnlock,
    pond_id: pondId,
    pond_name: pond.pond_name,
    conditions: {
      withdrawal: {
        passed: withdrawalPassed,
        info: withdrawalInfo,
        label: '停药期满检查'
      },
      reInspection: {
        passed: reInspectionPassed,
        info: reInspectionInfo,
        label: '复检通过检查'
      },
      harvest: {
        passed: harvestRecalculated,
        info: harvestInfo,
        label: '出塘计划重算检查'
      }
    }
  };
}

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

    if (pond.locked === 1) {
      pond.unlock_check = getPondUnlockCheckResult(req.params.id);
    }

    res.json({ success: true, data: pond });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/ponds/:id/timeline', (req, res) => {
  try {
    const pond = get('SELECT * FROM ponds WHERE id = ?', [req.params.id]);
    if (!pond) return res.status(404).json({ success: false, message: '池塘不存在' });

    const timeline = [];

    const meds = all(
      `SELECT m.*, d.drug_name, d.withdrawal_period, d.is_banned,
        DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date,
        a.auditor, a.audit_result, a.audit_opinion, a.audit_date
       FROM medication_records m
       LEFT JOIN drugs d ON m.drug_id = d.id
       LEFT JOIN audit_records a ON a.medication_id = m.id
       WHERE m.pond_id = ?
       ORDER BY m.created_at DESC`,
      [req.params.id]
    );
    for (const m of meds) {
      timeline.push({
        type: 'medication',
        subtype: m.audit_status === 'pending' ? 'medication_pending' :
                 m.audit_status === 'approved' ? 'medication_approved' : 'medication_rejected',
        time: m.created_at,
        title: `用药登记：${m.drug_name || '未知药品'}`,
        content: `用量：${m.dosage}${m.unit || ''}，日期：${m.medication_date}，登记人：${m.operator}`,
        data: m,
        status: m.audit_status
      });
      if (m.audit_result) {
        timeline.push({
          type: 'audit',
          subtype: m.audit_result === 'approved' ? 'audit_approved' : 'audit_rejected',
          time: m.audit_date,
          title: `兽医审核：${m.audit_result === 'approved' ? '通过' : '驳回'}`,
          content: `审核人：${m.auditor}，意见：${m.audit_opinion || '无'}`,
          data: m,
          status: m.audit_result
        });
      }
    }

    const inspections = all(
      `SELECT * FROM inspection_records WHERE pond_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    for (const i of inspections) {
      timeline.push({
        type: 'inspection',
        subtype: i.inspection_result === 'qualified'
          ? (i.is_reinspection ? 'reinspection_qualified' : 'inspection_qualified')
          : (i.is_reinspection ? 'reinspection_unqualified' : 'inspection_unqualified'),
        time: i.created_at,
        title: `${i.is_reinspection ? '复检' : '抽检'}：${i.inspection_result === 'qualified' ? '合格' : '不合格'}`,
        content: `质检员：${i.inspector}，抽样日期：${i.sample_date}，结果：${i.inspection_result === 'qualified' ? '合格' : ('不合格：' + (i.unqualified_items || '多项指标不合格'))}`,
        data: i,
        status: i.inspection_result
      });
    }

    const lockRecords = all(
      `SELECT * FROM pond_lock_records WHERE pond_id = ? ORDER BY lock_date DESC`,
      [req.params.id]
    );
    for (const lr of lockRecords) {
      timeline.push({
        type: 'lock',
        subtype: lr.unlock_date ? 'unlocked' : 'locked',
        time: lr.unlock_date || lr.lock_date,
        title: lr.unlock_date ? `池塘解锁：${lr.lock_type}` : `池塘锁定：${lr.lock_type}`,
        content: `${lr.lock_reason || ''}${lr.operator ? '，操作人：' + lr.operator : ''}`,
        data: lr,
        status: lr.unlock_date ? 'unlocked' : 'locked'
      });
    }

    const harvests = all(
      `SELECT * FROM harvest_plans WHERE pond_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    for (const h of harvests) {
      timeline.push({
        type: 'harvest',
        subtype: `harvest_${h.status}`,
        time: h.created_at,
        title: `出塘计划：${h.status === 'planned' ? '计划中' : h.status === 'completed' ? '已完成' : '已取消'}`,
        content: `计划日期：${h.plan_date}，数量：${h.plan_quantity || '-'}，操作人：${h.operator || '-'}`,
        data: h,
        status: h.status
      });
    }

    timeline.sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());

    res.json({
      success: true,
      data: {
        pond,
        timeline
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/ponds/:id/lock-records', (req, res) => {
  try {
    const records = all(
      `SELECT plr.*, i.inspection_no, m.record_no
       FROM pond_lock_records plr
       LEFT JOIN inspection_records i ON plr.inspection_id = i.id
       LEFT JOIN medication_records m ON plr.medication_id = m.id
       WHERE plr.pond_id = ?
       ORDER BY plr.lock_date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: records });
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
    const { locked, lock_reason, operator, lock_type = 'manual' } = req.body;
    const pond = get('SELECT * FROM ponds WHERE id = ?', [req.params.id]);
    if (!pond) return res.status(400).json({ success: false, message: '池塘不存在' });

    transaction(() => {
      run(
        `UPDATE ponds SET locked=?, lock_reason=?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [locked ? 1 : 0, lock_reason || null, req.params.id]
      );
      if (locked) {
        const lockDate = dayjs().format('YYYY-MM-DD HH:mm:ss');
        run(
          `INSERT INTO pond_lock_records (pond_id, lock_type, lock_reason, lock_date, operator) VALUES (?, ?, ?, ?, ?)`,
          [req.params.id, lock_type, lock_reason || null, lockDate, operator || null]
        );
      } else {
        const unlockDate = dayjs().format('YYYY-MM-DD HH:mm:ss');
        const latest = get(
          `SELECT * FROM pond_lock_records WHERE pond_id = ? ORDER BY lock_date DESC LIMIT 1`,
          [req.params.id]
        );
        if (latest) {
          run(
            `UPDATE pond_lock_records SET unlock_date = ?, unlock_check_status = ? WHERE id = ?`,
            [unlockDate, 'manual', latest.id]
          );
        }
        run(
          `UPDATE ponds SET last_unlock_date = ? WHERE id = ?`,
          [unlockDate, req.params.id]
        );
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ponds/:id/unlock', (req, res) => {
  try {
    const { operator, force = false } = req.body;
    const pond = get('SELECT * FROM ponds WHERE id = ?', [req.params.id]);
    if (!pond) return res.status(400).json({ success: false, message: '池塘不存在' });
    if (pond.locked !== 1) return res.status(400).json({ success: false, message: '池塘未锁定' });

    const checkResult = getPondUnlockCheckResult(req.params.id);
    if (!force && !checkResult.can_unlock) {
      return res.status(400).json({
        success: false,
        message: '解锁条件未全部满足，请检查停药期、复检和出塘计划',
        data: checkResult
      });
    }

    const unlockDate = dayjs().format('YYYY-MM-DD HH:mm:ss');

    transaction(() => {
      run(
        `UPDATE ponds SET locked=0, lock_reason=?, last_unlock_date=?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [null, unlockDate, req.params.id]
      );
      const latest = get(
        `SELECT * FROM pond_lock_records WHERE pond_id = ? ORDER BY lock_date DESC LIMIT 1`,
        [req.params.id]
      );
      if (latest) {
        run(
          `UPDATE pond_lock_records SET unlock_date = ?, unlock_conditions = ?, unlock_check_status = ?, operator = COALESCE(?, operator) WHERE id = ?`,
          [unlockDate, JSON.stringify(checkResult.conditions), force ? 'forced' : 'passed', operator || null, latest.id]
        );
      }
    });

    res.json({
      success: true,
      data: {
        unlock_date: unlockDate,
        forced: force,
        check_result: checkResult
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/ponds/:id/unlock-check', (req, res) => {
  try {
    const result = getPondUnlockCheckResult(req.params.id);
    res.json({ success: true, data: result });
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

router.get('/drugs/:id/substitutes', (req, res) => {
  try {
    const drug = get('SELECT * FROM drugs WHERE id = ?', [req.params.id]);
    if (!drug) return res.status(404).json({ success: false, message: '药品不存在' });
    let substitutes = [];
    let bannedInfo = null;
    if (drug.is_banned === 1) {
      substitutes = getDrugSubstitutes(req.params.id);
      bannedInfo = drug;
    }
    res.json({ success: true, data: { drug, banned_info: bannedInfo, substitutes } });
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
      SELECT m.*, p.pond_code, p.pond_name, p.area as pond_area_joined,
             d.drug_name, d.withdrawal_period, d.is_banned,
        DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date,
        a.auditor as audit_auditor, a.audit_result, a.audit_opinion, a.audit_date, a.suggested_substitutes
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
    const rows = all(sql, params).map((r) => {
      try {
        r.alternative_drug_ids_parsed = r.alternative_drug_ids ? JSON.parse(r.alternative_drug_ids) : null;
      } catch (e) { r.alternative_drug_ids_parsed = null; }
      try {
        r.suggested_substitutes_parsed = r.suggested_substitutes ? JSON.parse(r.suggested_substitutes) : null;
      } catch (e) { r.suggested_substitutes_parsed = null; }
      return r;
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/medications', (req, res) => {
  try {
    const {
      pond_id, drug_id, dosage, unit, usage_method, medication_date,
      operator, remark, expected_harvest_date, alternative_drug_ids
    } = req.body;

    const drug = get('SELECT * FROM drugs WHERE id = ?', [drug_id]);
    if (!drug) return res.status(400).json({ success: false, message: '药品不存在' });

    const pond = get('SELECT * FROM ponds WHERE id = ?', [pond_id]);
    if (!pond) return res.status(400).json({ success: false, message: '池塘不存在' });
    if (pond.locked === 1) {
      return res.status(400).json({ success: false, message: `池塘【${pond.pond_name}】已被锁定，无法登记用药` });
    }

    let hasWarning = false;
    let warningData = null;
    if (drug.is_banned === 1) {
      hasWarning = true;
      const substitutes = getDrugSubstitutes(drug_id);
      warningData = {
        banned_drug: drug,
        substitutes,
        message: `所选药品【${drug.drug_name}】为禁用药物，建议使用替代方案`
      };
    }

    if (expected_harvest_date && drug.withdrawal_period > 0) {
      const medDate = dayjs(medication_date || dayjs().format('YYYY-MM-DD'));
      const withdrawalEnd = medDate.add(drug.withdrawal_period, 'day');
      const harvestDate = dayjs(expected_harvest_date);
      if (harvestDate.isBefore(withdrawalEnd)) {
        hasWarning = true;
        warningData = warningData || {};
        warningData.harvest_conflict = {
          expected_harvest_date,
          withdrawal_end_date: withdrawalEnd.format('YYYY-MM-DD'),
          days_conflict: withdrawalEnd.diff(harvestDate, 'day') + 1,
          message: `预计出塘日早于停药期结束日 ${withdrawalEnd.format('YYYY-MM-DD')}`
        };
      }
    }

    const record_no = genCode('MED');
    const info = run(
      `INSERT INTO medication_records
        (record_no, pond_id, drug_id, dosage, unit, usage_method, medication_date,
         operator, remark, audit_status, expected_harvest_date, alternative_drug_ids, pond_area)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        record_no, pond_id, drug_id, dosage, unit, usage_method, medication_date,
        operator, remark,
        expected_harvest_date || null,
        alternative_drug_ids ? JSON.stringify(alternative_drug_ids) : null,
        pond.area || null
      ]
    );

    res.json({
      success: true,
      data: {
        id: info.lastInsertRowid,
        record_no,
        has_warning: hasWarning,
        warning: warningData
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/medications/:id/resubmit', (req, res) => {
  try {
    const original = get('SELECT * FROM medication_records WHERE id = ?', [req.params.id]);
    if (!original) return res.status(404).json({ success: false, message: '原用药记录不存在' });
    if (original.audit_status !== 'rejected') {
      return res.status(400).json({ success: false, message: '只有已驳回的记录才能重新提交' });
    }

    const {
      drug_id, dosage, unit, usage_method, medication_date,
      operator, remark, expected_harvest_date, alternative_drug_ids
    } = req.body;

    const newDrugId = drug_id || original.drug_id;
    const drug = get('SELECT * FROM drugs WHERE id = ?', [newDrugId]);
    if (!drug) return res.status(400).json({ success: false, message: '药品不存在' });

    const pond = get('SELECT * FROM ponds WHERE id = ?', [original.pond_id]);
    if (pond.locked === 1) {
      return res.status(400).json({ success: false, message: '池塘已锁定，无法重新提交' });
    }

    let hasWarning = false;
    let warningData = null;
    if (drug.is_banned === 1) {
      hasWarning = true;
      const substitutes = getDrugSubstitutes(newDrugId);
      warningData = {
        banned_drug: drug,
        substitutes,
        message: `所选药品【${drug.drug_name}】为禁用药物，建议使用替代方案`
      };
    }

    const newMedDate = medication_date || original.medication_date;
    const newHarvestDate = expected_harvest_date || original.expected_harvest_date;
    if (newHarvestDate && drug.withdrawal_period > 0) {
      const medDate = dayjs(newMedDate);
      const withdrawalEnd = medDate.add(drug.withdrawal_period, 'day');
      const harvestDate = dayjs(newHarvestDate);
      if (harvestDate.isBefore(withdrawalEnd)) {
        hasWarning = true;
        warningData = warningData || {};
        warningData.harvest_conflict = {
          expected_harvest_date: newHarvestDate,
          withdrawal_end_date: withdrawalEnd.format('YYYY-MM-DD'),
          message: `预计出塘日早于停药期结束日 ${withdrawalEnd.format('YYYY-MM-DD')}`
        };
      }
    }

    const resubmitCount = (original.resubmit_count || 0) + 1;
    const record_no = genCode('MED');

    const info = run(
      `INSERT INTO medication_records
        (record_no, pond_id, drug_id, dosage, unit, usage_method, medication_date,
         operator, remark, audit_status, expected_harvest_date, alternative_drug_ids,
         pond_area, original_medication_id, resubmit_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        record_no, original.pond_id, newDrugId,
        dosage != null ? dosage : original.dosage,
        unit != null ? unit : original.unit,
        usage_method != null ? usage_method : original.usage_method,
        newMedDate,
        operator != null ? operator : original.operator,
        remark != null ? remark : original.remark,
        newHarvestDate || null,
        alternative_drug_ids ? JSON.stringify(alternative_drug_ids) : original.alternative_drug_ids,
        pond.area || null,
        original.id,
        resubmitCount
      ]
    );

    res.json({
      success: true,
      data: {
        id: info.lastInsertRowid,
        record_no,
        original_id: original.id,
        resubmit_count: resubmitCount,
        has_warning: hasWarning,
        warning: warningData
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/medications/:id/audit', (req, res) => {
  try {
    const { auditor, audit_result, audit_opinion, suggested_substitutes } = req.body;
    if (!['approved', 'rejected'].includes(audit_result)) {
      return res.status(400).json({ success: false, message: '审核结果无效' });
    }
    const record = get('SELECT * FROM medication_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ success: false, message: '用药记录不存在' });

    let suggestedSubsData = null;
    if (audit_result === 'rejected') {
      const drug = get('SELECT * FROM drugs WHERE id = ?', [record.drug_id]);
      if (drug && drug.is_banned === 1) {
        suggestedSubsData = suggested_substitutes || getDrugSubstitutes(record.drug_id);
      } else if (suggested_substitutes) {
        suggestedSubsData = suggested_substitutes;
      }
    }

    transaction(() => {
      run('UPDATE medication_records SET audit_status = ? WHERE id = ?', [audit_result, req.params.id]);
      run(
        `INSERT INTO audit_records (medication_id, auditor, audit_result, audit_opinion, suggested_substitutes) VALUES (?, ?, ?, ?, ?)`,
        [
          req.params.id, auditor, audit_result, audit_opinion || null,
          suggestedSubsData ? JSON.stringify(suggestedSubsData) : null
        ]
      );
    });

    res.json({
      success: true,
      data: {
        suggested_substitutes: suggestedSubsData || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/inspections', (req, res) => {
  try {
    const { pond_id, inspection_result } = req.query;
    let sql = `SELECT i.*, p.pond_code, p.pond_name,
                      pi.inspection_no as parent_inspection_no
               FROM inspection_records i
               JOIN ponds p ON i.pond_id = p.id
               LEFT JOIN inspection_records pi ON i.parent_inspection_id = pi.id`;
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
    const {
      pond_id, sample_date, inspector, inspection_items,
      inspection_result, unqualified_items, remark,
      is_reinspection = 0, parent_inspection_id = null
    } = req.body;

    if (!['qualified', 'unqualified'].includes(inspection_result)) {
      return res.status(400).json({ success: false, message: '抽检结果无效' });
    }
    const pond = get('SELECT * FROM ponds WHERE id = ?', [pond_id]);
    if (!pond) return res.status(400).json({ success: false, message: '池塘不存在' });

    if (is_reinspection && parent_inspection_id) {
      const parent = get('SELECT * FROM inspection_records WHERE id = ?', [parent_inspection_id]);
      if (!parent) return res.status(400).json({ success: false, message: '关联的原抽检记录不存在' });
    }

    const inspection_no = genCode('INS');
    let pondLockedNow = false;
    let unlockCheckTriggered = null;

    transaction(() => {
      run(
        `INSERT INTO inspection_records
          (inspection_no, pond_id, sample_date, inspector, inspection_items,
           inspection_result, unqualified_items, remark, is_reinspection, parent_inspection_id, reinspection_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inspection_no, pond_id, sample_date, inspector, inspection_items || null,
          inspection_result, unqualified_items || null, remark || null,
          is_reinspection ? 1 : 0, parent_inspection_id || null,
          is_reinspection ? (inspection_result === 'qualified' ? 'passed' : 'failed') : null
        ]
      );

      if (inspection_result === 'unqualified') {
        const lockReason = `${is_reinspection ? '复检' : '抽检'}不合格：${unqualified_items || '多项指标不合格'}，编号：${inspection_no}`;
        run(`UPDATE ponds SET locked = 1, lock_reason = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`, [lockReason, pond_id]);
        pondLockedNow = true;
        const lockDate = dayjs().format('YYYY-MM-DD HH:mm:ss');
        run(
          `INSERT INTO pond_lock_records (pond_id, lock_type, lock_reason, lock_date, inspection_id, operator) VALUES (?, ?, ?, ?, ?, ?)`,
          [pond_id, is_reinspection ? 'reinspection_unqualified' : 'inspection_unqualified', lockReason, lockDate, null, inspector]
        );
        const latestLockId = get('SELECT last_insert_rowid() as id').id;
        run(`UPDATE pond_lock_records SET inspection_id = ? WHERE id = ?`, [latestLockId, latestLockId]);
      }

      if (is_reinspection && inspection_result === 'qualified' && parent_inspection_id) {
        run(
          `UPDATE inspection_records SET reinspection_status = 'resolved' WHERE id = ?`,
          [parent_inspection_id]
        );
        if (pond.locked === 1) {
          unlockCheckTriggered = getPondUnlockCheckResult(pond_id);
        }
      }
    });

    res.json({
      success: true,
      data: {
        inspection_no,
        pond_locked: pondLockedNow,
        unlock_check: unlockCheckTriggered
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/harvests', (req, res) => {
  try {
    const rows = all(`
      SELECT h.*, p.pond_code, p.pond_name, p.locked, p.lock_reason,
             hp.plan_no as recalculated_from_no,
        (SELECT MAX(DATE(m.medication_date, '+' || d.withdrawal_period || ' days'))
         FROM medication_records m
         JOIN drugs d ON m.drug_id = d.id
         WHERE m.pond_id = h.pond_id AND m.audit_status = 'approved') as withdrawal_end_date
      FROM harvest_plans h
      JOIN ponds p ON h.pond_id = p.id
      LEFT JOIN harvest_plans hp ON h.recalculated_from_id = hp.id
      ORDER BY h.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/harvests', (req, res) => {
  try {
    const { pond_id, plan_date, plan_quantity, operator, remark, recalculated_from_id } = req.body;
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
          message: `停药期未满：药品【${latestApprovedMedication.drug_name}】停药期截止到 ${latestApprovedMedication.withdrawal_end_date}，计划出塘日 ${plan_date} 距离停药期结束还有 ${daysLeft} 天，不能安排出塘`,
          data: {
            withdrawal_end_date: latestApprovedMedication.withdrawal_end_date,
            suggested_plan_date: withdrawalEnd.add(1, 'day').format('YYYY-MM-DD')
          }
        });
      }
    }

    const plan_no = genCode('HVT');
    const info = run(
      `INSERT INTO harvest_plans (plan_no, pond_id, plan_date, plan_quantity, operator, status, remark, recalculated_from_id) VALUES (?, ?, ?, ?, ?, 'planned', ?, ?)`,
      [plan_no, pond_id, plan_date, plan_quantity, operator, remark || null, recalculated_from_id || null]
    );
    res.json({ success: true, data: { id: info.lastInsertRowid, plan_no } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/harvests/:id/recalculate', (req, res) => {
  try {
    const original = get('SELECT * FROM harvest_plans WHERE id = ?', [req.params.id]);
    if (!original) return res.status(404).json({ success: false, message: '原计划不存在' });

    const { plan_date, plan_quantity, operator, remark } = req.body;

    const pond = get('SELECT * FROM ponds WHERE id = ?', [original.pond_id]);
    const latestApprovedMedication = get(
      `SELECT m.*, d.drug_name, d.withdrawal_period,
        DATE(m.medication_date, '+' || d.withdrawal_period || ' days') as withdrawal_end_date
      FROM medication_records m
      JOIN drugs d ON m.drug_id = d.id
      WHERE m.pond_id = ? AND m.audit_status = 'approved'
      ORDER BY m.medication_date DESC
      LIMIT 1`,
      [original.pond_id]
    );

    let finalPlanDate = plan_date || original.plan_date;
    if (latestApprovedMedication && latestApprovedMedication.withdrawal_end_date) {
      const withdrawalEnd = dayjs(latestApprovedMedication.withdrawal_end_date);
      const fpd = dayjs(finalPlanDate);
      if (fpd.isBefore(withdrawalEnd)) {
        finalPlanDate = withdrawalEnd.add(1, 'day').format('YYYY-MM-DD');
      }
    }

    const plan_no = genCode('HVT');
    const info = run(
      `INSERT INTO harvest_plans (plan_no, pond_id, plan_date, plan_quantity, operator, status, remark, recalculated_from_id) VALUES (?, ?, ?, ?, ?, 'planned', ?, ?)`,
      [
        plan_no, original.pond_id, finalPlanDate,
        plan_quantity != null ? plan_quantity : original.plan_quantity,
        operator != null ? operator : original.operator,
        remark != null ? remark : original.remark,
        original.id
      ]
    );

    if (original.status === 'planned') {
      run('UPDATE harvest_plans SET status = ? WHERE id = ?', ['cancelled', original.id]);
    }

    res.json({
      success: true,
      data: {
        id: info.lastInsertRowid,
        plan_no,
        original_id: original.id,
        plan_date: finalPlanDate,
        auto_adjusted: finalPlanDate !== (plan_date || original.plan_date)
      }
    });
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

    const resubmitCount = get('SELECT COUNT(*) as cnt FROM medication_records WHERE original_medication_id IS NOT NULL')?.cnt || 0;
    const reInspectionPendingCount = get(`
      SELECT COUNT(*) as cnt FROM inspection_records i
      WHERE i.inspection_result = 'unqualified' AND i.reinspection_status IS NULL
        AND NOT EXISTS (SELECT 1 FROM inspection_records r WHERE r.parent_inspection_id = i.id AND r.is_reinspection = 1 AND r.inspection_result = 'qualified')
    `)?.cnt || 0;

    res.json({
      success: true,
      data: {
        pond_count: pondCount,
        locked_pond_count: lockedPondCount,
        pending_audit_count: pendingAuditCount,
        drug_count: drugCount,
        banned_drug_count: bannedDrugCount,
        active_withdrawal_count: activeWithdrawal,
        resubmit_count: resubmitCount,
        reinspection_pending_count: reInspectionPendingCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
