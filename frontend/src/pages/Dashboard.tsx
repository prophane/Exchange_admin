import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Alert, Typography, Space } from 'antd';
import {
  MailOutlined,
  TeamOutlined,
  DatabaseOutlined,
  SendOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { exchangeApi } from '../services/api.service';
import { useAuth } from '../context/useAuth';

const { Title } = Typography;

interface DashboardStats {
  mailboxCount: number;
  groupCount: number;
  databaseCount: number;
  queueCount: number;
  totalMessages: number;
  connected: boolean;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    mailboxCount: 0,
    groupCount: 0,
    databaseCount: 0,
    queueCount: 0,
    totalMessages: 0,
    connected: false,
  });

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Tester la connexion
      const connectionTest = await exchangeApi.testConnection();
      
      // Charger les statistiques
      const [mailboxes, groups, databases, queues] = await Promise.all([
        exchangeApi.getMailboxes(10000),
        exchangeApi.getDistributionGroups(10000),
        exchangeApi.getDatabases(),
        exchangeApi.getQueues(),
      ]);

      const totalMessages = queues.reduce((sum, queue) => sum + (queue.messageCount || 0), 0);

      setStats({
        mailboxCount: mailboxes.length,
        groupCount: groups.length,
        databaseCount: databases.length,
        queueCount: queues.length,
        totalMessages,
        connected: connectionTest.connected || false,
      });
    } catch (err: any) {
      const apiMsg =
        err?.response?.data?.Error ??
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        err?.response?.data?.detail ??
        err.message ??
        'Erreur inconnue';
      setError(apiMsg);
      console.error('Dashboard error:', err?.response?.data ?? err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 60000); // Rafraîchir toutes les minutes
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats.mailboxCount) {
    return (
      <div className="loading-container">
        <Spin size="large" tip="Chargement du tableau de bord..." />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <Space direction="vertical" size="small">
          <Title level={2}>Tableau de bord</Title>
          {stats.connected ? (
            <Alert
              message="Connecté au serveur Exchange"
              type="success"
              icon={<CheckCircleOutlined />}
              showIcon
            />
          ) : (
            <Alert
              message="Connexion au serveur Exchange échouée"
              type="error"
              icon={<WarningOutlined />}
              showIcon
            />
          )}
        </Space>
      </div>

      {error && (
        <Alert
          message="Erreur"
          description={error}
          type="error"
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable style={{ cursor: 'pointer' }} onClick={() => navigate('/recipients?tab=mailboxes')}>
            <Statistic
              title="Boîtes aux lettres"
              value={stats.mailboxCount}
              prefix={<MailOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card hoverable style={{ cursor: 'pointer' }} onClick={() => navigate('/recipients?tab=groups')}>
            <Statistic
              title="Groupes de distribution"
              value={stats.groupCount}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card hoverable style={{ cursor: 'pointer' }} onClick={() => navigate('/servers?tab=databases')}>
            <Statistic
              title="Bases de données"
              value={stats.databaseCount}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card hoverable style={{ cursor: 'pointer' }} onClick={() => navigate('/mailflow?tab=queues')}>
            <Statistic
              title="Messages en file"
              value={stats.totalMessages}
              prefix={<SendOutlined />}
              valueStyle={{ color: stats.totalMessages > 100 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card title="État du serveur" bordered={false}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <strong>Serveur:</strong> {user?.serverFqdn ?? '—'}
              </div>
              <div>
                <strong>Version:</strong> {user?.infrastructureVersion ?? '—'}
              </div>
              <div>
                <strong>État:</strong>{' '}
                {stats.connected ? (
                  <span style={{ color: '#3f8600' }}>✓ En ligne</span>
                ) : (
                  <span style={{ color: '#cf1322' }}>✗ Hors ligne</span>
                )}
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card title="Actions rapides" bordered={false}>
            <Space direction="vertical">
              <Typography.Link href="/mailboxes">Gérer les boîtes aux lettres</Typography.Link>
              <Typography.Link href="/groups">Gérer les groupes</Typography.Link>
              <Typography.Link href="/queues">Surveiller les files d'attente</Typography.Link>
              <Typography.Link href="/databases">Vérifier les bases de données</Typography.Link>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Alertes" bordered={false}>
            {stats.totalMessages > 100 ? (
              <Alert
                message="Attention"
                description={`${stats.totalMessages} messages en attente dans les files`}
                type="warning"
                showIcon
              />
            ) : (
              <Alert
                message="Tout va bien"
                description="Aucune alerte pour le moment"
                type="success"
                showIcon
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
