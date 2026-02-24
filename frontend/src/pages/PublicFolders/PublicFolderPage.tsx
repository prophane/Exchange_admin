import { useEffect, useState } from 'react';
import { Table, Typography, message, Button } from 'antd';
import { ReloadOutlined, FolderOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function PublicFolderPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await exchangeApi.getPublicFolderDatabases()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const columns: ColumnsType<any> = [
    { title: 'Nom', dataIndex: 'Name', sorter: (a, b) => (a.Name || '').localeCompare(b.Name || '') },
    { title: 'Serveur', dataIndex: 'Server' },
    { title: 'Quota avertissement', dataIndex: 'IssueWarningQuota', ellipsis: true },
    { title: 'Quota interdiction', dataIndex: 'ProhibitPostQuota', ellipsis: true },
    { title: 'Taille max message', dataIndex: 'MaxItemSize', ellipsis: true },
    { title: 'Créé le', dataIndex: 'WhenCreated', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <FolderOutlined style={{ marginRight: 8 }} />
          Dossiers publics
        </Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Actualiser</Button>
      </div>

      <Table
        rowKey="Name"
        dataSource={data}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
        footer={() => `${data.length} base(s) de dossiers publics`}
      />
    </div>
  );
}
