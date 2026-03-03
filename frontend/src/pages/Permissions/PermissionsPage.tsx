import { useEffect, useState } from 'react';
import { Table, Typography, Tag, message, Tabs, Button, Modal, Form, Input, Space, Popconfirm, Tooltip, Divider, Switch, Checkbox, Radio } from 'antd';
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
  // Création
  const [createVisible, setCreateVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();
  // Modification
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

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      await exchangeApi.createRoleAssignmentPolicy(values.name, values.description);
      message.success(`Stratégie "${values.name}" créée`);
      createForm.resetFields();
      setCreateVisible(false);
      load();
    } catch (e: any) {
      if (e?.message) message.error(`Erreur: ${e.message}`);
    } finally { setCreateLoading(false); }
  };

  const openEdit = (row: any) => {
    setEditTarget(row);
    editForm.setFieldsValue({
      newName: row.Name,
      description: row.Description ?? '',
      isDefault: !!row.IsDefault,
    });
    setEditVisible(true);
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    setEditLoading(true);
    try {
      await exchangeApi.updateRoleAssignmentPolicy(editTarget.Name, {
        newName: values.newName !== editTarget.Name ? values.newName : undefined,
        description: values.description ?? '',
        isDefault: values.isDefault && !editTarget.IsDefault ? true : undefined,
      });
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
        title={() => (
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>
            <Button icon={<PlusOutlined />} onClick={() => setCreateVisible(true)} size="small" type="primary">Nouvelle stratégie</Button>
          </Space>
        )} />

      <Modal title="Nouvelle stratégie d'attribution de rôles" open={createVisible}
        onCancel={() => { setCreateVisible(false); createForm.resetFields(); }}
        onOk={handleCreate} okText="Créer" confirmLoading={createLoading}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Entrez un nom' }]}>
            <Input placeholder="Ex: Policy-Restricted" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Description optionnelle" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`Modifier "${editTarget?.Name}"`} open={editVisible}
        onCancel={() => setEditVisible(false)} onOk={handleEdit}
        okText="Enregistrer" confirmLoading={editLoading}>
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="newName" label="Nom" rules={[{ required: true, message: 'Entrez un nom' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked">
            <Checkbox disabled={!!editTarget?.IsDefault}>
              Stratégie par défaut{editTarget?.IsDefault ? ' (déjà active)' : ''}
            </Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function OwaTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // Création
  const [createVisible, setCreateVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();
  // Modification
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

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      await exchangeApi.createOwaPolicy(values.name);
      message.success(`Stratégie "${values.name}" créée`);
      createForm.resetFields();
      setCreateVisible(false);
      load();
    } catch (e: any) {
      if (e?.message) message.error(`Erreur: ${e.message}`);
    } finally { setCreateLoading(false); }
  };

  const openEdit = (row: any) => {
    setEditTarget(row);
    editForm.setFieldsValue({
      // Communication
      instantMessagingEnabled: !!row.InstantMessagingEnabled,
      textMessagingEnabled: !!row.TextMessagingEnabled,
      activeSyncIntegrationEnabled: !!row.ActiveSyncIntegrationEnabled,
      contactsEnabled: !!row.ContactsEnabled,
      allAddressListsEnabled: !!row.AllAddressListsEnabled,
      // Information
      journalEnabled: !!row.JournalEnabled,
      notesEnabled: !!row.NotesEnabled,
      rulesEnabled: !!row.RulesEnabled,
      recoverDeletedItemsEnabled: !!row.RecoverDeletedItemsEnabled,
      // Sécurité
      changePasswordEnabled: !!row.ChangePasswordEnabled,
      junkEmailEnabled: !!row.JunkEmailEnabled,
      // Expérience utilisateur
      themeSelectionEnabled: !!row.ThemeSelectionEnabled,
      premiumClientEnabled: !!row.PremiumClientEnabled,
      signaturesEnabled: !!row.SignaturesEnabled,
      // Gestion du temps
      calendarEnabled: !!row.CalendarEnabled,
      tasksEnabled: !!row.TasksEnabled,
      remindersAndNotificationsEnabled: !!row.RemindersAndNotificationsEnabled,
      // Accès fichiers
      directFileAccessOnPublicComputersEnabled: !!row.DirectFileAccessOnPublicComputersEnabled,
      directFileAccessOnPrivateComputersEnabled: !!row.DirectFileAccessOnPrivateComputersEnabled,
      // Accès hors connexion
      allowOfflineOn: row.AllowOfflineOn || 'AllowedForSupportedBrowsers',
    });
    setEditVisible(true);
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    setEditLoading(true);
    try {
      await exchangeApi.updateOwaMailboxPolicy(editTarget.Name, {
        instantMessagingEnabled: values.instantMessagingEnabled,
        textMessagingEnabled: values.textMessagingEnabled,
        activeSyncIntegrationEnabled: values.activeSyncIntegrationEnabled,
        contactsEnabled: values.contactsEnabled,
        allAddressListsEnabled: values.allAddressListsEnabled,
        journalEnabled: values.journalEnabled,
        notesEnabled: values.notesEnabled,
        rulesEnabled: values.rulesEnabled,
        recoverDeletedItemsEnabled: values.recoverDeletedItemsEnabled,
        changePasswordEnabled: values.changePasswordEnabled,
        junkEmailEnabled: values.junkEmailEnabled,
        themeSelectionEnabled: values.themeSelectionEnabled,
        premiumClientEnabled: values.premiumClientEnabled,
        signaturesEnabled: values.signaturesEnabled,
        calendarEnabled: values.calendarEnabled,
        tasksEnabled: values.tasksEnabled,
        directFileAccessOnPublicComputersEnabled: values.directFileAccessOnPublicComputersEnabled,
        directFileAccessOnPrivateComputersEnabled: values.directFileAccessOnPrivateComputersEnabled,
        allowOfflineOn: values.allowOfflineOn,
      });
      message.success('Stratégie OWA mise à jour');
      setEditVisible(false);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setEditLoading(false); }
  };

  const CB = ({ name, label }: { name: string; label: string }) => (
    <Form.Item name={name} valuePropName="checked" style={{ marginBottom: 6 }}>
      <Checkbox>{label}</Checkbox>
    </Form.Item>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 4, color: '#1677ff' }}>{title}</div>
  );

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
        title={() => (
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>
            <Button icon={<PlusOutlined />} onClick={() => setCreateVisible(true)} size="small" type="primary">Nouvelle stratégie</Button>
          </Space>
        )} />

      <Modal title="Nouvelle stratégie OWA" open={createVisible}
        onCancel={() => { setCreateVisible(false); createForm.resetFields(); }}
        onOk={handleCreate} okText="Créer" confirmLoading={createLoading}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Entrez un nom' }]}>
            <Input placeholder="Ex: OWA-Restricted" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Modifier "${editTarget?.Name}"`}
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={handleEdit}
        okText="Enregistrer"
        confirmLoading={editLoading}
        width={700}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Form form={editForm} layout="vertical" size="small">
          <Tabs
            size="small"
            items={[
              {
                key: 'general',
                label: 'général',
                children: (
                  <div style={{ padding: '8px 0' }}>
                    <Form.Item label="Nom de la stratégie">
                      <Input value={editTarget?.Name} disabled />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'features',
                label: 'fonctionnalités',
                children: (
                  <div style={{ padding: '4px 0', maxHeight: 420, overflowY: 'auto' }}>
                    <SectionTitle title="Gestion des communications" />
                    <CB name="instantMessagingEnabled" label="Messagerie instantanée" />
                    <CB name="textMessagingEnabled" label="Messagerie texte" />
                    <CB name="activeSyncIntegrationEnabled" label="Exchange ActiveSync" />
                    <CB name="contactsEnabled" label="Contacts" />
                    <CB name="allAddressListsEnabled" label="Toutes les listes d'adresses" />
                    <Divider style={{ margin: '8px 0' }} />
                    <SectionTitle title="Gestion des informations" />
                    <CB name="journalEnabled" label="Journalisation" />
                    <CB name="notesEnabled" label="Notes" />
                    <CB name="rulesEnabled" label="Règles de la boîte de réception" />
                    <CB name="recoverDeletedItemsEnabled" label="Récupérer les éléments supprimés" />
                    <Divider style={{ margin: '8px 0' }} />
                    <SectionTitle title="Sécurité" />
                    <CB name="changePasswordEnabled" label="Modifier le mot de passe" />
                    <CB name="junkEmailEnabled" label="Filtrage du courrier indésirable" />
                    <Divider style={{ margin: '8px 0' }} />
                    <SectionTitle title="Expérience utilisateur" />
                    <CB name="themeSelectionEnabled" label="Thèmes" />
                    <CB name="premiumClientEnabled" label="Client Premium" />
                    <CB name="signaturesEnabled" label="Signature électronique" />
                    <Divider style={{ margin: '8px 0' }} />
                    <SectionTitle title="Gestion du temps" />
                    <CB name="calendarEnabled" label="Calendrier" />
                    <CB name="tasksEnabled" label="Tâches" />
                    <CB name="remindersAndNotificationsEnabled" label="Rappels et notifications" />
                  </div>
                ),
              },
              {
                key: 'fileaccess',
                label: 'accès aux fichiers',
                children: (
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ marginBottom: 12, color: '#555', fontSize: 13 }}>
                      Sélectionnez comment les utilisateurs peuvent afficher et accéder aux pièces jointes depuis des ordinateurs publics ou privés.
                    </div>
                    <SectionTitle title="Ordinateur public ou partagé" />
                    <CB name="directFileAccessOnPublicComputersEnabled" label="Accès direct aux fichiers" />
                    <Divider style={{ margin: '8px 0' }} />
                    <SectionTitle title="Ordinateur privé ou OWA pour appareils" />
                    <CB name="directFileAccessOnPrivateComputersEnabled" label="Accès direct aux fichiers" />
                  </div>
                ),
              },
              {
                key: 'offline',
                label: 'accès hors connexion',
                children: (
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ marginBottom: 12, color: '#555', fontSize: 13 }}>
                      Indiquez comment et quand les utilisateurs peuvent activer l'accès hors connexion à leur messagerie.
                    </div>
                    <div style={{ marginBottom: 8 }}>Activer l'accès hors connexion :</div>
                    <Form.Item name="allowOfflineOn">
                      <Radio.Group>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <Radio value="AllowedForSupportedBrowsers">Toujours</Radio>
                          <Radio value="AllowedForSupportedDevices">Ordinateur privé</Radio>
                          <Radio value="NoAccess">Jamais</Radio>
                        </div>
                      </Radio.Group>
                    </Form.Item>
                  </div>
                ),
              },
            ]}
          />
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
