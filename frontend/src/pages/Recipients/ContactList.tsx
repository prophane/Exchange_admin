import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, Tag, message, Modal, Form, Input, Select, Popconfirm } from 'antd';
import { ReloadOutlined, PlusOutlined, ContactsOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function ContactList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [ous, setOus] = useState<string[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setItems(await exchangeApi.getContacts()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    if (!ous.length) {
      try { setOus(await exchangeApi.getOrganizationalUnits()); } catch { /* ignore */ }
    }
    setCreateOpen(true);
  };

  const handleCreate = async (values: any) => {
    try {
      await exchangeApi.createContact({
        name: values.name,
        externalEmailAddress: values.externalEmail,
        alias: values.alias,
        organizationalUnit: values.ou,
      });
      message.success('Contact créé');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const handleDelete = async (identity: string) => {
    try {
      await exchangeApi.deleteContact(identity);
      message.success('Contact supprimé');
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'E-mail externe', dataIndex: 'ExternalEmailAddress', render: v => <Tag color="orange">{v}</Tag> },
    { title: 'Alias', dataIndex: 'Alias' },
    { title: 'OU', dataIndex: 'OrganizationalUnit', ellipsis: true },
    { title: 'Créé le', dataIndex: 'WhenCreated', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    {
      title: 'Actions',
      render: (_, rec) => (
        <Popconfirm title={`Supprimer ${rec.Name} ?`} onConfirm={() => handleDelete(rec.Name)}>
          <Button danger size="small" icon={<DeleteOutlined />}>Supprimer</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ContactsOutlined style={{ marginRight: 8 }} />
          Contacts messagerie
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nouveau contact</Button>
        </Space>
      </div>

      <Table
        rowKey={(r) => r.Alias || r.Name || Math.random().toString()}
        dataSource={items}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
        footer={() => `Total: ${items.length} contacts`}
      />

      <Modal title="Créer un contact messagerie" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Nom complet" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="externalEmail" label="Adresse e-mail externe" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="alias" label="Alias (optionnel)"><Input /></Form.Item>
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
