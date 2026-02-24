import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Typography, Tag, message, Tabs, Button, Modal, Form, Input, Popconfirm, Space, Tooltip } from 'antd';
import { ReloadOutlined, CloudServerOutlined, EyeOutlined, DatabaseOutlined, SafetyCertificateOutlined, GlobalOutlined, PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import DatabaseList from '../Databases/DatabaseList';
import Certificates from '../Configuration/Certificates';
import VirtualDirectories from '../Configuration/VirtualDirectories';

const { Title } = Typography;

// Déduction des rôles à partir des champs booléens (Is*Server) retournés par Get-ExchangeServer.
// Ces champs sont fiables quelle que soit la version d'Exchange (2010, 2013, 2016, SE).
function ServerRoleTags({ record }: { record: any }) {
  if (!record) return <Tag>-</Tag>;

  const tags: JSX.Element[] = [];

  // Champs booléens disponibles depuis Exchange 2010
  if (record.IsEdgeServer === true || record.IsEdgeServer === 'True')
    tags.push(<Tag key="edge" color="orange">Edge</Tag>);
  if (record.IsMailboxServer === true || record.IsMailboxServer === 'True')
    tags.push(<Tag key="mbx" color="blue">Boîte aux lettres</Tag>);
  if (record.IsHubTransportServer === true || record.IsHubTransportServer === 'True')
    tags.push(<Tag key="hub" color="blue">HubTransport</Tag>);
  if (record.IsClientAccessServer === true || record.IsClientAccessServer === 'True'
      && record.IsMailboxServer !== true && record.IsMailboxServer !== 'True')
    tags.push(<Tag key="cas" color="blue">CAS</Tag>);
  if (record.IsUnifiedMessagingServer === true || record.IsUnifiedMessagingServer === 'True')
    tags.push(<Tag key="um" color="blue">UM</Tag>);

  return tags.length > 0 ? <>{tags}</> : <Tag>-</Tag>;
}

function ServersTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthModal, setHealthModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState('');
  const [health, setHealth] = useState<any[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getExchangeServers()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const viewHealth = async (name: string) => {
    setSelectedServer(name);
    setHealthModal(true);
    setHealthLoading(true);
    try {
      const res = await exchangeApi.getServerHealth(name);
      setHealth(res);
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setHealthLoading(false); }
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'FQDN', dataIndex: 'Fqdn' },
    { title: 'Édition', dataIndex: 'Edition', render: (v: any) => {
      const EDITION_MAP: Record<string, string> = {
        '0': 'None', '1': 'Standard', '2': 'Enterprise', '3': 'Datacenter',
        '4': 'StandardEval', '5': 'EnterpriseEval',
        'Standard': 'Standard', 'Enterprise': 'Enterprise',
        'StandardEvaluation': 'Standard (Eval)', 'EnterpriseEvaluation': 'Enterprise (Eval)',
        'Datacenter': 'Datacenter',
      };
      const label = EDITION_MAP[String(v)] ?? String(v);
      const color = label.startsWith('Enterprise') ? 'gold' : label.startsWith('Datacenter') ? 'red' : 'purple';
      return <Tag color={color}>{label}</Tag>;
    }},
    { title: 'Version', dataIndex: 'AdminDisplayVersion', ellipsis: true },
    { title: 'Rôles', render: (_: any, record: any) => <ServerRoleTags record={record} /> },
    { title: 'Site', dataIndex: 'Site' },
    {
      title: 'Actions',
      render: (_, rec) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => viewHealth(rec.Name)}>Santé</Button>
      ),
    },
  ];

  return (
    <>
      <Table rowKey="Name" dataSource={data} columns={columns} loading={loading} size="small"
        pagination={{ pageSize: 20 }} footer={() => `${data.length} serveur(s)`}
        title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />

      <Modal title={`État des services — ${selectedServer}`} open={healthModal}
        onCancel={() => setHealthModal(false)} footer={null} width={700}>
        <Table
          rowKey="Role"
          dataSource={health}
          loading={healthLoading}
          size="small"
          columns={[
            { title: 'Rôle', dataIndex: 'Role' },
            {
              title: 'Services requis',
              dataIndex: 'RequiredServicesRunning',
              render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'OK' : 'ERREUR'}</Tag>,
            },
          ]}
        />
      </Modal>
    </>
  );
}

