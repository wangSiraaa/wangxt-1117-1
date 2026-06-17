import React, { useEffect, useState } from 'react';
import {
  Button,
  Table,
  Space,
  Modal,
  Form,
  Select,
  Input,
  InputNumber,
  DatePicker,
  Tag,
  App,
  Card,
  Descriptions
} from 'antd';
import { PlusOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getMedications,
  addMedication,
  getPonds,
  getDrugs,
  getPondDetail
} from '../services/api';

const { Option } = Select;
const { TextArea } = Input;

export default function Medication() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [medRes, pondRes, drugRes] = await Promise.all([
        getMedications(),
        getPonds(),
        getDrugs(true)
      ]);
      if (medRes.success) setList(medRes.data);
      if (pondRes.success) setPonds(pondRes.data.filter((p) => p.locked !== 1));
      if (drugRes.success) setDrugs(drugRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const viewDetail = async (record) => {
    try {
      const res = await getPondDetail(record.pond_id);
      if (res.success) setDetail(res.data);
      setDetailOpen(true);
    } catch (e) {
      message.error('获取详情失败');
    }
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        medication_date: values.medication_date.format('YYYY-MM-DD')
      };
      const res = await addMedication(payload);
      if (res.success) {
        message.success(`登记成功，编号：${res.data.record_no}`);
        setOpen(false);
        form.resetFields();
        loadData();
      } else {
        message.error(res.message || '登记失败');
      }
    } catch (e) {
      if (e?.message) {
        message.error(e.message);
      }
    }
  };

  const columns = [
    { title: '记录编号', dataIndex: 'record_no', width: 200 },
    { title: '池塘', dataIndex: 'pond_name', width: 100 },
    {
      title: '药品',
      dataIndex: 'drug_name',
      width: 140,
      render: (v, r) =>
        r.is_banned === 1 ? <Tag color="red">{v}（禁用）</Tag> : v
    },
    { title: '用量', dataIndex: 'dosage', width: 80, render: (v, r) => `${v}${r.unit || ''}` },
    { title: '用药日期', dataIndex: 'medication_date', width: 120 },
    {
      title: '停药期结束',
      dataIndex: 'withdrawal_end_date',
      width: 120,
      render: (v, r) =>
        r.audit_status === 'approved' ? (
          dayjs(v).isBefore(dayjs(), 'day') ? (
            <Tag color="green">{v}（已过）</Tag>
          ) : (
            <Tag color="orange">{v}</Tag>
          )
        ) : (
          '-'
        )
    },
    { title: '登记人', dataIndex: 'operator', width: 100 },
    {
      title: '审核状态',
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
      title: '兽医审核',
      width: 200,
      render: (v, r) =>
        r.audit_auditor ? (
          <Space direction="vertical" size={0}>
            <span>{r.audit_auditor} · {r.audit_date}</span>
            <span style={{ fontSize: 12, color: '#666' }}>{r.audit_opinion}</span>
          </Space>
        ) : (
          <span style={{ color: '#999' }}>未审核</span>
        )
    },
    {
      title: '操作',
      width: 100,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r)}>
          池塘详情
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">用药登记（养殖员）</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            新增用药记录
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
        />
      </Card>

      <Modal
        title="登记用药记录"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        width={600}
        okText="提交"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="池塘"
            name="pond_id"
            rules={[{ required: true, message: '请选择池塘' }]}
          >
            <Select placeholder="请选择池塘" showSearch optionFilterProp="children">
              {ponds.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.pond_code} - {p.pond_name}（{p.species || '-'}）
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="药品"
            name="drug_id"
            rules={[{ required: true, message: '请选择药品' }]}
          >
            <Select placeholder="请选择药品" showSearch optionFilterProp="children">
              {drugs.map((d) => (
                <Option key={d.id} value={d.id} disabled={d.is_banned === 1}>
                  {d.drug_code} - {d.drug_name}
                  {d.is_banned === 1 ? '（禁用）' : ` · 停药期${d.withdrawal_period}天`}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="用药日期" name="medication_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item
              label="用量"
              name="dosage"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
            </Form.Item>
            <Form.Item label="单位" name="unit" style={{ width: 160 }}>
              <Select allowClear>
                <Option value="kg">kg</Option>
                <Option value="g">g</Option>
                <Option value="L">L</Option>
                <Option value="mL">mL</Option>
                <Option value="瓶">瓶</Option>
                <Option value="袋">袋</Option>
              </Select>
            </Form.Item>
          </Space>
          <Form.Item label="使用方法" name="usage_method">
            <Input placeholder="如：全池泼洒 / 拌饵投喂" />
          </Form.Item>
          <Form.Item label="操作人（养殖员）" name="operator" rules={[{ required: true }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="池塘详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[<Button key="close" onClick={() => setDetailOpen(false)}>关闭</Button>]}
        width={600}
      >
        {detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="池塘编号">{detail.pond_code}</Descriptions.Item>
            <Descriptions.Item label="池塘名称">{detail.pond_name}</Descriptions.Item>
            <Descriptions.Item label="养殖品种">{detail.species}</Descriptions.Item>
            <Descriptions.Item label="面积">{detail.area} 亩</Descriptions.Item>
            <Descriptions.Item label="状态">
              {detail.locked === 1 ? (
                <Tag color="red">已锁定：{detail.lock_reason}</Tag>
              ) : (
                <Tag color="green">正常</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="放苗日期">{detail.stock_date}</Descriptions.Item>
            {detail.withdrawal_info ? (
              <>
                <Descriptions.Item label="最近用药" span={2}>
                  {detail.withdrawal_info.drug_name} · {detail.withdrawal_info.medication_date}
                </Descriptions.Item>
                <Descriptions.Item label="停药期结束">
                  {detail.withdrawal_info.withdrawal_end_date}
                </Descriptions.Item>
                <Descriptions.Item label="剩余天数">
                  {detail.withdrawal_info.is_withdrawal_active ? (
                    <Tag color="orange">{detail.withdrawal_info.days_remaining} 天</Tag>
                  ) : (
                    <Tag color="green">停药期已过</Tag>
                  )}
                </Descriptions.Item>
              </>
            ) : (
              <Descriptions.Item label="停药期" span={2}>
                暂无有效用药记录
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
