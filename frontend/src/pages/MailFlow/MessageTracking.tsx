import { useMemo, useState } from 'react';
import {
  Table, Button, Typography, Tag, message,
  Form, Input, DatePicker, InputNumber, Card, Select,
} from 'antd';
import { SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const EVENT_COLORS: Record<string, string> = {
  RECEIVE:     'blue',
  DELIVER:     'green',
  SEND:        'cyan',
  FAIL:        'red',
  DEFER:       'orange',
  RESOLVE:     'purple',
  EXPAND:      'gold',
  REDIRECT:    'geekblue',
  SUBMIT:      'lime',
  TRANSFER:    'volcano',
  DSN:         'magenta',
  NOTIFYMAPI:  'default',
  STOREDRIVER: 'default',
  BADMAIL:     'red',
};

const ALL_EVENTS = [
  'RECEIVE','DELIVER','SEND','SUBMIT','FAIL','DEFER',
  'RESOLVE','EXPAND','REDIRECT','TRANSFER','DSN','NOTIFYMAPI','BADMAIL',
];

export default function MessageTracking() {
  const [allResults, setAllResults] = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [form] = Form.useForm();

  // Filtre client-side sur événements (quand plusieurs sélectionnés)
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const results = useMemo(() => {
    if (!selectedEvents.length) return allResults;
    return allResults.filter(r => selectedEvents.includes(String(r.EventId ?? '').toUpperCase()));
  }, [allResults, selectedEvents]);

  const handleSearch = async (values: any) => {
    setLoading(true);
    try {
      const [start, end] = values.dateRange || [];
      const evts: string[] = values.events || [];
      setSelectedEvents(evts);
      // Si un seul événement, on le passe au backend pour réduire le volume
      // Si zéro ou plusieurs, le backend retourne tout et le filtre est client-side
      const eventId = evts.length === 1 ? evts[0] : undefined;
      const data = await exchangeApi.trackMessages({
        sender:     values.sender    || undefined,
        recipient:  values.recipient || undefined,
        start:      start ? start.toISOString() : undefined,
        end:        end   ? end.toISOString()   : undefined,
        maxResults: values.maxResults || 100,
        eventId,
      });
      setAllResults(data);
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
        <Form form={form} layout="inline" onFinish={handleSearch} style={{ gap: 8 }}>
          <Form.Item name="sender" label="Expéditeur">
            <Input placeholder="utilisateur@domaine.com" style={{ width: 180 }} allowClear />
          </Form.Item>
          <Form.Item name="recipient" label="Destinataire">
            <Input placeholder="utilisateur@domaine.com" style={{ width: 180 }} allowClear />
          </Form.Item>
          <Form.Item name="events" label="Événements">
            <Select
              mode="multiple"
              allowClear
              placeholder="Tous"
              style={{ minWidth: 180 }}
              maxTagCount={2}
              options={ALL_EVENTS.map(e => ({
                value: e,
                label: <Tag color={EVENT_COLORS[e] || 'default'} style={{ margin: 0 }}>{e}</Tag>,
              }))}
            />
          </Form.Item>
          <Form.Item name="dateRange" label="Période">
            <RangePicker showTime format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item name="maxResults" label="Max" initialValue={100}>
            <InputNumber min={1} max={5000} style={{ width: 80 }} />
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
        summary={() => results.length ? <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={8}><span style={{color:'#888'}}>{results.length} entrée(s){allResults.length !== results.length ? ` (filtrées de ${allResults.length})` : ''}</span></Table.Summary.Cell></Table.Summary.Row> : null}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 50 }}
        size="small"
        scroll={{ x: 1200 }}

      />
    </div>
  );
}
