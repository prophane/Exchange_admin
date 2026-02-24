import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs,
  Table,
  Button,
  Tag,
  Typography,
  Form,
  Input,
  Switch,
  message,
  Spin,
  Descriptions,
  Space,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ============================================================================
// Helpers
// ============================================================================

const formatDate = (v: any) =>
  v ? dayjs(v.toString()).format('DD/MM/YYYY HH:mm') : '-';

const strVal = (v: any) => (v != null ? String(v) : '-');

// ============================================================================
// Onglet Organisation > Général
// ============================================================================

function OrgGeneral() {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try   { setConfig(await exchangeApi.getOrganizationConfig()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    form.setFieldsValue({
      HierarchicalAddressBookEnabled:          config.HierarchicalAddressBookEnabled,
      MailTipsAllTipsEnabled:                  config.MailTipsAllTipsEnabled,
      MailTipsExternalRecipientsTipsEnabled:   config.MailTipsExternalRecipientsTipsEnabled,
      MailTipsGroupMetricsEnabled:             config.MailTipsGroupMetricsEnabled,
      MailTipsLargeAudienceThreshold:          config.MailTipsLargeAudienceThreshold,
      MailTipsMailboxSourcedTipsEnabled:       config.MailTipsMailboxSourcedTipsEnabled,
      CustomerFeedbackEnabled:                 config.CustomerFeedbackEnabled,
      ReadTrackingEnabled:                     config.ReadTrackingEnabled,
    });
    setEditing(true);
  };

  const save = async (values: any) => {
    setSaving(true);
    try {
      await exchangeApi.setOrganizationConfig(values);
      message.success('Configuration mise à jour');
      setEditing(false); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        {!editing ? (
          <>
            <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
            <Button type="primary" icon={<EditOutlined />} onClick={startEdit}>Modifier</Button>
          </>
        ) : (
          <>
            <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>Annuler</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => form.submit()}>Enregistrer</Button>
          </>
        )}
      </Space>

      {editing ? (
        <Form form={form} layout="vertical" onFinish={save} style={{ maxWidth: 560 }}>
          <Form.Item label="Carnet d'adresses hiérarchique (HAB)" name="HierarchicalAddressBookEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="MailTips — toutes les infos" name="MailTipsAllTipsEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="MailTips — destinataires externes" name="MailTipsExternalRecipientsTipsEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="MailTips — métriques de groupe" name="MailTipsGroupMetricsEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="MailTips — seuil grande audience" name="MailTipsLargeAudienceThreshold">
            <Input type="number" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="MailTips — données boîte source" name="MailTipsMailboxSourcedTipsEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Participation au programme d'amélioration" name="CustomerFeedbackEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Suivi de lecture des messages" name="ReadTrackingEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      ) : (
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="Nom de l'organisation" span={2}>
            <strong>{strVal(config.Name)}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="OU par défaut (groupes de distribution)" span={2}>
            {strVal(config.DistributionGroupDefaultOU) || <Text type="secondary">Non défini</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Carnet d'adresses hiérarchique">
            <BoolTag value={config.HierarchicalAddressBookEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="Suivi de lecture">
            <BoolTag value={config.ReadTrackingEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="MailTips (toutes)" >
            <BoolTag value={config.MailTipsAllTipsEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="MailTips (destinataires ext.)">
            <BoolTag value={config.MailTipsExternalRecipientsTipsEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="MailTips (métriques groupe)">
            <BoolTag value={config.MailTipsGroupMetricsEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="MailTips (seuil grande audience)">
            {strVal(config.MailTipsLargeAudienceThreshold)}
          </Descriptions.Item>
          <Descriptions.Item label="MailTips (données boîte source)">
            <BoolTag value={config.MailTipsMailboxSourcedTipsEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="Programme d'amélioration">
            <BoolTag value={config.CustomerFeedbackEnabled} />
          </Descriptions.Item>
          <Descriptions.Item label="Créé le">{formatDate(config.WhenCreated)}</Descriptions.Item>
          <Descriptions.Item label="Modifié le">{formatDate(config.WhenChanged)}</Descriptions.Item>
        </Descriptions>
      )}
    </div>
  );
}

// ============================================================================
// Onglet Organisation > Transport
// ============================================================================

function OrgTransport() {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setConfig(await exchangeApi.getTransportConfig());
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (values: any) => {
    setSaving(true);
    try {
      await exchangeApi.setTransportConfig(values);
      message.success('Configuration transport mise à jour');
      setEditing(false);
      load();
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        {!editing ? (
          <>
            <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
            <Button type="primary" icon={<EditOutlined />} onClick={() => {
              form.setFieldsValue({
                MaxSendSize: config.MaxSendSize,
                MaxReceiveSize: config.MaxReceiveSize,
                MaxRecipientEnvelopeLimit: config.MaxRecipientEnvelopeLimit,
                ShadowRedundancyEnabled: config.ShadowRedundancyEnabled,
              });
              setEditing(true);
            }}>Modifier</Button>
          </>
        ) : (
          <>
            <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>Annuler</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => form.submit()}>Enregistrer</Button>
          </>
        )}
      </Space>

      {editing ? (
        <Form form={form} layout="vertical" onFinish={save} style={{ maxWidth: 600 }}>
          <Form.Item label="Taille maximale d'envoi" name="MaxSendSize">
            <Input placeholder="Ex: 10MB" />
          </Form.Item>
          <Form.Item label="Taille maximale de réception" name="MaxReceiveSize">
            <Input placeholder="Ex: 10MB" />
          </Form.Item>
          <Form.Item label="Limite maximale de destinataires" name="MaxRecipientEnvelopeLimit">
            <Input placeholder="Ex: 500" />
          </Form.Item>
          <Form.Item label="Redondance Shadow" name="ShadowRedundancyEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      ) : (
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="Taille max d'envoi">{strVal(config.MaxSendSize)}</Descriptions.Item>
          <Descriptions.Item label="Taille max de réception">{strVal(config.MaxReceiveSize)}</Descriptions.Item>
          <Descriptions.Item label="Limite destinataires">{strVal(config.MaxRecipientEnvelopeLimit)}</Descriptions.Item>
          <Descriptions.Item label="Redondance Shadow"><BoolTag value={config.ShadowRedundancyEnabled} /></Descriptions.Item>
          <Descriptions.Item label="Journalisation messagerie vocale"><BoolTag value={config.VoicemailJournalingEnabled} /></Descriptions.Item>
          <Descriptions.Item label="Auth. notification DSN (externe)">{strVal(config.ExternalDsnReportingAuthority)}</Descriptions.Item>
          <Descriptions.Item label="Auth. notification DSN (interne)">{strVal(config.InternalDsnReportingAuthority)}</Descriptions.Item>
          <Descriptions.Item label="Durée de rétention Dumpster">{strVal(config.MaxDumpsterTime)}</Descriptions.Item>
        </Descriptions>
      )}
    </div>
  );
}

// ============================================================================
// ============================================================================
// Onglet Utilisateurs > Rétention
// ============================================================================

function UsersRetention() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        exchangeApi.getRetentionPolicies(),
        exchangeApi.getRetentionPolicyTags(),
      ]);
      setPolicies(p);
      setTags(t);
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const policyCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', key: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', key: 'IsDefault', render: (v) => v ? <Tag color="gold">Défaut</Tag> : null },
    { title: 'Modifié le', dataIndex: 'WhenChanged', key: 'WhenChanged', render: formatDate },
  ];

  const tagCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', key: 'Name' },
    { title: 'Type', dataIndex: 'Type', key: 'Type', render: (v) => <Tag>{v}</Tag> },
    { title: 'Action', dataIndex: 'RetentionAction', key: 'RetentionAction', render: (v) => <Tag color="orange">{v}</Tag> },
    { title: 'Limite d\'âge', dataIndex: 'AgeLimitForRetention', key: 'AgeLimitForRetention', render: strVal },
    { title: 'Par défaut', dataIndex: 'IsDefaultTag', key: 'IsDefaultTag', render: (v) => v ? <Tag color="gold">Défaut</Tag> : null },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
      </Space>
      <Title level={5} style={{ marginTop: 8 }}>Politiques de rétention</Title>
      <Table dataSource={policies} columns={policyCols} rowKey="Name" loading={loading} size="small" style={{ marginBottom: 24 }} />
      <Title level={5}>Balises de rétention</Title>
      <Table dataSource={tags} columns={tagCols} rowKey="Name" loading={loading} size="small" />
    </>
  );
}

// ============================================================================
// Onglet Utilisateurs > Rôles & Plans
// ============================================================================

function UsersRolesPlans() {
  const [roles, setRoles] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        exchangeApi.getRoleAssignmentPolicies(),
        exchangeApi.getMailboxPlans(),
      ]);
      setRoles(r);
      setPlans(p);
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const roleCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', key: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', key: 'IsDefault', render: (v) => v ? <Tag color="gold">Défaut</Tag> : null },
    { title: 'Description', dataIndex: 'Description', key: 'Description', ellipsis: true },
    { title: 'Modifié le', dataIndex: 'WhenChanged', key: 'WhenChanged', render: formatDate },
  ];

  const planCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'DisplayName', key: 'DisplayName' },
    { title: 'Alias', dataIndex: 'Alias', key: 'Alias' },
    { title: 'Max envoi', dataIndex: 'MaxSendSize', key: 'MaxSendSize', render: strVal },
    { title: 'Max réception', dataIndex: 'MaxReceiveSize', key: 'MaxReceiveSize', render: strVal },
    { title: 'Quota avertissement', dataIndex: 'IssueWarningQuota', key: 'IssueWarningQuota', render: strVal },
    { title: 'Quota interdiction envoi', dataIndex: 'ProhibitSendQuota', key: 'ProhibitSendQuota', render: strVal },
    { title: 'Par défaut', dataIndex: 'IsDefault', key: 'IsDefault', render: (v) => v ? <Tag color="gold">Défaut</Tag> : null },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
      </Space>
      <Title level={5} style={{ marginTop: 8 }}>Politiques d'attribution de rôles</Title>
      <Table dataSource={roles} columns={roleCols} rowKey="Name" loading={loading} size="small" style={{ marginBottom: 24 }} />
      <Title level={5}>Plans de boîtes aux lettres</Title>
      <Table dataSource={plans} columns={planCols} rowKey="DisplayName" loading={loading} size="small" />
    </>
  );
}

