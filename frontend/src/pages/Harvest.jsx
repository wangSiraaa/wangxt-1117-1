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
  Alert,
  Descriptions
} from 'antd';
import { PlusOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getHarvests, addHarvest, updateHarvestStatus, getPonds } from '../services/api';

const { Option } = Select;
const { TextArea } = Input;

export default function Harvest() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [harvestRes, pondRes] = await Promise.all([getHarvests(), getPonds()]);
      if (harvestRes.success) setList(harvestRes.data);
      if (pondRes.success) {
        const available = pondRes.data.filter((p) => p.locked !== 1);
        setPonds(available);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        plan_date: values.plan_date.format('YYYY-MM-DD')
      };
      const res = await addHarvest(payload);
      if (res.success) {
        message.success(`出塘计划已创建：${res.data.plan_no}`);
        setOpen(false);
        form.resetFields();
        loadData();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const updateStatus = (id, status) => {
    modal.confirm({
      title: status === 'completed' ? '确认完成出塘？' : '确认取消计划？',
      onOk: async () => {
        const res = await updateHarvestStatus(id, status);
        if (res.success) {
          message.success('状态已更新');
          loadData();
        } else {
          message.error(res.message || '操作失败');
        }
      }
    });
  };

  const statusMap = {
    planned: <Tag color="blue">计划中</Tag>,
    completed: <Tag color="green">已完成</Tag>,
    cancelled: <Tag color="default">已取消</Tag>
  };

  const columns = [
    { title: '计划编号', dataIndex: 'plan_no', width: 200 },
    { title: '池塘', dataIndex: 'pond_name', width: 120 },
    {
      title: '池塘状态',
      dataIndex: 'locked',
      width: 100,
      render: (v, r) =>
        v === 1 ? (
          <Tag color="red">已锁定</Tag>
        ) : (
          <Tag color="green">正常</Tag>
        )
    },
    { title: '计划出塘日期', dataIndex: 'plan_date', width: 140 },
    {
      title: '停药期状态',
      width: 160,
      render: (_, r) => {
        if (!r.withdrawal_end_date) return <Tag color="green">无停药期</Tag>;
        const end = dayjs(r.withdrawal_end_date);
        const plan = dayjs(r.plan_date);
        if (plan.isBefore(end)) {
          return (
            <Tag color="red">
              停药期至{r.withdrawal_end_date}
            </Tag>
          );
        }
        return <Tag color="green">已过停药期</Tag>;
      }
    },
    { title: '计划数量', dataIndex: 'plan_quantity', width: 100 },
    { title: '操作人', dataIndex: 'operator', width: 100 },
    { title: '状态', dataIndex: 'status', width: 100, render: (v) => statusMap[v]
  },
    {
      title: '操作',
      width: 180,
      render: (_, r) =>
        r.status === 'planned' ? (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => updateStatus(r.id, 'completed')}
            >
              完成
            </Button>
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={() => updateStatus(r.id, 'cancelled')}
            >
              取消
            </Button>
          </Space>
        ) : null
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">出塘管理</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
          >
            新增出塘计划
          </Button>
        </Space>
      </div>

      <Alert
        type="warning"
        showIcon
        message="业务规则：停药期未满或池塘锁定状态下无法安排出塘"
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          expandedRowRender={(r) => (
            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="备注" span={3}>
                {r.remark || '无'}
              </Descriptions.Item>
              {r.lock_reason && (
                <Descriptions.Item label="锁定原因" span={3}>
                  <Tag color="red">{r.lock_reason}</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          )}
        />
      </Card>

      <Modal
        title="新增出塘计划"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        width={560}
        okText="提交"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Alert
            type="info"
            showIcon
            message="系统将自动校验停药期和锁定状态"
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            label="池塘"
            name="pond_id"
            rules={[{ required: true, message: '请选择池塘' }]}
          >
            <Select placeholder="请选择池塘" showSearch optionFilterProp="children">
              {ponds.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.pond_code} - {p.pond_name}（{p.species || '-'}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="计划出塘日期" name="plan_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="计划数量(尾/斤)" name="plan_quantity">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="操作人" name="operator">
            <Input placeholder="请输入操作人姓名" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
