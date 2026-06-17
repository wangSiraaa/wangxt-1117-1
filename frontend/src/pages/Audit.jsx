import React, { useEffect, useState } from 'react';
import {
  Button,
  Table,
  Space,
  Modal,
  Form,
  Select,
  Input,
  Tag,
  App,
  Card,
  Radio,
  Descriptions
} from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { getMedications, auditMedication } from '../services/api';

const { TextArea } = Input;

export default function Audit() {
  const { message } = App.useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [auditOpen, setAuditOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [form] = Form.useForm();

  const loadData = async (status = filter) => {
    setLoading(true);
    try {
      const res = await getMedications(status === 'all' ? {} : { audit_status: status });
      if (res.success) setList(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const openAudit = (record, auditResult) => {
  setCurrent(record);
  form.setFieldsValue({ audit_result: auditResult });
  setAuditOpen(true);
};

  const onAuditSubmit = async () => {
    try {
      const values = await form.validateFields();
      const res = await auditMedication(current.id, {
        auditor: values.auditor,
        audit_result: values.audit_result,
        audit_opinion: values.audit_opinion
      });
      if (res.success) {
        message.success(values.audit_result === 'approved' ? '审核通过' : '已驳回');
        setAuditOpen(false);
        form.resetFields();
        loadData();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const columns = [
    { title: '记录编号', dataIndex: 'record_no', width: 200 },
    { title: '池塘', dataIndex: 'pond_name', width: 100 },
    { title: '药品', dataIndex: 'drug_name', width: 120 },
    { title: '用量', dataIndex: 'dosage', render: (v, r) => `${v}${r.unit || ''}`, width: 100 },
    { title: '使用方法', dataIndex: 'usage_method' },
    { title: '用药日期', dataIndex: 'medication_date', width: 120 },
    { title: '停药期(天)', dataIndex: 'withdrawal_period', width: 100 },
    { title: '登记人', dataIndex: 'operator', width: 100 },
    {
      title: '状态',
      dataIndex: 'audit_status',
      width: 100,
      render: (v) => {
        const map = {
          pending: <Tag color="orange">待审核</Tag>,
          approved: <Tag color="green">已通过</Tag>,
          rejected: <Tag color="red">已驳回</Tag>
        };
        return map[v] || v;
      }
    },
    {
      title: '操作',
      width: 200,
      render: (_, r) =>
        r.audit_status === 'pending' ? (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => openAudit(r, 'approved')}
            >
              通过
            </Button>
            <Button
              danger
              size="small"
              icon={<CloseOutlined />}
              onClick={() => openAudit(r, 'rejected')}
            >
              驳回
            </Button>
          </Space>
        ) : (
          <span style={{ color: '#999' }}>已处理</span>
        )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">用药审核（兽医）</div>
        <Space>
          <Radio.Group
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <Radio.Button value="pending">待审核</Radio.Button>
            <Radio.Button value="approved">已通过</Radio.Button>
            <Radio.Button value="rejected">已驳回</Radio.Button>
            <Radio.Button value="all">全部</Radio.Button>
          </Radio.Group>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
        </Space>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          expandedRowRender={(r) => (
            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="登记时间">{r.created_at}</Descriptions.Item>
              <Descriptions.Item label="审核人">{r.audit_auditor || '-'}</Descriptions.Item>
              <Descriptions.Item label="审核时间">{r.audit_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="审核意见" span={3}>
                {r.audit_opinion || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={3}>
                {r.remark || '-'}
              </Descriptions.Item>
            </Descriptions>
          )}
        />
      </Card>

      <Modal
        title="审核用药记录"
        open={auditOpen}
        onCancel={() => setAuditOpen(false)}
        onOk={onAuditSubmit}
        width={520}
        okText="确认"
        cancelText="取消"
      >
        {current && (
          <div style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="记录编号">{current.record_no}</Descriptions.Item>
              <Descriptions.Item label="池塘">{current.pond_name}</Descriptions.Item>
              <Descriptions.Item label="药品">{current.drug_name}</Descriptions.Item>
              <Descriptions.Item label="用量">
                {current.dosage}
                {current.unit}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
        <Form form={form} layout="vertical">
          <Form.Item
            label="审核结果"
            name="audit_result"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="approved">通过</Radio>
              <Radio value="rejected">驳回</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="兽医姓名" name="auditor" rules={[{ required: true }]}>
            <Input placeholder="请输入兽医姓名" />
          </Form.Item>
          <Form.Item label="审核意见" name="audit_opinion">
            <TextArea rows={3} placeholder="请输入审核意见（驳回必填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
