import { useEffect, useState } from 'react';
import { Table, Button, Typography, Tag, message, Modal, Descriptions, Form, Input, Tooltip, Space } from 'antd';
import { ReloadOutlined, DatabaseOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import type { MailboxDatabase } from '../../types/exchange.types';
import dayjs from 'dayjs';

const { Title } = Typography;

// Extract "1.9 GB" from "1.9 GB (2,040,110,080 bytes)"
const parseQuota = (v: string | undefined): string => {
  if (!v) return '';
  const m = v.match(/^([^(]+)/);
  return m ? m[1].trim() : v;
};

export default function DatabaseList() {
  const [databases, setDatabases] = useState<MailboxDatabase[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MailboxDatabase | null>(null);
  const [editTarget, setEditTarget] = useState<MailboxDatabase | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadDatabases = async () => {
    try {
      setLoading(true);
      const data = await exchangeApi.getDatabases();
      setDatabases(data);
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDatabases(); }, []);

  const openEdit = (row: MailboxDatabase) => {
    setEditTarget(row);
    form.setFieldsValue({
      IssueWarningQuota:        parseQuota((row as any).issueWarningQuota),
      ProhibitSendQuota:        parseQuota((row as any).prohibitSendQuota),
      ProhibitSendReceiveQuota: parseQuota((row as any).prohibitSendReceiveQuota),
      MailboxRetention:         (row as any).mailboxRetention || '',
      DeletedItemRetention:     (row as any).deletedItemRetention || '',
    });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await exchangeApi.updateDatabase(editTarget.name, {
        IssueWarningQuota:        values.IssueWarningQuota || undefined,
        ProhibitSendQuota:        values.ProhibitSendQuota || undefined,
        ProhibitSendReceiveQuota: values.ProhibitSendReceiveQuota || undefined,
        MailboxRetention:         values.MailboxRetention || undefined,
        DeletedItemRetention:     values.DeletedItemRetention || undefined,
      });
      message.success('Base de données mise à jour');
      setEditTarget(null);
      loadDatabases();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || `Erreur: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<MailboxDatabase> = [
    {
      title: 'Nom', dataIndex: 'name', key: 'name',
      render: (text) => <><DatabaseOutlined /> <strong>{text}</strong></>,
    },
    {
      title: 'Serveur', dataIndex: 'server', key: 'server',
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'État', dataIndex: 'mounted', key: 'mounted',
      render: (mounted: boolean) => mounted
        ? <Tag color="success" icon={<CheckCircleOutlined />}>Montée</Tag>
        : <Tag color="error" icon={<CloseCircleOutlined />}>Démontée</Tag>,
    },
    {
      title: 'Chemin EDB', dataIndex: 'edbFilePath', key: 'edbFilePath', ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: 'Quota avertissement', dataIndex: 'issueWarningQuota', key: 'issueWarningQuota',
      render: (v: string) => v || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: 'Quota interdiction envoi', dataIndex: 'prohibitSendQuota', key: 'prohibitSendQuota',
      render: (v: string) => v || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: 'Quota interdiction total', dataIndex: 'prohibitSendReceiveQuota', key: 'prohibitSendReceiveQuota',
      render: (v: string) => v || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="Voir détails">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(row)} />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>Bases de données de boîtes aux lettres</Title>
        <Button icon={<ReloadOutlined />} onClick={loadDatabases} loading={loading}>Actualiser</Button>
      </div>

      <Table columns={columns} dataSource={databases} rowKey={(r) => r.name || ''} loading={loading} size="small" />

      {/* Detail modal */}
      <Modal
        title={<><DatabaseOutlined /> {detail?.name}</>}
        open={!!detail} onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>Fermer</Button>}
        width={700}
      >
        {detail && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="Nom" span={2}><strong>{detail.name}</strong></Descriptions.Item>
            <Descriptions.Item label="Serveur"><Tag color="blue">{detail.server}</Tag></Descriptions.Item>
            <Descriptions.Item label="État">
              {detail.mounted
                ? <Tag color="success" icon={<CheckCircleOutlined />}>Montée</Tag>
                : <Tag color="error" icon={<CloseCircleOutlined />}>Démontée</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Chemin EDB" span={2}>{(detail as any).edbFilePath || '-'}</Descriptions.Item>
            <Descriptions.Item label="Dossier journaux" span={2}>{(detail as any).logFolderPath || '-'}</Descriptions.Item>
            <Descriptions.Item label="Quota avertissement">{detail.issueWarningQuota || '-'}</Descriptions.Item>
            <Descriptions.Item label="Quota interdiction envoi">{(detail as any).prohibitSendQuota || '-'}</Descriptions.Item>
            <Descriptions.Item label="Quota interdiction total" span={2}>{detail.prohibitSendReceiveQuota || '-'}</Descriptions.Item>
            <Descriptions.Item label="Rétention boîtes">{(detail as any).mailboxRetention || '-'}</Descriptions.Item>
            <Descriptions.Item label="Rétention items supprimés">{(detail as any).deletedItemRetention || '-'}</Descriptions.Item>
            <Descriptions.Item label="Créée le" span={2}>
              {(detail as any).whenCreated ? dayjs((detail as any).whenCreated).format('DD/MM/YYYY HH:mm') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Edit modal */}
      <Modal
        title={<><EditOutlined /> Modifier — {editTarget?.name}</>}
        open={!!editTarget} onCancel={() => setEditTarget(null)}
        onOk={handleSave} confirmLoading={saving}
        okText="Enregistrer" cancelText="Annuler"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            label="Quota avertissement" name="IssueWarningQuota"
            tooltip="Ex : 1.9 GB ou Unlimited"
          >
            <Input placeholder="ex: 1.9 GB" />
          </Form.Item>
          <Form.Item
            label="Quota interdiction d'envoi" name="ProhibitSendQuota"
            tooltip="Ex : 2 GB ou Unlimited"
          >
            <Input placeholder="ex: 2 GB" />
          </Form.Item>
          <Form.Item
            label="Quota interdiction total (envoi + réception)" name="ProhibitSendReceiveQuota"
            tooltip="Ex : 2.3 GB ou Unlimited"
          >
            <Input placeholder="ex: 2.3 GB" />
          </Form.Item>
          <Form.Item
            label="Rétention boîtes supprimées" name="MailboxRetention"
            tooltip="Format : jours.heures:minutes:secondes — ex: 30.00:00:00"
          >
            <Input placeholder="ex: 30.00:00:00" />
          </Form.Item>
          <Form.Item
            label="Rétention éléments supprimés" name="DeletedItemRetention"
            tooltip="Format : jours.heures:minutes:secondes — ex: 14.00:00:00"
          >
            <Input placeholder="ex: 14.00:00:00" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

