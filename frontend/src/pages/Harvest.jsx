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
  Descriptions,
  Tooltip,
  Progress,
  Badge,
  Steps
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RollbackOutlined,
  WarningOutlined,
  LockOutlined,
  UnlockOutlined,
  CalendarOutlined,
  MedicineBoxOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getHarvests,
  addHarvest,
  updateHarvestStatus,
  getPonds,
  recalculateHarvest,
  getPondUnlockCheck
} from '../services/api';

const { Option } = Select;
const { TextArea } = Input;

export default function Harvest() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedPondId, setSelectedPondId] = useState(null);
  const [pondLatestMed, setPondLatestMed] = useState(null);
  const [conflictInfo, setConflictInfo] = useState(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [harvestRes, pondRes] = await Promise.all([getHarvests(), getPonds()]);
      if (harvestRes.success) setList(harvestRes.data || []);
      if (pondRes.success) setPonds(pondRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onPondChange = (pondId) => {
    setSelectedPondId(pondId);
    const pond = ponds.find((p) => p.id === pondId);
    if (pond?.locked === 1) {
      setConflictInfo({
        type: 'locked',
        title: '池塘已锁定',
        desc: pond.lock_reason || '请先在池塘管理中执行解锁流程'
      });
    } else {
      setConflictInfo(null);
    }
    setPondLatestMed(null);
  };

  const onDateChange = (date) => {
    if (!selectedPondId || !date) {
      setConflictInfo(null);
      return;
    }
    const pond = ponds.find((p) => p.id === selectedPondId);
    if (pond?.locked === 1) return;

    const related = list.find(
      (x) => x.pond_id === selectedPondId && x.withdrawal_end_date
    );
    if (related?.withdrawal_end_date) {
      const end = dayjs(related.withdrawal_end_date);
      const plan = dayjs(date.format('YYYY-MM-DD'));
      if (plan.isBefore(end)) {
        const days = end.diff(plan, 'day') + 1;
        setConflictInfo({
          type: 'withdrawal',
          title: `出塘日期早于停药期${days}天`,
          desc: `停药期至 ${related.withdrawal_end_date}（药品：${related.drug_name || '-'}，${related.withdrawal_period}天），建议调整至 ${end.format(
            'YYYY-MM-DD'
          )} 之后`,
          suggested: end.format('YYYY-MM-DD')
        });
      } else {
        setConflictInfo(null);
      }
    }
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        plan_date: values.plan_date.format('YYYY-MM-DD')
      };
      const res = await addHarvest(payload);
      if (res.success) {
        if (res.data?.suggested_plan_date && res.data?.has_conflict) {
          Modal.info({
            title: '存在停药期冲突',
            icon: <WarningOutlined style={{ color: '#faad14' }} />,
            content: (
              <div>
                <p>计划已创建，但当前出塘日期存在停药期冲突：</p>
                <Alert
                  type="warning"
                  showIcon
                  message={`建议调整至 ${res.data.suggested_plan_date}`}
                  description="可使用下方「按停药期重算」功能一键调整"
                  style={{ margin: '8px 0' }}
                />
              </div>
            ),
            okText: '知道了'
          });
        } else {
          message.success(`出塘计划已创建：${res.data.plan_no}`);
        }
        setOpen(false);
        form.resetFields();
        setConflictInfo(null);
        setSelectedPondId(null);
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

  const doRecalculate = (record) => {
    modal.confirm({
      title: '按停药期重算出塘日期',
      icon: <CalendarOutlined />,
      content: (
        <div>
          <p>系统将根据最近一次已审核用药的停药期自动调整计划出塘日期：</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>原出塘日期：{record.plan_date}</li>
            {record.withdrawal_end_date && (
              <li>停药期截止：{record.withdrawal_end_date}</li>
            )}
          </ul>
          <p style={{ margin: '8px 0 0 0' }}>调整后，原计划将标记为已取消并生成新计划。</p>
        </div>
      ),
      okText: '确认重算',
      onOk: async () => {
        try {
          const res = await recalculateHarvest(record.id, {
            operator: '管理员'
          });
          if (res?.success) {
            Modal.success({
              title: '重算完成',
              content: (
                <div>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="新计划编号">
                      {res.data?.new_plan_no || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="新出塘日期">
                      {res.data?.new_plan_date || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="原计划">
                      已标记为 <Tag color="default">已取消</Tag>
                    </Descriptions.Item>
                  </Descriptions>
                  {res.data?.unlock_ready && (
                    <Alert
                      type="success"
                      showIcon
                      message="解锁条件已满足"
                      description="可前往池塘管理执行解锁操作"
                      style={{ marginTop: 12 }}
                    />
                  )}
                </div>
              )
            });
            loadData();
          } else {
            message.error(res?.message || '重算失败');
          }
        } catch (e) {
          if (e?.message) message.error(e.message);
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
    {
      title: '关联信息',
      width: 120,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.pond_name}</span>
          {r.recalculated_from_id && (
            <Tag color="cyan" style={{ margin: 0 }} icon={<RollbackOutlined />}>
              重算生成
            </Tag>
          )}
        </Space>
      )
    },
    {
      title: '池塘状态',
      dataIndex: 'locked',
      width: 100,
      render: (v) =>
        v === 1 ? (
          <Tag color="red" icon={<LockOutlined />}>
            已锁定
          </Tag>
        ) : (
          <Tag color="green" icon={<UnlockOutlined />}>
            正常
          </Tag>
        )
    },
    {
      title: '计划出塘日期',
      dataIndex: 'plan_date',
      width: 150,
      render: (v, r) => {
        if (!r.withdrawal_end_date) return v;
        const end = dayjs(r.withdrawal_end_date);
        const plan = dayjs(v);
        const conflict = plan.isBefore(end);
        return (
          <Tooltip
            title={
              conflict
                ? `与停药期冲突（停药期至 ${r.withdrawal_end_date}）`
                : `停药期已至 ${r.withdrawal_end_date}`
            }
          >
            <Space>
              <span>{v}</span>
              {conflict && <WarningOutlined style={{ color: '#faad14' }} />}
            </Space>
          </Tooltip>
        );
      }
    },
    {
      title: '停药期信息',
      width: 220,
      render: (_, r) => {
        if (!r.withdrawal_end_date) {
          return <Tag color="default">无关联用药</Tag>;
        }
        const end = dayjs(r.withdrawal_end_date);
        const plan = dayjs(r.plan_date);
        const days = end.diff(dayjs().startOf('day'), 'day');
        const conflict = plan.isBefore(end);
        const total = r.withdrawal_period || 1;
        const passed = Math.min(total, Math.max(0, total - Math.max(0, days)));
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Space size={4}>
              {r.drug_name && (
                <Tag color="blue" icon={<MedicineBoxOutlined />}>
                  {r.drug_name}
                </Tag>
              )}
              <Tag color={conflict ? 'red' : 'green'}>
                至 {r.withdrawal_end_date}
              </Tag>
            </Space>
            {r.status === 'planned' && (
              <Progress
                percent={Math.round((passed / total) * 100)}
                size="small"
                status={conflict ? 'active' : 'success'}
                showInfo={false}
              />
            )}
          </Space>
        );
      }
    },
    { title: '计划数量', dataIndex: 'plan_quantity', width: 100 },
    { title: '操作人', dataIndex: 'operator', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          {statusMap[v]}
          {r.status === 'planned' && r.withdrawal_end_date && (
            <span style={{ fontSize: 11, color: '#888' }}>
              {dayjs(r.plan_date).isBefore(dayjs(r.withdrawal_end_date))
                ? '需重算'
                : '可执行'}
            </span>
          )}
        </Space>
      )
    },
    {
      title: '操作',
      width: 260,
      render: (_, r) =>
        r.status === 'planned' ? (
          <Space>
            {r.withdrawal_end_date &&
              dayjs(r.plan_date).isBefore(dayjs(r.withdrawal_end_date)) && (
                <Tooltip title="按停药期重算并调整日期">
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<CalendarOutlined />}
                    onClick={() => doRecalculate(r)}
                  >
                    重算
                  </Button>
                </Tooltip>
              )}
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              disabled={
                r.locked === 1 ||
                (r.withdrawal_end_date &&
                  dayjs(r.plan_date).isBefore(dayjs(r.withdrawal_end_date)))
              }
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
        ) : r.recalculated_from_id ? (
          <Tag color="cyan">重算生成</Tag>
        ) : null
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">出塘管理</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            新增出塘计划
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<Steps size="small" current={0} />}
        message="完整链路：用药登记 → 审核 → 抽检/复检 → 池塘解锁 → 出塘计划重算 → 执行出塘"
        description="停药期未满或池塘锁定时，完成按钮将被禁用；可使用「重算」自动调整日期。"
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          expandable={{
            expandedRowRender: (r) => (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Descriptions column={3} size="small" bordered>
                  <Descriptions.Item label="创建时间">
                    {r.created_at}
                  </Descriptions.Item>
                  <Descriptions.Item label="重算自">
                    {r.recalculated_from_id || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="锁定原因">
                    {r.lock_reason ? <Tag color="red">{r.lock_reason}</Tag> : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="备注" span={3}>
                    {r.remark || '无'}
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            )
          }}
        />
      </Card>

      <Modal
        title="新增出塘计划"
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
          setConflictInfo(null);
          setSelectedPondId(null);
        }}
        onOk={onSubmit}
        width={620}
        okText="提交"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="池塘"
            name="pond_id"
            rules={[{ required: true, message: '请选择池塘' }]}
          >
            <Select
              placeholder="请选择池塘"
              showSearch
              optionFilterProp="children"
              onChange={onPondChange}
            >
              {ponds.map((p) => (
                <Option key={p.id} value={p.id}>
                  <Space>
                    <span>
                      {p.pond_code} - {p.pond_name}（{p.species || '-'}，{p.area || '-'}亩）
                    </span>
                    {p.locked === 1 && <Tag color="red">已锁定</Tag>}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="计划出塘日期"
            name="plan_date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} onChange={onDateChange} />
          </Form.Item>
          {conflictInfo && (
            <Alert
              type={conflictInfo.type === 'locked' ? 'error' : 'warning'}
              showIcon
              message={conflictInfo.title}
              description={conflictInfo.desc}
              style={{ marginBottom: 12 }}
              action={
                conflictInfo.suggested ? (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    onClick={() => {
                      form.setFieldsValue({
                        plan_date: dayjs(conflictInfo.suggested)
                      });
                      onDateChange(dayjs(conflictInfo.suggested));
                    }}
                  >
                    调整至建议日期
                  </Button>
                ) : null
              }
            />
          )}
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
