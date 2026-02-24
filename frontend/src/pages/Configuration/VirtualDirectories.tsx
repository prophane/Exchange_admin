import { useEffect, useRef, useState } from 'react';
import {
  Tabs, Table, Button, Space, Typography, message,
  Modal, Form, Input, Switch, Alert, Tooltip, Tag,
  Divider, Select, InputNumber, Badge, Spin,
} from 'antd';
import {
  ReloadOutlined, GlobalOutlined, EditOutlined, SaveOutlined,
  LockOutlined, LinkOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface VDir {
  Identity: string;
  Name?: string;
  Server?: string;
  InternalUrl?: string;
  ExternalUrl?: string;
  // Commun
  BasicAuthentication?: boolean;
  WindowsAuthentication?: boolean;
  FormsAuthentication?: boolean;
  DigestAuthentication?: boolean;
  OAuthAuthentication?: boolean;
  LiveIdNegotiate?: boolean;
  CertificateAuthentication?: boolean;
  RequireSSL?: boolean;
  // OWA spécifique
  LogonFormat?: string;
  DefaultDomain?: string;
  RedirectToOptimalOWAServer?: boolean;
  // EAS spécifique
  BasicAuthEnabled?: boolean;
  WindowsAuthEnabled?: boolean;
  // EWS spécifique
  MRSProxyEnabled?: boolean;
  // OAB spécifique
  PollInterval?: number;
  // RPC (Outlook Anywhere)
  InternalHostname?: string;
  ExternalHostname?: string;
  ExternalAuthenticationMethods?: any;
  IISAuthenticationMethods?: any;
  ExternalClientsRequireSsl?: boolean;
  InternalClientsRequireSsl?: boolean;
  SSLOffloading?: boolean;
  // MAPI over HTTP
  MapiHttpEnabled?: boolean;
  // type interne
  _dirType?: string;
}

export default function VirtualDirectories() {
  const [loading, setLoading]       = useState(false);
  const [authLoading, setAuthLoading] = useState(false); // inutilisé mais conservé pour compatibilité
  const [owaList, setOwaList]     = useState<VDir[]>([]);
  const [ecpList, setEcpList]     = useState<VDir[]>([]);
  const [easList, setEasList]     = useState<VDir[]>([]);
  const [ewsList, setEwsList]     = useState<VDir[]>([]);
  const [oabList, setOabList]     = useState<VDir[]>([]);
  const [psList, setPsList]       = useState<VDir[]>([]);
  const [rpcList, setRpcList]     = useState<VDir[]>([]);
  const [mapiList, setMapiList]   = useState<VDir[]>([]);
  const [mapiOrgEnabled, setMapiOrgEnabled] = useState<boolean | null>(null);
  const [editRec, setEditRec]     = useState<VDir | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form] = Form.useForm();

  // ── Server selector ────────────────────────────────────────────────────────
  const [servers, setServers]               = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined);

  const tag = (list: any[], type: string): VDir[] => list.map((d) => ({ ...d, _dirType: type }));

  const loadRef = useRef(0);

  const applyData = (all: { owa: any[]; ecp: any[]; eas: any[]; ews: any[]; oab: any[]; powershell: any[]; rpc: any[]; mapi: any[] }) => {
    setOwaList(tag(all.owa,        'owa'));
    setEcpList(tag(all.ecp,        'ecp'));
    setEasList(tag(all.eas,        'eas'));
    setEwsList(tag(all.ews,        'ews'));
    setOabList(tag(all.oab,        'oab'));
    setPsList( tag(all.powershell, 'powershell'));
    setRpcList(tag(all.rpc,        'rpc'));
    setMapiList(tag(all.mapi,      'mapi'));
  };

  const load = async () => {
    const id = ++loadRef.current;
    setLoading(true);
    setAuthLoading(false);
    try {
      // Une seule requête avec -ADPropertiesOnly : rapide (~5-10s) et contient TOUS les champs
      // (URLs + authentification) car Exchange stocke ces infos en AD.
      const data = await exchangeApi.getAllVirtualDirectories(selectedServer, true);
      if (id !== loadRef.current) return;
      applyData(data);
      // Statut MAPI au niveau organisation (en parallèle, non bloquant)
      exchangeApi.getOrganizationConfig()
        .then((cfg) => {
          const v = cfg?.MapiHttpEnabled;
          if (v === true || v === 'True') setMapiOrgEnabled(true);
          else if (v === false || v === 'False') setMapiOrgEnabled(false);
        })
        .catch(() => {});
    } catch (e: any) {
      if (id !== loadRef.current) return;
      message.error(`Erreur chargement : ${e.message}`);
    } finally {
      if (id === loadRef.current) {
        setLoading(false);
        setAuthLoading(false);
      }
    }
  };

  useEffect(() => {
    exchangeApi.getExchangeServers().then(setServers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [selectedServer]);

  const openEdit = (rec: VDir) => {
    setEditRec(rec);
    // Normalise : EAS utilise BasicAuthEnabled/WindowsAuthEnabled
    const vals = { ...rec };
    if (rec._dirType === 'eas') {
      (vals as any).BasicAuthentication = rec.BasicAuthEnabled;
      (vals as any).WindowsAuthentication = rec.WindowsAuthEnabled;
    }
    form.setFieldsValue(vals);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!editRec?._dirType) return;
      setSaving(true);
      // Re-mapper pour EAS
      if (editRec._dirType === 'eas') {
        values.BasicAuthEnabled = values.BasicAuthentication;
        values.WindowsAuthEnabled = values.WindowsAuthentication;
        delete values.BasicAuthentication;
        delete values.WindowsAuthentication;
      }
      await exchangeApi.updateVirtualDirectory(editRec._dirType, editRec.Identity, values);
      message.success('Répertoire virtuel mis à jour');
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(`Erreur : ${e?.response?.data?.error ?? e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Tags d'authentification dans le tableau
  const renderAuth = (rec: VDir) => {
    const tags: { label: string; color: string }[] = [];
    if (rec._dirType === 'rpc' || rec._dirType === 'mapi') {
      const methods = Array.isArray(rec.IISAuthenticationMethods)
        ? rec.IISAuthenticationMethods
        : rec.IISAuthenticationMethods ? [rec.IISAuthenticationMethods] : [];
      methods.forEach((m: any) => tags.push({ label: String(m), color: 'blue' }));
    } else if (rec._dirType === 'eas') {
      if (rec.BasicAuthEnabled)       tags.push({ label: 'Basic',     color: 'blue'   });
      if (rec.WindowsAuthEnabled)     tags.push({ label: 'Windows',   color: 'green'  });
      if (rec.CertificateAuthentication) tags.push({ label: 'Cert',   color: 'purple' });
    } else {
      if (rec.BasicAuthentication)    tags.push({ label: 'Basic',     color: 'blue'   });
      if (rec.WindowsAuthentication)  tags.push({ label: 'Windows',   color: 'green'  });
      if (rec.FormsAuthentication)    tags.push({ label: 'FBA',       color: 'orange' });
      if (rec.DigestAuthentication)   tags.push({ label: 'Digest',    color: 'cyan'   });
      if (rec.OAuthAuthentication)    tags.push({ label: 'OAuth',     color: 'lime'   });
      if (rec.CertificateAuthentication) tags.push({ label: 'Cert',   color: 'purple' });
    }
    if (!tags.length) return <Tag color="default">Aucune</Tag>;
    return <Space wrap size={4}>{tags.map((t) => <Tag key={t.label} color={t.color}>{t.label}</Tag>)}</Space>;
  };

  const renderBool = (v: unknown) => v
    ? <Badge status="success" text={<Text style={{ fontSize: 12 }}>Oui</Text>} />
    : <Badge status="default"  text={<Text type="secondary" style={{ fontSize: 12 }}>Non</Text>} />;

  const columns = (extras?: ColumnsType<VDir>): ColumnsType<VDir> => [
    {
      title: 'Identité', dataIndex: 'Identity', key: 'Identity', ellipsis: true,
      render: (v) => <strong style={{ fontSize: 12 }}>{v}</strong>,
    },
    {
      title: 'URL Interne', dataIndex: 'InternalUrl', key: 'InternalUrl', ellipsis: true,
      render: (v) => v
        ? <a href={v} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}><LinkOutlined /> {v}</a>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'URL Externe', dataIndex: 'ExternalUrl', key: 'ExternalUrl', ellipsis: true,
      render: (v) => v
        ? <a href={v} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}><LinkOutlined /> {v}</a>
        : <Text type="secondary">—</Text>,
    },
    { title: 'Authentification', key: 'auth', width: 220, render: (_, r) => renderAuth(r) },
    ...(extras ?? []),
    {
      title: '', key: 'actions', width: 48,
      render: (_, r) => (
        <Tooltip title="Modifier">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Tooltip>
      ),
    },
  ];

  // Champs du modal selon le type
  const renderFields = (type?: string) => {
    const isOwa  = type === 'owa';
    const isEcp  = type === 'ecp';
    const isEas  = type === 'eas';
    const isEws  = type === 'ews';
    const isOab  = type === 'oab';
    const isPs   = type === 'powershell';
    const isRpc  = type === 'rpc';
    const isMapi = type === 'mapi';

    return (
      <>
        {!isRpc && (
          <>
            <Divider><LinkOutlined /> URLs</Divider>
            <Form.Item name="InternalUrl" label="URL Interne">
              <Input prefix={<GlobalOutlined />} placeholder="https://serveur/..." />
            </Form.Item>
            <Form.Item name="ExternalUrl" label="URL Externe">
              <Input prefix={<GlobalOutlined />} placeholder="https://mail.domaine.com/..." />
            </Form.Item>
          </>
        )}

        <Divider><LockOutlined /> {isRpc ? 'Configuration RPC' : 'Authentification'}</Divider>

        {isRpc ? (
          <>
            <Form.Item name="InternalHostname" label="Hostname interne">
              <Input prefix={<GlobalOutlined />} placeholder="mail.domaine.local" />
            </Form.Item>
            <Form.Item name="ExternalHostname" label="Hostname externe">
              <Input prefix={<GlobalOutlined />} placeholder="mail.domaine.com" />
            </Form.Item>
            <Form.Item name="ExternalClientsRequireSsl" label="SSL requis (externe)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="InternalClientsRequireSsl" label="SSL requis (interne)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="SSLOffloading" label="SSL Offloading" valuePropName="checked"><Switch /></Form.Item>
          </>
        ) : isMapi ? (
          <>
            <Alert
              type="info"
              showIcon
              message="Activation MAPI over HTTP"
              description={<>Le paramètre <strong>MapiHttpEnabled</strong> se configure au niveau de l'organisation via <strong>Set-OrganizationConfig -MapiHttpEnabled $true</strong>, pas au niveau du répertoire virtuel.</>}
              style={{ marginBottom: 8 }}
            />
          </>
        ) : isEas ? (
          <>
            <Form.Item name="BasicAuthentication" label="Basic" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="WindowsAuthentication" label="Windows (NTLM/Negotiate)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="CertificateAuthentication" label="Certificat client" valuePropName="checked"><Switch /></Form.Item>
          </>
        ) : isPs ? (
          <>
            <Form.Item name="BasicAuthentication" label="Basic" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="WindowsAuthentication" label="Windows (Kerberos/NTLM)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="CertificateAuthentication" label="Certificat client" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="RequireSSL" label="Exiger SSL" valuePropName="checked"><Switch /></Form.Item>
          </>
        ) : isOab ? (
          <>
            <Form.Item name="BasicAuthentication" label="Basic" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="WindowsAuthentication" label="Windows (NTLM/Negotiate)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="DigestAuthentication" label="Digest" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="RequireSSL" label="Exiger SSL" valuePropName="checked"><Switch /></Form.Item>
            <Divider>Paramètres OAB</Divider>
            <Form.Item name="PollInterval" label="Intervalle de sondage (min)">
              <InputNumber min={1} max={1440} style={{ width: '100%' }} />
            </Form.Item>
          </>
        ) : isEws ? (
          <>
            <Form.Item name="BasicAuthentication" label="Basic" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="WindowsAuthentication" label="Windows (NTLM/Negotiate)" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="DigestAuthentication" label="Digest" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="OAuthAuthentication" label="OAuth" valuePropName="checked"><Switch /></Form.Item>
            <Divider>Paramètres EWS</Divider>
            <Form.Item name="MRSProxyEnabled" label="MRS Proxy activé (migrations)" valuePropName="checked"><Switch /></Form.Item>
          </>
        ) : (
          /* OWA / ECP */
          <>
            <Form.Item name="BasicAuthentication" label="Basic" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="WindowsAuthentication" label="Windows (NTLM/Negotiate)" valuePropName="checked"><Switch /></Form.Item>
            {(isOwa || isEcp) && (
              <Form.Item name="FormsAuthentication" label="Forms-Based Authentication (FBA)" valuePropName="checked"><Switch /></Form.Item>
            )}
            <Form.Item name="DigestAuthentication" label="Digest" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="OAuthAuthentication" label="OAuth" valuePropName="checked"><Switch /></Form.Item>

            {(isOwa || isEcp) && (
              <>
                <Divider>Connexion</Divider>
                <Form.Item name="DefaultDomain" label="Domaine par défaut">
                  <Input placeholder="TLS-LAB" />
                </Form.Item>
              </>
            )}
            {isOwa && (
              <>
                <Form.Item name="LogonFormat" label="Format de connexion">
                  <Select>
                    <Select.Option value="FullDomain">Domaine complet (domaine\utilisateur)</Select.Option>
                    <Select.Option value="UserName">Nom d'utilisateur seul</Select.Option>
                    <Select.Option value="PrincipalName">UPN (utilisateur@domaine.com)</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="RedirectToOptimalOWAServer" label="Rediriger vers serveur OWA optimal" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </>
            )}
          </>
        )}
      </>
    );
  };

  // Pour RPC : pas de colonnes URL (hostnames à la place)
  const rpcColumns = (extras?: ColumnsType<VDir>): ColumnsType<VDir> => [
    {
      title: 'Identité', dataIndex: 'Identity', key: 'Identity', ellipsis: true,
      render: (v) => <strong style={{ fontSize: 12 }}>{v}</strong>,
    },
    { title: 'Authentification', key: 'auth', width: 220, render: (_, r) => renderAuth(r) },
    ...(extras ?? []),
    {
      title: '', key: 'actions', width: 48,
      render: (_, r) => (
        <Tooltip title="Modifier">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Tooltip>
      ),
    },
  ];

  const tabProps = (list: VDir[], extras?: ColumnsType<VDir>, useRpcCols = false) => ({
    columns: useRpcCols ? rpcColumns(extras) : columns(extras),
    dataSource: list,
    rowKey: (r: VDir) => r.Identity,
    loading,
    pagination: false as const,
    size: 'small' as const,
  });

  const owaExtras: ColumnsType<VDir> = [
    { title: 'Format connexion', dataIndex: 'LogonFormat', key: 'LogonFormat', width: 140,
      render: (v) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Domaine défaut', dataIndex: 'DefaultDomain', key: 'DefaultDomain', width: 120,
      render: (v) => v || <Text type="secondary">—</Text> },
  ];

  const ewsExtras: ColumnsType<VDir> = [
    { title: 'MRS Proxy', dataIndex: 'MRSProxyEnabled', key: 'MRSProxyEnabled', width: 100,
      render: (v) => renderBool(v) },
  ];

  const oabExtras: ColumnsType<VDir> = [
    { title: 'SSL requis', dataIndex: 'RequireSSL', key: 'RequireSSL', width: 90,
      render: (v) => renderBool(v) },
    { title: 'Sondage (min)', dataIndex: 'PollInterval', key: 'PollInterval', width: 110,
      render: (v) => v ?? <Text type="secondary">—</Text> },
  ];

  const psExtras: ColumnsType<VDir> = [
    { title: 'SSL requis', dataIndex: 'RequireSSL', key: 'RequireSSL', width: 90,
      render: (v) => renderBool(v) },
  ];

  const rpcExtras: ColumnsType<VDir> = [
    { title: 'Hostname interne', dataIndex: 'InternalHostname', key: 'InternalHostname', ellipsis: true,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'Hostname externe', dataIndex: 'ExternalHostname', key: 'ExternalHostname', ellipsis: true,
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'SSL Offloading', dataIndex: 'SSLOffloading', key: 'SSLOffloading', width: 110,
      render: (v) => renderBool(v) },
  ];

  const mapiExtras: ColumnsType<VDir> = [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}><GlobalOutlined /> Répertoires Virtuels</Title>
        <Space>
          {servers.length > 1 && (
            <Select
              placeholder="Tous les serveurs"
              allowClear
              style={{ width: 200 }}
              value={selectedServer}
              onChange={(v) => setSelectedServer(v)}
              options={servers.map((s: any) => ({ value: s.Name ?? s.Fqdn, label: s.Name ?? s.Fqdn }))}
            />
          )}
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
        </Space>
      </div>

      <Alert
        message="Configuration IIS Exchange"
        description="Modifiez les URLs et méthodes d'authentification. Un redémarrage IIS peut être nécessaire pour appliquer certains changements."
        type="info" showIcon style={{ marginBottom: 16 }}
      />

      <Tabs defaultActiveKey="owa">
        <TabPane tab="Outlook Web App (OWA)" key="owa">
          <Table {...tabProps(owaList, owaExtras)} />
        </TabPane>
        <TabPane tab="Exchange Control Panel (ECP)" key="ecp">
          <Table {...tabProps(ecpList)} />
        </TabPane>
        <TabPane tab="ActiveSync (EAS)" key="eas">
          <Table {...tabProps(easList)} />
        </TabPane>
        <TabPane tab="Exchange Web Services (EWS)" key="ews">
          <Table {...tabProps(ewsList, ewsExtras)} />
        </TabPane>
        <TabPane tab="Offline Address Book (OAB)" key="oab">
          <Table {...tabProps(oabList, oabExtras)} />
        </TabPane>
        <TabPane tab="PowerShell" key="powershell">
          <Table {...tabProps(psList, psExtras)} />
        </TabPane>
        <TabPane tab="Outlook Anywhere (RPC)" key="rpc">
          <Table {...tabProps(rpcList, rpcExtras, true)} />
        </TabPane>
        <TabPane tab="MAPI over HTTP" key="mapi">
          <Alert
            type={mapiOrgEnabled === true ? 'success' : mapiOrgEnabled === false ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            message={
              mapiOrgEnabled === true
                ? 'MAPI over HTTP activé au niveau de l’organisation'
                : mapiOrgEnabled === false
                  ? 'MAPI over HTTP désactivé au niveau de l’organisation — activez via Set-OrganizationConfig -MapiHttpEnabled $true'
                  : 'Statut MAPI (organisation) en cours de chargement...'
            }
          />
          <Table {...tabProps(mapiList, mapiExtras)} />
        </TabPane>
      </Tabs>

      <Modal
        title={`Modifier : ${editRec?.Identity ?? ''}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={560}
        footer={[
          <Button key="cancel" onClick={() => setModalOpen(false)}>Annuler</Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            Enregistrer
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" size="small">
          {renderFields(editRec?._dirType)}
        </Form>
      </Modal>
    </div>
  );
}
