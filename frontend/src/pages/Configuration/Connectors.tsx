import React, { useEffect, useState } from 'react';
import {
  Tabs, Table, Button, Space, Typography, message,
  Modal, Form, Input, Tag, Alert, Tooltip, Select,
  Descriptions, Switch, Popconfirm, InputNumber, Divider,
} from 'antd';
import {
  ReloadOutlined, CloudServerOutlined, PlusOutlined,
  EyeOutlined, DeleteOutlined, SendOutlined,
  EditOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';

// ─── helpers ──────────────────────────────────────────────────────────────────
const toArray = (v: string | undefined): string[] =>
  v ? v.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean) : [];

const joinArr = (v: any): string => {
  if (!v) return '-';
  if (Array.isArray(v)) return v.join(', ') || '-';
  return String(v);
};

// Like joinArr but returns '' instead of '-' for empty values (used for form pre-fill)
const toFormStr = (v: any): string => {
  if (!v) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return String(v);
};

const enabledTag = (v: any) => {
  const on = v === true || String(v).toLowerCase() === 'true' || String(v) === '1';
  return <Tag color={on ? 'green' : 'red'}>{on ? 'Activé' : 'Désactivé'}</Tag>;
};

const { Title } = Typography;

// ─── Exchange cert Services flags ─────────────────────────────────────────────
const hasSmtp = (services: any): boolean => {
  if (!services) return false;
  const s = String(services);
  if (s.includes('SMTP')) return true;
  const n = parseInt(s, 10);
  return !isNaN(n) && (n & 16) !== 0;
};

const parseMB = (v: any): number | undefined => {
  if (!v) return undefined;
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*MB/i);
  return m ? parseFloat(m[1]) : undefined;
};

// ─── detail modal ─────────────────────────────────────────────────────────────
function DetailModal({ rec, onClose }: { rec: any; onClose: () => void }) {
  const items = Object.entries(rec)
    .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
    .map(([k, v]) => ({
      key: k, label: k, children: Array.isArray(v) ? joinArr(v) : String(v),
    }));
  return (
    <Modal title={`Détails — ${rec.Identity ?? rec.Name ?? '?'}`} open onCancel={onClose}
      width={760} footer={<Button onClick={onClose}>Fermer</Button>}>
      <Descriptions bordered size="small" column={1} items={items} />
    </Modal>
  );
}

