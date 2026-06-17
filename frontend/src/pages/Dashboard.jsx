import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Space, Alert } from 'antd';
import { getSummary, getPonds, getMedications } from '../services/api';

export default function Dashboard() {
  const [summary, setSummary] = useState({});
  const [ponds, setPonds] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, pondRes, medRes] = await Promise.all([
        getSummary(),
        getPonds(),
        getMedications({ audit_status: 'pending' })
      ]);
      if (sumRes.success) setSummary(sumRes.data);
      if (pondRes.success) setPonds(pondRes.data);
      if (medRes.success) setPendingList(medRes.data.slice(0, 5));
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
    { label: '池塘总数', value: summary.pond_count, cls: '' },
    { label: '锁定池塘', value: summary.locked_pond_count, cls: 'danger' },
    { label: '可用药品', value: summary.drug_count, cls: 'success' },
    { label: '禁用药品', value: summary.banned_drug_count, cls: 'warn' },
    { label: '待审核用药', value: summary.pending_audit_count, cls: 'warn' },
    { label: '停药期中池塘', value: summary.active_withdrawal_count, cls: 'warn' }
  ];

  const pondColumns = [
    { title: '池塘编号', dataIndex: 'pond_code', width: 100 },
    { title: '池塘名称', dataIndex: 'pond_name', width: 120 },
    { title: '养殖品种', dataIndex: 'species' },
    { title: '面积(亩)', dataIndex: 'area', width: 100 },
    {
      title: '状态',
      dataIndex: 'locked',
      width: 100,
      render: (v, r) =>
        v === 1 ? (
          <Space direction="vertical" size={0}>
            <Tag color="red">已锁定</Tag>
            <span style={{ fontSize: 11, color: '#999' }}>{r.lock_reason}</span>
          </Space>
        ) : (
          <Tag color="green">正常</Tag>
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
      width: 100,
      render: (v) => <Tag color="orange">待审核</Tag>
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">系统概览</div>
      </div>

      {summary.locked_pond_count > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`当前有 ${summary.locked_pond_count} 个池塘处于锁定状态，请及时处理`}
          style={{ marginBottom: 16 }}
        />
      )}
      {summary.pending_audit_count > 0 && (
        <Alert
          type="info"
          showIcon
          message={`有 ${summary.pending_audit_count} 条用药记录等待审核`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards.map((c, i) => (
          <Col span={4} key={i}>
            <Card className="stat-card">
              <div className={`stat-value ${c.cls}`}>{c.value ?? '-'}</div>
              <div className="stat-label">{c.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col span={14}>
          <Card title="池塘列表" size="small">
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              columns={pondColumns}
              dataSource={ponds}
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
        <Col span={10}>
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
      </Row>
    </div>
  );
}
