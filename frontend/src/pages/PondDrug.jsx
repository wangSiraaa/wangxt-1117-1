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
  Alert,
  Descriptions,
  Timeline,
  Steps,
  List,
  Divider,
  Tooltip,
  Empty,
  Progress,
  Badge
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  LockOutlined,
  UnlockOutlined,
  HistoryOutlined,
  LineChartOutlined,
  MedicineBoxOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  RollbackOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getPonds,
  addPond,
  updatePond,
  lockPond,
  unlockPond,
  getDrugs,
  addDrug,
  getPondUnlockCheck,
  getPondTimeline,
  getPondLockRecords
} from '../services/api';

const { TextArea } = Input;

const typeIconMap = {
  medication: <MedicineBoxOutlined style={{ color: '#1890ff' }} />,
  audit: <FileTextOutlined style={{ color: '#722ed1' }} />,
  inspection: <SafetyCertificateOutlined style={{ color: '#52c41a' }} />,
  reinspection: <SafetyCertificateOutlined style={{ color: '#13c2c2' }} />,
  lock: <LockOutlined style={{ color: '#ff4d4f' }} />,
  unlock: <UnlockOutlined style={{ color: '#52c41a' }} />,
  harvest: <LineChartOutlined style={{ color: '#fa8c16' }} />
};

