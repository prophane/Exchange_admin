import { useEffect, useState } from 'react';
import { Table, Typography, Tag, message, Tabs, Button } from 'antd';
import { ReloadOutlined, MobileOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

function PoliciesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getActiveSyncPolicies()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', render: v => v ? <Tag color="green">Oui</Tag> : <Tag>Non</Tag> },
    { title: 'Mot de passe requis', dataIndex: 'DevicePasswordEnabled', render: v => <Tag color={v ? 'orange' : 'default'}>{v ? 'Oui' : 'Non'}</Tag> },
    { title: 'Chiffrement', dataIndex: 'DeviceEncryptionEnabled', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Activé' : 'Désactivé'}</Tag> },
    { title: 'Tentatives max', dataIndex: 'MaxDevicePasswordFailedAttempts' },
    { title: 'Longeur min MDP', dataIndex: 'MinDevicePasswordLength' },
    { title: 'Modifié le', dataIndex: 'WhenChanged', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
  ];

  return (
    <Table rowKey="Name" dataSource={data} columns={columns} loading={loading} size="small"
      pagination={{ pageSize: 20 }} footer={() => `${data.length} stratégies`}
      title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
  );
}

function AccessRulesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getMobileDeviceAccessRules()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const ACCESS_COLORS: Record<string, string> = {
    Allow: 'green',
    Block: 'red',
    Quarantine: 'orange',
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Caractéristique', dataIndex: 'Characteristic', render: v => <Tag>{v}</Tag> },
    { title: 'Valeur', dataIndex: 'QueryString' },
    { title: 'Accès', dataIndex: 'AccessLevel', render: v => <Tag color={ACCESS_COLORS[String(v)] || 'default'}>{v}</Tag> },
  ];

  return (
    <Table rowKey="Name" dataSource={data} columns={columns} loading={loading} size="small"
      pagination={{ pageSize: 20 }} footer={() => `${data.length} règles d'accès`}
      title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
  );
}

export default function MobilePage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <MobileOutlined style={{ marginRight: 8 }} />
        Mobile
      </Title>
      <Tabs items={[
        { key: 'policies', label: 'Stratégies de boîtes aux lettres des appareils mobiles', children: <PoliciesTab /> },
        { key: 'access', label: "Règles d'accès aux appareils", children: <AccessRulesTab /> },
      ]} />
    </div>
  );
}
