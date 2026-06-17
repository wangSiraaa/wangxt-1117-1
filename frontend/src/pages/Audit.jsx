import React, { useEffect, useState } from 'react';
import {
  Button,
  Table,
  Space,
  Modal,
  Form,
  Input,
  Tag,
  App,
  Card,
  Radio,
  Descriptions,
  Alert,
  List,
  Tooltip,
  Divider,
  Badge
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  WarningOutlined,
  MedicineBoxOutlined,
  EditOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import {
  getMedications,
  auditMedication,
  getDrugSubstitutes,
  resubmitMedication
} from '../services/api';
import dayjs from 'dayjs';

const { TextArea } = Input;

const isBannedDrug = (r) => r?.is_banned === 1 || r?.is_banned === '1';

export default function Audit() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [auditOpen, setAuditOpen] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [substitutes, setSubstitutes] = useState([]);
  const [form] = Form.useForm();
  const [resubmitForm] = Form.useForm();
  const [auditResult, setAuditResult] = useState('approved');

  const loadData = async (status = filter) => {
    setLoading(true);
    try {
      const res = await getMedications(status === 'all' ? {} : { audit_status: status });
      if (res.success) setList(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const openAudit = async (record, auditResult) => {
    setCurrent(record);
    setAuditResult(auditResult);
    form.setFieldsValue({ audit_result: auditResult, auditor: '', audit_opinion: '' });
    setSubstitutes([]);

    if (auditResult === 'rejected' && isBannedDrug(record)) {
      try {
        const sub = await getDrugSubstitutes(record.drug_id);
        if (sub?.success) setSubstitutes(sub.data || []);
      } catch (_) {}
    }
    setAuditOpen(true);
  };

  const openResubmit = (record) => {
    setCurrent(record);
    const suggested = record.suggested_substitutes
      ? (typeof record.suggested_substitutes === 'string'
          ? JSON.parse(record.suggested_substitutes)
          : record.suggested_substitutes)
      : [];
    resubmitForm.setFieldsValue({
      operator: record.operator,
      drug_id: record.drug_id,
      pond_id: record.pond_id,
      dosage: record.dosage,
      unit: record.unit,
      usage_method: record.usage_method,
      medication_date: record.medication_date,
      expected_harvest_date: record.expected_harvest_date,
      pond_area: record.pond_area,
      alternative_drug_ids: record.alternative_drug_ids || [],
      remark: record.remark
    });
    setCurrent({ ...record, _parsed_suggested: suggested });
    setResubmitOpen(true);
  };

  const onAuditSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.audit_result === 'rejected' && !values.audit_opinion?.trim()) {
        message.warning('驳回必须填写审核意见');
        return;
      }

      const payload = {
        auditor: values.auditor,
        audit_result: values.audit_result,
        audit_opinion: values.audit_opinion
      };

      if (values.audit_result === 'rejected' && isBannedDrug(current) && substitutes.length) {
        payload.suggested_substitutes = substitutes.map((s) => ({
          substitute_drug_id: s.substitute_drug_id,
          substitute_code: s.substitute_code,
          substitute_name: s.substitute_name,
          withdrawal_period: s.withdrawal_period,
          priority: s.priority,
          usage_instructions: s.usage_instructions
        }));
      }

      const res = await auditMedication(current.id, payload);
      if (res.success) {
        message.success(values.audit_result === 'approved' ? '审核通过' : '已驳回');
        setAuditOpen(false);
        form.resetFields();
        setSubstitutes([]);
        loadData();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const onResubmit = async () => {
    try {
      const values = await resubmitForm.validateFields();
      const res = await resubmitMedication(current.id, values);
      if (res.success) {
        message.success('重提已提交，等待审核');
        setResubmitOpen(false);
        resubmitForm.resetFields();
        loadData();
      } else {
        message.error(res.message || '重提失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const columns = [
    { title: '记录编号', dataIndex: 'record_no', width: 200 },
    {
      title: '池塘',
      dataIndex: 'pond_name',
      width: 100,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          {r.pond_area && <span style={{ color: '#888', fontSize: 12 }}>{r.pond_area} 亩</span>}
        </Space>
      )
    },
    {
      title: '药品',
      dataIndex: 'drug_name',
      width: 140,
      render: (v, r) => (
        <Space>
          <span>{v}</span>
          {isBannedDrug(r) && (
            <Tooltip title="违禁药品">
              <Badge color="red" status="error" text={<Tag color="red" style={{ margin: 0 }}>禁药</Tag>} />
            </Tooltip>
          )}
        </Space>
      )
    },
    { title: '用量', dataIndex: 'dosage', render: (v, r) => `${v || ''}${r.unit || ''}`, width: 100 },
    { title: '使用方法', dataIndex: 'usage_method' },
    { title: '用药日期', dataIndex: 'medication_date', width: 120 },
    {
      title: '预计出塘',
      dataIndex: 'expected_harvest_date',
      width: 120,
      render: (v, r) => {
        if (!v) return <span style={{ color: '#bbb' }}>未设置</span>;
        if (r.withdrawal_period && r.medication_date) {
          const endDate = dayjs(r.medication_date).add(r.withdrawal_period, 'day');
          const conflict = dayjs(v).isBefore(endDate);
          return (
            <Tooltip title={conflict ? `停药期至 ${endDate.format('YYYY-MM-DD')}，出塘日期冲突` : `停药期至 ${endDate.format('YYYY-MM-DD')}`}>
              <Space>
                <span>{v}</span>
                {conflict && <WarningOutlined style={{ color: '#faad14' }} />}
              </Space>
            </Tooltip>
          );
        }
        return <span>{v}</span>;
      }
    },
    { title: '停药期(天)', dataIndex: 'withdrawal_period', width: 100 },
    {
      title: '状态',
      dataIndex: 'audit_status',
      width: 110,
      render: (v, r) => {
        const map = {
          pending: <Tag color="orange">待审核</Tag>,
          approved: <Tag color="green">已通过</Tag>,
          rejected: <Tag color="red">已驳回</Tag>
        };
        return (
          <Space direction="vertical" size={2}>
            {map[v] || v}
            {r.resubmit_count > 0 && (
              <Tag color="purple" style={{ margin: 0 }}>第{r.resubmit_count}次重提</Tag>
            )}
          </Space>
        );
      }
    },
    {
      title: '操作',
      width: 220,
      render: (_, r) => {
        if (r.audit_status === 'pending') {
          return (
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => openAudit(r, 'approved')}
              >
                通过
              </Button>
              <Tooltip title={isBannedDrug(r) ? '驳回并推荐替代药品' : '驳回'}>
                <Button
                  danger
                  size="small"
                  icon={isBannedDrug(r) ? <MedicineBoxOutlined /> : <CloseOutlined />}
                  onClick={() => openAudit(r, 'rejected')}
                >
                  {isBannedDrug(r) ? '驳回+建议' : '驳回'}
                </Button>
              </Tooltip>
            </Space>
          );
        }
        if (r.audit_status === 'rejected') {
          return (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openResubmit(r)}
            >
              修改重审
            </Button>
          );
        }
        return <span style={{ color: '#999' }}>已处理</span>;
      }
    }
  ];

  const renderExpanded = (r) => {
    const suggested = r.suggested_substitutes
      ? (typeof r.suggested_substitutes === 'string'
          ? JSON.parse(r.suggested_substitutes)
          : r.suggested_substitutes)
      : [];
    const alternatives = r.alternative_drug_ids
      ? (typeof r.alternative_drug_ids === 'string'
          ? JSON.parse(r.alternative_drug_ids)
          : r.alternative_drug_ids)
      : [];

    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions column={4} size="small" bordered>
          <Descriptions.Item label="登记时间">{r.created_at}</Descriptions.Item>
          <Descriptions.Item label="审核人">{r.audit_auditor || '-'}</Descriptions.Item>
          <Descriptions.Item label="审核时间">{r.audit_date || '-'}</Descriptions.Item>
          <Descriptions.Item label="登记人">{r.operator}</Descriptions.Item>
          <Descriptions.Item label="审核意见" span={4}>
            {r.audit_opinion || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={4}>
            {r.remark || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备选药品数" span={2}>
            {alternatives.length > 0 ? alternatives.length : '无'}
          </Descriptions.Item>
          <Descriptions.Item label="原始记录" span={2}>
            {r.original_medication_id ? `由 ${r.original_medication_id} 重提` : '原始登记'}
          </Descriptions.Item>
        </Descriptions>

        {suggested.length > 0 && (
          <div>
            <Divider orientation="left" style={{ margin: '8px 0' }}>
              <Space>
                <MedicineBoxOutlined style={{ color: '#52c41a' }} />
                <strong>兽医推荐替代方案</strong>
              </Space>
            </Divider>
            <List
              size="small"
              dataSource={suggested}
              bordered
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Tag key="wp" color="blue">
                      停药期 {item.withdrawal_period} 天
                    </Tag>,
                    <Tag key="pri" color={item.priority === 1 ? 'green' : 'orange'}>
                      优先级 {item.priority}
                    </Tag>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <span>{item.substitute_code}</span>
                        <strong>{item.substitute_name}</strong>
                      </Space>
                    }
                    description={item.usage_instructions || '暂无使用说明'}
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </Space>
    );
  };

  const renderBannedCard = () => {
    if (!current || auditResult !== 'rejected' || !isBannedDrug(current)) return null;
    return (
      <Alert
        type="error"
        showIcon
        icon={<ExclamationCircleOutlined />}
        message="检测到违禁药品"
        description={
          <div>
            <p style={{ margin: '4px 0' }}>
              <strong>{current.drug_name}</strong> 属于禁用兽药，系统自动推荐以下替代方案：
            </p>
            {substitutes.length > 0 ? (
              <List
                size="small"
                dataSource={substitutes}
                bordered
                style={{ margin: '8px 0' }}
                renderItem={(item, idx) => (
                  <List.Item
                    actions={[
                      <Tag key="pri" color={item.priority === 1 ? 'green' : 'orange'}>
                        推荐度 {item.priority}
                      </Tag>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color="blue">{`方案${idx + 1}`}</Tag>
                          <strong>{item.substitute_name}</strong>
                          <span style={{ color: '#888' }}>{item.substitute_code}</span>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <span>停药期：{item.withdrawal_period} 天</span>
                          {item.usage_instructions && <span>用法：{item.usage_instructions}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Tag color="default">暂无匹配替代方案，请人工确认</Tag>
            )}
            <p style={{ margin: '4px 0 0 0', color: '#52c41a' }}>
              提交驳回后，替代方案会自动保存，养殖员修改重审时可见。
            </p>
          </div>
        }
        style={{ marginBottom: 16 }}
      />
    );
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">用药审核（兽医）</div>
        <Space>
          <Radio.Group value={filter} onChange={(e) => setFilter(e.target.value)}>
            <Radio.Button value="pending">待审核</Radio.Button>
            <Radio.Button value="approved">已通过</Radio.Button>
            <Radio.Button value="rejected">已驳回</Radio.Button>
            <Radio.Button value="all">全部</Radio.Button>
          </Radio.Group>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          expandedRowRender={renderExpanded}
          expandRowByClick={false}
        />
      </Card>

      <Modal
        title={
          <Space>
            <span>审核用药记录</span>
            {current && isBannedDrug(current) && <Tag color="red">含禁药</Tag>}
          </Space>
        }
        open={auditOpen}
        onCancel={() => {
          setAuditOpen(false);
          setSubstitutes([]);
        }}
        onOk={onAuditSubmit}
        width={720}
        okText={auditResult === 'rejected' && isBannedDrug(current) ? '驳回并保存替代方案' : '确认'}
        cancelText="取消"
      >
        {current && (
          <div style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="记录编号">{current.record_no}</Descriptions.Item>
              <Descriptions.Item label="池塘">{current.pond_name}</Descriptions.Item>
              <Descriptions.Item label="药品">
                <Space>
                  <span>{current.drug_name}</span>
                  {isBannedDrug(current) && <Tag color="red">违禁</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="用量">
                {current.dosage}
                {current.unit}
              </Descriptions.Item>
              <Descriptions.Item label="用药日期">{current.medication_date}</Descriptions.Item>
              <Descriptions.Item label="预计出塘">
                {current.expected_harvest_date || '-'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
        {renderBannedCard()}
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(c) => {
            if (c.audit_result !== undefined) {
              setAuditResult(c.audit_result);
            }
          }}
        >
          <Form.Item label="审核结果" name="audit_result" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="approved">通过</Radio>
              <Radio value="rejected">驳回</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="兽医姓名" name="auditor" rules={[{ required: true }]}>
            <Input placeholder="请输入兽医姓名" />
          </Form.Item>
          <Form.Item
            label={
              <Space>
                <span>审核意见</span>
                {auditResult === 'rejected' && <span style={{ color: '#ff4d4f' }}>（驳回必填）</span>}
              </Space>
            }
            name="audit_opinion"
          >
            <TextArea rows={4} placeholder="请说明通过/驳回的具体原因，含禁药驳回可附加替代方案的人工说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>修改重审 - {current?.record_no}</span>
          </Space>
        }
        open={resubmitOpen}
        onCancel={() => {
          setResubmitOpen(false);
          resubmitForm.resetFields();
        }}
        onOk={onResubmit}
        width={720}
        okText="提交重审"
        cancelText="取消"
      >
        {current && current._parsed_suggested?.length > 0 && (
          <Alert
            type="success"
            showIcon
            icon={<MedicineBoxOutlined />}
            message="兽医替代方案建议"
            description={
              <List
                size="small"
                dataSource={current._parsed_suggested}
                bordered
                style={{ margin: '8px 0 0 0' }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Tag key="wp" color="blue">
                        停药期 {item.withdrawal_period} 天
                      </Tag>
                    ]}
                  >
                    <List.Item.Meta
                      title={<strong>{item.substitute_name}</strong>}
                      description={item.usage_instructions || '暂无用法说明'}
                    />
                  </List.Item>
                )}
              />
            }
            style={{ marginBottom: 16 }}
          />
        )}
        {current && (
          <Alert
            type="warning"
            showIcon
            message="原兽医意见"
            description={current.audit_opinion || '无'}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={resubmitForm} layout="vertical">
          <Form.Item
            label="用药日期"
            name="medication_date"
            rules={[{ required: true, message: '请选择用药日期' }]}
          >
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="用量" name="dosage" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="单位" name="unit" rules={[{ required: true }]}>
            <Input placeholder="如 kg / mL / 包" />
          </Form.Item>
          <Form.Item label="使用方法" name="usage_method">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item label="修改说明" name="remark">
            <TextArea rows={2} placeholder="请说明本次修改的原因（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
