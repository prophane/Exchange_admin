import { useCallback, useEffect, useState } from 'react';
import {
  Table, Button, Space, Typography, Tag, Modal,
  Descriptions, Alert, Tooltip, Badge, Spin, message,
  Steps, Form, Input, Select, Checkbox, Divider, Popconfirm,
} from 'antd';
import {
  ReloadOutlined, SafetyCertificateOutlined, EyeOutlined,
  LockOutlined, CheckCircleOutlined, LoadingOutlined, EditOutlined,
  DeleteOutlined, SyncOutlined, BankOutlined, CopyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';

const { Title, Text } = Typography;

// Exchange 2010 AllowedServices bitmask (valeurs réelles vérifiées empiriquement)
const EXCHANGE_SERVICES: Record<number, string> = {
  1: 'IIS', 2: 'IMAP', 4: 'UM', 8: 'POP', 16: 'SMTP', 32: 'Federation',
};

const SERVICE_COLORS: Record<string, string> = {
  SMTP: 'blue', IMAP: 'cyan', POP: 'geekblue', UM: 'purple', IIS: 'green', Federation: 'orange',
};

const parseServices = (services: unknown): string[] => {
  if (services === null || services === undefined) return [];
  const s = String(services).trim();
  if (s === '' || s === '0' || s.toLowerCase() === 'none') return [];
  // Si c'est un nombre → décodage bitmask
  const num = Number(s);
  if (!isNaN(num) && num > 0) {
    return Object.entries(EXCHANGE_SERVICES)
      .filter(([bit]) => (num & Number(bit)) !== 0)
      .map(([, name]) => name);
  }
  // Sinon c'est déjà une chaîne type "SMTP, IIS" ou "Smtp, Iis" (Exchange)
  return s.split(',').map((x) => x.trim().toUpperCase()).filter((x) => x && x !== 'NONE');
};

const formatDate = (val: unknown): string => {
  if (!val) return 'N/A';
  try {
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(val); }
};

const getDays = (val: unknown): number => {
  if (!val) return 9999;
  try { return Math.floor((new Date(String(val)).getTime() - Date.now()) / 86400000); }
  catch { return 9999; }
};

const parseCertDomains = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return (val as unknown[]).map(String).filter(Boolean);
  const s = String(val).trim();
  if (!s || s === 'null') return [];
  try { const p = JSON.parse(s); if (Array.isArray(p)) return p.map(String).filter(Boolean); } catch { /* ignore */ }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
};

/** Détecte le type de certificat selon l'émetteur. */
const getCertType = (cert: Record<string, unknown>): 'selfsigned' | 'letsencrypt' | 'ca' => {
  if (cert.IsSelfSigned) return 'selfsigned';
  const issuer = String(cert.Issuer ?? '').toLowerCase();
  if (issuer.includes("let's encrypt") || issuer.includes('letsencrypt')) return 'letsencrypt';
  return 'ca';
};

const getStatus = (cert: Record<string, unknown>) => {
  const d = getDays(cert.NotAfter);
  if (d < 0)  return { label: 'Expiré',         badgeStatus: 'error'   as const, tagColor: 'red'    };
  if (d < 30) return { label: 'Expire bientot',  badgeStatus: 'warning' as const, tagColor: 'orange' };
  return         { label: 'Valide',             badgeStatus: 'success' as const, tagColor: 'green'  };
};

