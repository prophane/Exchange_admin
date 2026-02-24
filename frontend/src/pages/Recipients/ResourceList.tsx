import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, Tag, message, Modal, Form, Input, Select } from 'antd';
import { ReloadOutlined, PlusOutlined, HomeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  RoomMailbox:      { label: 'Salle',      color: 'blue'   },
  EquipmentMailbox: { label: 'Équipement', color: 'cyan'   },
  '16':             { label: 'Salle',      color: 'blue'   },
  '32':             { label: 'Équipement', color: 'cyan'   },
};

export default function ResourceList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dbs, setDbs] = useState<string[]>([]);
  const [ous, setOus] = useState<string[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setItems(await exchangeApi.getResources()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
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
      await exchangeApi.createResource({
        type: values.type,
        name: values.name,
        alias: values.alias,
        userPrincipalName: values.upn,
        database: values.database,
        organizationalUnit: values.ou,
      });
      message.success('Ressource créée');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Adresse e-mail', dataIndex: 'PrimarySmtpAddress', render: v => <Tag color="blue">{v}</Tag> },
    {
      title: 'Type',
      dataIndex: 'RecipientTypeDetails',
      render: v => {
        const e = TYPE_LABELS[String(v)];
        return e ? <Tag color={e.color}>{e.label}</Tag> : <Tag>{v}</Tag>;
      },
    },
    { title: 'Base de données', dataIndex: 'Database' },
    { title: 'Créée le', dataIndex: 'WhenCreated', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <HomeOutlined style={{ marginRight: 8 }} />
          Ressources (Salles &amp; Équipements)
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nouvelle ressource</Button>
        </Space>
      </div>

      <Table
        rowKey={(r) => r.Alias || r.Name || Math.random().toString()}
        dataSource={items}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
        footer={() => `Total: ${items.length} ressources`}
      />

      <Modal title="Créer une ressource" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="type" label="Type" initialValue="Room" rules={[{ required: true }]}>
            <Select options={[
              { value: 'Room', label: 'Salle de réunion' },
              { value: 'Equipment', label: 'Équipement' },
            ]} />
          </Form.Item>
          <Form.Item name="name" label="Nom" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="alias" label="Alias (SAM)" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="upn" label="Adresse e-mail (UPN)" rules={[{ required: true }]}><Input /></Form.Item>
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
    </div>
  );
}