// ============================================================================
// Onglet Utilisateurs > Carnets d'adresses
// ============================================================================

function UsersAddressBooks() {
  const [lists, setLists] = useState<any[]>([]);
  const [gals, setGals] = useState<any[]>([]);
  const [oabs, setOabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [l, g, o] = await Promise.all([
        exchangeApi.getAddressLists(),
        exchangeApi.getGlobalAddressLists(),
        exchangeApi.getOfflineAddressBooks(),
      ]);
      setLists(l);
      setGals(g);
      setOabs(o);
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const baseCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', key: 'Name' },
    { title: 'Type de filtre', dataIndex: 'RecipientFilterType', key: 'RecipientFilterType', render: (v: any) => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Filtre', dataIndex: 'RecipientFilter', key: 'RecipientFilter', ellipsis: true, render: (v: any) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '-'}</span> },
  ];

  const galCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', key: 'Name' },
    { title: 'Type de filtre', dataIndex: 'RecipientFilterType', key: 'RecipientFilterType', render: (v: any) => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Par défaut', dataIndex: 'IsDefaultGlobalAddressList', key: 'IsDefaultGlobalAddressList', render: (v: any) => v ? <Tag color="gold">Défaut</Tag> : null },
  ];

  const oabCols: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', key: 'Name' },
    { title: 'Boîte génératrice', dataIndex: 'GeneratingMailbox', key: 'GeneratingMailbox', render: (v: any) => v || '-' },
    { title: 'Par défaut', dataIndex: 'IsDefault', key: 'IsDefault', render: (v: any) => v ? <Tag color="gold">Défaut</Tag> : null },
    { title: 'Dernière requête', dataIndex: 'LastRequestedTime', key: 'LastRequestedTime', render: (v: any) => v ? formatDate(v) : '-' },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
      </Space>
      <Title level={5} style={{ marginTop: 8 }}>Listes d'adresses globales (GAL)</Title>
      <Table dataSource={gals} columns={galCols} rowKey="Name" loading={loading} size="small" style={{ marginBottom: 24 }} />
      <Title level={5}>Listes d'adresses</Title>
      <Table dataSource={lists} columns={baseCols} rowKey="Name" loading={loading} size="small" style={{ marginBottom: 24 }} />
      <Title level={5}>Carnets d'adresses hors connexion (OAB)</Title>
      <Table dataSource={oabs} columns={oabCols} rowKey="Name" loading={loading} size="small" />
    </>
  );
}

