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
  Alert,
  Descriptions,
  Tooltip,
  Divider,
  Badge,
  Steps,
  Progress
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  UnlockOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  MedicineBoxOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getInspections,
  addInspection,
  getPonds,
  getPondUnlockCheck,
  unlockPond
} from '../services/api';

const { Option } = Select;
const { TextArea } = Input;

export default function Inspection() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [reinspectOpen, setReinspectOpen] = useState(false);
  const [unlockCheckOpen, setUnlockCheckOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [unlockCheckResult, setUnlockCheckResult] = useState(null);
  const [form] = Form.useForm();
  const [reinspectForm] = Form.useForm();
  const [resultType, setResultType] = useState('qualified');

  const loadData = async () => {
    setLoading(true);
    try {
      const [insRes, pondRes] = await Promise.all([getInspections(), getPonds()]);
      if (insRes.success) setList(insRes.data || []);
      if (pondRes.success) setPonds(pondRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNew = () => {
    form.resetFields();
    setCurrent(null);
    setResultType('qualified');
    setOpen(true);
  };

  const openReinspect = (record) => {
    const pond = ponds.find((p) => p.id === record.pond_id);
    setCurrent({ ...record, pond_locked: pond?.locked });
    reinspectForm.resetFields();
    reinspectForm.setFieldsValue({
      pond_id: record.pond_id,
      parent_inspection_id: record.id,
      is_reinspection: 1,
      sample_date: dayjs(),
      inspection_items: record.inspection_items
    });
    setReinspectOpen(true);
  };

  const checkAndTryUnlock = async (pondId) => {
    try {
      const res = await getPondUnlockCheck(pondId);
      if (res?.success) {
        setUnlockCheckResult(res.data);
        setUnlockCheckOpen(true);
      }
    } catch (_) {}
  };

  const confirmUnlock = async (force = false) => {
    if (!current && !unlockCheckResult) return;
    const pondId = current?.pond_id || unlockCheckResult?.pond_id;
    try {
      const res = await unlockPond(pondId, {
        operator: '质检员',
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

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.inspection_result === 'unqualified' && !values.unqualified_items?.trim()) {
        message.warning('不合格请填写具体不合格项');
        return;
      }
      const res = await addInspection({
        ...values,
        sample_date: values.sample_date.format('YYYY-MM-DD')
      });
      if (res.success) {
        if (res.data?.pond_locked) {
          Modal.warning({
            title: '池塘已自动锁定',
            icon: <LockOutlined style={{ color: '#ff4d4f' }} />,
            content: (
              <div>
                <p>
                  抽检编号 <strong>{res.data.inspection_no}</strong> 判定不合格，对应池塘已进入锁定状态。
                </p>
                <Divider style={{ margin: '8px 0' }} />
                <Alert
                  type="warning"
                  showIcon
                  message="解锁三步流程"
                  description={
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>停药期满（根据最近用药计算）</li>
                      <li>抽检复检并通过</li>
                      <li>出塘计划按停药期重算调整</li>
                    </ul>
                  }
                />
              </div>
            ),
            okText: '了解'
          });
        } else if (
          values.inspection_result === 'qualified' &&
          values.is_reinspection !== 1 &&
          res.data?.unlock_ready
        ) {
          message.success('抽检合格，已自动检查解锁条件');
          if (res.data?.pond_id) checkAndTryUnlock(res.data.pond_id);
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

  const onReinspectSubmit = async () => {
    try {
      const values = await reinspectForm.validateFields();
      if (values.inspection_result === 'unqualified' && !values.unqualified_items?.trim()) {
        message.warning('不合格请填写具体不合格项');
        return;
      }
      const res = await addInspection({
        ...values,
        sample_date: values.sample_date.format('YYYY-MM-DD'),
        is_reinspection: 1,
        parent_inspection_id: current.id
      });
      if (res.success) {
        if (values.inspection_result === 'qualified') {
          Modal.success({
            title: '复检通过',
            icon: <SafetyCertificateOutlined />,
            content: (
              <div>
                <p>复检已通过，原始不合格记录已标记为 resolved。</p>
                {res.data?.unlock_check && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <Alert
                      type={res.data.unlock_check.can_unlock ? 'success' : 'info'}
                      showIcon
                      message="解锁条件检查"
                      description={
                        res.data.unlock_check.can_unlock
                          ? '三项条件均已满足，可立即执行解锁操作。'
                          : '尚有未满足项，请继续处理后再解锁。'
                      }
                    />
                  </>
                )}
              </div>
            ),
            okText: res.data?.unlock_check?.can_unlock ? '去解锁' : '知道了',
            onOk: () => {
              if (res.data?.unlock_check?.can_unlock) {
                setUnlockCheckResult({
                  ...res.data.unlock_check,
                  pond_id: current.pond_id
                });
                setUnlockCheckOpen(true);
              }
            }
          });
        } else {
          message.warning('复检仍不合格，池塘将继续锁定');
        }
        setReinspectOpen(false);
        reinspectForm.resetFields();
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
    {
      title: '类型',
      dataIndex: 'is_reinspection',
      width: 90,
      render: (v, r) => (
        <Space>
          {v === 1 || v === '1' ? (
            <Tag color="cyan" icon={<SyncOutlined />}>
              复检
            </Tag>
          ) : (
            <Tag color="blue">初检</Tag>
          )}
          {r.reinspection_status === 'resolved' && (
            <Tooltip title="复检已通过">
              <Badge color="green" status="success" />
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: '池塘',
      dataIndex: 'pond_name',
      width: 140,
      render: (v, r) => {
        const pond = ponds.find((p) => p.id === r.pond_id);
        return (
          <Space direction="vertical" size={0}>
            <span>{v}</span>
            {pond?.locked === 1 && (
              <Tooltip title="池塘当前已锁定">
                <Tag color="red" icon={<LockOutlined />} style={{ margin: 0 }}>
                  已锁定
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    { title: '抽样日期', dataIndex: 'sample_date', width: 120 },
    { title: '质检员', dataIndex: 'inspector', width: 100 },
    { title: '检测项目', dataIndex: 'inspection_items' },
    {
      title: '抽检结果',
      dataIndex: 'inspection_result',
      width: 100,
      render: (v) =>
        v === 'qualified' ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            合格
          </Tag>
        ) : (
          <Tag color="red" icon={<ExclamationCircleOutlined />}>
            不合格
          </Tag>
        )
    },
    { title: '不合格项', dataIndex: 'unqualified_items', width: 160 },
    {
      title: '复检状态',
      dataIndex: 'reinspection_status',
      width: 110,
      render: (v, r) => {
        if (r.is_reinspection === 1 || r.is_reinspection === '1')
          return <span style={{ color: '#bbb' }}>（复检记录）</span>;
        if (v === 'resolved') return <Tag color="green">已复检通过</Tag>;
        if (r.inspection_result === 'unqualified')
          return <Tag color="orange">待复检</Tag>;
        return <span style={{ color: '#bbb' }}>-</span>;
      }
    },
    {
      title: '操作',
      width: 240,
      render: (_, r) => {
        const pond = ponds.find((p) => p.id === r.pond_id);
        return (
          <Space>
            {r.inspection_result === 'unqualified' &&
              r.reinspection_status !== 'resolved' &&
              (r.is_reinspection !== 1 && r.is_reinspection !== '1') && (
                <Button
                  size="small"
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={() => openReinspect(r)}
                >
                  发起复检
                </Button>
              )}
            {pond?.locked === 1 && (
              <Tooltip title="检查解锁条件">
                <Button
                  size="small"
                  icon={<UnlockOutlined />}
                  onClick={() => checkAndTryUnlock(r.pond_id)}
                >
                  解锁检查
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      }
    }
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
            message="三项条件均满足，池塘可解锁"
            style={{ marginBottom: 16 }}
          />
          <Steps
            direction="vertical"
            size="small"
            current={3}
            items={[
              { title: '停药期满', description: cond?.withdrawal?.drug_name || '-' },
              { title: '复检通过', description: '所有不合格记录均已复检通过' },
              { title: '出塘计划已重算', description: '出塘日期均在停药期之后' }
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
                  <span>停药期满</span>
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
                    药品：{cond.withdrawal.drug_name}（停药期 {cond.withdrawal.withdrawal_period} 天）
                  </p>
                  <p style={{ margin: 0 }}>
                    用药日期：{cond.withdrawal.medication_date} → 停药期至：
                    {cond.withdrawal.withdrawal_end_date}
                  </p>
                  <p style={{ margin: 0 }}>
                    距离解锁还剩 <strong>{cond.withdrawal.days_remaining}</strong> 天
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
                  <span>复检通过</span>
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
                        {x.unqualified_items || '未填写'} -{' '}
                        {x.has_reinspection ? (
                          <span style={{ color: '#52c41a' }}>
                            已复检（{x.reinspection_no}，{x.reinspection_date}）
                          </span>
                        ) : (
                          <span style={{ color: '#ff4d4f' }}>未复检</span>
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
                  <span>出塘计划重算</span>
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
                          <span>，建议调整至 <strong>{h.suggested_plan_date}</strong></span>
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

  return (
    <div>
      <div className="page-header">
        <div className="page-title">抽检记录（质检员）</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            新增抽检记录
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<MedicineBoxOutlined />}
        message="停药期-抽检-解锁三联动"
        description="抽检不合格 → 池塘自动锁定 → 发起复检 → 复检通过+停药期满+出塘重算 → 解锁出塘"
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
            expandedRowRender: (r) => {
              const hasReinspections = list.some(
                (x) => x.parent_inspection_id === r.id
              );
              return (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Descriptions column={3} size="small" bordered>
                    <Descriptions.Item label="登记时间">
                      {r.created_at}
                    </Descriptions.Item>
                    <Descriptions.Item label="关联复检编号">
                      {r.parent_inspection_id || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="备注">{r.remark || '-'}</Descriptions.Item>
                  </Descriptions>
                  {hasReinspections && (
                    <div>
                      <Divider orientation="left" style={{ margin: '8px 0' }}>
                        复检记录
                      </Divider>
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={list.filter(
                          (x) => x.parent_inspection_id === r.id
                        )}
                        columns={[
                          { title: '复检编号', dataIndex: 'inspection_no' },
                          { title: '抽样日期', dataIndex: 'sample_date', width: 120 },
                          { title: '质检员', dataIndex: 'inspector', width: 100 },
                          {
                            title: '结果',
                            dataIndex: 'inspection_result',
                            render: (v) =>
                              v === 'qualified' ? (
                                <Tag color="green">合格</Tag>
                              ) : (
                                <Tag color="red">不合格</Tag>
                              ),
                            width: 100
                          },
                          { title: '登记时间', dataIndex: 'created_at', width: 160 }
                        ]}
                      />
                    </div>
                  )}
                </Space>
              );
            }
          }}
        />
      </Card>

      <Modal
        title="新增抽检记录"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        width={620}
        okText="提交"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(c) => {
            if (c.inspection_result !== undefined) setResultType(c.inspection_result);
          }}
        >
          <Form.Item
            label="池塘"
            name="pond_id"
            rules={[{ required: true, message: '请选择池塘' }]}
          >
            <Select placeholder="请选择池塘" showSearch optionFilterProp="children">
              {ponds.map((p) => (
                <Option key={p.id} value={p.id}>
                  <Space>
                    <span>
                      {p.pond_code} - {p.pond_name}
                    </span>
                    {p.locked === 1 && <Tag color="red">已锁定</Tag>}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="抽样日期" name="sample_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="质检员" name="inspector" rules={[{ required: true }]}>
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
          {resultType === 'unqualified' && (
            <Alert
              type="error"
              showIcon
              message="判定不合格将自动锁定对应池塘，需走解锁流程"
              style={{ marginBottom: 12 }}
            />
          )}
          <Form.Item label="不合格项目" name="unqualified_items">
            <Input placeholder="不合格时填写具体不合格项，如：孔雀石绿残留超标" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <SyncOutlined />
            <span>复检登记 - 源自 {current?.inspection_no}</span>
          </Space>
        }
        open={reinspectOpen}
        onCancel={() => setReinspectOpen(false)}
        onOk={onReinspectSubmit}
        width={620}
        okText="提交复检结果"
        cancelText="取消"
      >
        {current && (
          <Alert
            type="warning"
            showIcon
            message="原始不合格记录"
            description={
              <Descriptions column={2} size="small" bordered style={{ marginTop: 6 }}>
                <Descriptions.Item label="不合格项">
                  {current.unqualified_items || '未填写'}
                </Descriptions.Item>
                <Descriptions.Item label="抽样日期">
                  {current.sample_date}
                </Descriptions.Item>
              </Descriptions>
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <Form
          form={reinspectForm}
          layout="vertical"
          onValuesChange={(c) => {
            if (c.inspection_result !== undefined) setResultType(c.inspection_result);
          }}
        >
          <Form.Item label="抽样日期" name="sample_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="质检员" name="inspector" rules={[{ required: true }]}>
            <Input placeholder="请输入质检员姓名" />
          </Form.Item>
          <Form.Item label="复检项目" name="inspection_items">
            <Input />
          </Form.Item>
          <Form.Item
            label="复检结果"
            name="inspection_result"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="qualified">复检通过</Radio>
              <Radio value="unqualified">复检仍不合格</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="不合格项目" name="unqualified_items">
            <Input placeholder="如仍不合格请注明" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} placeholder="复检过程或异常情况说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <UnlockOutlined />
            <span>池塘解锁条件检查</span>
          </Space>
        }
        open={unlockCheckOpen}
        onCancel={() => setUnlockCheckOpen(false)}
        width={720}
        footer={
          <Space>
            <Button onClick={() => setUnlockCheckOpen(false)}>关闭</Button>
            <Button
              danger
              onClick={() => {
                modal.confirm({
                  title: '强制解锁',
                  icon: <ExclamationCircleOutlined />,
                  content:
                    '当前条件未完全满足，强制解锁将跳过停药期/复检/出塘检查，请确认是否继续？',
                  okText: '确认强制解锁',
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
        {renderUnlockSteps()}
      </Modal>
    </div>
  );
}
