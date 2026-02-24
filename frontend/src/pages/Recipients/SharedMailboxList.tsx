import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Typography, Tag, message,
  Modal, Form, Input, Select,
} from 'antd';
import {
  ReloadOutlined, PlusOutlined, ShareAltOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function SharedMailboxList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [dbs, setDbs] = useState<string[]>([]);
  const [ous, setOus] = useState<string[]>([]);
  const [form] = Form.useForm();
  const [permForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await exchangeApi.getSharedMailboxes();
      setItems(data);
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    if (!dbs.length) {
      try {
        const [dbData, ouData] = await Promise.all([exchangeApi.getDatabases(), exchangeApi.getOrganizationalUnits()]);
        setDbs(dbData.map((d: any) => d.name || d.Name));
        setOus(ouData);
      } catch { /* ignore */ }
    }
    setCreateOpen(true);
  };

  const handleCreate = async (values: any) => {
    try {
      await exchangeApi.createSharedMailbox({
        name: values.name,
        alias: values.alias,
        userPrincipalName: values.upn,
        database: values.database,
        organizationalUnit: values.ou,
      });
      message.success('Boîte partagée créée');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const openPerm = (identity: string) => {
    setSelectedIdentity(identity);
    setPermOpen(true);
  };

  const handleAddPerm = async (values: any) => {
    try {
      await exchangeApi.setSharedMailboxPermission(selectedIdentity, values.user, values.accessRight);
      message.success('Permission ajoutée');
      setPermOpen(false);
      permForm.resetFields();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Adresse e-mail', dataIndex: 'PrimarySmtpAddress', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Alias', dataIndex: 'Alias' },
    { title: 'Base de données', dataIndex: 'Database' },
    {
      title: 'Créée le',
      dataIndex: 'WhenCreated',
      render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Actions',
      render: (_, rec) => (
        <Space>
          <Button size="small" icon={<UserAddOutlined />} onClick={() => openPerm(rec.Alias || rec.Name)}>
            Permissions
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ShareAltOutlined style={{ marginRight: 8 }} />
          Boîtes aux lettres partagées
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nouvelle boîte partagée</Button>
        </Space>
      </div>

      <Table
        rowKey={(r) => r.Alias || r.Name || Math.random().toString()}
        dataSource={items}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
        footer={() => `Total: ${items.length} boîtes partagées`}
      />

      {/* Création */}
      <Modal title="Créer une boîte partagée" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Nom complet" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="alias" label="Alias (SAM)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="upn" label="Adresse e-mail (UPN)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="database" label="Base de données">
            <Select allowClear placeholder="(défaut)" options={dbs.map(d => ({ value: d, label: d }))} />
          </Form.Item>
          <Form.Item name="ou" label="Unité organisationnelle (OU)">
            <Select allowClear showSearch placeholder="(défaut)"
              options={ous.map(o => ({ value: o, label: o.split(',')[0]?.replace('OU=','').replace('CN=','') || o }))} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">Créer</Button>
              <Button onClick={() => setCreateOpen(false)}>Annuler</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Permissions */}
      <Modal title={`Ajouter une permission — ${selectedIdentity}`} open={permOpen} onCancel={() => setPermOpen(false)} footer={null}>
        <Form form={permForm} layout="vertical" onFinish={handleAddPerm}>
          <Form.Item name="user" label="Utilisateur / Groupe" rules={[{ required: true }]}>
            <Input placeholder="domaine\utilisateur ou UPN" />
          </Form.Item>
          <Form.Item name="accessRight" label="Droit" initialValue="FullAccess" rules={[{ required: true }]}>
            <Select options={[
              { value: 'FullAccess', label: 'Accès total (FullAccess)' },
              { value: 'SendAs', label: 'Envoyer en tant que (SendAs)' },
              { value: 'ExternalAccount', label: 'Compte externe' },
            ]} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">Ajouter</Button>
              <Button onClick={() => setPermOpen(false)}>Annuler</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