// ─── certificate modal ─────────────────────────────────────────────────────────
function CertModal({ onClose }: { onClose: () => void }) {
  const [certs, setCerts]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [enabling, setEnabling] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setCerts(await exchangeApi.getConnectorCertificates()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleEnable = async (thumbprint: string) => {
    setEnabling(thumbprint);
    try {
      await exchangeApi.enableCertificateForSmtp(thumbprint);
      message.success('Certificat activé pour SMTP');
      load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setEnabling(null); }
  };

  const columns: ColumnsType<any> = [
    {
      title: 'Sujet', dataIndex: 'Subject', ellipsis: true,
      render: (v: string, r: any) => (
        <Space>
          {hasSmtp(r.Services) && <Tag color="blue" icon={<SafetyCertificateOutlined />}>SMTP actif</Tag>}
          <span>{v}</span>
        </Space>
      ),
    },
    { title: 'Émetteur', dataIndex: 'Issuer', width: 200, ellipsis: true },
    {
      title: 'Expiration', dataIndex: 'NotAfter', width: 120,
      render: (v: any) => {
        if (!v) return '—';
        const d = new Date(String(v));
        const expired = d < new Date();
        const soon = !expired && (d.getTime() - Date.now()) < 30 * 24 * 36e5;
        return <Tag color={expired ? 'red' : soon ? 'orange' : 'green'}>{d.toLocaleDateString('fr-FR')}</Tag>;
      },
    },
    {
      title: 'Services', dataIndex: 'Services', width: 180,
      render: (v: any) => {
        const s = String(v ?? '');
        const flags: string[] = [];
        const n = parseInt(s, 10);
        if (!isNaN(n)) {
          if (n & 1)  flags.push('Federation');
          if (n & 2)  flags.push('IIS');
          if (n & 4)  flags.push('IMAP');
          if (n & 8)  flags.push('POP');
          if (n & 16) flags.push('SMTP');
          if (n & 32) flags.push('UM');
        } else {
          ['SMTP', 'IIS', 'IMAP', 'POP', 'Federation', 'UM'].forEach(f => s.includes(f) && flags.push(f));
        }
        return flags.length
          ? <Space wrap size={2}>{flags.map(f => <Tag key={f} color={f === 'SMTP' ? 'blue' : undefined}>{f}</Tag>)}</Space>
          : <span style={{ color: '#999' }}>—</span>;
      },
    },
    {
      title: 'Thumbprint', dataIndex: 'Thumbprint', width: 110,
      render: (v: string) => (
        <Tooltip title={v}><code style={{ fontSize: 10 }}>{v?.slice(0, 8)}…</code></Tooltip>
      ),
    },
    {
      title: 'Action', key: 'action', width: 150,
      render: (_: any, r: any) => hasSmtp(r.Services) ? (
        <Tag color="blue" icon={<SafetyCertificateOutlined />}>Actif pour SMTP</Tag>
      ) : (
        <Popconfirm
          title="Activer ce certificat pour SMTP ?"
          description="Le certificat SMTP actuel sera remplacé sur ce serveur Exchange."
          onConfirm={() => handleEnable(r.Thumbprint)}
          okText="Activer" cancelText="Annuler">
          <Button size="small" icon={<SafetyCertificateOutlined />} loading={enabling === r.Thumbprint}>
            Activer SMTP
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const active = certs.find(c => hasSmtp(c.Services));

  return (
    <Modal
      title={<Space><SafetyCertificateOutlined /> Certificats TLS Exchange</Space>}
      open onCancel={onClose} width={960}
      footer={<Button onClick={onClose}>Fermer</Button>}>
      {active && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={`Certificat SMTP actif : ${active.Subject}`}
          description={`Thumbprint : ${active.Thumbprint} — Expire le ${new Date(String(active.NotAfter)).toLocaleDateString('fr-FR')}`}
        />
      )}
      <Table columns={columns} dataSource={certs} rowKey="Thumbprint"
        loading={loading} size="small" pagination={false}
        footer={() => <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>} />
    </Modal>
  );
}

type ModalState = { mode: 'create' | 'edit'; type: 'receive' | 'send'; rec: any } | null;

// ─── main component ───────────────────────────────────────────────────────────
export default function Connectors() {
  const [loading, setLoading]         = useState(false);
  const [receive, setReceive]         = useState<any[]>([]);
  const [send, setSend]               = useState<any[]>([]);
  const [detail, setDetail]           = useState<any>(null);
  const [modal, setModal]             = useState<ModalState>(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [certOpen, setCertOpen]       = useState(false);
  const [formTlsAuth, setFormTlsAuth] = useState<string | null>(null);
  const [form]                        = Form.useForm();

  // ── Server selector (connecteurs de réception) ───────────────────────────
  const [servers, setServers]               = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        exchangeApi.getReceiveConnectors(selectedServer),
        exchangeApi.getSendConnectors(),
      ]);
      setReceive(r); setSend(s);
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    exchangeApi.getExchangeServers().then(setServers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [selectedServer]);

  const openCreate = (type: 'receive' | 'send') => {
    form.resetFields(); setFormTlsAuth(null);
    setModal({ mode: 'create', type, rec: null });
  };

  const openEdit = (type: 'receive' | 'send', rec: any) => {
    const fields: any = {};
    if (type === 'receive') {
      fields.Bindings       = toFormStr(rec.Bindings);
      fields.RemoteIPRanges = toFormStr(rec.RemoteIPRanges);
      fields.AuthMechanism  = Array.isArray(rec.AuthMechanism)
        ? rec.AuthMechanism
        : rec.AuthMechanism ? String(rec.AuthMechanism).split(/[,\s]+/).filter(Boolean) : [];
      fields.Fqdn = rec.Fqdn ? String(rec.Fqdn) : undefined;
    } else {
      fields.SmartHosts    = toFormStr(rec.SmartHosts);
      fields.AddressSpaces = toFormStr(rec.AddressSpaces);
      fields.RequireTLS    = rec.RequireTLS === true || String(rec.RequireTLS).toLowerCase() === 'true';
      fields.TlsAuthLevel  = rec.TlsAuthLevel && String(rec.TlsAuthLevel) !== 'None' ? String(rec.TlsAuthLevel) : undefined;
      fields.TlsDomain     = rec.TlsDomain ? String(rec.TlsDomain) : undefined;
      fields.Fqdn = rec.Fqdn ? String(rec.Fqdn) : undefined;
      setFormTlsAuth(fields.TlsAuthLevel ?? null);
    }
    fields.MaxMessageSize = parseMB(rec.MaxMessageSize);
    fields.Enabled        = rec.Enabled === true || String(rec.Enabled).toLowerCase() === 'true';
    form.resetFields();
    form.setFieldsValue(fields);
    setModal({ mode: 'edit', type, rec });
  };

  const handleSubmit = async (values: any) => {
    if (!modal) return;
    setSaving(true);
    try {
      const id = modal.rec?.Identity ?? modal.rec?.Name;
      if (modal.mode === 'create') {
        if (modal.type === 'receive') {
          await exchangeApi.createReceiveConnector({
            Name: values.Name, Server: values.Server || undefined,
            Bindings: toArray(values.Bindings), RemoteIPRanges: toArray(values.RemoteIPRanges),
            MaxMessageSize: values.MaxMessageSize ?? undefined, Enabled: values.Enabled ?? true,
            AuthMechanism: values.AuthMechanism?.length ? values.AuthMechanism : undefined,
            Fqdn: values.Fqdn || undefined,
          });
        } else {
          await exchangeApi.createSendConnector({
            Name: values.Name, SmartHosts: toArray(values.SmartHosts),
            AddressSpaces: toArray(values.AddressSpaces),
            MaxMessageSize: values.MaxMessageSize ?? undefined, Enabled: values.Enabled ?? true,
            RequireTLS: values.RequireTLS ?? false, TlsAuthLevel: values.TlsAuthLevel || undefined,
            TlsDomain: values.TlsDomain || undefined,
            Fqdn: values.Fqdn || undefined,
          });
        }
        message.success('Connecteur créé avec succès');
      } else {
        if (modal.type === 'receive') {
          await exchangeApi.updateReceiveConnector(id, {
            Bindings:       toArray(values.Bindings).length ? toArray(values.Bindings) : undefined,
            RemoteIPRanges: toArray(values.RemoteIPRanges).length ? toArray(values.RemoteIPRanges) : undefined,
            MaxMessageSize: values.MaxMessageSize ?? undefined,
            Enabled:        values.Enabled,
            AuthMechanism:  values.AuthMechanism?.length ? values.AuthMechanism : undefined,
            Fqdn: values.Fqdn || undefined,
          });
        } else {
          await exchangeApi.updateSendConnector(id, {
            SmartHosts:    toArray(values.SmartHosts).length ? toArray(values.SmartHosts) : undefined,
            AddressSpaces: toArray(values.AddressSpaces).length ? toArray(values.AddressSpaces) : undefined,
            MaxMessageSize: values.MaxMessageSize ?? undefined,
            Enabled:        values.Enabled,
            RequireTLS:     values.RequireTLS ?? undefined,
            TlsAuthLevel:   values.TlsAuthLevel || undefined,
            TlsDomain:      values.TlsDomain || undefined,
            Fqdn: values.Fqdn || undefined,
          });
        }
        message.success('Connecteur mis à jour');
      }
      setModal(null); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setSaving(false); }
  };

  const handleDelete = async (type: 'receive' | 'send', identity: string) => {
    setDeleting(identity);
    try {
      await exchangeApi.deleteConnector(type, identity);
      message.success(`Connecteur "${identity}" supprimé`); load();
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setDeleting(null); }
  };

  const actionCol = (type: 'receive' | 'send'): ColumnsType<any>[number] => ({
    title: 'Actions', key: 'actions', width: 120,
    render: (_, r) => {
      const id = r.Identity ?? r.Name;
      return (
        <Space size={0}>
          <Tooltip title="Voir détails">
            <Button type="text" icon={<EyeOutlined />} onClick={() => setDetail(r)} />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(type, r)} />
          </Tooltip>
          <Popconfirm
            title={`Supprimer "${id}" ?`} description="Cette action est irréversible."
            onConfirm={() => handleDelete(type, id)}
            okText="Supprimer" cancelText="Annuler" okButtonProps={{ danger: true }}>
            <Button type="text" danger icon={<DeleteOutlined />} loading={deleting === id} />
          </Popconfirm>
        </Space>
      );
    },
  });

  const receiveColumns: ColumnsType<any> = [
    { title: 'Identité',   dataIndex: 'Identity',       render: v => <strong>{v}</strong> },
    { title: 'Serveur',    dataIndex: 'Server',          width: 140 },
    { title: 'Statut',     dataIndex: 'Enabled',         width: 90, render: enabledTag },
    {
      title: 'Auth / TLS', dataIndex: 'AuthMechanism', width: 200,
      render: (v: any) => {
        const arr: string[] = Array.isArray(v) ? v : v ? String(v).split(/[,\s]+/).filter(Boolean) : [];
        return arr.length
          ? <Space wrap size={2}>{arr.map(m => <Tag key={m} color={m === 'Tls' ? 'blue' : undefined}>{m}</Tag>)}</Space>
          : <span style={{ color: '#999' }}>—</span>;
      },
    },
    { title: 'FQDN', dataIndex: 'Fqdn', width: 180, render: (v: any) => v ? <code style={{ fontSize: 12 }}>{String(v)}</code> : <span style={{ color: '#999' }}>—</span> },
    { title: 'Taille max', dataIndex: 'MaxMessageSize', width: 160 },
    actionCol('receive'),
  ];

  const sendColumns: ColumnsType<any> = [
    { title: 'Identité',    dataIndex: 'Identity',      render: v => <strong>{v}</strong> },
    { title: 'Smart Hosts', dataIndex: 'SmartHosts',    render: joinArr },
    { title: 'Statut',      dataIndex: 'Enabled',       width: 90, render: enabledTag },
    {
      title: 'TLS', key: 'tls', width: 210,
      render: (_: any, r: any) => {
        const tags: React.ReactNode[] = [];
        if (r.RequireTLS === true || String(r.RequireTLS).toLowerCase() === 'true')
          tags.push(<Tag key="req" color="blue">TLS requis</Tag>);
        if (r.TlsAuthLevel && r.TlsAuthLevel !== 'None')
          tags.push(<Tag key="lvl" color="geekblue">{String(r.TlsAuthLevel)}</Tag>);
        if (r.TlsDomain)
          tags.push(<Tag key="dom">{String(r.TlsDomain)}</Tag>);
        return tags.length ? <Space wrap size={2}>{tags}</Space> : <span style={{ color: '#999' }}>—</span>;
      },
    },
    { title: 'FQDN', dataIndex: 'Fqdn', width: 180, render: (v: any) => v ? <code style={{ fontSize: 12 }}>{String(v)}</code> : <span style={{ color: '#999' }}>—</span> },
    { title: 'Taille max', dataIndex: 'MaxMessageSize', width: 160 },
    actionCol('send'),
  ];

  const isEdit  = modal?.mode === 'edit';
  const isRecv  = modal?.type === 'receive';
  const modalTitle = isEdit
    ? `Modifier — ${modal!.rec?.Identity ?? modal!.rec?.Name}`
    : isRecv ? 'Nouveau connecteur de réception' : "Nouveau connecteur d'envoi";

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={2} style={{ margin: 0 }}>
          <CloudServerOutlined style={{ marginRight: 8 }} /> Connecteurs SMTP
        </Title>
        <Space>
          <Button icon={<SafetyCertificateOutlined />} onClick={() => setCertOpen(true)}>
            Certificat TLS
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
        </Space>
      </div>

      <Alert message="Gestion des connecteurs SMTP"
        description="Configurez les connecteurs de réception et d'envoi pour le flux de messagerie Exchange"
        type="info" showIcon style={{ marginBottom: 16 }} />

      <Tabs defaultActiveKey="receive" items={[
        {
          key: 'receive', label: 'Connecteurs de réception',
          children: (
            <>
              <Space style={{ marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate('receive')}>
                  Nouveau connecteur de réception
                </Button>
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
              </Space>
              <Table columns={receiveColumns} dataSource={receive}
                rowKey={r => r.Identity ?? r.Name ?? Math.random().toString()}
                loading={loading} pagination={{ pageSize: 20 }} size="small"
                footer={() => `${receive.length} connecteur(s)`} />
            </>
          ),
        },
        {
          key: 'send', label: "Connecteurs d'envoi",
          children: (
            <>
              <Space style={{ marginBottom: 12 }}>
                <Button type="primary" icon={<SendOutlined />} onClick={() => openCreate('send')}>
                  Nouveau connecteur d'envoi
                </Button>
              </Space>
              <Table columns={sendColumns} dataSource={send}
                rowKey={r => r.Identity ?? r.Name ?? Math.random().toString()}
                loading={loading} pagination={{ pageSize: 20 }} size="small"
                footer={() => `${send.length} connecteur(s)`} />
            </>
          ),
        },
      ]} />

      {detail   && <DetailModal rec={detail} onClose={() => setDetail(null)} />}
      {certOpen && <CertModal onClose={() => setCertOpen(false)} />}

      {/* Modal création / modification */}
      <Modal title={modalTitle}
        open={!!modal} onCancel={() => setModal(null)} onOk={() => form.submit()}
        confirmLoading={saving} okText={isEdit ? 'Enregistrer' : 'Créer'} cancelText="Annuler" width={620}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>

          {!isEdit && (
            <Form.Item name="Name" label="Nom" rules={[{ required: true, message: 'Requis' }]}>
              <Input placeholder="ex: Relay Interne" />
            </Form.Item>
          )}
          {isEdit && modal && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`Connecteur : ${modal.rec?.Identity ?? modal.rec?.Name}`}
              description="Modifiez les champs ci-dessous. Laissez un champ vide pour conserver sa valeur actuelle." />
          )}

          {modal?.type === 'receive' ? (
            <>
              {!isEdit && (
                <Form.Item name="Server" label="Serveur Exchange"
                  tooltip="Laisser vide pour utiliser le serveur local">
                  <Input placeholder="ex: TLS-EXCH-LAB" />
                </Form.Item>
              )}
              <Form.Item name="Bindings" label="Liaisons (IP:Port)"
                rules={isEdit ? [] : [{ required: true, message: 'Requis' }]}
                tooltip="Séparez par des virgules. ex: 0.0.0.0:25, 192.168.1.1:25">
                <Input.TextArea rows={2} placeholder="0.0.0.0:25" />
              </Form.Item>
              <Form.Item name="RemoteIPRanges" label="Plages IP autorisées"
                tooltip="Laisser vide pour 0.0.0.0/0. Séparez par des virgules.">
                <Input.TextArea rows={2} placeholder="192.168.1.0/24, 10.0.0.0/8" />
              </Form.Item>
              <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, margin: '12px 0 8px' }}>TLS / Authentification</Divider>
              <Form.Item name="AuthMechanism" label="Mécanismes d'authentification"
                tooltip="Méthodes acceptées. 'Tls' active STARTTLS.">
                <Select mode="multiple" placeholder="Sélectionner..." options={[
                  { value: 'None',                  label: 'None — aucune auth' },
                  { value: 'Tls',                   label: 'TLS (STARTTLS)' },
                  { value: 'Integrated',            label: 'Integrated (NTLM/Kerberos)' },
                  { value: 'BasicAuth',             label: 'BasicAuth' },
                  { value: 'BasicAuthRequireTLS',   label: 'BasicAuth + TLS requis' },
                  { value: 'ExchangeServer',        label: 'ExchangeServer' },
                  { value: 'ExternalAuthoritative', label: 'ExternalAuthoritative' },
                ]} />
              </Form.Item>
              <Form.Item name="Fqdn" label="FQDN"
                tooltip="FQDN annoncé dans HELO/EHLO. Sous Exchange 2010, Exchange sélectionne le certificat dont le CN correspond à ce FQDN.">
                <Input placeholder="mail.contoso.com" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="SmartHosts" label="Smart Hosts"
                rules={isEdit ? [] : [{ required: true, message: 'Requis' }]}
                tooltip="Séparez par des virgules.">
                <Input.TextArea rows={2} placeholder="smtp.relay.com" />
              </Form.Item>
              <Form.Item name="AddressSpaces" label="Espaces d'adressage"
                tooltip="Laisser vide pour '*'. Séparez par des virgules.">
                <Input placeholder="*, contoso.com" />
              </Form.Item>
              <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, margin: '12px 0 8px' }}>TLS / Certificat</Divider>
              <Space align="start" style={{ flexWrap: 'wrap', gap: 16 }}>
                <Form.Item name="RequireTLS" valuePropName="checked" label="Exiger TLS" style={{ marginBottom: 8 }}
                  tooltip="Force le chiffrement TLS sur toutes les connexions sortantes">
                  <Switch />
                </Form.Item>
                <Form.Item name="TlsAuthLevel" label="Niveau d'authentification TLS"
                  style={{ marginBottom: 8, minWidth: 240 }}
                  tooltip="EncryptionOnly : chiffrement seul. CertificateValidation : valide le cert. DomainValidation : valide le domaine.">
                  <Select allowClear placeholder="Sélectionner (optionnel)..."
                    onChange={(v: string | null) => setFormTlsAuth(v ?? null)}
                    options={[
                      { value: 'EncryptionOnly',        label: 'EncryptionOnly — chiffrement seul' },
                      { value: 'CertificateValidation', label: 'CertificateValidation — valide le cert' },
                      { value: 'DomainValidation',      label: 'DomainValidation — valide le domaine' },
                    ]} />
                </Form.Item>
              </Space>
              {formTlsAuth === 'DomainValidation' && (
                <Form.Item name="TlsDomain" label="Domaine TLS cible"
                  tooltip="FQDN à valider dans le certificat du serveur distant">
                  <Input placeholder="mail.contoso.com" />
                </Form.Item>
              )}
              <Form.Item name="Fqdn" label="FQDN (HELO/EHLO)"
                tooltip="FQDN annoncé dans HELO/EHLO. Sous Exchange 2010, Exchange sélectionne le certificat dont le CN correspond à ce FQDN pour l'authentification TLS.">
                <Input placeholder="mail.contoso.com" />
              </Form.Item>
            </>
          )}

          <Divider style={{ margin: '12px 0' }} />
          <Space>
            <Form.Item name="MaxMessageSize" label="Taille max (MB)" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={150} placeholder="10" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="Enabled" label="Activé" valuePropName="checked"
              initialValue={true} style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
