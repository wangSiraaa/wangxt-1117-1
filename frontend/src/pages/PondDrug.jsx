import React, { useEffect, useState } from 'react';
import {
  Button,
  Table,
  Tabs,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Tag,
  App,
  Card,
  Switch,
  Popconfirm
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  LockOutlined,
  UnlockOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getPonds,
  addPond,
  updatePond,
  lockPond,
  getDrugs,
  addDrug
} from '../services/api';

const { TextArea } = Input;

export default function PondDrug() {
  const { message, modal } = App.useApp();

  const [ponds, setPonds] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pondOpen, setPondOpen] = useState(false);
  const [drugOpen, setDrugOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [lockTarget, setLockTarget] = useState(null);

  const [pondForm] = Form.useForm();
  const [drugForm] = Form.useForm();
  const [lockForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [pondRes, drugRes] = await Promise.all([
        getPonds(),
        getDrugs(true)
      ]);
      if (pondRes.success) setPonds(pondRes.data);
      if (drugRes.success) setDrugs(drugRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ---------- Pond ----------
  const onAddPond = async () => {
    try {
      const values = await pondForm.validateFields();
      const res = await addPond({
        ...values,
        stock_date: values.stock_date?.format('YYYY-MM-DD')
      });
      if (res.success) {
        message.success('池塘已添加');
        setPondOpen(false);
        pondForm.resetFields();
        loadData();
      } else {
        message.error(res.message);
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const onLockPond = async () => {
    try {
      const values = await lockForm.validateFields();
      const res = await lockPond(lockTarget.id, {
        locked: lockTarget.locked === 1 ? 0 : 1,
        lock_reason: values.lock_reason
      });
      if (res.success) {
        message.success(lockTarget.locked === 1 ? '已解锁' : '已锁定');
        setLockOpen(false);
        lockForm.resetFields();
        loadData();
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const handleLockClick = (pond) => {
    setLockTarget(pond);
    lockForm.setFieldsValue({ lock_reason: '' });
    setLockOpen(true);
  };

  const pondColumns = [
    { title: '编号', dataIndex: 'pond_code', width: 100 },
    { title: '名称', dataIndex: 'pond_name', width: 120 },
    { title: '品种', dataIndex: 'species' },
    { title: '面积(亩)', dataIndex: 'area', width: 100 },
    { title: '放苗日期', dataIndex: 'stock_date', width: 120 },
    { title: '放养数量', dataIndex: 'stock_quantity', width: 120 },
    { title: '用药次数', dataIndex: 'medication_count', width: 100 },
    { title: '抽检次数', dataIndex: 'inspection_count', width: 100 },
    {
      title: '状态',
      dataIndex: 'locked',
      width: 120,
      render: (v, r) =>
        v === 1 ? (
          <Space direction="vertical" size={0}>
            <Tag color="red">已锁定</Tag>
            <span style={{ fontSize: 11, color: '#999' }}>{r.lock_reason}</span>
          </Space>
        ) : (
          <Tag color="green">正常</Tag>
        )
    },
    {
      title: '操作',
      width: 160,
      render: (_, r) => (
        <Button
          type={r.locked === 1 ? 'default' : 'danger'}
          size="small"
          icon={r.locked === 1 ? <UnlockOutlined /> : <LockOutlined />}
          onClick={() => handleLockClick(r)}
        >
          {r.locked === 1 ? '解锁' : '锁定'}
        </Button>
      )
    }
  ];

  // ---------- Drug ----------
  const onAddDrug = async () => {
    try {
      const values = await drugForm.validateFields();
      const res = await addDrug(values);
      if (res.success) {
        message.success('药品已添加');
        setDrugOpen(false);
        drugForm.resetFields();
        loadData();
      } else {
        message.error(res.message);
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const drugColumns = [
    { title: '编号', dataIndex: 'drug_code', width: 100 },
    { title: '名称', dataIndex: 'drug_name', width: 140 },
    { title: '生产厂家', dataIndex: 'manufacturer' },
    { title: '规格', dataIndex: 'specification' },
    { title: '停药期(天)', dataIndex: 'withdrawal_period', width: 100 },
    {
      title: '状态',
      dataIndex: 'is_banned',
      width: 100,
      render: (v) =>
        v === 1 ? (
          <Tag color="red">禁用</Tag>
        ) : (
          <Tag color="green">可用</Tag>
        )
    },
    { title: '使用说明', dataIndex: 'usage_instructions' }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">池塘与药品管理</div>
        <Button icon={<ReloadOutlined />} onClick={loadData}>
          刷新
        </Button>
      </div>

      <Card>
        <Tabs
          items={[
            {
              key: 'pond',
              label: '池塘管理',
              children: (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setPondOpen(true)}
                    >
                      新增池塘
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    loading={loading}
                    columns={pondColumns}
                    dataSource={ponds}
                    pagination={{ pageSize: 10 }}
                  />
                </>
              )
            },
            {
              key: 'drug',
              label: '药品管理',
              children: (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setDrugOpen(true)}
                    >
                      新增药品
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    loading={loading}
                    columns={drugColumns}
                    dataSource={drugs}
                    pagination={{ pageSize: 10 }}
                  />
                </>
              )
            }
          ]}
        />
      </Card>

      {/* 新增池塘 */}
      <Modal
        title="新增池塘"
        open={pondOpen}
        onCancel={() => setPondOpen(false)}
        onOk={onAddPond}
        width={560}
      >
        <Form form={pondForm} layout="vertical">
          <Form.Item label="池塘编号" name="pond_code" rules={[{ required: true }]}>
            <Input placeholder="如：P005" />
          </Form.Item>
          <Form.Item label="池塘名称" name="pond_name" rules={[{ required: true }]}>
            <Input placeholder="如：5号塘" />
          </Form.Item>
          <Form.Item label="养殖品种" name="species">
            <Input placeholder="如：南美白对虾" />
          </Form.Item>
          <Form.Item label="面积(亩)" name="area">
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
          </Form.Item>
          <Form.Item label="放苗日期" name="stock_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="放养数量" name="stock_quantity">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增药品 */}
      <Modal
        title="新增药品"
        open={drugOpen}
        onCancel={() => setDrugOpen(false)}
        onOk={onAddDrug}
        width={560}
      >
        <Form form={drugForm} layout="vertical">
          <Form.Item label="药品编号" name="drug_code" rules={[{ required: true }]}>
            <Input placeholder="如：D008" />
          </Form.Item>
          <Form.Item label="药品名称" name="drug_name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="生产厂家" name="manufacturer">
            <Input />
          </Form.Item>
          <Form.Item label="规格" name="specification">
            <Input />
          </Form.Item>
          <Form.Item label="停药期(天)" name="withdrawal_period" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item
            label="是否禁用"
            name="is_banned"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item label="使用说明" name="usage_instructions">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 锁定/解锁池塘 */}
      <Modal
        title={lockTarget?.locked === 1 ? '解锁池塘' : '锁定池塘'}
        open={lockOpen}
        onCancel={() => setLockOpen(false)}
        onOk={onLockPond}
        width={480}
      >
        {lockTarget && (
          <p style={{ marginBottom: 16 }}>
          当前池塘：{lockTarget.pond_name}（{lockTarget.pond_code}）
          </p>
        )}
        <Form form={lockForm} layout="vertical">
          <Form.Item
            label={lockTarget?.locked === 1 ? '解锁原因' : '锁定原因'}
            name="lock_reason"
            rules={
              lockTarget?.locked !== 1
                ? [{ required: true, message: '请输入锁定原因' }]
            : []
            }
          >
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
