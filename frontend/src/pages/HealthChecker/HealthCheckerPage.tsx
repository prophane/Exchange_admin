import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Table, Tag, Typography, message } from 'antd';
import { FileSearchOutlined, ReloadOutlined, DownloadOutlined, LinkOutlined, PlayCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { exchangeApi } from '../../services/api.service';
import { useAuth } from '../../context/useAuth';

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<HealthCheckerReport[]>([]);
  const [resultsPath, setResultsPath] = useState('');
  const [server, setServer] = useState('');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState('');
  const [runStatus, setRunStatus] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const pollTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    setServer(user?.serverFqdn ?? '');
    load();
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const state = await exchangeApi.getHealthCheckerRunStatus(id);
        setRunStatus(state.status || '');
        setRunOutput(state.output || '');
        setRunError(state.error || '');

        if (state.status === 'completed' || state.status === 'failed') {
          stopPolling();
          setRunning(false);
          if (state.status === 'completed') {
            message.success('Analyse HealthChecker terminée');
            load();
          } else {
            message.error('Analyse HealthChecker en échec');
          }
        }
      } catch (e: any) {
        stopPolling();
        setRunning(false);
        message.error(`Erreur suivi HealthChecker: ${e?.message ?? 'Erreur inconnue'}`);
      }
    }, 3000);
  };

  const runAnalysis = async () => {
    try {
      setRunError('');
      setRunOutput('');
      setRunning(true);
      setRunStatus('queued');
      const run = await exchangeApi.startHealthCheckerRun(server || undefined);
      setRunId(run.runId);
      setRunStatus(run.status);
      startPolling(run.runId);
      message.info('Analyse HealthChecker démarrée');
    } catch (e: any) {
      setRunning(false);
      const msg = e?.response?.data?.error ?? e?.message ?? 'Impossible de démarrer l’analyse';
      setRunError(msg);
      message.error(msg);
    }
  };

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

      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          style={{ width: 280 }}
          placeholder="Serveur Exchange (optionnel)"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          disabled={running}
        />
        <Button
          type="primary"
          icon={running ? <LoadingOutlined /> : <PlayCircleOutlined />}
          loading={running}
          onClick={runAnalysis}
        >
          Lancer l'analyse
        </Button>
        <Button size="middle" icon={<ReloadOutlined />} onClick={load} disabled={running}>
          Actualiser les résultats
        </Button>
      </Space>

      {(runId || runStatus || runError) && (
        <Alert
          style={{ marginBottom: 16 }}
          type={runStatus === 'failed' ? 'error' : runStatus === 'completed' ? 'success' : 'warning'}
          showIcon
          message={`Exécution HealthChecker${runStatus ? ` — ${runStatus}` : ''}`}
          description={
            <Space direction="vertical" size={4}>
              {runId ? <Text type="secondary">Run ID : {runId}</Text> : null}
              {runError ? <Text type="danger">{runError}</Text> : null}
              {runOutput ? <Text style={{ whiteSpace: 'pre-wrap' }}>{runOutput}</Text> : null}
            </Space>
          }
        />
      )}

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