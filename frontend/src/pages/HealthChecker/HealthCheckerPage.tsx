import { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Card, Col, Collapse, Input, Row, Space, Statistic,
  Table, Tabs, Tag, Typography, message,
} from 'antd';
import {
  FileSearchOutlined, ReloadOutlined, DownloadOutlined, LinkOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, InfoCircleOutlined,
  CopyOutlined, ServerOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { exchangeApi } from '../../services/api.service';

const { Title, Text } = Typography;

type Finding = { name: string; value: string; severity: string };
type Section = { title: string; items: Finding[] };
type ServerAnalysis = {
  serverName: string;
  reportDate: string;
  fileName: string;
  htmlFileName?: string;
  exchangeVersion: string;
  serverRole: string;
  osVersion: string;
  overallStatus: 'red' | 'yellow' | 'green';
  summary: { red: number; yellow: number; green: number; info: number };
  sections: Section[];
  fileSize: number;
};

type Report = {
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

const severityIcon = (s: string) => {
  switch (s) {
    case 'red': return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
    case 'yellow': return <WarningOutlined style={{ color: '#faad14' }} />;
    case 'green': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    default: return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
  }
};

const statusColor = (s: string) => s === 'red' ? '#f5222d' : s === 'yellow' ? '#faad14' : '#52c41a';
const statusLabel = (s: string) => s === 'red' ? 'Critique' : s === 'yellow' ? 'Attention' : 'OK';

export default function HealthCheckerPage() {
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<ServerAnalysis[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [resultsPath, setResultsPath] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [analysis, reportsData] = await Promise.all([
        exchangeApi.getHealthCheckerAnalysis(),
        exchangeApi.getHealthCheckerReports(),
      ]);
      setServers(analysis.servers || []);
      setReports(reportsData.reports || []);
      setResultsPath(reportsData.path || '');
    } catch (e: any) {
      message.error(`Erreur: ${e?.message ?? 'Impossible de charger les résultats'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const path = resultsPath || 'C:\\Logs\\ExchangeHealthChecker';
  const manualCommand = [
    `$resultsPath = '${path}'`,
    `New-Item -ItemType Directory -Path $resultsPath -Force | Out-Null`,
    `Set-Location "$resultsPath\\Diagnostics\\HealthChecker"`,
    ``,
    `# Analyse de tous les serveurs de l'infra + rapport HTML`,
    `Get-ExchangeServer | ForEach-Object {`,
    `    Write-Host "===== Analyse de $($_.Name) =====" -ForegroundColor Cyan`,
    `    .\\HealthChecker.ps1 -Server $_.Name -OutputFilePath $resultsPath -BuildHtmlReport`,
    `}`,
  ].join('\n');

  // Global aggregation
  const totalRed = servers.reduce((a, s) => a + s.summary.red, 0);
  const totalYellow = servers.reduce((a, s) => a + s.summary.yellow, 0);
  const totalGreen = servers.reduce((a, s) => a + s.summary.green, 0);
  const globalStatus = totalRed > 0 ? 'red' : totalYellow > 0 ? 'yellow' : 'green';

  const fileColumns: ColumnsType<Report> = [
    { title: 'Fichier', dataIndex: 'fileName', ellipsis: true },
    { title: 'Type', dataIndex: 'extension', width: 90, render: (v: string) => <Tag>{(v || '').replace('.', '').toUpperCase()}</Tag> },
    { title: 'Taille', dataIndex: 'sizeBytes', width: 100, render: (v: number) => formatSize(v) },
    { title: 'Date', dataIndex: 'lastWriteTime', width: 160, render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '-' },
    {
      title: 'Actions', width: 180, render: (_, row) => (
        <Space>
          <Button size="small" icon={<LinkOutlined />} onClick={() => window.open(exchangeApi.getHealthCheckerReportUrl(row.fileName), '_blank')}>Ouvrir</Button>
          <Button size="small" icon={<DownloadOutlined />} href={exchangeApi.getHealthCheckerReportUrl(row.fileName)}>DL</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          <FileSearchOutlined style={{ marginRight: 8 }} />
          HealthChecker Exchange
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
          <a href="https://microsoft.github.io/CSS-Exchange/Diagnostics/HealthChecker/" target="_blank" rel="noreferrer">
            <Button type="link">Documentation</Button>
          </a>
        </Space>
      </div>

      {/* Global stats */}
      {servers.length > 0 && (
        <Card size="small" style={{ marginBottom: 20, borderLeft: `4px solid ${statusColor(globalStatus)}` }}>
          <Row gutter={24}>
            <Col>
              <Statistic title="Serveurs analysés" value={servers.length} prefix={<ServerOutlined />} />
            </Col>
            <Col>
              <Statistic title="Critiques" value={totalRed} valueStyle={{ color: totalRed > 0 ? '#f5222d' : '#8c8c8c' }} prefix={<CloseCircleOutlined />} />
            </Col>
            <Col>
              <Statistic title="Avertissements" value={totalYellow} valueStyle={{ color: totalYellow > 0 ? '#faad14' : '#8c8c8c' }} prefix={<WarningOutlined />} />
            </Col>
            <Col>
              <Statistic title="OK" value={totalGreen} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
            </Col>
            <Col>
              <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                Statut global : <Tag color={statusColor(globalStatus)} style={{ fontSize: 14, padding: '2px 12px' }}>{statusLabel(globalStatus)}</Tag>
              </Text>
            </Col>
          </Row>
        </Card>
      )}

      {/* No data state */}
      {servers.length === 0 && !loading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message="Aucun rapport HealthChecker trouvé"
          description="Lancez la commande ci-dessous (onglet « Commande manuelle ») dans un Exchange Management Shell (Administrateur) pour générer les rapports."
        />
      )}

      {/* Server cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {servers.map((srv) => (
          <Col xs={24} key={srv.serverName}>
            <Badge.Ribbon text={statusLabel(srv.overallStatus)} color={statusColor(srv.overallStatus)}>
              <Card
                title={
                  <Space>
                    <ServerOutlined />
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{srv.serverName}</span>
                    <Tag color="blue">{srv.exchangeVersion}</Tag>
                    <Tag>{srv.serverRole}</Tag>
                  </Space>
                }
                size="small"
                extra={
                  <Space>
                    <Text type="secondary">{srv.reportDate}</Text>
                    {srv.htmlFileName && (
                      <Button size="small" type="primary" ghost icon={<LinkOutlined />}
                        onClick={() => window.open(exchangeApi.getHealthCheckerReportUrl(srv.htmlFileName!), '_blank')}>
                        Rapport HTML
                      </Button>
                    )}
                    <Button size="small" icon={<DownloadOutlined />}
                      onClick={() => window.open(exchangeApi.getHealthCheckerReportUrl(srv.fileName), '_blank')}>
                      TXT
                    </Button>
                  </Space>
                }
              >
                {/* Summary row */}
                <Row gutter={16} style={{ marginBottom: 12 }}>
                  <Col>
                    <Space>
                      <CloseCircleOutlined style={{ color: '#f5222d' }} />
                      <Text strong style={{ color: srv.summary.red > 0 ? '#f5222d' : undefined }}>
                        {srv.summary.red} critique{srv.summary.red !== 1 ? 's' : ''}
                      </Text>
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <WarningOutlined style={{ color: '#faad14' }} />
                      <Text strong style={{ color: srv.summary.yellow > 0 ? '#faad14' : undefined }}>
                        {srv.summary.yellow} avertissement{srv.summary.yellow !== 1 ? 's' : ''}
                      </Text>
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <Text>{srv.summary.green} OK</Text>
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <InfoCircleOutlined style={{ color: '#1890ff' }} />
                      <Text type="secondary">{srv.summary.info} info</Text>
                    </Space>
                  </Col>
                  <Col>
                    <Text type="secondary">OS : {srv.osVersion}</Text>
                  </Col>
                </Row>

                {/* Sections with findings */}
                <Collapse
                  size="small"
                  items={srv.sections
                    .filter(sec => sec.items.length > 0)
                    .map((sec, idx) => {
                      const secRed = sec.items.filter(i => i.severity === 'red').length;
                      const secYellow = sec.items.filter(i => i.severity === 'yellow').length;
                      const secStatus = secRed > 0 ? 'red' : secYellow > 0 ? 'yellow' : 'green';
                      return {
                        key: idx,
                        label: (
                          <Space>
                            {severityIcon(secStatus)}
                            <Text strong>{sec.title}</Text>
                            {secRed > 0 && <Tag color="red">{secRed}</Tag>}
                            {secYellow > 0 && <Tag color="orange">{secYellow}</Tag>}
                            <Tag color="default">{sec.items.length} élément{sec.items.length > 1 ? 's' : ''}</Tag>
                          </Space>
                        ),
                        children: (
                          <div style={{ maxHeight: 400, overflow: 'auto' }}>
                            {sec.items.map((item, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: '4px 8px',
                                  borderLeft: `3px solid ${statusColor(item.severity === 'info' ? 'green' : item.severity)}`,
                                  marginBottom: 2,
                                  background: item.severity === 'red' ? '#fff2f0'
                                    : item.severity === 'yellow' ? '#fffbe6'
                                    : 'transparent',
                                  fontFamily: 'Consolas, monospace',
                                  fontSize: 12,
                                }}
                              >
                                <Space size={4}>
                                  {severityIcon(item.severity)}
                                  <Text strong style={{ minWidth: 200, display: 'inline-block' }}>{item.name}</Text>
                                  {item.value && <Text>{item.value}</Text>}
                                </Space>
                              </div>
                            ))}
                          </div>
                        ),
                      };
                    })}
                  defaultActiveKey={
                    srv.sections
                      .map((sec, idx) => ({ idx, hasIssues: sec.items.some(i => i.severity === 'red' || i.severity === 'yellow') }))
                      .filter(s => s.hasIssues)
                      .map(s => s.idx)
                  }
                />
              </Card>
            </Badge.Ribbon>
          </Col>
        ))}
      </Row>

      {/* Tabs: Files + Command */}
      <Tabs
        defaultActiveKey={servers.length > 0 ? 'files' : 'command'}
        items={[
          {
            key: 'files',
            label: `Fichiers (${reports.length})`,
            children: (
              <Table
                rowKey="fileName"
                dataSource={reports}
                columns={fileColumns}
                loading={loading}
                size="small"
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: 'Aucun fichier' }}
              />
            ),
          },
          {
            key: 'command',
            label: 'Commande manuelle',
            children: (
              <Alert
                type="warning"
                showIcon
                message="Exchange Management Shell (Administrateur)"
                description={
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Text type="secondary">
                      Copiez et exécutez cette commande dans un Exchange Management Shell lancé en tant qu'Administrateur.
                    </Text>
                    <Input.TextArea
                      rows={9}
                      readOnly
                      value={manualCommand}
                      style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
                    />
                    <Button
                      icon={<CopyOutlined />}
                      onClick={async () => {
                        await navigator.clipboard.writeText(manualCommand);
                        message.success('Commande copiée !');
                      }}
                    >
                      Copier la commande
                    </Button>
                  </Space>
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}