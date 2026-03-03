import { useEffect, useState } from 'react';
import {
  Button, Input, Modal, Space, Table, Tag, Typography,
  Descriptions, Tabs, Spin, message,
} from 'antd';
import {
  EyeOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { exchangeApi } from '../../services/api.service';
import type { Mailbox, MailboxStatistics } from '../../types/exchange.types';
import { SYSTEM_MAILBOX_TYPES, isSystemMailbox } from './MailboxList';

const { Title } = Typography;
const { Search } = Input;

const RECIPIENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ArbitrationMailbox:     { label: 'Arbitrage',      color: 'lime'    },
  DiscoveryMailbox:       { label: 'Découverte',      color: 'gold'    },
  SystemMailbox:          { label: 'Système',         color: 'default' },
  SystemAttendantMailbox: { label: 'Système',         color: 'default' },
  PublicFolderMailbox:    { label: 'Dossier public',  color: 'purple'  },
  MonitoringMailbox:      { label: 'Surveillance',    color: 'cyan'    },
  '8192':      { label: 'Système',        color: 'default' },
  '16384':     { label: 'Système',        color: 'default' },
  '8388608':   { label: 'Arbitrage',      color: 'lime'    },
  '536870912': { label: 'Découverte',     color: 'gold'    },
  '2147483648':{ label: 'Dossier public', color: 'purple'  },
};

function TypeTag({ value }: { value?: string }) {
  if (!value) return <Tag>-</Tag>;
  const entry = RECIPIENT_TYPE_LABELS[String(value)];
  if (entry) return <Tag color={entry.color}>{entry.label}</Tag>;
  return <Tag>{value}</Tag>;
}

export default function SystemMailboxList() {
  const [mailboxes, setMailboxes]   = useState<Mailbox[]>([]);
  const [filtered, setFiltered]     = useState<Mailbox[]>([]);
  const [loading, setLoading]       = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected]     = useState<Mailbox | null>(null);
  const [stats, setStats]           = useState<MailboxStatistics | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await exchangeApi.getMailboxes(2000);
      const sys = data.filter(m => isSystemMailbox(m.recipientTypeDetails));
      setMailboxes(sys);
      setFiltered(sys);
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!searchTerm) { setFiltered(mailboxes); return; }
    const q = searchTerm.toLowerCase();
    setFiltered(mailboxes.filter(m =>
      m.displayName?.toLowerCase().includes(q) ||
      m.primarySmtpAddress?.toLowerCase().includes(q) ||
      m.alias?.toLowerCase().includes(q)
    ));
  }, [searchTerm, mailboxes]);

  const openDetail = async (mb: Mailbox) => {
    setSelected(mb);
    setModalOpen(true);
    setDetailLoading(true);
    try {
      const [full, s] = await Promise.all([
        exchangeApi.getMailbox(mb.primarySmtpAddress || mb.alias || ''),
        exchangeApi.getMailboxStatistics(mb.primarySmtpAddress || mb.alias || '').catch(() => null),
      ]);
      setSelected(full);
      setStats(s);
    } catch { /* on garde mb original */ }
    finally { setDetailLoading(false); }
  };

  const columns: ColumnsType<Mailbox> = [
    {
      title: 'Nom d\'affichage',
      dataIndex: 'displayName',
      render: (t) => <strong>{t}</strong>,
      sorter: (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
    },
    { title: 'Alias', dataIndex: 'alias' },
    { title: 'Adresse email', dataIndex: 'primarySmtpAddress' },
    {
      title: 'Type',
      dataIndex: 'recipientTypeDetails',
      render: (v) => <TypeTag value={v} />,
      filters: [
        { text: 'Arbitrage',       value: 'ArbitrationMailbox'     },
        { text: 'Découverte',      value: 'DiscoveryMailbox'        },
        { text: 'Dossier public',  value: 'PublicFolderMailbox'     },
        { text: 'Système',         value: 'SystemMailbox'           },
        { text: 'Surveillance',    value: 'MonitoringMailbox'       },
      ],
      onFilter: (value, record) => {
        const v = String(record.recipientTypeDetails ?? '');
        const a = RECIPIENT_TYPE_LABELS[v]?.label;
        const b = RECIPIENT_TYPE_LABELS[String(value)]?.label;
        return !!a && a === b;
      },
    },
    {
      title: 'Base de données',
      dataIndex: 'database',
      render: (t) => t ? <Tag color="blue">{t}</Tag> : '-',
    },
    {
      title: 'Créé le',
      dataIndex: 'whenCreated',
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '-',
      sorter: (a, b) => {
        if (!a.whenCreated) return -1;
        if (!b.whenCreated) return 1;
        return dayjs(a.whenCreated).unix() - dayjs(b.whenCreated).unix();
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>Voir</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={2}>Boîtes système</Title>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Search
          placeholder="Rechercher..."
          allowClear
          enterButton={<SearchOutlined />}
          size="large"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: 500 }}
        />
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey={(r) => r.primarySmtpAddress || r.alias || r.name || ''}
        loading={loading}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showTotal: (total) => `Total : ${total} boîte${total > 1 ? 's' : ''} système`,
        }}
      />

      <Modal
        title="Détails — Boîte système"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setSelected(null); setStats(null); }}
        footer={<Button onClick={() => { setModalOpen(false); setSelected(null); setStats(null); }}>Fermer</Button>}
        width={720}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : selected && (
          <Tabs items={[
            {
              key: 'general',
              label: 'Général',
              children: (
                <Descriptions column={1} bordered>
                  <Descriptions.Item label="Nom d'affichage">{selected.displayName}</Descriptions.Item>
                  <Descriptions.Item label="Adresse email">{selected.primarySmtpAddress}</Descriptions.Item>
                  <Descriptions.Item label="Alias">{selected.alias}</Descriptions.Item>
                  <Descriptions.Item label="Type"><TypeTag value={selected.recipientTypeDetails ?? undefined} /></Descriptions.Item>
                  <Descriptions.Item label="Base de données"><Tag color="blue">{selected.database}</Tag></Descriptions.Item>
                  <Descriptions.Item label="OU">{selected.organizationalUnit || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Créé le">{selected.whenCreated ? dayjs(selected.whenCreated).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                  <Descriptions.Item label="Modifié le">{selected.whenChanged ? dayjs(selected.whenChanged).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'quotas',
              label: 'Quotas',
              children: (
                <Descriptions column={1} bordered>
                  <Descriptions.Item label="BD par défaut">
                    <Tag color={selected.useDatabaseQuotaDefaults ? 'green' : 'orange'}>
                      {selected.useDatabaseQuotaDefaults ? 'Oui' : 'Non'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Avertissement">{selected.issueWarningQuota || 'Par défaut'}</Descriptions.Item>
                  <Descriptions.Item label="Interdiction envoi">{selected.prohibitSendQuota || 'Par défaut'}</Descriptions.Item>
                  <Descriptions.Item label="Interdiction envoi/réception">{selected.prohibitSendReceiveQuota || 'Par défaut'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            ...(stats ? [{
              key: 'stats',
              label: 'Statistiques',
              children: (
                <Descriptions column={1} bordered>
                  <Descriptions.Item label="Nombre d'éléments">{stats.itemCount?.toLocaleString() || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Taille totale">{stats.totalItemSize || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Dernière connexion">{stats.lastLogonTime ? dayjs(stats.lastLogonTime).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                </Descriptions>
              ),
            }] : []),
          ]} />
        )}
      </Modal>
    </div>
  );
}
