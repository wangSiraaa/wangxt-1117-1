import React, { useEffect, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Alert,
  Steps,
  Timeline,
  List,
  Tooltip,
  Badge,
  Divider,
  Progress
} from 'antd';
import {
  MedicineBoxOutlined,
  AuditOutlined,
  ExperimentOutlined,
  LockOutlined,
  UnlockOutlined,
  FishOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  WarningFilled,
  ExclamationCircleFilled,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getSummary,
  getPonds,
  getMedications,
  getInspections,
  getHarvests,
  getAudits
} from '../services/api';

export default function Dashboard() {
  const [summary, setSummary] = useState({});
  const [ponds, setPonds] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [latestInspections, setLatestInspections] = useState([]);
  const [lockedPondsDetail, setLockedPondsDetail] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, pondRes, medRes, inspRes, harvestRes, auditRes] =
        await Promise.all([
          getSummary(),
          getPonds(),
          getMedications({ audit_status: 'pending' }),
          getInspections(),
          getHarvests(),
          getAudits()
        ]);
      if (sumRes.success) setSummary(sumRes.data || {});
      if (pondRes.success) {
        setPonds(pondRes.data || []);
        setLockedPondsDetail(
          (pondRes.data || []).filter((p) => p.locked === 1).slice(0, 5)
        );
      }
      if (medRes.success) setPendingList(medRes.data.slice(0, 5) || []);
      if (inspRes.success)
        setLatestInspections((inspRes.data || []).slice(0, 8));

      const events = [];
      (medRes.data || []).slice(0, 10).forEach((m) =>
        events.push({
          time: m.created_at || m.medication_date,
          type: 'medication',
          tag: <Tag color="blue">用药登记</Tag>,
          color: 'blue',
          dot: <MedicineBoxOutlined />,
          desc: `${m.record_no}｜${m.pond_name}｜${m.drug_name}｜${m.operator}`
        })
      );
      (auditRes.data || []).slice(0, 10).forEach((a) =>
        events.push({
          time: a.audit_date || a.created_at,
          type: 'audit',
          tag:
            a.audit_result === 'approved' ? (
              <Tag color="green" icon={<CheckCircleFilled />}>
                审核通过
              </Tag>
            ) : (
              <Tag color="red" icon={<CloseCircleFilled />}>
                审核驳回
              </Tag>
            ),
          color: a.audit_result === 'approved' ? 'green' : 'red',
          dot: <AuditOutlined />,
          desc: `${a.auditor}｜${a.related_record_no || '#' + a.id}${
            a.reason ? '｜' + a.reason : ''
          }`
        })
      );
      (inspRes.data || []).slice(0, 10).forEach((i) =>
        events.push({
          time: i.inspection_date || i.created_at,
          type: 'inspection',
          tag:
            i.result === 'qualified' ? (
              <Tag color="green" icon={<CheckCircleFilled />}>
                {i.is_reinspection ? '复检通过' : '抽检合格'}
              </Tag>
            ) : (
              <Tag color="red" icon={<ExclamationCircleFilled />}>
                {i.is_reinspection ? '复检不合格' : '抽检不合格'}
              </Tag>
            ),
          color: i.result === 'qualified' ? 'green' : 'red',
          dot: <ExperimentOutlined />,
          desc: `${i.pond_name}｜${i.item || '残留检测'}${
            i.sample_batch ? '｜批次' + i.sample_batch : ''
          }`
        })
      );
      (harvestRes.data || []).slice(0, 5).forEach((h) =>
        events.push({
          time: h.created_at || h.plan_date,
          type: 'harvest',
          tag:
            h.status === 'completed' ? (
              <Tag color="green" icon={<FishOutlined />}>
                出塘完成
              </Tag>
            ) : h.status === 'planned' ? (
              <Tag color="blue">出塘计划</Tag>
            ) : (
              <Tag color="default">计划取消</Tag>
            ),
          color: h.status === 'completed' ? 'green' : 'blue',
          dot: <FishOutlined />,
          desc: `${h.plan_no}｜${h.pond_name}｜${h.plan_date}${
            h.recalculated_from_id ? '｜已重算' : ''
          }`
        })
      );

      events.sort((a, b) => {
        const ta = dayjs(a.time || '').valueOf();
        const tb = dayjs(b.time || '').valueOf();
        return isNaN(tb) ? -1 : isNaN(ta) ? 1 : tb - ta;
      });
      setTimeline(events.slice(0, 12));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const statCards = [
    {
      label: '池塘总数',
      value: summary.pond_count,
      cls: '',
      icon: <FishOutlined />
    },
    {
      label: '锁定池塘',
      value: summary.locked_pond_count,
      cls: 'danger',
      icon: <LockOutlined />
    },
    {
      label: '可用药品',
      value: summary.drug_count,
      cls: 'success',
      icon: <MedicineBoxOutlined />
    },
    {
      label: '禁用药品',
      value: summary.banned_drug_count,
      cls: 'warn',
      icon: <WarningFilled />
    },
    {
      label: '待审核用药',
      value: summary.pending_audit_count,
      cls: 'warn',
      icon: <AuditOutlined />
    },
    {
      label: '停药期中池塘',
      value: summary.active_withdrawal_count,
      cls: 'warn',
      icon: <ReloadOutlined />
    }
  ];

  const pondColumns = [
    { title: '池塘编号', dataIndex: 'pond_code', width: 100 },
    { title: '池塘名称', dataIndex: 'pond_name', width: 120 },
    { title: '养殖品种', dataIndex: 'species' },
    { title: '面积(亩)', dataIndex: 'area', width: 100 },
    {
      title: '状态',
      dataIndex: 'locked',
      width: 130,
      render: (v, r) =>
        v === 1 ? (
          <Space direction="vertical" size={0}>
            <Tag color="red" icon={<LockOutlined />}>
              已锁定
            </Tag>
            <span style={{ fontSize: 11, color: '#999' }}>{r.lock_reason}</span>
          </Space>
        ) : (
          <Tag color="green" icon={<UnlockOutlined />}>
            正常
          </Tag>
        )
    }
  ];

  const pendingColumns = [
    { title: '记录编号', dataIndex: 'record_no', width: 180 },
    { title: '池塘', dataIndex: 'pond_name', width: 100 },
    { title: '药品', dataIndex: 'drug_name' },
    { title: '用药日期', dataIndex: 'medication_date', width: 120 },
    { title: '登记人', dataIndex: 'operator', width: 100 },
    {
      title: '状态',
      dataIndex: 'audit_status',
      width: 110,
      render: (v, r) =>
        r.is_banned_drug ? (
          <Space direction="vertical" size={0}>
            <Tag color="orange">待审核</Tag>
            <Tag color="red" style={{ margin: 0 }}>
              含禁药
            </Tag>
          </Space>
        ) : (
          <Tag color="orange">待审核</Tag>
        )
    }
  ];

  const pipelineSteps = [
    {
      title: '用药登记',
      desc: '养殖员登记批次/池塘/预计出塘',
      icon: <MedicineBoxOutlined />,
      status: summary.pending_audit_count > 0 ? 'process' : 'finish',
      stat: summary.medication_today_count || '-'
    },
    {
      title: '兽医审核',
      desc: '禁药识别 → 替代方案 → 重审入口',
      icon: <AuditOutlined />,
      status: 'finish',
      stat: summary.audit_approved_count || '-'
    },
    {
      title: '抽检/复检',
      desc: '不合格锁定池塘 → 复检入口',
      icon: <ExperimentOutlined />,
      status: 'finish',
      stat: summary.inspection_unqualified_count || '-'
    },
    {
      title: '解锁条件',
      desc: '停药期满 + 复检通过 + 出塘重算',
      icon: <UnlockOutlined />,
      status: summary.locked_pond_count > 0 ? 'wait' : 'finish',
      stat: summary.locked_pond_count || '0'
    },
    {
      title: '出塘执行',
      desc: '停药期冲突预警 + 一键重算',
      icon: <FishOutlined />,
      status: 'finish',
      stat: summary.harvest_completed_count || '-'
    }
  ];

  const pipelineProgress = Math.max(
    20,
    Math.min(100, Math.round(((5 - (summary.locked_pond_count ? 1 : 0)) / 5) * 100))
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title">水产用药全链路追踪看板</div>
      </div>

      {summary.locked_pond_count > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleFilled />}
          message={`当前有 ${summary.locked_pond_count} 个池塘处于锁定状态`}
          description="需完成停药期、复检通过并重算出塘计划后才能解锁，前往【池塘管理】处理"
          style={{ marginBottom: 16 }}
        />
      )}
      {summary.pending_audit_count > 0 && (
        <Alert
          type="info"
          showIcon
          message={`有 ${summary.pending_audit_count} 条用药记录等待审核`}
          description="含禁药的记录将自动匹配替代方案，前往【兽医审核】处理"
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {statCards.map((c, i) => (
          <Col span={4} key={i}>
            <Card className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className={`stat-value ${c.cls}`} style={{ flex: 1 }}>
                  {c.value ?? '-'}
                </div>
                <div style={{ fontSize: 22, color: '#999' }}>{c.icon}</div>
              </div>
              <div className="stat-label">{c.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        size="small"
        title={
          <Space>
            <span>业务主链路（Medication → Audit → Inspection → Unlock → Harvest）</span>
            <Badge color="blue" text="可追踪" />
          </Space>
        }
        style={{ marginBottom: 20 }}
        extra={
          <Space>
            <Progress
              type="dashboard"
              percent={pipelineProgress}
              size={70}
              strokeColor="#1677ff"
            />
            <span style={{ color: '#666', fontSize: 12 }}>
              链路健康度
            </span>
          </Space>
        }
      >
        <Steps
          size="small"
          current={summary.locked_pond_count > 0 ? 3 : 5}
          status={summary.locked_pond_count > 0 ? 'error' : 'finish'}
          items={pipelineSteps.map((s) => ({
            title: (
              <Space direction="vertical" size={0}>
                <span style={{ fontWeight: 600 }}>{s.title}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{s.desc}</span>
              </Space>
            ),
            description: <Tag color="blue">{s.stat}</Tag>,
            icon: s.icon,
            status: s.status
          }))}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={14}>
          <Card title="待审核用药记录" size="small">
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              columns={pendingColumns}
              dataSource={pendingList}
              pagination={false}
              locale={{ emptyText: '暂无待审核记录' }}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="锁定池塘预警（需三步解锁）" size="small">
            <List
              size="small"
              locale={{ emptyText: '所有池塘均正常' }}
              dataSource={lockedPondsDetail}
              renderItem={(p) => (
                <List.Item
                  actions={[
                    <Tag color="red" icon={<LockOutlined />} key="l">
                      锁定中
                    </Tag>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <span>
                          {p.pond_code} {p.pond_name}
                        </span>
                        <Tag color="cyan">{p.species}</Tag>
                        <Tag color="blue">{p.area}亩</Tag>
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <span style={{ color: '#c00' }}>{p.lock_reason}</span>
                        {p.last_lock_date && (
                          <span style={{ fontSize: 11, color: '#999' }}>
                            锁定：{p.last_lock_date}
                          </span>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card
            title={
              <Space>
                <span>全链路事件时间线（最近）</span>
                <Tag color="purple">{timeline.length}条</Tag>
              </Space>
            }
            size="small"
          >
            <Timeline
              mode="left"
              items={timeline.map((t, idx) => ({
                color: t.color,
                dot: t.dot,
                label: (
                  <Space size={2} style={{ fontSize: 11 }}>
                    {t.tag}
                    <span style={{ color: '#999' }}>
                      {dayjs(t.time || '').format('MM-DD HH:mm')}
                    </span>
                  </Space>
                ),
                children: (
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      background:
                        t.color === 'green'
                          ? '#f6ffed'
                          : t.color === 'red'
                          ? '#fff2f0'
                          : '#e6f4ff',
                      fontSize: 12,
                      color: '#333'
                    }}
                  >
                    {t.desc}
                  </div>
                )
              }))}
            />
            {timeline.length === 0 && (
              <div style={{ color: '#999', padding: 16, textAlign: 'center' }}>
                暂无业务事件
              </div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title={
              <Space>
                <span>最近抽检</span>
                <Tooltip title="抽检不合格将自动触发池塘锁定流程">
                  <Tag color="blue">查看</Tag>
                </Tooltip>
              </Space>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <List
              size="small"
              locale={{ emptyText: '暂无抽检记录' }}
              dataSource={latestInspections}
              renderItem={(i) => (
                <List.Item
                  actions={[
                    i.result === 'qualified' ? (
                      <Tag color="green" key="r">
                        {i.is_reinspection ? '复检通过' : '合格'}
                      </Tag>
                    ) : (
                      <Tag color="red" key="r">
                        {i.is_reinspection ? '复检不合格' : '不合格→锁定'}
                      </Tag>
                    )
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <ExperimentOutlined />
                        <span>{i.pond_name}</span>
                        <span style={{ color: '#888', fontSize: 12 }}>
                          {i.inspection_date}
                        </span>
                        {i.is_reinspection && (
                          <Tag color="orange" style={{ margin: 0 }}>
                            RE
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space>
                        <span>
                          {i.item || '残留检测'}
                          {i.sample_batch ? '｜' + i.sample_batch : ''}
                        </span>
                        {i.inspector && (
                          <Tag color="default" style={{ margin: 0 }}>
                            {i.inspector}
                          </Tag>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card title="池塘概览" size="small">
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              columns={pondColumns}
              dataSource={ponds}
              pagination={{ pageSize: 4, size: 'small' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
