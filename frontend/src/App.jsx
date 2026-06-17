import React, { useState, useEffect } from 'react';
import { Layout, Menu, theme } from 'antd';
import {
  DashboardOutlined,
  MedicineBoxOutlined,
  AuditOutlined,
  ExperimentOutlined,
  GiftOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Medication from './pages/Medication.jsx';
import Audit from './pages/Audit.jsx';
import Inspection from './pages/Inspection.jsx';
import Harvest from './pages/Harvest.jsx';
import PondDrug from './pages/PondDrug.jsx';

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '概览' },
  { key: '/medication', icon: <MedicineBoxOutlined />, label: '用药登记（养殖员）' },
  { key: '/audit', icon: <AuditOutlined />, label: '用药审核（兽医）' },
  { key: '/inspection', icon: <ExperimentOutlined />, label: '抽检记录（质检员）' },
  { key: '/harvest', icon: <GiftOutlined />, label: '出塘管理' },
  { key: '/pond-drug', icon: <DatabaseOutlined />, label: '池塘与药品管理' }
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            height: 64,
            margin: 16,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: collapsed ? 14 : 16,
            fontWeight: 600
          }}
        >
          {collapsed ? '养殖' : '水产养殖用药系统'}
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0'
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>水产养殖用药记录管理系统</h2>
          <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
            养殖员 · 兽医 · 质检员 协同平台
          </div>
        </Header>
        <Content style={{ margin: '0 16px' }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              marginTop: 16
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/medication" element={<Medication />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/inspection" element={<Inspection />} />
              <Route path="/harvest" element={<Harvest />} />
              <Route path="/pond-drug" element={<PondDrug />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
