import { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Space, Tag, Avatar, Dropdown, Button, Tooltip } from 'antd';
import {
  MailOutlined,
  SendOutlined,
  DashboardOutlined,
  SafetyOutlined,
  CloudServerOutlined,
  UserOutlined,
  LogoutOutlined,
  WindowsOutlined,
  KeyOutlined,
  ApartmentOutlined,
  LockOutlined,
  AuditOutlined,
  MobileOutlined,
  FolderOutlined,
  FilterOutlined,
} from '@ant-design/icons';

// Auth
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/Login/LoginPage';

// Pages — Destinataires
import RecipientsPage from './pages/Recipients/RecipientsPage';
import MailboxDetail from './pages/Mailboxes/MailboxDetail';
// Pages — Autorisations
import PermissionsPage from './pages/Permissions/PermissionsPage';
// Pages — Conformité
import CompliancePage from './pages/Compliance/CompliancePage';
// Pages — Protection
import ProtectionPage from './pages/Protection/ProtectionPage';
// Pages — Organisation
import Organization from './pages/Organization/Organization';
// Pages — Flux de messagerie
import MailFlowPage from './pages/MailFlow/MailFlowPage';
// Pages — Mobile
import MobilePage from './pages/Mobile/MobilePage';
// Pages — Dossiers publics
import PublicFolderPage from './pages/PublicFolders/PublicFolderPage';
// Pages — Serveurs
import ServersPage from './pages/Servers/ServersPage';
// Dashboard
import Dashboard from './pages/Dashboard';
import CmdletLogDrawer from './components/CmdletLogDrawer';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

// Calcule la clé active dans la sidebar à partir du chemin courant
function getSelectedKey(pathname: string, search: string): string {
  if (pathname.startsWith('/mailboxes') || pathname.startsWith('/recipients') || pathname.startsWith('/groups')) return '/recipients';
  if (pathname.startsWith('/mailflow')) return '/mailflow' + search;
  if (pathname.startsWith('/servers') || pathname.startsWith('/databases') || pathname.startsWith('/config/certificates') || pathname.startsWith('/config/virtual-directories')) return '/servers';
  return pathname;
}

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location   = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: <Link to="/">Tableau de bord</Link>,
    },
    // 1. DESTINATAIRES
    {
      key: '/recipients',
      icon: <MailOutlined />,
      label: <Link to="/recipients">Destinataires</Link>,
    },
    // 2. AUTORISATIONS
    {
      key: '/permissions',
      icon: <LockOutlined />,
      label: <Link to="/permissions">Autorisations</Link>,
    },
    // 3. GESTION DE LA CONFORMITE
    {
      key: '/compliance',
      icon: <AuditOutlined />,
      label: <Link to="/compliance">Gestion de la conformité</Link>,
    },
    // 4. ORGANISATION
    {
      key: '/organization',
      icon: <ApartmentOutlined />,
      label: <Link to="/organization">Organisation</Link>,
    },
    // 5. PROTECTION
    {
      key: '/protection',
      icon: <FilterOutlined />,
      label: <Link to="/protection">Protection</Link>,
    },
    // 6. FLUX DE MESSAGERIE
    {
      key: '/mailflow',
      icon: <SendOutlined />,
      label: <Link to="/mailflow">Flux de messagerie</Link>,
    },
    // 7. MOBILE
    {
      key: '/mobile',
      icon: <MobileOutlined />,
      label: <Link to="/mobile">Mobile</Link>,
    },
    // 8. DOSSIERS PUBLICS
    {
      key: '/public-folders',
      icon: <FolderOutlined />,
      label: <Link to="/public-folders">Dossiers publics</Link>,
    },
    // 9. SERVEURS
    {
      key: '/servers',
      icon: <CloudServerOutlined />,
      label: <Link to="/servers">Serveurs</Link>,
    },
  ];

  const userMenuItems = [
    {
      key: 'info',
      disabled: true,
      label: (
        <div style={{ padding: '4px 0' }}>
          <div><strong>{user?.displayName ?? user?.username}</strong></div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {user?.domain}\{user?.username}
          </Text>
          <br />
          <Tag
            color={user?.authMethod === 'SSO' ? 'blue' : 'green'}
            style={{ marginTop: 4, fontSize: 11 }}
            icon={user?.authMethod === 'SSO' ? <WindowsOutlined /> : <KeyOutlined />}
          >
            {user?.authMethod === 'SSO' ? 'SSO Windows' : 'Connexion manuelle'}
          </Tag>
        </div>
      ),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Se deconnecter',
      danger: true,
      onClick: logout,
    },
  ];

  return (
    <Layout className="app-layout">
      <Header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div className="app-logo" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SafetyOutlined style={{ fontSize: 28 }} />
          <Title level={4} style={{ color: 'white', margin: 0 }}>
            Exchange Web Admin
          </Title>
        </div>
        <Space>
          <Tag color="green">{user?.serverFqdn ?? '—'}</Tag>
          <Tag color="blue">{user?.infrastructureVersion ?? 'Exchange'}</Tag>

          {user && (
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Tooltip title={`${user.domain}\\${user.username}`}>
                <Button
                  type="text"
                  style={{ color: 'white', display: 'flex', alignItems: 'center', gap: 8, height: 40 }}
                >
                  <Avatar size={28} icon={<UserOutlined />} style={{ background: '#1890ff' }} />
                  <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName || user.username}
                  </span>
                </Button>
              </Tooltip>
            </Dropdown>
          )}
        </Space>
      </Header>

      <Layout style={{ flex: 1, minHeight: 0 }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="light"
          width={250}
        >
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey(location.pathname, location.search)]}
            items={menuItems}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>

        <Layout style={{ padding: '0 24px 24px', overflow: 'auto' }}>
          <Content className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/recipients" element={<RecipientsPage />} />
              <Route path="/mailboxes/:identity" element={<MailboxDetail />} />
              <Route path="/mailflow" element={<MailFlowPage />} />
              <Route path="/mailflow/rules" element={<MailFlowPage />} />
              <Route path="/mailflow/tracking" element={<MailFlowPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/protection" element={<ProtectionPage />} />
              <Route path="/mobile" element={<MobilePage />} />
              <Route path="/public-folders" element={<PublicFolderPage />} />
              <Route path="/servers" element={<ServersPage />} />
              <Route path="/organization" element={<Organization />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
      <CmdletLogDrawer />
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
