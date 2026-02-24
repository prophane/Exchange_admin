import { useEffect, useState } from 'react';
import { Table, Typography, Tag, message, Tabs, Button, Modal, Form, Input, Space, Popconfirm, Tooltip, Divider, Switch, Drawer } from 'antd';
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

// ── Composant réutilisable : rangée toggle avec description ──────────────────
function SettingRow({ name, label, description }: { name: string; label: string; description: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid #f0f0f0',
    }}>
      <div style={{ flex: 1, paddingRight: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{description}</div>
      </div>
      <Form.Item name={name} valuePropName="checked" noStyle><Switch /></Form.Item>
    </div>
  );
}

function OwaTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [saveLoading, setSaveLoading] = useState(false);
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
      instantMessagingEnabled:      !!row.InstantMessagingEnabled,
      textMessagingEnabled:         !!row.TextMessagingEnabled,
      activeSyncIntegrationEnabled: !!row.ActiveSyncIntegrationEnabled,
      contactsEnabled:              !!row.ContactsEnabled,
      journalEnabled:               !!row.JournalEnabled,
      changePasswordEnabled:        !!row.ChangePasswordEnabled,
      junkEmailEnabled:             !!row.JunkEmailEnabled,
      themeSelectionEnabled:        !!row.ThemeSelectionEnabled,
      premiumClientEnabled:         !!row.PremiumClientEnabled,
      weatherEnabled:               !!row.WeatherEnabled,
      placesEnabled:                !!row.PlacesEnabled,
      localEventsEnabled:           !!row.LocalEventsEnabled,
      interestingCalendarsEnabled:  !!row.InterestingCalendarsEnabled,
      calendarEnabled:              !!row.CalendarEnabled,
      tasksEnabled:                 !!row.TasksEnabled,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    const v = await editForm.validateFields();
    setSaveLoading(true);
    try {
      await exchangeApi.updateOwaMailboxPolicy(editTarget.Name, v);
      message.success('Stratégie OWA mise à jour');
      setDrawerOpen(false);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaveLoading(false); }
  };

  const BoolTag = ({ v }: { v: any }) =>
    <Tag color={v ? 'green' : 'default'} style={{ fontSize: 11 }}>{v ? 'Oui' : 'Non'}</Tag>;

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', width: 100, render: v => v ? <Tag color="green">Oui</Tag> : <Tag>Non</Tag> },
    { title: 'Mess. instant.', dataIndex: 'InstantMessagingEnabled', width: 120, render: v => <BoolTag v={v} /> },
    { title: 'ActiveSync',    dataIndex: 'ActiveSyncIntegrationEnabled', width: 100, render: v => <BoolTag v={v} /> },
    { title: 'Calendrier',   dataIndex: 'CalendarEnabled',  width: 100, render: v => <BoolTag v={v} /> },
    { title: 'Tâches',       dataIndex: 'TasksEnabled',     width: 80,  render: v => <BoolTag v={v} /> },
    { title: 'Premium',      dataIndex: 'PremiumClientEnabled', width: 80, render: v => <BoolTag v={v} /> },
    { title: 'Modifié le',   dataIndex: 'WhenChanged', width: 110, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
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
        size="small" pagination={{ pageSize: 20 }} scroll={{ x: true }}
        footer={() => `${data.length} stratégie(s) OWA`}
        title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />

      <Drawer
        title={
          <Space direction="vertical" size={0}>
            <span style={{ fontWeight: 600 }}>Stratégie OWA — {editTarget?.Name}</span>
            {editTarget?.IsDefault && <Tag color="blue" style={{ marginTop: 2 }}>Politique par défaut</Tag>}
          </Space>
        }
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Button type="primary" loading={saveLoading} onClick={handleSave}>Enregistrer</Button>
        }
      >
        <Form form={editForm} layout="vertical">

          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '0 0 4px' }}>
            📬 Communication
          </Divider>
          <SettingRow name="instantMessagingEnabled" label="Messagerie instantanée"
            description="Autorise l'accès à la messagerie instantanée (IM) depuis OWA." />
          <SettingRow name="textMessagingEnabled" label="Messagerie texte"
            description="Permet l'envoi et la réception de SMS depuis OWA." />
          <SettingRow name="activeSyncIntegrationEnabled" label="Exchange ActiveSync"
            description="Affiche l'onglet ActiveSync dans les paramètres du compte OWA." />
          <SettingRow name="contactsEnabled" label="Contacts"
            description="Autorise l'accès au carnet d'adresses personnel." />

          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '16px 0 4px' }}>
            📋 Informations
          </Divider>
          <SettingRow name="journalEnabled" label="Journalisation"
            description="Permet d'accéder au dossier Journal dans OWA." />

          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '16px 0 4px' }}>
            🔒 Sécurité
          </Divider>
          <SettingRow name="changePasswordEnabled" label="Changer le mot de passe"
            description="Permet à l'utilisateur de changer son mot de passe directement depuis OWA." />
          <SettingRow name="junkEmailEnabled" label="Filtrage courrier indésirable"
            description="Affiche les options de gestion du courrier indésirable dans OWA." />

          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '16px 0 4px' }}>
            ✨ Expérience utilisateur
          </Divider>
          <SettingRow name="themeSelectionEnabled" label="Thèmes"
            description="Permet à l'utilisateur de personnaliser le thème visuel d'OWA." />
          <SettingRow name="premiumClientEnabled" label="Client premium"
            description="Active la version complète d'OWA (désactiver force la version allégée)." />
          <SettingRow name="weatherEnabled" label="Météo"
            description="Affiche la météo dans le calendrier OWA." />
          <SettingRow name="placesEnabled" label="Lieux"
            description="Suggère des lieux lors de la création d'événements de calendrier." />
          <SettingRow name="localEventsEnabled" label="Événements locaux"
            description="Affiche des suggestions d'événements locaux dans le calendrier." />
          <SettingRow name="interestingCalendarsEnabled" label="Calendriers suggérés"
            description="Propose des calendriers d'intérêt général (sports, fêtes, etc.)." />

          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: '#555', fontWeight: 600, margin: '16px 0 4px' }}>
            📅 Agenda &amp; organisation
          </Divider>
          <SettingRow name="calendarEnabled" label="Calendrier"
            description="Autorise l'accès au module Calendrier dans OWA." />
          <SettingRow name="tasksEnabled" label="Tâches"
            description="Autorise l'accès au module Tâches dans OWA." />

        </Form>
      </Drawer>
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
