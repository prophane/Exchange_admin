import { useEffect, useState } from 'react';
import { Alert, Button, Space, Table, Tag, Typography, message } from 'antd';
import { FileSearchOutlined, ReloadOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { exchangeApi } from '../../services/api.service';

const { Title, Text } = Typography;

type HealthCheckerReport = {
  fileName: string;
  extension: string;
  sizeBytes: number;
  lastWriteTime: string;
};

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HealthCheckerPage() {
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<HealthCheckerReport[]>([]);
  const [resultsPath, setResultsPath] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await exchangeApi.getHealthCheckerReports();
      setReports(data.reports || []);
      setResultsPath(data.path || '');
    } catch (e: any) {
      message.error(`Erreur: ${e?.message ?? 'Impossible de charger les résultats HealthChecker'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openReport = (fileName: string) => {
    const url = exchangeApi.getHealthCheckerReportUrl(fileName);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const columns: ColumnsType<HealthCheckerReport> = [
    { title: 'Fichier', dataIndex: 'fileName', ellipsis: true },
    {
      title: 'Type',
      dataIndex: 'extension',
      width: 110,
      render: (v: string) => <Tag>{(v || '').replace('.', '').toUpperCase() || '-'}</Tag>,
    },
    {
      title: 'Taille',
      dataIndex: 'sizeBytes',
      width: 120,
      render: (v: number) => formatSize(v),
    },
    {
      title: 'Modifié le',
      dataIndex: 'lastWriteTime',
      width: 180,
      render: (v: string) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '-'),
    },
    {
      title: 'Actions',
      width: 180,
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<LinkOutlined />} onClick={() => openReport(row.fileName)}>
            Ouvrir
          </Button>
          <Button size="small" icon={<DownloadOutlined />} href={exchangeApi.getHealthCheckerReportUrl(row.fileName)}>
            Télécharger
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <FileSearchOutlined style={{ marginRight: 8 }} />
        HealthChecker Exchange
      </Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Diagnostic Microsoft CSS-Exchange"
        description={
          <Space direction="vertical" size={4}>
            <Text>
              Utilisez le script officiel HealthChecker.ps1 pour générer les rapports de santé Exchange.
            </Text>
            <a href="https://microsoft.github.io/CSS-Exchange/Diagnostics/HealthChecker/" target="_blank" rel="noreferrer">
              Ouvrir la documentation HealthChecker
            </a>
            {resultsPath ? <Text type="secondary">Dossier des résultats : {resultsPath}</Text> : null}
          </Space>
        }
      />

      <Table
        rowKey="fileName"
        dataSource={reports}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: 'Aucun rapport HealthChecker trouvé' }}
        title={() => (
          <Button size="small" icon={<ReloadOutlined />} onClick={load}>
            Actualiser les résultats
          </Button>
        )}
        footer={() => `${reports.length} rapport(s)`}
      />
    </div>
  );
}