function DagTab() {
  const [data, setData]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [servers, setServers]       = useState<any[]>([]);
  // Create / Edit modal
  const [formModal, setFormModal]   = useState<{ open: boolean; record?: any }>({ open: false });
  const [saving, setSaving]         = useState(false);
  const [form] = Form.useForm();
  // Members modal
  const [memberModal, setMemberModal] = useState<{ open: boolean; dag?: any }>({ open: false });
  const [addServerInput, setAddServerInput] = useState('');
  const [memberSaving, setMemberSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dags, svrs] = await Promise.all([
        exchangeApi.getDatabaseAvailabilityGroups(),
        exchangeApi.getExchangeServers().catch(() => []),
      ]);
      setData(dags);
      setServers(svrs);
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { form.resetFields(); setFormModal({ open: true }); };
  const openEdit   = (rec: any) => { form.setFieldsValue({ name: rec.Name, witnessServer: rec.WitnessServer, witnessDirectory: rec.WitnessDirectory }); setFormModal({ open: true, record: rec }); };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (formModal.record) {
        await exchangeApi.updateDag(formModal.record.Name, { witnessServer: values.witnessServer, witnessDirectory: values.witnessDirectory });
        message.success('DAG modifié');
      } else {
        await exchangeApi.createDag({ name: values.name, witnessServer: values.witnessServer, witnessDirectory: values.witnessDirectory });
        message.success('DAG créé');
      }
      setFormModal({ open: false });
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  const handleDelete = async (name: string) => {
    try {
      await exchangeApi.deleteDag(name);
      message.success(`DAG «${name}» supprimé`);
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const openMembers = (rec: any) => { setAddServerInput(''); setMemberModal({ open: true, dag: rec }); };

  const handleAddMember = async () => {
    if (!addServerInput.trim() || !memberModal.dag) return;
    setMemberSaving(true);
    try {
      await exchangeApi.addDagMember(memberModal.dag.Name, addServerInput.trim());
      message.success(`Serveur ajouté au DAG`);
      setAddServerInput('');
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setMemberSaving(false); }
  };

  const handleRemoveMember = async (serverName: string) => {
    if (!memberModal.dag) return;
    try {
      await exchangeApi.removeDagMember(memberModal.dag.Name, serverName);
      message.success(`Serveur retiré du DAG`);
      // update local modal dag members
      const updated = data.find(d => d.Name === memberModal.dag.Name);
      if (updated) setMemberModal(m => ({ ...m, dag: updated }));
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const dagMembers: string[] = (() => {
    if (!memberModal.dag) return [];
    const v = memberModal.dag.OperationalServers;
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String);
    return String(v).split(',').map((s: string) => s.trim()).filter(Boolean);
  })();

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Serveur témoin', dataIndex: 'WitnessServer' },
    { title: 'Répertoire témoin', dataIndex: 'WitnessDirectory' },
    {
      title: 'Membres',
      dataIndex: 'OperationalServers',
      render: v => {
        const arr = Array.isArray(v) ? v : String(v || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        return arr.length ? arr.map((s: string) => <Tag key={s} color="blue">{s}</Tag>) : <Tag>-</Tag>;
      },
    },
    { title: 'Créé le', dataIndex: 'WhenCreated', render: v => v ? new Date(v).toLocaleDateString('fr-FR') : '-' },
    {
      title: 'Actions',
      width: 180,
      render: (_, rec) => (
        <Space>
          <Tooltip title="Gérer les membres">
            <Button size="small" icon={<TeamOutlined />} onClick={() => openMembers(rec)} />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          </Tooltip>
          <Popconfirm title={`Supprimer le DAG «${rec.Name}» ?`} okText="Supprimer" okType="danger" cancelText="Annuler" onConfirm={() => handleDelete(rec.Name)}>
            <Tooltip title="Supprimer">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        rowKey="Name"
        dataSource={data}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        footer={() => `${data.length} DAG`}
        title={() => (
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>
            <Button icon={<PlusOutlined />} type="primary" onClick={openCreate} size="small">Nouveau DAG</Button>
          </Space>
        )}
      />

      {/* Create / Edit Modal */}
      <Modal
        title={formModal.record ? `Modifier le DAG — ${formModal.record.Name}` : 'Nouveau groupe de disponibilité (DAG)'}
        open={formModal.open}
        onCancel={() => setFormModal({ open: false })}
        onOk={handleSave}
        okText={formModal.record ? 'Enregistrer' : 'Créer'}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!formModal.record && (
            <Form.Item name="name" label="Nom du DAG" rules={[{ required: true, message: 'Nom requis' }]}>
              <Input placeholder="DAG-01" />
            </Form.Item>
          )}
          <Form.Item name="witnessServer" label="Serveur témoin (Witness Server)" rules={[{ required: !formModal.record, message: 'Requis' }]}>
            <Input placeholder="ex: fileserver01.contoso.com" />
          </Form.Item>
          <Form.Item name="witnessDirectory" label="Répertoire témoin" rules={[{ required: !formModal.record, message: 'Requis' }]}>
            <Input placeholder="ex: C:\DAGWitness\DAG-01" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Members Modal */}
      <Modal
        title={<span><TeamOutlined /> Membres du DAG — {memberModal.dag?.Name}</span>}
        open={memberModal.open}
        onCancel={() => setMemberModal({ open: false })}
        footer={null}
        width={540}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <strong>Membres actuels :</strong>
          {dagMembers.length === 0 ? (
            <div style={{ color: '#999', marginTop: 8 }}>Aucun membre</div>
          ) : (
            <Table
              size="small"
              pagination={false}
              rowKey={r => r}
              dataSource={dagMembers.map(s => ({ name: s }))}
              style={{ marginTop: 8 }}
              columns={[
                { title: 'Serveur', dataIndex: 'name' },
                {
                  title: '', width: 60,
                  render: (_, rec) => (
                    <Popconfirm title={`Retirer ${rec.name} du DAG ?`} okText="Retirer" okType="danger" cancelText="Annuler" onConfirm={() => handleRemoveMember(rec.name)}>
                      <Button size="small" danger icon={<MinusCircleOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          )}
        </div>
        <div>
          <strong>Ajouter un serveur membre :</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Input
              placeholder="Nom du serveur Exchange"
              value={addServerInput}
              onChange={e => setAddServerInput(e.target.value)}
              onPressEnter={handleAddMember}
              style={{ flex: 1 }}
            />
            <Button type="primary" icon={<PlusOutlined />} loading={memberSaving} onClick={handleAddMember}>
              Ajouter
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const VALID_TABS = ['servers', 'dag', 'databases', 'certificates', 'virtualdirs'];

export default function ServersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'servers';
  const activeTab = VALID_TABS.includes(tab) ? tab : 'servers';

  useEffect(() => {
    if (!VALID_TABS.includes(tab)) {
      setSearchParams({ tab: 'servers' }, { replace: true });
    }
  }, [tab]);

  const items = [
    { key: 'servers',      label: <span><CloudServerOutlined /> Serveurs Exchange</span>,         children: <ServersTab /> },
    { key: 'dag',         label: <span><CloudServerOutlined /> Groupes de disponibilité (DAG)</span>, children: <DagTab /> },
    { key: 'databases',   label: <span><DatabaseOutlined /> Bases de données</span>,              children: <DatabaseList /> },
    { key: 'certificates',label: <span><SafetyCertificateOutlined /> Certificats</span>,          children: <Certificates /> },
    { key: 'virtualdirs', label: <span><GlobalOutlined /> Répertoires virtuels</span>,            children: <VirtualDirectories /> },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <CloudServerOutlined style={{ marginRight: 8 }} />
        Serveurs
      </Title>
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
        items={items}
      />
    </div>
  );
}
