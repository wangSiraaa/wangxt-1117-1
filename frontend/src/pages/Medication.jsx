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
  Descriptions,
  Alert,
  Tooltip,
  Divider,
  List
} from 'antd';
import { PlusOutlined, ReloadOutlined, EyeOutlined, WarningOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getMedications,
  addMedication,
  getPonds,
  getDrugs,
  getPondDetail,
  getDrugSubstitutes,
  resubmitMedication
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
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form] = Form.useForm();
  const [resubmitForm] = Form.useForm();

  const [selectedPond, setSelectedPond] = useState(null);
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [bannedWarning, setBannedWarning] = useState(null);
  const [harvestConflictWarning, setHarvestConflictWarning] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [medRes, pondRes, drugRes] = await Promise.all([
        getMedications(),
        getPonds(),
        getDrugs(true)
      ]);
      if (medRes.success) setList(medRes.data);
      if (pondRes.success) setPonds(pondRes.data);
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

  const onPondChange = (pondId) => {
    const pond = ponds.find((p) => p.id === pondId);
    setSelectedPond(pond || null);
  };

  const onDrugChange = async (drugId) => {
    const drug = drugs.find((d) => d.id === drugId);
    setSelectedDrug(drug || null);
    setBannedWarning(null);
    if (drug && drug.is_banned === 1) {
      try {
        const res = await getDrugSubstitutes(drugId);
        if (res.success) {
          setBannedWarning({
            drug,
            substitutes: res.data.substitutes
          });
        }
      } catch (e) {}
    }
  };

  const onMedicationDateChange = (medDate) => {
    updateHarvestWarning(medDate, form.getFieldValue('expected_harvest_date'), selectedDrug);
  };

  const onHarvestDateChange = (harvestDate) => {
    updateHarvestWarning(form.getFieldValue('medication_date'), harvestDate, selectedDrug);
  };

  const updateHarvestWarning = (medDate, harvestDate, drug) => {
    setHarvestConflictWarning(null);
    if (medDate && harvestDate && drug && drug.withdrawal_period > 0) {
      const withdrawalEnd = dayjs(medDate).add(drug.withdrawal_period, 'day');
      const hDate = dayjs(harvestDate);
      if (hDate.isBefore(withdrawalEnd)) {
        setHarvestConflictWarning({
          withdrawal_end_date: withdrawalEnd.format('YYYY-MM-DD'),
          days_conflict: withdrawalEnd.diff(hDate, 'day') + 1
        });
      }
    }
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        medication_date: values.medication_date.format('YYYY-MM-DD'),
        expected_harvest_date: values.expected_harvest_date?.format('YYYY-MM-DD')
      };
      const res = await addMedication(payload);
      if (res.success) {
        if (res.data?.has_warning && res.data?.warning) {
          const w = res.data.warning;
          modal.warning({
            title: '提交成功，但存在业务预警',
            okText: '我已知晓',
            content: (
              <div>
                <p>记录编号：<b>{res.data.record_no}</b></p>
                {w.banned_drug && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={`用药【${w.banned_drug.drug_name}】为禁用药，已提交兽医审核`}
                    description={w.substitutes && w.substitutes.length > 0 ? (
                      <div>
                        <p style={{ margin: '4px 0' }}>建议替代方案：</p>
                        <List size="small" dataSource={w.substitutes} renderItem={(s) => (
                          <List.Item>
                            <b>优先度{s.priority}</b>：{s.substitute_name}（{s.substitute_code}）- {s.substitute_reason || `停药期${s.withdrawal_period}天`}
                          </List.Item>
                        )} />
                      </div>
                    ) : null}
                  />
                )}
                {w.harvest_conflict && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`预计出塘日 ${w.harvest_conflict.expected_harvest_date} 早于停药期结束日 ${w.harvest_conflict.withdrawal_end_date}`}
                    description={`相差约 ${w.harvest_conflict.days_conflict} 天，建议兽医审核时评估`}
                  />
                )}
              </div>
            )
          });
        } else {
          message.success(`登记成功，编号：${res.data.record_no}`);
        }
        setOpen(false);
        form.resetFields();
        setSelectedPond(null);
        setSelectedDrug(null);
        setBannedWarning(null);
        setHarvestConflictWarning(null);
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

  const openResubmit = (record) => {
    setResubmitTarget(record);
    resubmitForm.setFieldsValue({
      pond_id: record.pond_id,
      drug_id: record.drug_id,
      medication_date: dayjs(record.medication_date),
      expected_harvest_date: record.expected_harvest_date ? dayjs(record.expected_harvest_date) : null,
      dosage: record.dosage,
      unit: record.unit,
      usage_method: record.usage_method,
      operator: record.operator,
      remark: record.remark
    });
    const pond = ponds.find((p) => p.id === record.pond_id);
    setSelectedPond(pond || null);
    const drug = drugs.find((d) => d.id === record.drug_id);
    setSelectedDrug(drug || null);
    setBannedWarning(null);
    setHarvestConflictWarning(null);
    if (drug && drug.is_banned === 1) {
      getDrugSubstitutes(record.drug_id).then((res) => {
        if (res?.success) setBannedWarning({ drug, substitutes: res.data.substitutes });
      });
    }
    setResubmitOpen(true);
  };

  const onResubmit = async () => {
    if (!resubmitTarget) return;
    try {
      const values = await resubmitForm.validateFields();
      const payload = {
        ...values,
        medication_date: values.medication_date.format('YYYY-MM-DD'),
        expected_harvest_date: values.expected_harvest_date?.format('YYYY-MM-DD')
      };
      const res = await resubmitMedication(resubmitTarget.id, payload);
      if (res.success) {
        let msg = `重新提交成功，新编号：${res.data.record_no}`;
        if (res.data.resubmit_count) msg += `（第${res.data.resubmit_count}次修改）`;
        if (res.data.has_warning && res.data.warning) {
          const w = res.data.warning;
          modal.warning({
            title: msg,
            content: (
              <div>
                {w.banned_drug && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message={`新药品【${w.banned_drug.drug_name}】仍为禁用药`}
                  />
                )}
                {w.harvest_conflict && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`出塘日期仍与停药期冲突`}
                  />
                )}
              </div>
            )
          });
        } else {
          message.success(msg);
        }
        setResubmitOpen(false);
        setResubmitTarget(null);
        resubmitForm.resetFields();
        setSelectedPond(null);
        setSelectedDrug(null);
        setBannedWarning(null);
        setHarvestConflictWarning(null);
        loadData();
      } else {
        message.error(res.message || '重新提交失败');
      }
    } catch (e) {
      if (e?.message) message.error(e.message);
    }
  };

  const renderAuditSubstitutes = (r) => {
    const subs = r.suggested_substitutes_parsed;
    if (!subs || !subs.length) return null;
    return (
      <Tooltip title={subs.map((s) => `${s.substitute_name}：${s.substitute_reason || `停药期${s.withdrawal_period}天`}`).join('\n')}>
        <Tag color="purple" icon={<WarningOutlined />}>含兽医替代建议</Tag>
      </Tooltip>
    );
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
      title: '预计出塘',
      dataIndex: 'expected_harvest_date',
      width: 120,
      render: (v) => v || '-'
    },
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
    {
      title: '备选药品',
      width: 100,
      render: (_, r) => {
        const ids = r.alternative_drug_ids_parsed;
        if (!ids || !ids.length) return '-';
        const names = ids.map((id) => drugs.find((d) => d.id === id)?.drug_name || id).join('、');
        return <Tooltip title={names}>{ids.length}种</Tooltip>;
      }
    },
    { title: '登记人', dataIndex: 'operator', width: 100 },
    {
      title: '审核状态',
      dataIndex: 'audit_status',
      width: 100,
      render: (v, r) => {
        const map = {
          pending: <Tag color="orange">待审核</Tag>,
          approved: <Tag color="green">已通过</Tag>,
          rejected: <Tag color="red">已驳回</Tag>
        };
        return (
          <Space direction="vertical" size={4}>
            {map[v] || v}
            {r.resubmit_count > 0 && (
              <Tag color="blue" icon={<HistoryOutlined />}>重提{r.resubmit_count}次</Tag>
            )}
            {r.suggested_substitutes_parsed && renderAuditSubstitutes(r)}
          </Space>
        );
      }
    },
    {
      title: '兽医审核',
      width: 180,
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
      width: 200,
      render: (_, r) => (
        <Space direction="vertical" size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r)}>
            池塘详情
          </Button>
          {r.audit_status === 'rejected' && (
            <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openResubmit(r)}>
              修改后重提
            </Button>
          )}
        </Space>
      )
    }
  ];

  const renderFormBody = (formIns, isResubmit = false) => (
    <Form form={formIns} layout="vertical">
      <Form.Item
        label="池塘"
        name="pond_id"
        rules={[{ required: true, message: '请选择池塘' }]}
      >
        <Select
          placeholder="请选择池塘"
          showSearch
          optionFilterProp="children"
          onChange={(val) => {
            onPondChange(val);
          }}
        >
          {ponds.map((p) => (
            <Option
              key={p.id}
              value={p.id}
              disabled={p.locked === 1}
            >
              {p.pond_code} - {p.pond_name}（{p.species || '-'}
              {p.area ? ` · ${p.area}亩` : ''}
              {p.locked === 1 ? ' · 已锁定' : ''}
              ）
            </Option>
          ))}
        </Select>
      </Form.Item>
      {selectedPond && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message={`池塘信息：面积 ${selectedPond.area || '-'} 亩，品种 ${selectedPond.species || '-'}，放苗 ${selectedPond.stock_quantity || '-'} 尾`}
        />
      )}
      <Space style={{ width: '100%' }} align="baseline">
        <Form.Item
          label="药品（主药）"
          name="drug_id"
          rules={[{ required: true, message: '请选择药品' }]}
          style={{ flex: 1 }}
        >
          <Select
            placeholder="请选择药品"
            showSearch
            optionFilterProp="children"
            onChange={(val) => {
              if (!isResubmit) onDrugChange(val);
              else {
                const drug = drugs.find((d) => d.id === val);
                setSelectedDrug(drug || null);
                setBannedWarning(null);
                if (drug && drug.is_banned === 1) {
                  getDrugSubstitutes(val).then((res) => {
                    if (res?.success) setBannedWarning({ drug, substitutes: res.data.substitutes });
                  });
                }
              }
            }}
          >
            {drugs.map((d) => (
              <Option key={d.id} value={d.id}>
                {d.drug_code} - {d.drug_name}
                {d.is_banned === 1 ? '（禁用）' : ` · 停药期${d.withdrawal_period}天`}
              </Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          label="用药日期"
          name="medication_date"
          rules={[{ required: true }]}
          style={{ flex: 1 }}
        >
          <DatePicker
            style={{ width: '100%' }}
            onChange={(val) => {
              if (!isResubmit) onMedicationDateChange(val);
              else {
                const harvest = resubmitForm.getFieldValue('expected_harvest_date');
                updateHarvestWarning(val, harvest, selectedDrug);
              }
            }}
          />
        </Form.Item>
      </Space>
      {bannedWarning && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`注意：药品【${bannedWarning.drug.drug_name}】为国家禁用药物，登记后将强制由兽医审核`}
          description={
            bannedWarning.substitutes && bannedWarning.substitutes.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: 0, marginBottom: 4, fontWeight: 500 }}>建议可替代药品：</p>
                <List
                  size="small"
                  bordered
                  dataSource={bannedWarning.substitutes}
                  renderItem={(s) => (
                    <List.Item>
                      <Space>
                        <Tag color="blue">优先{s.priority}</Tag>
                        <b>{s.substitute_name}</b>
                        <span style={{ color: '#888' }}>{s.substitute_code}</span>
                        <span style={{ color: '#666' }}>
                          {s.substitute_reason || `停药期${s.withdrawal_period}天`}
                        </span>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            ) : '暂无推荐替代方案，请联系兽医确认'
          }
        />
      )}
      <Space style={{ width: '100%' }} align="baseline">
        <Form.Item
          label="预计出塘日期"
          name="expected_harvest_date"
          style={{ flex: 1 }}
        >
          <DatePicker
            style={{ width: '100%' }}
            onChange={(val) => {
              if (!isResubmit) onHarvestDateChange(val);
              else {
                const med = resubmitForm.getFieldValue('medication_date');
                updateHarvestWarning(med, val, selectedDrug);
              }
            }}
          />
        </Form.Item>
        <Form.Item
          label="备选药品"
          name="alternative_drug_ids"
          style={{ flex: 1 }}
        >
          <Select
            mode="multiple"
            placeholder="可多选备选方案"
            allowClear
            showSearch
            optionFilterProp="children"
            filterOption
          >
            {drugs
              .filter((d) => d.is_banned !== 1)
              .map((d) => (
                <Option key={d.id} value={d.id}>
                  {d.drug_name} · 停药期{d.withdrawal_period}天
                </Option>
              ))}
          </Select>
        </Form.Item>
      </Space>
      {harvestConflictWarning && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={`预计出塘日早于停药期结束日（${harvestConflictWarning.withdrawal_end_date}）`}
          description={`两者相差约 ${harvestConflictWarning.days_conflict} 天，建议兽医审核时评估是否调整出塘计划`}
        />
      )}
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
  );

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

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="业务提示：登记用药时需关联池塘面积、预计出塘日期和备选药品；含禁药的方案不会被立即驳回，而是转交兽医审核并给出替代建议"
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
        title="登记用药记录"
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
          setSelectedPond(null);
          setSelectedDrug(null);
          setBannedWarning(null);
          setHarvestConflictWarning(null);
        }}
        onOk={onSubmit}
        width={720}
        okText="提交（送审）"
        cancelText="取消"
      >
        {renderFormBody(form)}
      </Modal>

      <Modal
        title={
          resubmitTarget
            ? `修改后重新提交（原编号：${resubmitTarget.record_no}）`
            : '重新提交'
        }
        open={resubmitOpen}
        onCancel={() => {
          setResubmitOpen(false);
          setResubmitTarget(null);
          resubmitForm.resetFields();
          setSelectedPond(null);
          setSelectedDrug(null);
          setBannedWarning(null);
          setHarvestConflictWarning(null);
        }}
        onOk={onResubmit}
        width={720}
        okText="重新提交（送审）"
        cancelText="取消"
      >
        {resubmitTarget && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`原审核结果：${resubmitTarget.audit_result === 'rejected' ? '已驳回' : resubmitTarget.audit_result}`}
            description={
              <div>
                <p style={{ margin: 0 }}>
                  兽医：{resubmitTarget.audit_auditor || '-'}；
                  审核意见：{resubmitTarget.audit_opinion || '无'}
                </p>
                {resubmitTarget.suggested_substitutes_parsed && (
                  <div style={{ marginTop: 6 }}>
                    <Divider style={{ margin: '8px 0' }} orientation="left">兽医建议替代方案</Divider>
                    {resubmitTarget.suggested_substitutes_parsed.map((s, i) => (
                      <Tag key={i} color="purple" style={{ margin: '2px 4px 2px 0' }}>
                        {s.substitute_name}（{s.substitute_reason || `停药期${s.withdrawal_period}天`}）
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            }
          />
        )}
        {renderFormBody(resubmitForm, true)}
      </Modal>

      <Modal
        title="池塘详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[<Button key="close" onClick={() => setDetailOpen(false)}>关闭</Button>]}
        width={640}
      >
        {detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="池塘编号">{detail.pond_code}</Descriptions.Item>
            <Descriptions.Item label="池塘名称">{detail.pond_name}</Descriptions.Item>
            <Descriptions.Item label="养殖品种">{detail.species}</Descriptions.Item>
            <Descriptions.Item label="面积">{detail.area} 亩</Descriptions.Item>
            <Descriptions.Item label="状态" span={2}>
              {detail.locked === 1 ? (
                <Tag color="red">已锁定：{detail.lock_reason}</Tag>
              ) : (
                <Tag color="green">正常</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="放苗日期">{detail.stock_date}</Descriptions.Item>
            <Descriptions.Item label="放养数量">{detail.stock_quantity}</Descriptions.Item>
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
              <Descriptions.Item label="停药期" span={2}>暂无有效用药记录</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