export default function Certificates() {
  const [certs, setCerts]       = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [modalOpen, setModal]   = useState(false);

  // ── Server selector ────────────────────────────────────────────────────────
  const [servers, setServers]               = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined);

  // ── Load certificates ──────────────────────────────────────────────────────
  // Défini en premier pour être disponible dans tous les handlers sans dépendance de closure
  const load = useCallback(async (srv?: string) => {
    const serverParam = srv !== undefined ? srv : selectedServer;
    setLoading(true);
    setError(null);
    try {
      const data = await exchangeApi.getCertificates(serverParam || undefined);
      // Filtrage client en filet de sécurité
      const filtered = serverParam
        ? (Array.isArray(data) ? data : []).filter((c: Record<string, unknown>) => {
            const certSrv = String(c.Server ?? '').toUpperCase();
            const wanted  = serverParam.toUpperCase();
            // Accepte correspondance exacte ou si le nom court est contenu dans le FQDN
            return certSrv === wanted
              || certSrv.startsWith(wanted + '.')
              || certSrv.startsWith(wanted + '\\');
          })
        : (Array.isArray(data) ? data : []);
      setCerts(filtered);
      if (filtered.length) message.success(`${filtered.length} certificat(s) charge(s)`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string; detail?: string } }; message?: string };
      const msg = e?.response?.data?.message ?? e?.response?.data?.detail ?? e?.response?.data?.error ?? e?.message ?? 'Erreur inconnue';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedServer]);

  // ── Let's Encrypt wizard state ─────────────────────────────────────────────
  const [leOpen, setLeOpen]         = useState(false);
  const [leStep, setLeStep]         = useState(0);
  const [leBusy, setLeBusy]         = useState(false);
  const [leError, setLeError]       = useState<string | null>(null);
  const [leOrderId, setLeOrderId]   = useState('');
  const [leDnsServer, setLeDnsServer] = useState('');
  const [leStaging, setLeStaging]   = useState(false);
  const [leChallenges, setLeChallenges] = useState<Array<{
    domain: string; zone: string; recordName: string; fullName: string; txtValue: string;
    autoCreated: boolean; autoCreateError?: string;
  }>>([]);
  const [leThumbprint, setLeThumbprint] = useState('');
  const [leForm]  = Form.useForm();

  // ── Edit services modal state ──────────────────────────────────────────────
  const [editServOpen, setEditServOpen]   = useState(false);
  const [editServCert, setEditServCert]   = useState<Record<string, unknown> | null>(null);
  const [editServBusy, setEditServBusy]   = useState(false);
  const [editServForm] = Form.useForm();

  // ── Renew self-signed state ────────────────────────────────────────────────
  const [renewOpen, setRenewOpen]   = useState(false);
  const [renewCert, setRenewCert]   = useState<Record<string, unknown> | null>(null);
  const [renewBusy, setRenewBusy]   = useState(false);
  const [renewDone, setRenewDone]   = useState('');
  const [renewForm] = Form.useForm();
  // Label affiché dans le titre du modal/wizard lors d'un renouvellement
  const [renewingLabel, setRenewingLabel] = useState('');

  // ── Par-wizard : serveur cible + déploiement multi-serveur ─────────────────
  const [caServer, setCaServer]               = useState<string>('');
  const [leServer, setLeServer]               = useState<string>('');
  const [caFinalServices, setCaFinalServices] = useState<string[]>(['SMTP', 'IIS']);
  const [leFinalServices, setLeFinalServices] = useState<string[]>(['SMTP', 'IIS']);
  const [caDeployTargets, setCaDeployTargets] = useState<string[]>([]);
  const [leDeployTargets, setLeDeployTargets] = useState<string[]>([]);
  const [deployBusy, setDeployBusy]           = useState(false);
  const [caDeployResults, setCaDeployResults] = useState<Record<string, 'ok' | string>>({});
  const [leDeployResults, setLeDeployResults] = useState<Record<string, 'ok' | string>>({});

  // ── CA Entreprise wizard state ─────────────────────────────────────────────
  const [caOpen, setCaOpen]   = useState(false);
  const [caStep, setCaStep]   = useState(0);
  const [caBusy, setCaBusy]   = useState(false);
  const [caError, setCaError] = useState<string | null>(null);
  const [caCsr, setCaCsr]     = useState('');
  const [caThumb, setCaThumb] = useState('');
  const [caForm] = Form.useForm();
  const [caImportForm] = Form.useForm();

  // ── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = async (thumb: string) => {
    try {
      await exchangeApi.deleteCertificate(thumb);
      message.success('Certificat supprimé');
      load(selectedServer);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? err?.message ?? 'Erreur suppression');
    }
  };

  // ── Renew handlers ────────────────────────────────────────────────────────
  const openRenewSelfSigned = (cert: Record<string, unknown>) => {
    const svcs = parseServices(cert.Services);
    renewForm.setFieldsValue({ services: svcs.length ? svcs : ['SMTP', 'IIS'] });
    setRenewCert(cert);
    setRenewDone('');
    setRenewOpen(true);
  };

  /** Ouvre le wizard Let's Encrypt pré-rempli pour renouvellement. */
  const openLeWizardForRenew = (cert: Record<string, unknown>) => {
    const domains = parseCertDomains(cert.CertificateDomains);
    const svcs = parseServices(cert.Services).filter((s) => ['SMTP', 'IIS', 'IMAP', 'POP'].includes(s));
    leForm.resetFields();
    leForm.setFieldsValue({
      domains: domains.join('\n'),
      services: svcs.length ? svcs : ['SMTP', 'IIS'],
    });
    setLeStep(0);
    setLeError(null);
    setLeOrderId('');
    setLeChallenges([]);
    setLeThumbprint('');
    setRenewingLabel(String(cert.Subject ?? ''));
    setLeServer(String((cert as any).Server ?? selectedServer ?? (servers[0] as any)?.Name ?? ''));
    setLeDeployTargets([]);
    setLeDeployResults({});
    setLeOpen(true);
  };

  /** Ouvre le wizard CA Entreprise pré-rempli pour renouvellement. */
  const openCaWizardForRenew = (cert: Record<string, unknown>) => {
    const domains = parseCertDomains(cert.CertificateDomains);
    const svcs = parseServices(cert.Services).filter((s) => ['SMTP', 'IIS', 'IMAP', 'POP'].includes(s));
    caForm.resetFields();
    caImportForm.resetFields();
    caForm.setFieldsValue({
      subjectName: String(cert.Subject ?? ''),
      domains: domains.join('\n'),
      friendlyName: String(cert.FriendlyName ?? (domains[0] ?? '')),
      keySize: '2048',
      services: svcs.length ? svcs : ['SMTP', 'IIS'],
    });
    setCaStep(0);
    setCaError(null);
    setCaCsr('');
    setCaThumb('');
    setRenewingLabel(String(cert.Subject ?? ''));
    setCaServer(String((cert as any).Server ?? selectedServer ?? (servers[0] as any)?.Name ?? ''));
    setCaDeployTargets([]);
    setCaDeployResults({});
    setCaOpen(true);
  };

  /** Route vers le bon wizard selon le type de certificat. */
  const openRenewForCert = (cert: Record<string, unknown>) => {
    const type = getCertType(cert);
    if (type === 'letsencrypt') openLeWizardForRenew(cert);
    else if (type === 'ca')     openCaWizardForRenew(cert);
    else                        openRenewSelfSigned(cert);
  };

  const handleRenew = async () => {
    try {
      const values = await renewForm.validateFields();
      const services: string[] = values.services ?? ['SMTP', 'IIS'];
      const certServer = String(renewCert?.Server ?? renewCert?.server ?? selectedServer ?? '');
      if (!certServer) { message.error('Sélectionnez un serveur avant de renouveler'); return; }
      setRenewBusy(true);
      const thumb = String(renewCert?.Thumbprint ?? '');
      const res = await exchangeApi.renewCertificate(thumb, services, certServer);
      setRenewDone(res.thumbprint ?? '');
      message.success('Certificat renouvelé avec succès');
      load(selectedServer);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? err?.message ?? 'Erreur renouvellement');
    } finally {
      setRenewBusy(false);
    }
  };

  // ── CA Entreprise handlers ─────────────────────────────────────────────────
  const openCaWizard = () => {
    caForm.resetFields();
    caImportForm.resetFields();
    setCaStep(0);
    setCaError(null);
    setCaCsr('');
    setCaThumb('');
    setRenewingLabel('');
    setCaServer(selectedServer || (servers[0] as any)?.Name || (servers[0] as any)?.Fqdn || '');
    setCaDeployTargets([]);
    setCaDeployResults({});
    setCaOpen(true);
  };

  const handleGenerateCsr = async () => {
    try {
      const values = await caForm.validateFields();
      const domains: string[] = values.domains
        .split(/[\n,;]+/).map((d: string) => d.trim()).filter(Boolean);
      if (!domains.length) { message.error('Entrez au moins un domaine'); return; }
      setCaBusy(true);
      setCaError(null);
      const csrServer = caServer;
      if (!csrServer) { setCaError('Sélectionnez un serveur avant de générer un CSR'); setCaBusy(false); return; }
      const res = await exchangeApi.newCertificateRequest({
        server: csrServer,
        subjectName: values.subjectName,
        domainNames: domains,
        friendlyName: values.friendlyName || domains[0],
        keySize: Number(values.keySize) || 2048,
        services: values.services ?? [],
      });
      setCaCsr(res.csr);
      setCaStep(1);
    } catch (err: any) {
      setCaError(err?.response?.data?.error ?? err?.message ?? 'Erreur génération CSR');
    } finally {
      setCaBusy(false);
    }
  };

  const handleImportCert = async () => {
    try {
      const values = await caImportForm.validateFields();
      // Accepte PEM (entre -----BEGIN/END-----) ou base64 pur
      let b64 = (values.certData as string).trim();
      b64 = b64.replace(/-----BEGIN[^-]*-----/g, '').replace(/-----END[^-]*-----/g, '').replace(/\s+/g, '');
      setCaBusy(true);
      setCaError(null);
      const importServer = caServer;
      if (!importServer) { setCaError('Sélectionnez un serveur avant d\'importer'); setCaBusy(false); return; }
      const importServices = values.importServices ?? [];
      const res = await exchangeApi.importCertificateResponse({
        server: importServer,
        base64Certificate: b64,
        services: importServices,
        pfxPassword: values.pfxPassword || undefined,
      });
      setCaFinalServices(importServices);
      setCaThumb(res.thumbprint ?? '');
      setCaStep(2);
      load(selectedServer);
    } catch (err: any) {
      setCaError(err?.response?.data?.error ?? err?.message ?? 'Erreur import certificat');
    } finally {
      setCaBusy(false);
    }
  };

  const openEditServices = (cert: Record<string, unknown>) => {
    const current = parseServices(cert.Services);
    editServForm.setFieldsValue({ services: current });
    setEditServCert(cert);
    setEditServOpen(true);
  };

  const saveEditServices = async () => {
    try {
      const values = await editServForm.validateFields();
      const services: string[] = values.services ?? [];
      if (!services.length) { message.error('Sélectionnez au moins un service'); return; }
      setEditServBusy(true);
      const thumb = String(editServCert?.Thumbprint ?? '');
      await exchangeApi.enableCertificateServices(thumb, services);
      message.success('Services mis à jour');
      setEditServOpen(false);
      load(selectedServer);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erreur inconnue';
      message.error(msg);
    } finally {
      setEditServBusy(false);
    }
  };

  // ── Let's Encrypt handlers ─────────────────────────────────────────────────
  const openLeWizard = () => {
    leForm.resetFields();
    setLeStep(0);
    setLeError(null);
    setLeOrderId('');
    setLeChallenges([]);
    setLeThumbprint('');
    setRenewingLabel('');
    setLeServer(selectedServer || (servers[0] as any)?.Name || (servers[0] as any)?.Fqdn || '');
    setLeDeployTargets([]);
    setLeDeployResults({});
    setLeOpen(true);
  };

  const leStartOrder = async () => {
    try {
      const values = await leForm.validateFields();
      const domains: string[] = values.domains
        .split(/[\n,;]+/)
        .map((d: string) => d.trim().toLowerCase())
        .filter(Boolean);
      if (!domains.length) { message.error('Entrez au moins un domaine'); return; }

      setLeBusy(true);
      setLeError(null);
      const res = await exchangeApi.startLetsEncryptOrder({
        email: values.email,
        domains,
        dnsServer: values.dnsServer || undefined,
        dnsUsername: values.dnsUsername || undefined,
        dnsPassword: values.dnsPassword || undefined,
        staging: values.staging ?? false,
      });
      setLeOrderId(res.orderId);
      setLeDnsServer(res.dnsServer);
      setLeStaging(res.staging ?? false);
      setLeChallenges(res.challenges);
      setLeStep(1);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erreur inconnue';
      setLeError(msg);
    } finally {
      setLeBusy(false);
    }
  };

  const leValidate = async () => {
    try {
      setLeBusy(true);
      setLeError(null);
      const services: string[] = leForm.getFieldValue('services') ?? [];
      const res = await exchangeApi.validateLetsEncryptOrder({ orderId: leOrderId, services, server: leServer || undefined });
      setLeFinalServices(services);
      setLeThumbprint(res.thumbprint);
      setLeStep(2);
      load(selectedServer); // refresh table
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erreur inconnue';
      setLeError(msg);
    } finally {
      setLeBusy(false);
    }
  };

  const handleDeploy = async (which: 'ca' | 'le') => {
    const thumbprint = which === 'ca' ? caThumb : leThumbprint;
    const fromServer = which === 'ca' ? caServer : leServer;
    const targets    = which === 'ca' ? caDeployTargets : leDeployTargets;
    const services   = (which === 'ca' ? caFinalServices : leFinalServices).length > 0
      ? (which === 'ca' ? caFinalServices : leFinalServices) : ['SMTP', 'IIS'];
    if (!thumbprint || !fromServer || !targets.length) return;
    setDeployBusy(true);
    const results: Record<string, 'ok' | string> = {};
    for (const target of targets) {
      try {
        await exchangeApi.deployCertificateToServer(thumbprint, fromServer, target, services);
        results[target] = 'ok';
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Erreur inconnue';
        results[target] = msg;
        message.error(`Déploiement vers ${target} : ${msg}`, 8);
      }
    }
    if (which === 'ca') setCaDeployResults(results);
    else setLeDeployResults(results);
    setDeployBusy(false);
    load(selectedServer);
  };

  useEffect(() => {
    exchangeApi.getExchangeServers().then(setServers).catch(() => {});
  }, []);

  // On passe selectedServer explicitement pour éviter toute closure stale
  useEffect(() => { load(selectedServer); }, [selectedServer]);

  const columns: ColumnsType<Record<string, unknown>> = [
    {
      title: 'Statut', key: 'status', width: 140,
      render: (_, r) => { const s = getStatus(r); return <Badge status={s.badgeStatus} text={s.label} />; },
    },
    {
      title: 'Sujet', dataIndex: 'Subject', key: 'Subject',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <strong style={{ fontSize: 13 }}>{String(v ?? 'N/A')}</strong>
          {!!r.IsSelfSigned && <Tag color="orange" style={{ fontSize: 11 }}>Auto-signe</Tag>}
        </Space>
      ),
    },
    ...(servers.length > 1
      ? [{
          title: 'Serveur',
          dataIndex: 'Server',
          key: 'Server',
          width: 130,
          render: (v: unknown) => (
            <Tag color="geekblue" style={{ fontSize: 11 }}>{String(v ?? '?')}</Tag>
          ),
        }]
      : []),
    {
      title: 'Emetteur', dataIndex: 'Issuer', key: 'Issuer',
      render: (v) => <span style={{ fontSize: 12, color: '#555' }}>{String(v ?? 'N/A')}</span>,
    },
    {
      title: 'Services', dataIndex: 'Services', key: 'Services',
      render: (v) => {
        const svcs = parseServices(v);
        return svcs.length > 0
          ? <Space wrap size={4}>{svcs.map((s) => <Tag key={s} color={SERVICE_COLORS[s] ?? 'default'} style={{ fontSize: 11 }}>{s}</Tag>)}</Space>
          : <span style={{ color: '#aaa', fontSize: 12 }}>Aucun</span>;
      },
    },
    {
      title: 'Expire le', dataIndex: 'NotAfter', key: 'NotAfter', width: 150,
      render: (v) => {
        const days = getDays(v);
        return (
          <Space direction="vertical" size={0}>
            <span>{formatDate(v)}</span>
            <small style={{ color: days < 30 ? '#ff4d4f' : '#888' }}>
              {days < 0 ? `Expire depuis ${-days}j` : `dans ${days} j`}
            </small>
          </Space>
        );
      },
    },
    {
      title: '', key: 'actions', width: 140,
      render: (_, r) => {
        const type = getCertType(r);
        const days = getDays(r.NotAfter);
        const renewTooltip: Record<string, string> = {
          selfsigned: 'Renouveler (auto-signé)',
          letsencrypt: "Renouveler via Let's Encrypt",
          ca: 'Renouveler via CA Entreprise',
        };
        const renewColor: Record<string, string> = {
          selfsigned: '#fa8c16',
          letsencrypt: '#1677ff',
          ca: '#722ed1',
        };
        // Toujours afficher pour auto-signé et LE (cert court), sinon < 90 j pour CA
        const canRenew = type === 'selfsigned' || type === 'letsencrypt' || days < 90;
        return (
          <Space size={0}>
            <Tooltip title="Modifier les services">
              <Button type="text" icon={<EditOutlined />} onClick={() => openEditServices(r)} />
            </Tooltip>
            {canRenew && (
              <Tooltip title={renewTooltip[type]}>
                <Button type="text" icon={<SyncOutlined />}
                  style={{ color: renewColor[type] }}
                  onClick={() => openRenewForCert(r)}
                />
              </Tooltip>
            )}
            <Tooltip title="Voir détails">
              <Button type="text" icon={<EyeOutlined />} onClick={() => { setSelected(r); setModal(true); }} />
            </Tooltip>
            <Tooltip title="Supprimer">
              <Popconfirm
                title="Supprimer ce certificat ?"
                description={<span>Empreinte : <code style={{fontSize:11}}>{String(r.Thumbprint ?? '')}</code></span>}
                okText="Supprimer"
                okButtonProps={{ danger: true }}
                cancelText="Annuler"
                onConfirm={() => handleDelete(String(r.Thumbprint ?? ''))}
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />
          Certificats SSL/TLS
        </Title>
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
          <Button icon={<BankOutlined />} onClick={openCaWizard}>
            CA Entreprise
          </Button>
          <Button icon={<LockOutlined />} type="primary" onClick={openLeWizard}>
            Let's Encrypt
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => load(selectedServer)} loading={loading}>Actualiser</Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error" showIcon closable
          message="Erreur lors du chargement"
          description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{error}</pre>}
          style={{ marginBottom: 16 }}
          onClose={() => setError(null)}
        />
      )}

      {loading && certs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#888' }}>Chargement des certificats Exchange...</div>
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={certs}
          rowKey={(r) => String(r.Thumbprint ?? Math.random())}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: error ? 'Erreur de chargement' : 'Aucun certificat' }}
        />
      )}

      {/* ── Let's Encrypt Wizard ─────────────────────────────────────────── */}
      <Modal
        title={<Space><LockOutlined />{renewingLabel ? `Renouveler via Let's Encrypt — ${renewingLabel}` : "Générer un certificat Let's Encrypt (DNS-01)"}</Space>}
        open={leOpen}
        onCancel={() => { if (!leBusy) { setLeOpen(false); } }}
        width={660}
        footer={null}
        maskClosable={false}
      >
        <Steps
          current={leStep}
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Configurer', icon: leStep === 0 && leBusy ? <LoadingOutlined /> : undefined },
            { title: 'Défis DNS',  icon: leStep === 1 && leBusy ? <LoadingOutlined /> : undefined },
            { title: 'Résultat',  icon: leStep === 2 ? <CheckCircleOutlined /> : undefined },
          ]}
        />

        {leError && (
          <Alert type="error" showIcon closable message={leError}
            onClose={() => setLeError(null)} style={{ marginBottom: 16 }} />
        )}

        {/* Step 0 — configuration */}
        {leStep === 0 && (
          <Form form={leForm} layout="vertical">
            {servers.length > 1 && (
              <Form.Item label="Serveur Exchange cible" required extra="Le certificat Let's Encrypt sera importé sur ce serveur.">
                <Select
                  value={leServer}
                  onChange={setLeServer}
                  placeholder="Sélectionner un serveur"
                  style={{ width: '100%' }}
                  options={servers.map((s: any) => ({ value: s.Name ?? s.Fqdn, label: s.Name ?? s.Fqdn }))}
                />
              </Form.Item>
            )}
            <Form.Item name="email" label="Adresse e-mail Let's Encrypt"
              rules={[{ required: true, type: 'email', message: 'E-mail valide requis' }]}>
              <Input placeholder="admin@exemple.com" />
            </Form.Item>
            <Form.Item name="domains" label="Domaine(s) — un par ligne ou séparés par virgule"
              rules={[{ required: true, message: 'Au moins un domaine requis' }]}>
              <Input.TextArea rows={3} placeholder="webmail.example.com&#10;autodiscover.example.com" />
            </Form.Item>
            <Form.Item name="dnsServer" label={`Serveur DNS Windows (défaut: tls-arr.prophane.local)`}>
              <Input placeholder="tls-arr.prophane.local" />
            </Form.Item>
            <Form.Item
              label="Identifiants pour le serveur DNS"
              style={{ marginBottom: 0 }}
              extra="Laissez vide pour utiliser les credentials de la session Exchange"
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="dnsUsername" noStyle>
                  <Input style={{ width: '50%' }} placeholder="domaine\\utilisateur" autoComplete="username" />
                </Form.Item>
                <Form.Item name="dnsPassword" noStyle>
                  <Input.Password style={{ width: '50%' }} placeholder="Mot de passe DNS" autoComplete="current-password" />
                </Form.Item>
              </Space.Compact>
            </Form.Item>
            <Form.Item name="services" label="Services Exchange à activer" initialValue={['SMTP', 'IIS']}>
              <Checkbox.Group options={['SMTP', 'IIS', 'IMAP', 'POP']} />
            </Form.Item>            <Form.Item name="staging" valuePropName="checked" initialValue={false}
              extra={<span style={{color:'#ff7a00'}}>Mode staging : certificat non reconnu par les navigateurs, mais sans limite de taux — à utiliser pour les tests</span>}>
              <Checkbox>Utiliser le serveur de staging Let's Encrypt (test)</Checkbox>
            </Form.Item>            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setLeOpen(false)}>Annuler</Button>
                <Button type="primary" loading={leBusy} onClick={leStartOrder}>
                  Créer les enregistrements DNS →
                </Button>
              </Space>
            </div>
          </Form>
        )}

        {/* Step 1 — DNS challenges */}
        {leStep === 1 && (
          <div>
            {leStaging && (
              <Alert type="warning" showIcon message="Mode STAGING actif — certificat de test, non reconnu par les navigateurs" style={{ marginBottom: 12 }} />
            )}
            {leChallenges.every(c => c.autoCreated) ? (
              <Alert
                type="success" showIcon
                message={`Enregistrements TXT créés automatiquement sur ${leDnsServer}`}
                description="Attendez 1 à 2 minutes pour la propagation DNS, puis cliquez sur « Valider et importer »."
                style={{ marginBottom: 16 }}
              />
            ) : leChallenges.some(c => c.autoCreated) ? (
              <Alert
                type="warning" showIcon
                message="Création DNS partielle"
                description="Certains enregistrements ont été créés automatiquement, d'autres doivent être ajoutés manuellement (voir tableau)."
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert
                type="warning" showIcon
                message={`Création automatique échouée sur ${leDnsServer}`}
                description="La création automatique via WinRM a échoué (droits ou connectivité). Ajoutez manuellement les enregistrements TXT ci-dessous dans votre DNS (hébergeur externe ou console DNS), puis cliquez « Valider et importer »."
                style={{ marginBottom: 16 }}
              />
            )}
            <Divider orientation="left" plain>Enregistrements créés</Divider>
            <Table
              size="small"
              pagination={false}
              dataSource={leChallenges}
              rowKey="domain"
              columns={[
                { title: 'Domaine', dataIndex: 'domain', key: 'domain' },
                { title: 'Zone', dataIndex: 'zone', key: 'zone',
                  render: (v) => <code style={{ fontSize: 11 }}>{v}</code> },
                { title: 'Nom TXT', dataIndex: 'recordName', key: 'recordName',
                  render: (v) => <code style={{ fontSize: 11 }}>{v}</code> },
                { title: 'Valeur', dataIndex: 'txtValue', key: 'txtValue',
                  render: (v) => <code style={{ fontSize: 10, wordBreak: 'break-all' }}>{v}</code> },
                { title: 'Statut', dataIndex: 'autoCreated', key: 'autoCreated', width: 110,
                  render: (v, r: any) => v
                    ? <Tag color="green">Créé auto</Tag>
                    : <Tooltip title={r.autoCreateError ?? 'Création échouée'}><Tag color="orange">Manuel requis</Tag></Tooltip> },
              ]}
            />
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setLeStep(0)}>← Retour</Button>
                <Button type="primary" loading={leBusy} onClick={leValidate}>
                  Valider et importer →
                </Button>
              </Space>
            </div>
          </div>
        )}

        {/* Step 2 — result */}
        {leStep === 2 && (
          <div>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
              <div style={{ marginTop: 12 }}>
                <Text strong>{renewingLabel ? "Certificat Let's Encrypt renouvelé avec succès !" : "Certificat Let's Encrypt importé avec succès !"}</Text>
              </div>
              {leThumbprint?.length === 40 && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">Empreinte : </Text>
                  <code style={{ fontSize: 11 }}>{leThumbprint}</code>
                </div>
              )}
              {leServer && <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>Serveur : <strong>{leServer}</strong></div>}
              <div style={{ marginTop: 20 }}>
                <Button type="primary" onClick={() => setLeOpen(false)}>Fermer</Button>
              </div>
            </div>
            {servers.length > 1 && leThumbprint?.length === 40 && leServer && (() => {
              const others = servers.filter((s: any) => (s.Name ?? s.Fqdn) !== leServer);
              return others.length > 0 ? (
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>Déployer sur d&apos;autres serveurs</Text>
                  <div style={{ marginTop: 8 }}>
                    <Checkbox.Group
                      options={others.map((s: any) => ({ value: s.Name ?? s.Fqdn, label: s.Name ?? s.Fqdn }))}
                      value={leDeployTargets}
                      onChange={(v) => setLeDeployTargets(v as string[])}
                    />
                  </div>
                  {Object.keys(leDeployResults).length > 0 && (
                    <Space wrap style={{ marginTop: 8 }}>
                      {Object.entries(leDeployResults).map(([srv, res]) => (
                        res === 'ok'
                          ? <Tag key={srv} color="green" icon={<CheckCircleOutlined />}>{srv}</Tag>
                          : <Tooltip key={srv} title={res}><Tag color="red">{srv}</Tag></Tooltip>
                      ))}
                    </Space>
                  )}
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button
                      loading={deployBusy}
                      disabled={!leDeployTargets.length}
                      onClick={() => handleDeploy('le')}
                    >
                      <SyncOutlined /> Déployer {leDeployTargets.length ? `vers ${leDeployTargets.join(', ')}` : ''}
                    </Button>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </Modal>

      {/* ── Renew certificate modal ─────────────────────────────────────── */}
      <Modal
        title={<Space><SyncOutlined />Renouveler — {String(renewCert?.Subject ?? '')}</Space>}
        open={renewOpen}
        onCancel={() => { if (!renewBusy) { setRenewOpen(false); } }}
        onOk={renewDone ? () => setRenewOpen(false) : handleRenew}
        okText={renewDone ? 'Fermer' : 'Renouveler'}
        cancelText="Annuler"
        cancelButtonProps={renewDone ? { style: { display: 'none' } } : {}}
        confirmLoading={renewBusy}
        maskClosable={false}
        width={440}
      >
        {renewDone ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 40, color: '#52c41a' }} />
            <div style={{ marginTop: 12 }}><strong>Certificat renouvelé !</strong></div>
            <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>Nouvelle empreinte :</div>
            <code style={{ fontSize: 11 }}>{renewDone}</code>
          </div>
        ) : (
          <Form form={renewForm} layout="vertical">
            <Alert
              type="info" showIcon style={{ marginBottom: 16, fontSize: 12 }}
              message={
                <>
                  Un nouveau certificat auto-signé sera créé avec les mêmes domaines. L&apos;ancien certificat reste en place.
                  {renewCert?.Server
                    ? <span style={{ marginLeft: 12 }}>Serveur : <strong>{String(renewCert.Server)}</strong></span>
                    : null}
                </>
              }
            />
            <Form.Item name="services" label="Services à activer sur le nouveau certificat"
              rules={[{ required: true, message: 'Sélectionnez au moins un service' }]}>
              <Checkbox.Group options={['SMTP', 'IIS', 'IMAP', 'POP', 'UM']} />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* ── CA Entreprise wizard ──────────────────────────────────────────── */}
      <Modal
        title={<Space><BankOutlined />{renewingLabel ? `Renouveler via CA Entreprise — ${renewingLabel}` : 'Certificat CA Entreprise'}</Space>}
        open={caOpen}
        onCancel={() => { if (!caBusy) setCaOpen(false); }}
        width={680}
        footer={null}
        maskClosable={false}
      >
        <Steps
          current={caStep}
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Générer CSR',   icon: caStep === 0 && caBusy ? <LoadingOutlined /> : undefined },
            { title: 'Importer cert', icon: caStep === 1 && caBusy ? <LoadingOutlined /> : undefined },
            { title: 'Résultat',      icon: caStep === 2 ? <CheckCircleOutlined /> : undefined },
          ]}
        />

        {caError && (
          <Alert type="error" showIcon closable message={caError}
            onClose={() => setCaError(null)} style={{ marginBottom: 16 }} />
        )}

        {/* Step 0 — générer CSR */}
        {caStep === 0 && (
          <Form form={caForm} layout="vertical">
            {servers.length > 1 && (
              <Form.Item label="Serveur Exchange cible" required extra="Le CSR et le certificat seront générés/importés sur ce serveur.">
                <Select
                  value={caServer}
                  onChange={setCaServer}
                  placeholder="Sélectionner un serveur"
                  style={{ width: '100%' }}
                  options={servers.map((s: any) => ({ value: s.Name ?? s.Fqdn, label: s.Name ?? s.Fqdn }))}
                />
              </Form.Item>
            )}
            <Form.Item name="subjectName" label="Nom du sujet (SubjectName)"
              rules={[{ required: true, message: 'Requis' }]}
              extra="Ex : cn=webmail.domaine.local">
              <Input placeholder="cn=webmail.domaine.local" />
            </Form.Item>
            <Form.Item name="domains" label="Noms de domaine SAN — un par ligne ou séparés par virgule"
              rules={[{ required: true, message: 'Requis' }]}>
              <Input.TextArea rows={3} placeholder="webmail.domaine.local&#10;autodiscover.domaine.local" />
            </Form.Item>
            <Form.Item name="friendlyName" label="Nom convivial" extra="Laissez vide pour utiliser le premier domaine">
              <Input placeholder="Exchange 2010 - Certificat CA" />
            </Form.Item>
            <Space style={{ width: '100%' }} size={16}>
              <Form.Item name="keySize" label="Taille de clé" initialValue="2048" style={{ marginBottom: 0 }}>
                <Select style={{ width: 120 }} options={[
                  { label: '2048 bits', value: '2048' },
                  { label: '4096 bits', value: '4096' },
                ]} />
              </Form.Item>
              <Form.Item name="services" label="Services" initialValue={['SMTP', 'IIS']} style={{ marginBottom: 0 }}>
                <Checkbox.Group options={['SMTP', 'IIS', 'IMAP', 'POP']} />
              </Form.Item>
            </Space>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setCaOpen(false)}>Annuler</Button>
                <Button type="primary" loading={caBusy} onClick={handleGenerateCsr}>
                  Générer le CSR →
                </Button>
              </Space>
            </div>
          </Form>
        )}

        {/* Step 1 — coller le certificat signé */}
        {caStep === 1 && (
          <div>
            <Alert
              type="success" showIcon style={{ marginBottom: 16 }}
              message="CSR généré avec succès"
              description="Soumettez ce CSR à votre CA d'entreprise, puis collez le certificat signé ci-dessous."
            />
            <Divider orientation="left" plain>CSR à soumettre à votre CA</Divider>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Input.TextArea
                value={caCsr}
                readOnly
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: 11, background: '#f5f5f5' }}
              />
              <Button
                size="small"
                icon={<CopyOutlined />}
                style={{ position: 'absolute', top: 4, right: 4 }}
                onClick={() => { navigator.clipboard.writeText(caCsr); message.success('CSR copié'); }}
              >Copier</Button>
            </div>
            <Divider orientation="left" plain>Certificat signé par la CA (PEM / PKCS#7 / PFX base64)</Divider>
            <Form form={caImportForm} layout="vertical">
              <Form.Item name="certData" label="Coller le certificat ici"
                rules={[{ required: true, message: 'Requis' }]}>
                <Input.TextArea rows={6} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" style={{ fontFamily: 'monospace', fontSize: 11 }} />
              </Form.Item>
              <Form.Item name="pfxPassword" label="Mot de passe PFX" extra="Uniquement pour les fichiers PFX (laissez vide pour PKCS#7/PEM)">
                <Input.Password placeholder="(optionnel)" />
              </Form.Item>
              <Form.Item name="importServices" label="Services à activer" initialValue={['SMTP', 'IIS']}>
                <Checkbox.Group options={['SMTP', 'IIS', 'IMAP', 'POP']} />
              </Form.Item>
            </Form>
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <Space>
                <Button onClick={() => setCaStep(0)}>← Retour</Button>
                <Button type="primary" loading={caBusy} onClick={handleImportCert}>
                  Importer le certificat →
                </Button>
              </Space>
            </div>
          </div>
        )}

        {/* Step 2 — succès */}
        {caStep === 2 && (
          <div>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
              <div style={{ marginTop: 12 }}>
                <strong>{renewingLabel ? 'Certificat CA renouvelé et activé avec succès !' : 'Certificat CA importé et activé avec succès !'}</strong>
              </div>
              {caThumb?.length === 40 && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: '#888' }}>Empreinte : </span>
                  <code style={{ fontSize: 11 }}>{caThumb}</code>
                </div>
              )}
              {caServer && <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>Serveur : <strong>{caServer}</strong></div>}
              <div style={{ marginTop: 20 }}>
                <Button type="primary" onClick={() => setCaOpen(false)}>Fermer</Button>
              </div>
            </div>
            {servers.length > 1 && caThumb?.length === 40 && caServer && (() => {
              const others = servers.filter((s: any) => (s.Name ?? s.Fqdn) !== caServer);
              return others.length > 0 ? (
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>Déployer sur d&apos;autres serveurs</Text>
                  <div style={{ marginTop: 8 }}>
                    <Checkbox.Group
                      options={others.map((s: any) => ({ value: s.Name ?? s.Fqdn, label: s.Name ?? s.Fqdn }))}
                      value={caDeployTargets}
                      onChange={(v) => setCaDeployTargets(v as string[])}
                    />
                  </div>
                  {Object.keys(caDeployResults).length > 0 && (
                    <Space wrap style={{ marginTop: 8 }}>
                      {Object.entries(caDeployResults).map(([srv, res]) => (
                        res === 'ok'
                          ? <Tag key={srv} color="green" icon={<CheckCircleOutlined />}>{srv}</Tag>
                          : <Tooltip key={srv} title={res}><Tag color="red">{srv}</Tag></Tooltip>
                      ))}
                    </Space>
                  )}
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button
                      loading={deployBusy}
                      disabled={!caDeployTargets.length}
                      onClick={() => handleDeploy('ca')}
                    >
                      <SyncOutlined /> Déployer {caDeployTargets.length ? `vers ${caDeployTargets.join(', ')}` : ''}
                    </Button>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </Modal>

      {/* ── Edit Services modal ──────────────────────────────────────────── */}
      <Modal
        title={<Space><EditOutlined />Activer les services — {String(editServCert?.Subject ?? '')}</Space>}
        open={editServOpen}
        onCancel={() => { if (!editServBusy) setEditServOpen(false); }}
        onOk={saveEditServices}
        okText="Appliquer"
        cancelText="Annuler"
        confirmLoading={editServBusy}
        maskClosable={false}
        width={400}
      >
        <Alert
          type="info" showIcon
          message="Seuls les services cochés seront activés. Les services non cochés ne seront PAS désactivés par cette action."
          style={{ marginBottom: 16, fontSize: 12 }}
        />
        <Form form={editServForm} layout="vertical">
          <Form.Item name="services" label="Services à activer"
            rules={[{ required: true, message: 'Sélectionnez au moins un service' }]}>
            <Checkbox.Group options={['SMTP', 'IIS', 'IMAP', 'POP', 'UM']} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Détail certificat ─────────────────────────────────────────────── */}
      <Modal
        title={<Space><SafetyCertificateOutlined />Details du certificat</Space>}
        open={modalOpen}
        onCancel={() => setModal(false)}
        width={720}
        footer={<Button onClick={() => setModal(false)}>Fermer</Button>}
      >
        {selected && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Empreinte">
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{String(selected.Thumbprint ?? 'N/A')}</code>
            </Descriptions.Item>
            <Descriptions.Item label="Sujet">{String(selected.Subject ?? 'N/A')}</Descriptions.Item>
            <Descriptions.Item label="Emetteur">{String(selected.Issuer ?? 'N/A')}</Descriptions.Item>
            <Descriptions.Item label="Valide du">{formatDate(selected.NotBefore)}</Descriptions.Item>
            <Descriptions.Item label="Valide jusqu au">
              <Space>
                {formatDate(selected.NotAfter)}
                {(() => { const s = getStatus(selected); return <Tag color={s.tagColor}>{s.label}</Tag>; })()}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Auto-signe">
              {selected.IsSelfSigned ? <Tag color="orange">Oui</Tag> : <Tag color="green">Non</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Services">
              <Space wrap>
                {parseServices(selected.Services).length > 0
                  ? parseServices(selected.Services).map((s) => <Tag key={s} color="blue">{s}</Tag>)
                  : <span style={{ color: '#aaa' }}>Aucun service assigne</span>}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
