import { useEffect, useState } from 'react';
import { Table, Typography, Tag, message, Tabs, Button, Alert } from 'antd';
import { ReloadOutlined, AuditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

function RetentionPoliciesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getRetentionPolicies()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Par défaut', dataIndex: 'IsDefault', render: v => v ? <Tag color="green">Oui</Tag> : <Tag>Non</Tag> },
    { title: 'Modifié le', dataIndex: 'WhenChanged', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
  ];

  return (
    <Table rowKey="Name" dataSource={data} columns={columns} loading={loading} size="small"
      pagination={{ pageSize: 20 }} footer={() => `${data.length} stratégies`}
      title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
  );
}

function RetentionTagsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getRetentionPolicyTags()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Mapping noms Exchange → libellés lisibles (int ou string)
  const TAG_TYPE_NUM: Record<number, string> = {
    0: 'Tous les éléments', 1: 'Calendrier', 2: 'Contacts', 3: 'Éléments supprimés',
    4: 'Brouillons', 5: 'Boîte de réception', 6: 'Courrier indésirable', 7: 'Journal',
    8: 'Notes', 9: 'Boîte d\'envoi', 10: 'Éléments envoyés', 11: 'Tâches',
    12: 'Tous (par défaut)', 17: 'Tag personnel', 18: 'Éléments récupérables',
  };
  const TAG_TYPE_STR: Record<string, string> = {
    All: 'Tous (par défaut)', Personal: 'Tag personnel', Calendar: 'Calendrier',
    Contacts: 'Contacts', DeletedItems: 'Éléments supprimés', Drafts: 'Brouillons',
    Inbox: 'Boîte de réception', JunkEmail: 'Courrier indésirable', Journal: 'Journal',
    Notes: 'Notes', Outbox: 'Boîte d\'envoi', SentItems: 'Éléments envoyés',
    Tasks: 'Tâches', RecoverableItems: 'Éléments récupérables',
  };

  const ACTION_MAP: Record<string, { label: string; color: string }> = {
    MoveToArchive:           { label: 'Vers archive',        color: 'blue'    },
    DeleteAndAllowRecovery:  { label: 'Suppr. récupérable',  color: 'orange'  },
    PermanentlyDelete:       { label: 'Suppr. définitive',   color: 'red'     },
    MoveToDeletedItems:      { label: 'Vers corbeille',      color: 'volcano' },
    MarkAsPastRetentionLimit:{ label: 'Marquer expiré',      color: 'gold'    },
    MoveToFolder:            { label: 'Vers dossier',        color: 'cyan'    },
    None:                    { label: 'Aucune',              color: 'default' },
    '0': { label: 'Aucune',              color: 'default' },
    '1': { label: 'Vers dossier',        color: 'cyan'    },
    '2': { label: 'Suppr. récupérable',  color: 'orange'  },
    '3': { label: 'Suppr. définitive',   color: 'red'     },
    '4': { label: 'Marquer expiré',      color: 'gold'    },
    '5': { label: 'Vers corbeille',      color: 'volcano' },
    '6': { label: 'Vers archive',        color: 'blue'    },
  };

  // Convertit un EnhancedTimeSpan Exchange ("365.00:00:00") en texte lisible
  const formatAgeLimit = (v: any): string => {
    if (!v || v === 'Illimitée') return 'Illimitée';
    const s = String(v);
    // Format "d.HH:mm:ss" ou "d"
    const days = parseInt(s.split('.')[0], 10);
    if (isNaN(days)) return s;
    if (days >= 365 * 5) return `${Math.round(days / 365)} ans`;
    if (days >= 365)     return `${Math.round(days / 365)} an${Math.round(days/365) > 1 ? 's' : ''}`;
    if (days >= 30)      return `${Math.round(days / 30)} mois`;
    return `${days} jour${days > 1 ? 's' : ''}`;
  };

  const resolveType = (v: any): string => {
    const s = String(v ?? '');
    if (TAG_TYPE_STR[s]) return TAG_TYPE_STR[s];
    const n = parseInt(s, 10);
    if (!isNaN(n) && TAG_TYPE_NUM[n]) return TAG_TYPE_NUM[n];
    return s || '-';
  };
  const resolveAction = (v: any): { label: string; color: string } => {
    const s = String(v ?? '');
    return ACTION_MAP[s] ?? { label: s || '-', color: 'default' };
  };

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Type', dataIndex: 'Type', render: v => <Tag>{resolveType(v)}</Tag> },
    {
      title: 'Action',
      dataIndex: 'RetentionAction',
      render: v => { const a = resolveAction(v); return <Tag color={a.color}>{a.label}</Tag>; },
    },
    { title: 'Limite d\'âge', dataIndex: 'AgeLimitForRetention', render: v => formatAgeLimit(v) },
    { title: 'Par défaut', dataIndex: 'IsDefaultTag', render: v => v === true || v === 'True' || v === 'true' ? <Tag color="green">Oui</Tag> : null },
  ];

  return (
    <Table rowKey="Name" dataSource={data} columns={columns} loading={loading} size="small"
      pagination={{ pageSize: 20 }} footer={() => `${data.length} balises`}
      title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
  );
}

function JournalRulesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getJournalRules()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name' },
    { title: 'Activée', dataIndex: 'Enabled', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Oui' : 'Non'}</Tag> },
    { title: 'Portée', dataIndex: 'Scope', render: v => <Tag>{v}</Tag> },
    { title: 'Destinataire', dataIndex: 'Recipient', ellipsis: true },
    { title: 'Adresse journal', dataIndex: 'JournalEmailAddress', ellipsis: true },
  ];

  return (
    <Table rowKey="Name" dataSource={data} columns={columns} loading={loading} size="small"
      pagination={{ pageSize: 20 }} footer={() => `${data.length} règles`}
      title={() => <Button icon={<ReloadOutlined />} onClick={load} size="small">Actualiser</Button>} />
  );
}

function EdiscoveryTab() {
  return (
    <Alert
      type="info"
      showIcon
      message="Découverte en place (In-Place eDiscovery & Hold)"
      description="Utilisez l'interface Exchange Admin Center native ou les cmdlets PowerShell New-MailboxSearch / Get-MailboxSearch pour gérer les recherches eDiscovery sur Exchange 2010."
      style={{ marginTop: 16 }}
    />
  );
}

export default function CompliancePage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <AuditOutlined style={{ marginRight: 8 }} />
        Gestion de la conformité
      </Title>
      <Tabs items={[
        { key: 'ediscovery', label: 'Découverte en place', children: <EdiscoveryTab /> },
        { key: 'retention', label: 'Stratégies de rétention', children: <RetentionPoliciesTab /> },
        { key: 'tags', label: 'Balises de rétention', children: <RetentionTagsTab /> },
        { key: 'journal', label: 'Règles de journal', children: <JournalRulesTab /> },
      ]} />
    </div>
  );
}
