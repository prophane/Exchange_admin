import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Typography, Alert, Select, Spin, Tag, Space } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, CloudServerOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../context/useAuth';
import type { AuthUser } from '../../context/auth.types';
import { exchangeApi } from '../../services/api.service';

const { Title, Text } = Typography;

interface Infrastructure {
  id: string;
  label: string;
  version: string;
  server: string;
}

interface LoginFormValues {
  username: string;
  password: string;
  infrastructureId: string;
}

const VERSION_COLORS: Record<string, string> = {
  'Exchange 2010':  'gold',
  'Exchange 2013':  'orange',
  'Exchange 2016':  'blue',
  'Exchange 2019':  'geekblue',
  'Exchange SE':    'purple',
  'Exchange Online': 'cyan',
};

export default function LoginPage() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const from       = (location.state as any)?.from?.pathname ?? '/';
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('reason') === 'session_expired';

  const [form]              = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [infrastructures, setInfrastructures]   = useState<Infrastructure[]>([]);
  const [infrasLoading, setInfrasLoading]        = useState(true);

  // Charge la liste des infrastructures au montage (endpoint public)
  useEffect(() => {
    exchangeApi.getInfrastructures()
      .then((list) => {
        setInfrastructures(list);
        if (list.length > 0) {
          form.setFieldValue('infrastructureId', list[0].id);
        }
      })
      .catch(() => { /* silencieux — liste vide */ })
      .finally(() => setInfrasLoading(false));
  }, [form]);

  const handleLogin = async (values: LoginFormValues) => {
    try {
      setLoading(true);
      setError(null);

      // Accepte "DOMAINE\utilisateur" ou juste "utilisateur"
      let domain   = '';
      let username = values.username.trim();
      const sep = username.indexOf('\\');
      if (sep !== -1) {
        domain   = username.slice(0, sep);
        username = username.slice(sep + 1);
      }

      const resp = await axios.post('/api/auth/login', {
        username,
        password: values.password,
        domain,
        infrastructureId: values.infrastructureId ?? '',
      });

      const data = resp.data.data;
      const user: AuthUser = {
        username:              data.username,
        displayName:           data.displayName,
        domain:                data.domain,
        authMethod:            data.authMethod,
        expiresAt:             data.expiresAt,
        infrastructureId:      data.infrastructureId,
        infrastructureLabel:   data.infrastructureLabel,
        infrastructureVersion: data.infrastructureVersion,
        serverFqdn:            data.serverFqdn,
      };

      login(data.token, user);
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err.message ?? 'Erreur de connexion';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedInfraId = Form.useWatch('infrastructureId', form);
  const selectedInfra = infrastructures.find((i) => i.id === selectedInfraId);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <SafetyOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          <Title level={3} style={{ margin: '12px 0 4px' }}>
            Exchange Web Admin
          </Title>
          {infrasLoading
            ? <Spin size="small" />
            : selectedInfra
              ? <Space size={4}>
                  <CloudServerOutlined style={{ color: '#888' }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>{selectedInfra.server}</Text>
                  <Tag color={VERSION_COLORS[selectedInfra.version] ?? 'default'} style={{ fontSize: 11 }}>{selectedInfra.version}</Tag>
                </Space>
              : <Text type="secondary">Chargement...</Text>
          }
        </div>

        {/* Session expirée */}
        {sessionExpired && (
          <Alert
            type="warning"
            showIcon
            message="Session expirée"
            description="Le serveur a redémarré. Reconnectez-vous pour rétablir la session Exchange."
            style={{ marginBottom: 20 }}
          />
        )}

        {/* Formulaire */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleLogin}
          requiredMark={false}
        >
          {/* Sélecteur infrastructure */}
          {infrastructures.length > 1 && (
            <Form.Item
              name="infrastructureId"
              label="Infrastructure Exchange"
              rules={[{ required: true, message: 'Sélectionnez une infrastructure' }]}
            >
              <Select
                size="large"
                loading={infrasLoading}
                options={infrastructures.map((i) => ({
                  value: i.id,
                  label: (
                    <Space size={6}>
                      <span>{i.label}</span>
                      <Tag color={VERSION_COLORS[i.version] ?? 'default'} style={{ fontSize: 11 }}>{i.version}</Tag>
                    </Space>
                  ),
                }))}
                onChange={(val) => {
                  const infra = infrastructures.find((i) => i.id === val);
                  if (infra) form.setFieldValue('infrastructureId', infra.id);
                }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="username"
            label="Nom d'utilisateur"
            rules={[{ required: true, message: "Nom d'utilisateur requis" }]}
            extra={<Text type="secondary" style={{ fontSize: 11 }}>Format : utilisateur ou DOMAINE\utilisateur</Text>}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="utilisateur"
              autoComplete="username"
              autoFocus
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mot de passe"
            rules={[{ required: true, message: 'Mot de passe requis' }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Form.Item>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{ height: 48, fontSize: 15 }}
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
