import React, { useEffect, useState } from 'react';
import {
  Button,
  Table,
  Space,
  Modal,
  Form,
  Select,
  Input,
  DatePicker,
  Tag,
  App,
  Card,
  Radio,
  Alert
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getInspections, addInspection, getPonds } from '../services/api';

const { Option } = Select;
const { TextArea } = Input;

export default function Inspection() {
  const { message } = App.useApp();
  const [list, setList] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [insRes, pondRes] = await Promise.all([getInspections(), getPonds()]);
      if (insRes.success) setList(insRes.data);
      if (pondRes.success) setPonds(pondRes.data);
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
      const res = await addInspection({
        ...values,
        sample_date: values.sample_date.format('YYYY-MM-DD')
      });
      if (res.success) {
        if (res.data?.pond_locked) {
          message.warning(
            '抽检不合格，对应池塘已自动锁定，请在池塘管理中查看'
          );
        } else {
          message.success('抽检记录已保存');
        }
        setOpen(false);
        form.resetFields();
        loadData();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const columns = [
    { title: '抽检编号', dataIndex: 'inspection_no', width: 200 },
    { title: '池塘', dataIndex: 'pond_name', width: 120 },
    { title: '抽样日期', dataIndex: 'sample_date', width: 120 },
    { title: '质检员', dataIndex: 'inspector', width: 100 },
    { title: '检测项目', dataIndex: 'inspection_items' },
    {
      title: '抽检结果',
      dataIndex: 'inspection_result',
      width: 100,
      render: (v) =>
        v === 'qualified' ? (
          <Tag color="green">合格</Tag>
        ) : (
          <Tag color="red">不合格</Tag>
        )
    },
    { title: '不合格项', dataIndex: 'unqualified_items' },
    { title: '备注', dataIndex: 'remark' },
    { title: '登记时间', dataIndex: 'created_at', width: 160 }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">抽检记录（质检员）</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
          >
            新增抽检记录
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="业务规则：抽检不合格将自动锁定对应池塘，需人工解锁后方可安排出塘"
        style={{ marginBottom: 16 }}
      />

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
        title="新增抽检记录"
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
                {p.pond_code} - {p.pond_name}
                {p.locked === 1 ? '（已锁定）' : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="抽样日期" name="sample_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="质检员"
            name="inspector"
            rules={[{ required: true }]}
          >
            <Input placeholder="请输入质检员姓名" />
          </Form.Item>
          <Form.Item label="检测项目" name="inspection_items">
            <Input placeholder="如：药物残留、微生物指标等" />
          </Form.Item>
          <Form.Item
            label="抽检结果"
            name="inspection_result"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="qualified">合格</Radio>
              <Radio value="unqualified">不合格</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            label="不合格项目"
            name="unqualified_items"
          >
            <Input placeholder="不合格时填写具体不合格项" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
