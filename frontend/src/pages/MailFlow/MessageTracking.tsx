import { useState } from 'react';
import {
  Table, Button, Typography, Tag, message,
  Form, Input, DatePicker, InputNumber, Card,
} from 'antd';
import { SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const EVENT_COLORS: Record<string, string> = {
  RECEIVE: 'blue',
  DELIVER: 'green',
  SEND:    'cyan',
  FAIL:    'red',
  DEFER:   'orange',
  RESOLVE: 'purple',
  EXPAND:  'gold',
  REDIRECT:'geekblue',
};

export default function MessageTracking() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSearch = async (values: any) => {
    setLoading(true);
    try {
      const [start, end] = values.dateRange || [];
      const data = await exchangeApi.trackMessages({
        sender: values.sender || undefined,
        recipient: values.recipient || undefined,
        start: start ? start.toISOString() : undefined,
        end: end ? end.toISOString() : undefined,
        maxResults: values.maxResults || 100,
      });
      setResults(data);
      if (!data.length) message.info('Aucun message trouvé');
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  const columns: ColumnsType<any> = [
    {
      title: 'Horodatage',
      dataIndex: 'Timestamp',
      width: 160,
      render: v => v ? dayjs(v).format('DD/MM/YYYY HH:mm:ss') : '-',
      sorter: (a, b) => (a.Timestamp || '') < (b.Timestamp || '') ? -1 : 1,
    },
    {
      title: 'Événement',
      dataIndex: 'EventId',
      width: 100,
      render: v => <Tag color={EVENT_COLORS[String(v)] || 'default'}>{v}</Tag>,
    },
    { title: 'Source', dataIndex: 'Source', width: 100 },
    { title: 'Expéditeur', dataIndex: 'Sender', ellipsis: true },
    {
      title: 'Destinataires',
      dataIndex: 'Recipients',
      ellipsis: true,
      render: v => Array.isArray(v) ? v.join(', ') : String(v || '-'),
    },
    { title: 'Objet', dataIndex: 'MessageSubject', ellipsis: true },
    { title: 'Serveur', dataIndex: 'ServerHostname' },
    {
      title: 'Taille',
      dataIndex: 'TotalBytes',
      render: v => v ? `${Math.round(Number(v) / 1024)} Ko` : '-',
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <HistoryOutlined style={{ marginRight: 8 }} />
        Suivi des messages
      </Title>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="sender" label="Expéditeur">
            <Input placeholder="utilisateur@domaine.com" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="recipient" label="Destinataire">
            <Input placeholder="utilisateur@domaine.com" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="dateRange" label="Période">
            <RangePicker showTime format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item name="maxResults" label="Max" initialValue={100}>
            <InputNumber min={1} max={1000} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} icon={<SearchOutlined />}>
              Rechercher
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Table
        rowKey={(r, i) => `${r.MessageId || ''}-${i}`}
        dataSource={results}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 50 }}
        size="small"
        scroll={{ x: 1200 }}
        footer={() => results.length ? `${results.length} entrées trouvées` : ''}
      />
    </div>
  );
}
