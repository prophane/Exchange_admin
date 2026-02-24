import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs, Table, Button, Tag, Typography, Form, Input, Switch,
  Space, Modal, message, Popconfirm, Select, InputNumber,
} from 'antd';
import {
  ReloadOutlined, EditOutlined, PlayCircleOutlined,
  DeploymentUnitOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

// Sub-pages rendered as tabs (they keep their own layout)
import TransportRuleList from './TransportRuleList';
import MessageTracking from './MessageTracking';
import Connectors from '../Configuration/Connectors';
import QueueList from '../Queues/QueueList';

const { Title } = Typography;
const fmt  = (v: any) => v ? dayjs(v.toString()).format('DD/MM/YYYY HH:mm') : '-';

// ============================================================================
// Domaines acceptés
// ============================================================================
const DOMAIN_TYPES = [
  { value: 'Authoritative',  label: 'Authoritative (documents internes)' },
  { value: 'InternalRelay', label: 'InternalRelay (relais interne)' },
  { value: 'ExternalRelay', label: 'ExternalRelay (relais externe)' },
];

const mapDomainType = (v: any): string => {
  const s = String(v ?? '');
  if (s === '0') return 'Authoritative';
  if (s === '1') return 'ExternalRelay';
  if (s === '2') return 'InternalRelay';
  return s || '-';
};

function AcceptedDomainsTab() {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try   { setDomains(await exchangeApi.getAcceptedDomains()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    editForm.setFieldsValue({ DomainType: mapDomainType(row.DomainType), MakeDefault: false });
    setEditModal(row);
  };

  const save = async (values: any) => {
    setSaving(true);
    try {
      await exchangeApi.setAcceptedDomain(editModal.Name, values);
      message.success('Domaine mis à jour');
      setEditModal(null); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  const create = async (values: any) => {
    setSaving(true);
    try {
      await exchangeApi.createAcceptedDomain(values);
      message.success(`Domaine "${values.Name}" créé`);
      setCreateOpen(false); createForm.resetFields(); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  const remove = async (name: string) => {
    setDeleting(name);
    try {
      await exchangeApi.deleteAcceptedDomain(name);
      message.success(`Domaine "${name}" supprimé`);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setDeleting(null); }
  };

  const domainTypeTag = (v: any) => {
    const t = mapDomainType(v);
    const color = t === 'Authoritative' ? 'green' : t === 'InternalRelay' ? 'blue' : 'orange';
    return <Tag color={color}>{t}</Tag>;
  };

  const cols: ColumnsType<any> = [
    { title: 'Nom',    dataIndex: 'Name',       sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Domaine', dataIndex: 'DomainName' },
    { title: 'Type',   dataIndex: 'DomainType', render: domainTypeTag },
    { title: 'Défaut', dataIndex: 'Default', render: v =>
        (v === true || String(v).toLowerCase() === 'true') ? <Tag color="gold">Défaut</Tag> : null },
    { title: 'Actions', render: (_, row) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Modifier</Button>
        <Popconfirm
          title={`Supprimer le domaine "${row.Name}" ?`}
          description="Cette action est irréversible."
          onConfirm={() => remove(row.Name)}
          okText="Supprimer" cancelText="Annuler" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} loading={deleting === row.Name}>Supprimer</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Nouveau domaine</Button>
      </Space>
      <Table dataSource={domains} columns={cols} rowKey="Name" loading={loading} size="small"
        pagination={{ pageSize: 20 }} footer={() => `${domains.length} domaine(s)`} />

      {/* Édition */}
      <Modal title="Modifier le domaine accepté" open={!!editModal}
        onCancel={() => setEditModal(null)} onOk={() => editForm.submit()}
        confirmLoading={saving} okText="Enregistrer" cancelText="Annuler">
        <Form form={editForm} layout="vertical" onFinish={save}>
          <Form.Item label="Type de domaine" name="DomainType">
            <Select options={DOMAIN_TYPES} />
          </Form.Item>
          <Form.Item label="Définir comme domaine par défaut" name="MakeDefault" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      {/* Création */}
      <Modal title="Nouveau domaine accepté" open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={saving} okText="Créer" cancelText="Annuler">
        <Form form={createForm} layout="vertical" onFinish={create}>
          <Form.Item label="Nom" name="Name" rules={[{ required: true, message: 'Requis' }]}>
            <Input placeholder="ex: pdulab.ovh" />
          </Form.Item>
          <Form.Item label="Nom de domaine" name="DomainName" rules={[{ required: true, message: 'Requis' }]}>
            <Input placeholder="ex: pdulab.ovh" />
          </Form.Item>
          <Form.Item label="Type" name="DomainType" initialValue="Authoritative" rules={[{ required: true }]}>
            <Select options={DOMAIN_TYPES} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ============================================================================
// Politiques d'adresse e-mail
// ============================================================================
const INCLUDED_RECIPIENTS_OPTIONS = [
  { value: 'AllRecipients',  label: 'Tous les destinataires' },
  { value: 'MailboxUsers',   label: 'Boîtes aux lettres' },
  { value: 'MailUsers',      label: 'Utilisateurs de messagerie' },
  { value: 'MailContacts',   label: 'Contacts de messagerie' },
  { value: 'MailGroups',     label: 'Groupes de distribution' },
  { value: 'Resources',      label: 'Ressources (salles/équipements)' },
];

function EmailAddressPoliciesTab() {
  const [policies, setPolicies]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [applying, setApplying]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen]   = useState(false);
  const [editRow, setEditRow]     = useState<any | null>(null);
  const [saving, setSaving]       = useState(false);
  const [createForm]              = Form.useForm();
  const [editForm]                = Form.useForm();

  const load = async () => {
    setLoading(true);
    try   { setPolicies(await exchangeApi.getEmailAddressPolicies()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const apply = async (name: string) => {
    setApplying(name);
    try   { await exchangeApi.applyEmailAddressPolicy(name); message.success(`Politique "${name}" appliquée`); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setApplying(null); }
  };

  const remove = async (name: string) => {
    setDeleting(name);
    try   { await exchangeApi.deleteEmailAddressPolicy(name); message.success(`Politique "${name}" supprimée`); load(); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setDeleting(null); }
  };

  const create = async (values: any) => {
    setSaving(true);
    try {
      await exchangeApi.createEmailAddressPolicy(values);
      message.success(`Politique "${values.Name}" créée`);
      setCreateOpen(false); createForm.resetFields(); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  const openEdit = (row: any) => {
    setEditRow(row);
    editForm.setFieldsValue({
      SmtpTemplate: row.EnabledPrimarySMTPAddressTemplate || '',
      IncludedRecipients: row.RecipientFilterType === 'Custom' || row.RecipientFilterType === '2' ? undefined : 'AllRecipients',
      Priority: typeof row.Priority === 'number' ? row.Priority : undefined,
    });
    setEditOpen(true);
  };

  const saveEdit = async (values: any) => {
    if (!editRow) return;
    setSaving(true);
    try {
      await exchangeApi.updateEmailAddressPolicy(editRow.Name, values);
      message.success(`Politique "${editRow.Name}" modifiée`);
      setEditOpen(false); setEditRow(null); editForm.resetFields(); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  const mapFilterType = (v: any) => {
    const s = String(v ?? '');
    const map: Record<string, [string, string]> = {
      '0': ['Hérité', 'default'], 'Legacy': ['Hérité', 'default'],
      '1': ['Prédéfini', 'green'], 'Precanned': ['Prédéfini', 'green'],
      '2': ['Personnalisé', 'blue'], 'Custom': ['Personnalisé', 'blue'],
    };
    const [label, color] = map[s] ?? [s || '-', 'default'];
    return <Tag color={color}>{label}</Tag>;
  };

  const cols: ColumnsType<any> = [
    { title: 'Nom',            dataIndex: 'Name',      sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Priorité',       dataIndex: 'Priority',  width: 80 },
    { title: 'Type de filtre', dataIndex: 'RecipientFilterType', render: mapFilterType },
    { title: 'Modèle SMTP',    dataIndex: 'EnabledPrimarySMTPAddressTemplate',
      render: v => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: 'Modifié le',     dataIndex: 'WhenChanged', render: fmt },
    { title: 'Actions', render: (_, row) => (
      <Space>
        <Popconfirm title={`Appliquer "${row.Name}" ?`} onConfirm={() => apply(row.Name)} okText="Oui" cancelText="Non">
          <Button size="small" icon={<PlayCircleOutlined />} loading={applying === row.Name}>Appliquer</Button>
        </Popconfirm>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Modifier</Button>
        <Popconfirm
          title={`Supprimer la politique "${row.Name}" ?`}
          description="Cette action est irréversible."
          onConfirm={() => remove(row.Name)}
          okText="Supprimer" cancelText="Annuler" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} loading={deleting === row.Name}>Supprimer</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Nouvelle politique</Button>
      </Space>
      <Table dataSource={policies} columns={cols} rowKey="Name" loading={loading} size="small"
        pagination={{ pageSize: 20 }} footer={() => `${policies.length} politique(s)`} />

      <Modal title="Nouvelle politique d'adresse e-mail" open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={saving} okText="Créer" cancelText="Annuler">
        <Form form={createForm} layout="vertical" onFinish={create}>
          <Form.Item label="Nom" name="Name" rules={[{ required: true, message: 'Requis' }]}>
            <Input placeholder="ex: Politique OVH" />
          </Form.Item>
          <Form.Item label="Modèle SMTP" name="SmtpTemplate" rules={[{ required: true, message: 'Requis' }]}
            tooltip="ex: SMTP:%g.%s@domain.com  (%g=prénom, %s=nom, %d=domaine)">
            <Input placeholder="SMTP:%g.%s@domain.com" />
          </Form.Item>
          <Form.Item label="Destinataires inclus" name="IncludedRecipients" initialValue="AllRecipients" rules={[{ required: true }]}>
            <Select options={INCLUDED_RECIPIENTS_OPTIONS} />
          </Form.Item>
          <Form.Item label="Priorité" name="Priority" tooltip="Laisser vide pour priorité automatique">
            <InputNumber min={1} style={{ width: '100%' }} placeholder="(automatique)" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editRow ? `Modifier "${editRow.Name}"` : 'Modifier la politique'} open={editOpen}
        onCancel={() => { setEditOpen(false); setEditRow(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={saving} okText="Enregistrer" cancelText="Annuler">
        <Form form={editForm} layout="vertical" onFinish={saveEdit}>
          <Form.Item label="Modèle SMTP" name="SmtpTemplate"
            tooltip="ex: SMTP:%g.%s@domain.com  (%g=prénom, %s=nom, %d=domaine)">
            <Input placeholder="SMTP:%g.%s@domain.com" />
          </Form.Item>
          <Form.Item label="Destinataires inclus" name="IncludedRecipients">
            <Select options={INCLUDED_RECIPIENTS_OPTIONS} allowClear placeholder="(inchangé)" />
          </Form.Item>
          <Form.Item label="Priorité" name="Priority" tooltip="Laisser vide pour ne pas modifier">
            <InputNumber min={1} style={{ width: '100%' }} placeholder="(inchangé)" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ============================================================================
// Page principale Flux de messagerie
// ============================================================================
const VALID_TABS = new Set(['rules', 'domains', 'policies', 'connectors', 'tracking', 'queues']);

export default function MailFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab  = searchParams.get('tab') ?? 'rules';
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'rules';
  const onChange = (key: string) => setSearchParams({ tab: key }, { replace: true });

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <DeploymentUnitOutlined style={{ marginRight: 8 }} />
        Flux de messagerie
      </Title>
      <Tabs
        activeKey={activeTab}
        onChange={onChange}
        type="card"
        size="middle"
        items={[
          { key: 'rules',      label: 'Règles',                      children: <TransportRuleList /> },
          { key: 'domains',    label: 'Domaines acceptés',           children: <AcceptedDomainsTab /> },
          { key: 'policies',   label: "Politiques d'adresse e-mail", children: <EmailAddressPoliciesTab /> },
          { key: 'connectors', label: 'Connecteurs',                 children: <Connectors /> },
          { key: 'tracking',   label: 'Suivi des messages',          children: <MessageTracking /> },
          { key: 'queues',     label: "Files d'attente",             children: <QueueList /> },
        ]}
      />
    </div>
  );
}
