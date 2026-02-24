import { useEffect, useState } from 'react';
import { Table, Button, Typography, Tag, message, Switch, Tooltip, Modal, Form, Input, Select, InputNumber, Space, Popconfirm } from 'antd';
import { ReloadOutlined, DeploymentUnitOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const CONDITION_TYPES = [
  { value: 'SentTo',          label: 'Destinataire spécifique (SentTo)' },
  { value: 'From',            label: 'Expéditeur spécifique (From)' },
  { value: 'SubjectContains', label: 'Sujet contient' },
  { value: 'SentToScope',     label: 'Périmètre destinataire (SentToScope)' },
  { value: 'FromScope',       label: 'Périmètre expéditeur (FromScope)' },
];

const SCOPE_VALUES = ['InOrganization', 'NotInOrganization', 'ExternalPartner', 'ExternalNonPartner'];

const ACTION_TYPES = [
  { value: 'Reject',     label: 'Rejeter le message', needsValue: true,  valuePlaceholder: 'Raison du rejet (ex: Interdit)' },
  { value: 'Delete',     label: 'Supprimer silencieusement', needsValue: false },
  { value: 'Redirect',   label: 'Rediriger vers', needsValue: true, valuePlaceholder: 'Email de redirection' },
  { value: 'CopyTo',     label: 'Copier vers', needsValue: true, valuePlaceholder: 'Email de copie' },
  { value: 'Quarantine', label: 'Mettre en quarantaine', needsValue: false },
];

export default function TransportRuleList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const actionType = Form.useWatch('actionType', form);
  const conditionType = Form.useWatch('conditionType', form);

  const load = async () => {
    setLoading(true);
    try { setItems(await exchangeApi.getTransportRules()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleState = async (name: string, currentEnabled: boolean) => {
    setTogglingId(name);
    try {
      await exchangeApi.setTransportRuleState(name, !currentEnabled);
      message.success(`Règle ${!currentEnabled ? 'activée' : 'désactivée'}`);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setTogglingId(null); }
  };

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      await exchangeApi.createTransportRule({
        name: values.name,
        conditionType: values.conditionType,
        conditionValue: values.conditionValue,
        actionType: values.actionType,
        actionValue: values.actionValue,
        priority: values.priority,
        enabled: values.enabled !== false,
        comments: values.comments,
      });
      message.success(`Règle "${values.name}" créée`);
      setCreateVisible(false);
      form.resetFields();
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setCreating(false); }
  };

  const handleDelete = async (name: string) => {
    try {
      await exchangeApi.deleteTransportRule(name);
      message.success(`Règle "${name}" supprimée`);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const selectedAction = ACTION_TYPES.find(a => a.value === actionType);
  const isScopeCondition = conditionType === 'FromScope' || conditionType === 'SentToScope';

  const columns: ColumnsType<any> = [
    {
      title: 'État', dataIndex: 'State', width: 70,
      render: (v, rec) => {
        const enabled = String(v).toLowerCase() !== 'disabled';
        return <Switch checked={enabled} loading={togglingId === rec.Name} onChange={() => toggleState(rec.Name, enabled)} size="small" />;
      },
    },
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Priorité', dataIndex: 'Priority', width: 80 },
    {
      title: 'Source', key: 'source',
      render: (_, rec) => {
        const scope = rec.FromScope ? String(rec.FromScope) : null;
        const addrs: string[] = Array.isArray(rec.From) ? rec.From : (rec.From ? [String(rec.From)] : []);
        if (!scope && addrs.length === 0) return <Tag color="default">Tous expéditeurs</Tag>;
        return <span>{scope && <Tag color="geekblue">{scope}</Tag>}{addrs.map((a, i) => <Tag key={i}>{a}</Tag>)}</span>;
      },
    },
    {
      title: 'Destination', key: 'dest',
      render: (_, rec) => {
        const scope = rec.SentToScope ? String(rec.SentToScope) : null;
        const addrs: string[] = Array.isArray(rec.SentTo) ? rec.SentTo : (rec.SentTo ? [String(rec.SentTo)] : []);
        if (!scope && addrs.length === 0) return <Tag color="default">Tous destinataires</Tag>;
        return <span>{scope && <Tag color="purple">{scope}</Tag>}{addrs.map((a, i) => <Tag key={i}>{a}</Tag>)}</span>;
      },
    },
    {
      title: 'Action', key: 'action',
      render: (_, rec) => {
        if (rec.DeleteMessage === true || String(rec.DeleteMessage) === 'True') return <Tag color="red">Supprimer</Tag>;
        if (rec.Quarantine === true || String(rec.Quarantine) === 'True') return <Tag color="orange">Quarantaine</Tag>;
        if (rec.RejectMessageReasonText) return <Tooltip title={`${rec.RejectMessageEnhancedStatusCode || '5.7.1'} — ${rec.RejectMessageReasonText}`}><Tag color="volcano">Rejeter</Tag></Tooltip>;
        const redirectTo: string[] = Array.isArray(rec.RedirectMessageTo) ? rec.RedirectMessageTo : (rec.RedirectMessageTo ? [String(rec.RedirectMessageTo)] : []);
        if (redirectTo.length > 0) return <Tooltip title={redirectTo.join(', ')}><Tag color="blue">Rediriger</Tag></Tooltip>;
        const addTo: string[] = Array.isArray(rec.AddToRecipients) ? rec.AddToRecipients : (rec.AddToRecipients ? [String(rec.AddToRecipients)] : []);
        if (addTo.length > 0) return <Tooltip title={addTo.join(', ')}><Tag color="cyan">Copier vers</Tag></Tooltip>;
        return <Tag>Autre</Tag>;
      },
    },
    {
      title: 'Description', dataIndex: 'Description', ellipsis: true,
      render: v => v ? <Tooltip title={v}><span>{String(v).slice(0, 50)}{String(v).length > 50 ? '…' : ''}</span></Tooltip> : '-',
    },
    { title: 'Modifiée', dataIndex: 'WhenChanged', width: 110, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    {
      title: '', width: 50,
      render: (_, rec) => (
        <Popconfirm title={`Supprimer la règle "${rec.Name}" ?`} okText="Supprimer" okType="danger" cancelText="Annuler" onConfirm={() => handleDelete(rec.Name)}>
          <Tooltip title="Supprimer">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <DeploymentUnitOutlined style={{ marginRight: 8 }} />
          Règles de transport
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>Nouvelle règle</Button>
        </Space>
      </div>

      <Table
        rowKey={(r) => r.Name || Math.random().toString()}
        dataSource={items}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
        footer={() => `Total: ${items.length} règles`}
      />

      <Modal
        title="Créer une règle de transport"
        open={createVisible}
        onCancel={() => { setCreateVisible(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Créer"
        cancelText="Annuler"
        confirmLoading={creating}
        width={580}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item label="Nom de la règle" name="name" rules={[{ required: true, message: 'Nom requis' }]}>
            <Input placeholder="ex: Bloquer domaine externe" />
          </Form.Item>

          <Form.Item label="Priorité" name="priority">
            <InputNumber min={0} max={999} placeholder="0 = première" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Condition (si...)" name="conditionType">
            <Select placeholder="Sélectionner une condition (vide = tous les messages)" allowClear>
              {CONDITION_TYPES.map(c => <Option key={c.value} value={c.value}>{c.label}</Option>)}
            </Select>
          </Form.Item>

          {conditionType && (
            <Form.Item label="Valeur de la condition" name="conditionValue" rules={[{ required: true, message: 'Valeur requise' }]}>
              {isScopeCondition ? (
                <Select placeholder="Sélectionner un périmètre">
                  {SCOPE_VALUES.map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select>
              ) : (
                <Input placeholder={conditionType === 'SubjectContains' ? 'ex: SPAM' : 'ex: user@domain.com'} />
              )}
            </Form.Item>
          )}

          <Form.Item label="Action (alors...)" name="actionType" rules={[{ required: true, message: 'Action requise' }]}>
            <Select placeholder="Sélectionner une action">
              {ACTION_TYPES.map(a => <Option key={a.value} value={a.value}>{a.label}</Option>)}
            </Select>
          </Form.Item>

          {selectedAction?.needsValue && (
            <Form.Item label="Valeur de l'action" name="actionValue" rules={[{ required: true, message: 'Valeur requise' }]}>
              <Input placeholder={selectedAction.valuePlaceholder} />
            </Form.Item>
          )}

          <Form.Item label="Commentaires" name="comments">
            <Input.TextArea rows={2} placeholder="Description optionnelle de la règle" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
