import { useEffect, useState } from 'react';
import { Table, Button, Typography, Tag, message, Popconfirm, Space } from 'antd';
import { ReloadOutlined, SendOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import type { Queue } from '../../types/exchange.types';

const { Title } = Typography;

export default function QueueList() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(false);

  const loadQueues = async () => {
    try {
      setLoading(true);
      const data = await exchangeApi.getQueues();
      setQueues(data);
      const totalMessages = data.reduce((sum, q) => sum + (q.messageCount || 0), 0);
      message.success(`${data.length} files chargées (${totalMessages} messages)`);
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
    const interval = setInterval(loadQueues, 30000); // Rafraîchir toutes les 30 secondes
    return () => clearInterval(interval);
  }, []);

  const handleRetryQueue = async (queueIdentity: string) => {
    try {
      await exchangeApi.retryQueue(queueIdentity);
      message.success('File d\'attente relancée');
      loadQueues();
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    }
  };

  const columns: ColumnsType<Queue> = [
    {
      title: 'Identité',
      dataIndex: 'identity',
      key: 'identity',
      render: (text) => (
        <Space>
          <SendOutlined />
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'deliveryType',
      key: 'deliveryType',
      render: (text) => <Tag>{text}</Tag>,
    },
    {
      title: 'État',
      dataIndex: 'status',
      key: 'status',
      render: (text) => {
        const color =
          text === 'Active' ? 'green' : text === 'Retry' ? 'orange' : 'default';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Messages',
      dataIndex: 'messageCount',
      key: 'messageCount',
      render: (count: number) => {
        const color = count > 100 ? 'red' : count > 10 ? 'orange' : 'green';
        return (
          <Tag color={color} icon={count > 100 ? <WarningOutlined /> : null}>
            {count}
          </Tag>
        );
      },
      sorter: (a, b) => (a.messageCount || 0) - (b.messageCount || 0),
    },
    {
      title: 'Domaine suivant',
      dataIndex: 'nextHopDomain',
      key: 'nextHopDomain',
    },
    {
      title: 'Dernière erreur',
      dataIndex: 'lastError',
      key: 'lastError',
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Popconfirm
          title="Relancer cette file d'attente?"
          onConfirm={() => handleRetryQueue(record.identity || '')}
          okText="Oui"
          cancelText="Non"
        >
          <Button type="link" icon={<SyncOutlined />}>
            Relancer
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={2}>Files d'attente SMTP</Title>
          <Button icon={<ReloadOutlined />} onClick={loadQueues} loading={loading}>
            Actualiser
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={queues}
        rowKey={(record) => record.identity || ''}
        loading={loading}
        pagination={{
          pageSize: 20,
          showTotal: (total) => `Total: ${total} files d'attente`,
        }}
      />
    </div>
  );
}