export default function PondDrug() {
  const { message, modal } = App.useApp();

  const [ponds, setPonds] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pondOpen, setPondOpen] = useState(false);
  const [drugOpen, setDrugOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [unlockCheckOpen, setUnlockCheckOpen] = useState(false);

  const [lockTarget, setLockTarget] = useState(null);
  const [detailPond, setDetailPond] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [lockRecords, setLockRecords] = useState([]);
  const [unlockCheckResult, setUnlockCheckResult] = useState(null);

  const [pondForm] = Form.useForm();
  const [drugForm] = Form.useForm();
  const [lockForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [pondRes, drugRes] = await Promise.all([getPonds(), getDrugs(true)]);
      if (pondRes.success) setPonds(pondRes.data || []);
      if (drugRes.success) setDrugs(drugRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
    if (pond.locked === 1) {
      setUnlockTarget(pond);
      return;
    }
    setLockTarget(pond);
    lockForm.setFieldsValue({ lock_reason: '' });
    setLockOpen(true);
  };

  const setUnlockTarget = async (pond) => {
    setLockTarget(pond);
    try {
      const res = await getPondUnlockCheck(pond.id);
      if (res?.success) {
        setUnlockCheckResult(res.data);
        setUnlockCheckOpen(true);
      }
    } catch (_) {}
  };

  const openTimeline = async (pond) => {
    setDetailPond(pond);
    setTimeline([]);
    setLockRecords([]);
    setTimelineOpen(true);
    try {
      const [tlRes, lrRes] = await Promise.all([
        getPondTimeline(pond.id),
        getPondLockRecords(pond.id)
      ]);
      if (tlRes?.success) setTimeline(tlRes.data || []);
      if (lrRes?.success) setLockRecords(lrRes.data || []);
    } catch (_) {}
  };

  const confirmUnlock = async (force = false) => {
    if (!lockTarget) return;
    try {
      const res = await unlockPond(lockTarget.id, {
        operator: '管理员',
        force_mode: force ? 1 : 0,
        reason: force ? '管理员强制解锁' : '解锁条件已满足'
      });
      if (res?.success) {
        message.success(force ? '池塘已强制解锁' : '池塘已解锁');
        setUnlockCheckOpen(false);
        loadData();
      } else {
        message.error(res?.message || '解锁失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
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
      width: 140,
      render: (v, r) =>
        v === 1 ? (
          <Space direction="vertical" size={0}>
            <Tag color="red" icon={<LockOutlined />}>
              已锁定
            </Tag>
            {r.lock_reason && (
              <span style={{ fontSize: 11, color: '#999' }}>{r.lock_reason}</span>
            )}
            {r.last_unlock_date && (
              <span style={{ fontSize: 11, color: '#52c41a' }}>
                上次解锁：{r.last_unlock_date}
              </span>
            )}
          </Space>
        ) : (
          <Tag color="green">正常</Tag>
        )
    },
    {
      title: '操作',
      width: 240,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openTimeline(r)}>
            链路
          </Button>
          <Button
            type={r.locked === 1 ? 'primary' : 'danger'}
            size="small"
            icon={r.locked === 1 ? <UnlockOutlined /> : <LockOutlined />}
            onClick={() => handleLockClick(r)}
          >
            {r.locked === 1 ? '解锁' : '锁定'}
          </Button>
        </Space>
      )
    }
  ];

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
        v === 1 ? <Tag color="red">禁用</Tag> : <Tag color="green">可用</Tag>
    },
    { title: '使用说明', dataIndex: 'usage_instructions' }
  ];

  const renderUnlockSteps = () => {
    if (!unlockCheckResult) return null;
    const cond = unlockCheckResult.conditions;

    if (unlockCheckResult.can_unlock) {
      return (
        <div>
          <Alert
            type="success"
            showIcon
            icon={<UnlockOutlined />}
            message="三项解锁条件均满足"
            description="停药期满、所有复检通过、出塘计划已按停药期调整，可以执行解锁。"
            style={{ marginBottom: 16 }}
          />
          <Steps
            direction="vertical"
            size="small"
            current={3}
            items={[
              {
                title: '停药期满',
                description: cond?.withdrawal?.drug_name
                  ? `${cond.withdrawal.drug_name}，停药期至 ${cond.withdrawal.withdrawal_end_date}`
                  : '无用药记录'
              },
              { title: '复检通过', description: '所有不合格记录均已复检通过' },
              { title: '出塘计划重算', description: '出塘日期均在停药期之后' }
            ]}
          />
        </div>
      );
    }

    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Steps
          direction="vertical"
          size="small"
          items={[
            {
              title: (
                <Space>
                  <span>① 停药期满</span>
                  {cond?.withdrawal?.passed ? (
                    <Tag color="green">已满足</Tag>
                  ) : (
                    <Tag color="orange">未满足</Tag>
                  )}
                </Space>
              ),
              description: cond?.withdrawal ? (
                <div style={{ color: '#666' }}>
                  <p style={{ margin: 0 }}>
                    <strong>{cond.withdrawal.drug_name}</strong>（停药期 {cond.withdrawal.withdrawal_period} 天）
                  </p>
                  <p style={{ margin: 0 }}>
                    用药：{cond.withdrawal.medication_date} → 停药期满：
                    {cond.withdrawal.withdrawal_end_date}
                  </p>
                  <p style={{ margin: 0 }}>
                    距离解锁还剩 <strong style={{ color: '#faad14' }}>{cond.withdrawal.days_remaining}</strong> 天
                  </p>
                </div>
              ) : (
                '无用药记录'
              ),
              status: cond?.withdrawal?.passed ? 'finish' : 'process'
            },
            {
              title: (
                <Space>
                  <span>② 复检通过</span>
                  {cond?.reinspection?.passed ? (
                    <Tag color="green">已满足</Tag>
                  ) : (
                    <Tag color="red">未满足</Tag>
                  )}
                </Space>
              ),
              description:
                cond?.reinspection?.list?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {cond.reinspection.list.map((x, idx) => (
                      <li key={idx} style={{ color: '#666' }}>
                        {x.inspection_no}（{x.sample_date}）-{' '}
                        {x.unqualified_items || '未填写'}
                        {x.has_reinspection ? (
                          <span style={{ color: '#52c41a' }}>
                            {' '}
                            → 已复检（{x.reinspection_no}）
                          </span>
                        ) : (
                          <span style={{ color: '#ff4d4f' }}> → 未复检</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '无不合格抽检记录'
                ),
              status: cond?.reinspection?.passed ? 'finish' : 'error'
            },
            {
              title: (
                <Space>
                  <span>③ 出塘计划重算</span>
                  {cond?.harvest?.passed ? (
                    <Tag color="green">已满足</Tag>
                  ) : (
                    <Tag color="orange">未满足</Tag>
                  )}
                </Space>
              ),
              description:
                cond?.harvest?.list?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {cond.harvest.list.map((h, idx) => (
                      <li key={idx} style={{ color: '#666' }}>
                        计划出塘 {h.plan_date}，早于停药期 {h.safe_date}（早 {h.days_early} 天）
                        {h.suggested_plan_date && (
                          <span style={{ color: '#1890ff' }}>
                            {' '}
                            → 建议调整至 <strong>{h.suggested_plan_date}</strong>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '无冲突出塘计划'
                ),
              status: cond?.harvest?.passed ? 'finish' : 'process'
            }
          ]}
        />
      </Space>
    );
  };

  const renderTimelineItems = () => {
    if (!timeline || timeline.length === 0) {
      return <Empty description="暂无链路数据" />;
    }
    return (
      <Timeline
        mode="left"
        items={timeline.map((e) => ({
          color:
            e.event_type === 'lock'
              ? 'red'
              : e.event_type === 'unlock'
              ? 'green'
              : e.event_type === 'inspection' && e.inspection_result === 'unqualified'
              ? 'red'
              : 'blue',
          dot: typeIconMap[e.event_type] || <FileTextOutlined />,
          label: (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: '#999' }}>{e.event_time || e.created_at}</div>
              <Tag
                color={
                  e.event_type === 'lock'
                    ? 'red'
                    : e.event_type === 'unlock'
                    ? 'green'
                    : e.event_type === 'medication'
                    ? 'blue'
                    : e.event_type === 'audit'
                    ? 'purple'
                    : e.event_type === 'inspection' || e.event_type === 'reinspection'
                    ? 'cyan'
                    : 'orange'
                }
                style={{ marginTop: 4 }}
              >
                {e.event_type_label || e.event_type}
              </Tag>
            </div>
          ),
          children: (
            <Card size="small" style={{ marginBottom: 8 }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div style={{ fontWeight: 600 }}>{e.title || e.event_type}</div>
                {e.summary && <div style={{ color: '#555' }}>{e.summary}</div>}
                {e.detail && (
                  <div style={{ color: '#888', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {e.detail}
                  </div>
                )}
                {e.unlock_conditions && (
                  <Alert
                    type="warning"
                    showIcon
                    size="small"
                    message="解锁条件快照"
                    description={
                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(e.unlock_conditions, null, 2)}
                      </pre>
                    }
                    style={{ marginTop: 6 }}
                  />
                )}
              </Space>
            </Card>
          )
        }))}
      />
    );
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">池塘与药品管理</div>
        <Button icon={<ReloadOutlined />} onClick={loadData}>
          刷新
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        message="业务链路：用药登记 → 兽医审核（禁药驳回+替代方案） → 抽检 → 不合格锁定 → 复检+停药期满+出塘重算 → 解锁"
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Tabs
          items={[
            {
              key: 'pond',
              label: (
                <Space>
                  <LineChartOutlined />
                  <span>池塘管理</span>
                </Space>
              ),
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
              label: (
                <Space>
                  <MedicineBoxOutlined />
                  <span>药品管理</span>
                </Space>
              ),
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
          <Form.Item label="是否禁用" name="is_banned" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="使用说明" name="usage_instructions">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 手动锁定池塘（非解锁） */}
      <Modal
        title="手动锁定池塘"
        open={lockOpen}
        onCancel={() => setLockOpen(false)}
        onOk={onLockPond}
        width={480}
      >
        {lockTarget && (
          <p style={{ marginBottom: 16 }}>
            当前池塘：<strong>{lockTarget.pond_name}</strong>（{lockTarget.pond_code}）
          </p>
        )}
        <Alert
          type="warning"
          showIcon
          message="手动锁定将阻止出塘操作，建议仅在异常情况下使用"
          style={{ marginBottom: 12 }}
        />
        <Form form={lockForm} layout="vertical">
          <Form.Item
            label="锁定原因"
            name="lock_reason"
            rules={[{ required: true, message: '请输入锁定原因' }]}
          >
            <TextArea rows={2} placeholder="请说明锁定原因，如：养殖密度异常、设备检修等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 解锁三步流程弹窗 */}
      <Modal
        title={
          <Space>
            <UnlockOutlined />
            <span>解锁池塘 - {lockTarget?.pond_name}（{lockTarget?.pond_code}）</span>
          </Space>
        }
        open={unlockCheckOpen}
        onCancel={() => {
          setUnlockCheckOpen(false);
          setUnlockCheckResult(null);
        }}
        width={760}
        footer={
          <Space>
            <Button
              onClick={() => {
                setUnlockCheckOpen(false);
                setUnlockCheckResult(null);
              }}
            >
              关闭
            </Button>
            <Button
              danger
              onClick={() => {
                modal.confirm({
                  title: '确认强制解锁？',
                  icon: <ExclamationCircleOutlined />,
                  content:
                    '当前条件未完全满足，强制解锁将跳过停药期/复检/出塘检查，存在食品安全风险！',
                  okText: '确认强制解锁',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: () => confirmUnlock(true)
                });
              }}
            >
              强制解锁
            </Button>
            <Button
              type="primary"
              disabled={!unlockCheckResult?.can_unlock}
              onClick={() => confirmUnlock(false)}
            >
              执行解锁
            </Button>
          </Space>
        }
      >
        {lockTarget && (
          <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="面积">{lockTarget.area} 亩</Descriptions.Item>
            <Descriptions.Item label="品种">{lockTarget.species}</Descriptions.Item>
            <Descriptions.Item label="放苗数">{lockTarget.stock_quantity}</Descriptions.Item>
          </Descriptions>
        )}
        {renderUnlockSteps()}
      </Modal>

      {/* 时间线链路追踪弹窗 */}
      <Modal
        title={
          <Space>
            <HistoryOutlined />
            <span>全链路追踪 - {detailPond?.pond_name}（{detailPond?.pond_code}）</span>
          </Space>
        }
        open={timelineOpen}
        onCancel={() => {
          setTimelineOpen(false);
          setTimeline([]);
          setLockRecords([]);
          setDetailPond(null);
        }}
        width={960}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setTimelineOpen(false);
              setTimeline([]);
              setLockRecords([]);
              setDetailPond(null);
            }}
          >
            关闭
          </Button>
        ]}
      >
        <Tabs
          size="small"
          items={[
            {
              key: 'timeline',
              label: (
                <Space>
                  <HistoryOutlined />
                  <span>全链路时间线</span>
                </Space>
              ),
              children: renderTimelineItems()
            },
            {
              key: 'locks',
              label: (
                <Space>
                  <LockOutlined />
                  <span>锁定历史</span>
                  <Badge
                    count={lockRecords.length}
                    style={{ backgroundColor: '#ff4d4f' }}
                    offset={[4, -2]}
                  />
                </Space>
              ),
              children:
                lockRecords.length === 0 ? (
                  <Empty description="池塘暂无锁定记录" />
                ) : (
                  <List
                    size="small"
                    bordered
                    dataSource={lockRecords}
                    renderItem={(r) => (
                      <List.Item
                        actions={[
                          <Tag
                            key="type"
                            color={
                              r.lock_type === 'inspection_unqualified'
                                ? 'red'
                                : r.lock_type === 'manual'
                                ? 'orange'
                                : 'default'
                            }
                          >
                            {r.lock_type === 'inspection_unqualified'
                              ? '抽检不合格'
                              : r.lock_type === 'reinspection_unqualified'
                              ? '复检不合格'
                              : r.lock_type === 'manual'
                              ? '人工锁定'
                              : r.lock_type || '系统'}
                          </Tag>,
                          r.unlock_date ? (
                            <Tag key="st" color="green">已解锁</Tag>
                          ) : (
                            <Tag key="st" color="red">锁定中</Tag>
                          )
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <span>锁定时间：{r.lock_date}</span>
                              {r.unlock_date && (
                                <span style={{ color: '#888' }}>→ 解锁：{r.unlock_date}</span>
                              )}
                            </Space>
                          }
                          description={
                            <div style={{ fontSize: 12, color: '#666' }}>
                              <div>原因：{r.lock_reason || '无'}</div>
                              {r.unlock_reason && (
                                <div>解锁原因：{r.unlock_reason}</div>
                              )}
                              {r.unlock_operator && (
                                <div>解锁操作人：{r.unlock_operator}</div>
                              )}
                              {r.unlock_conditions && (
                                <Alert
                                  type="info"
                                  showIcon
                                  size="small"
                                  message="解锁条件"
                                  description={
                                    <pre style={{ margin: 0, fontSize: 11 }}>
                                      {JSON.stringify(
                                        typeof r.unlock_conditions === 'string'
                                          ? JSON.parse(r.unlock_conditions)
                                          : r.unlock_conditions,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  }
                                  style={{ marginTop: 6 }}
                                />
                              )}
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )
            }
          ]}
        />
      </Modal>
    </div>
  );
}