// ============================================================================
// Partage (Sharing Policies)
// ============================================================================

function OrgSharing() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try   { setData(await exchangeApi.getSharingPolicies()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cols: ColumnsType<any> = [
    { title: 'Nom',     dataIndex: 'Name',    sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Activée', dataIndex: 'Enabled', render: v => <BoolTag value={v} /> },
    { title: 'Domaines cibles', dataIndex: 'Domains',
      render: v => Array.isArray(v) ? v.map((d: string) => <Tag key={d}>{d}</Tag>) : strVal(v) },
    { title: 'Modifié le', dataIndex: 'WhenChanged', render: formatDate },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Actualiser</Button>
      </Space>
      <Table dataSource={data} columns={cols} rowKey="Name" loading={loading} size="small"
        pagination={{ pageSize: 20 }} footer={() => `${data.length} stratégie(s) de partage`} />
    </>
  );
}

// ============================================================================
// Applications (Add-ins) — stub Exchange 2010
// ============================================================================

function OrgAddIns() {
  return (
    <Alert
      type="info"
      showIcon
      message="Fonctionnalité non disponible sur Exchange 2010"
      description="La gestion des applications (add-ins OWA) est disponible à partir d'Exchange 2013. Sur Exchange 2010, configurez les options OWA directement dans les stratégies de boîte aux lettres OWA (menu Autorisations → Stratégies OWA)."
      style={{ maxWidth: 700 }}
    />
  );
}

// ============================================================================
// Composant utilitaire
// ============================================================================

function BoolTag({ value }: { value: any }) {
  const isTrue = value === true || value === 'True' || value === 1;
  return isTrue
    ? <Tag color="green" icon={<CheckCircleOutlined />}>Activé</Tag>
    : <Tag color="default" icon={<CloseCircleOutlined />}>Désactivé</Tag>;
}

// ============================================================================
// Page principale Organisation
// ============================================================================

const VALID_TABS = new Set(['general','sharing','addins','transport','addresses','retention','roles']);

export default function Organization() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'general';
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'general';

  const onChange = (key: string) => setSearchParams({ tab: key }, { replace: true });

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Organisation Exchange</Title>
      <Tabs
        activeKey={activeTab}
        onChange={onChange}
        type="card"
        size="middle"
        items={[
          { key: 'general',   label: 'Général',                children: <OrgGeneral /> },
          { key: 'sharing',   label: 'Partage',                children: <OrgSharing /> },
          { key: 'addins',    label: 'Applications',           children: <OrgAddIns /> },
          { key: 'transport', label: 'Transport',              children: <OrgTransport /> },
          { key: 'addresses', label: "Listes d'adresses",      children: <UsersAddressBooks /> },
          { key: 'retention', label: 'Rétention',              children: <UsersRetention /> },
          { key: 'roles',     label: 'Rôles & Plans',          children: <UsersRolesPlans /> },
        ]}
      />
    </div>
  );
}
