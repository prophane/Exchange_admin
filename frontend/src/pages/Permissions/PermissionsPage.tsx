import { useEffect, useState } from 'react';
import { Table, Typography, Tag, message, Tabs, Button, Modal, Form, Input, Space, Popconfirm, Tooltip, Divider, Switch } from 'antd';
import { ReloadOutlined, LockOutlined, PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, MinusCircleOutlined, UserAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

function RoleGroupsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  // Edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();

  // Members modal
  const [membersVisible, setMembersVisible] = useState(false);
  const [membersGroup, setMembersGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getRoleGroups()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Exchange 2010 RoleGroupType enum: 0 = Standard, 1 = LinkedRoleGroup
  const ROLE_GROUP_TYPE: Record<number, { label: string; color: string }> = {
    0: { label: 'Standard',              color: 'blue'   },
    1: { label: 'Lié (LinkedRoleGroup)', color: 'purple' },
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      await exchangeApi.createRoleGroup(values.name, values.description);
      message.success(`Groupe "${values.name}" créé`);
      createForm.resetFields();
      setCreateVisible(false);
      load();
    } catch (e: any) {
      if (e?.message) message.error(`Erreur: ${e.message}`);
    } finally { setCreateLoading(false); }
  };

  const openEdit = (row: any) => {
    setEditTarget(row);
    editForm.setFieldsValue({ description: row.Description || '' });
    setEditVisible(true);
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      await exchangeApi.updateRoleGroup(editTarget.Name, values.description);
      message.success(`Groupe "${editTarget.Name}" modifié`);
      setEditVisible(false);
      load();
    } catch (e: any) {
      if (e?.message) message.error(`Erreur: ${e.message}`);
    } finally { setEditLoading(false); }
  };

  const handleDelete = async (name: string) => {
    try {
      await exchangeApi.deleteRoleGroup(name);
      message.success(`Groupe "${name}" supprimé`);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const openMembers = async (row: any) => {
    setMembersGroup(row);
    setMembersVisible(true);
    setMembersLoading(true);
    try { setMembers(await exchangeApi.getRoleGroupMembers(row.Name)); }
    catch (e: any) { message.error(`Erreur membres: ${e.message}`); }
    finally { setMembersLoading(false); }
  };

  const handleAddMember = async () => {
    const trimmed = addMemberInput.trim();
    if (!trimmed) return;
    setAddMemberLoading(true);
    try {
      await exchangeApi.addRoleGroupMember(membersGroup.Name, trimmed);
      message.success(`Membre "${trimmed}" ajouté`);
      setAddMemberInput('');
      setMembers(await exchangeApi.getRoleGroupMembers(membersGroup.Name));
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setAddMemberLoading(false); }
  };

  const handleRemoveMember = async (memberName: string) => {
    try {
      await exchangeApi.removeRoleGroupMember(membersGroup.Name, memberName);
      message.success(`Membre "${memberName}" retiré`);
      setMembers(await exchangeApi.getRoleGroupMembers(membersGroup.Name));
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    {
      title: 'Type',
      dataIndex: 'RoleGroupType',
      width: 180,
      render: v => {
        const n = parseInt(String(v), 10);
        const t = !isNaN(n) && ROLE_GROUP_TYPE[n] ? ROLE_GROUP_TYPE[n] : { label: String(v || 'Standard'), color: 'default' };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    { title: 'Description', dataIndex: 'Description', ellipsis: true },
    { title: 'Modifié le', dataIndex: 'WhenChanged', width: 130, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    {
      title: 'Actions', width: 130, align: 'center',
      render: (_, row) => (
        <Space>
          <Tooltip title="Membres"><Button size="small" icon={<TeamOutlined />} onClick={() => openMembers(row)} /></Tooltip>
          <Tooltip title="Modifier"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Tooltip>
          <Popconfirm title={`Supprimer le groupe "${row.Name}" ?`} okText="Oui" cancelText="Non" onConfirm={() => handleDelete(row.Name)}>
            <Tooltip title="Supprimer"><Button size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Table
        rowKey="Name" dataSource={data} columns={columns} loading={loading}
        size="small" pagination={{ pageSize: 20 }}
        footer={() => `${data.length} groupes de rôles`}
        title={() => (
          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateVisible(true)}>Nouveau groupe</Button>
            <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
          </Space>
        )}
      />

      {/* ── Create modal ── */}
      <Modal title="Nouveau groupe de rôles" open={createVisible} onCancel={() => { setCreateVisible(false); createForm.resetFields(); }}
        onOk={handleCreate} okText="Créer" confirmLoading={createLoading}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Nom obligatoire' }]}>
            <Input placeholder="Ex: HelpDesk Tier2" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Description du groupe (optionnel)" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Edit modal ── */}
      <Modal title={`Modifier "${editTarget?.Name}"`} open={editVisible} onCancel={() => setEditVisible(false)}
        onOk={handleEdit} okText="Enregistrer" confirmLoading={editLoading}>
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Members modal ── */}
      <Modal title={<><TeamOutlined style={{ marginRight: 8 }} />Membres — {membersGroup?.Name}</>}
        open={membersVisible} onCancel={() => { setMembersVisible(false); setAddMemberInput(''); }}
        footer={null} width={620}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            prefix={<UserAddOutlined />}
            placeholder="Alias ou nom du membre à ajouter"
            value={addMemberInput}
            onChange={e => setAddMemberInput(e.target.value)}
            onPressEnter={handleAddMember}
            style={{ flex: 1 }}
          />
          <Button type="primary" icon={<PlusOutlined />} loading={addMemberLoading} onClick={handleAddMember}>Ajouter</Button>
        </div>
        <Divider style={{ margin: '8px 0' }} />
        <Table
          rowKey="Name" dataSource={members} loading={membersLoading} size="small"
          pagination={false}
          columns={[
            { title: 'Nom', dataIndex: 'Name' },
            { title: 'Type', dataIndex: 'RecipientType', width: 160, render: v => v ? <Tag>{String(v)}</Tag> : '-' },
            { title: 'Email', dataIndex: 'PrimarySmtpAddress', ellipsis: true },
            {
              title: '', width: 60, align: 'center',
              render: (_, m) => (
                <Popconfirm title={`Retirer "${m.Name}" ?`} okText="Oui" cancelText="Non" onConfirm={() => handleRemoveMember(m.Name)}>
                  <Button size="small" danger icon={<MinusCircleOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
          footer={() => `${members.length} membre(s)`}
        />
      </Modal>
    </>
  );
}

function AssignmentPoliciesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getRoleAssignmentPolicies()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    setEditTarget(row);
    editForm.setFieldsValue({ description: row.Description ?? '' });
    setEditVisible(true);
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    setEditLoading(true);
    try {
      await exchangeApi.updateRoleAssignmentPolicy(editTarget.Name, values.description ?? '');
      message.success('Stratégie mise à jour');
      setEditVisible(false);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setEditLoading(false); }
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', render: v => v ? <Tag color="green">Oui</Tag> : <Tag>Non</Tag> },
    { title: 'Description', dataIndex: 'Description', ellipsis: true },
    { title: 'Modifié le', dataIndex: 'WhenChanged', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    {
      title: '', width: 60, align: 'center',
      render: (_, row) => (
        <Tooltip title="Modifier"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Tooltip>
      ),
    },
  ];

  return (
    <>
      <Table rowKey="Name" dataSource={data} columns={columns} loading={loading}
        size="small" pagination={{ pageSize: 20 }}
        footer={() => `${data.length} stratégies`}
        title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
      <Modal title={`Modifier "${editTarget?.Name}"`} open={editVisible}
        onCancel={() => setEditVisible(false)} onOk={handleEdit}
        okText="Enregistrer" confirmLoading={editLoading}>
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function OwaTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getOwaMailboxPolicies()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    setEditTarget(row);
    editForm.setFieldsValue({
      instantMessagingEnabled: !!row.InstantMessagingEnabled,
      calendarEnabled: !!row.CalendarEnabled,
      tasksEnabled: !!row.TasksEnabled,
    });
    setEditVisible(true);
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    setEditLoading(true);
    try {
      await exchangeApi.updateOwaMailboxPolicy(editTarget.Name, {
        instantMessagingEnabled: values.instantMessagingEnabled,
        calendarEnabled: values.calendarEnabled,
        tasksEnabled: values.tasksEnabled,
      });
      message.success('Stratégie OWA mise à jour');
      setEditVisible(false);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setEditLoading(false); }
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', render: v => v ? <Tag color="green">Oui</Tag> : <Tag>Non</Tag> },
    { title: 'Messagerie instantanée', dataIndex: 'InstantMessagingEnabled', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Activé' : 'Désactivé'}</Tag> },
    { title: 'Calendrier', dataIndex: 'CalendarEnabled', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Activé' : 'Désactivé'}</Tag> },
    { title: 'Tâches', dataIndex: 'TasksEnabled', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Activé' : 'Désactivé'}</Tag> },
    { title: 'Modifié le', dataIndex: 'WhenChanged', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    {
      title: '', width: 60, align: 'center',
      render: (_, row) => (
        <Tooltip title="Modifier"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Tooltip>
      ),
    },
  ];

  return (
    <>
      <Table rowKey="Name" dataSource={data} columns={columns} loading={loading}
        size="small" pagination={{ pageSize: 20 }}
        footer={() => `${data.length} stratégies OWA`}
        title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
      <Modal title={`Modifier "${editTarget?.Name}"`} open={editVisible}
        onCancel={() => setEditVisible(false)} onOk={handleEdit}
        okText="Enregistrer" confirmLoading={editLoading}>
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="instantMessagingEnabled" label="Messagerie instantanée" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="calendarEnabled" label="Calendrier" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="tasksEnabled" label="Tâches" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function PermissionsPage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <LockOutlined style={{ marginRight: 8 }} />
        Autorisations
      </Title>
      <Tabs items={[
        { key: 'role-groups', label: 'Groupes de rôles', children: <RoleGroupsTab /> },
        { key: 'assignment', label: "Stratégies d'attribution de rôles", children: <AssignmentPoliciesTab /> },
        { key: 'owa', label: 'Stratégies Outlook Web App', children: <OwaTab /> },
      ]} />
    </div>
  );
}
