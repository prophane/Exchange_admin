import { useState, useCallback } from 'react';
import {
  Drawer, Table, Button, Tag, Tooltip, Space, Popconfirm, Typography, message,
} from 'antd';
import {
  CodeOutlined, ReloadOutlined, DeleteOutlined, CopyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../services/api.service';

const { Text } = Typography;

export default function CmdletLogDrawer() {
  const [open, setOpen]       = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try   { setEntries(await exchangeApi.getCmdletLog()); }
    catch (e: any) { message.error(`Erreur: ${e.message}`); }
    finally { setLoading(false); }
  }, []);

  const handleOpen = () => { setOpen(true); load(); };

  const clear = async () => {
    try {
      await exchangeApi.clearCmdletLog();
      setEntries([]);
      message.success('Journal effacé');
    } catch (e: any) { message.error(`Erreur: ${e.message}`); }
  };

  const copy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    message.success('Copié !');
  };

  const columns: ColumnsType<any> = [
    {
      title: '#',
      dataIndex: 'index',
      width: 55,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Heure',
      dataIndex: 'startTime',
      width: 140,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      width: 130,
      render: (v, rec) => {
        const color = v === 'Completed' ? 'green' : v === 'Failed' ? 'red' : 'processing';
        const label = v === 'Completed' ? 'Terminé' : v === 'Failed' ? 'Échec' : 'En cours';
        return (
          <Tooltip title={rec.errorMessage || ''}>
            <Tag color={color}>{label}</Tag>
            {rec.durationMs > 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}> {rec.durationMs} ms</Text>
            )}
          </Tooltip>
        );
      },
    },
    {
      title: 'Commande',
      dataIndex: 'command',
      ellipsis: true,
      render: (v, rec) => (
        <Space size={4}>
          <Tooltip title={<pre style={{ maxWidth: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{v}</pre>}>
            <Text code style={{ fontSize: 12, cursor: 'pointer' }}>
              {v?.length > 100 ? v.slice(0, 100) + '…' : v}
            </Text>
          </Tooltip>
          <Button
            type="text" size="small" icon={<CopyOutlined />}
            onClick={() => copy(rec.command)}
            style={{ padding: '0 4px', color: '#999' }}
          />
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* Bouton flottant en bas à droite */}
      <Tooltip title="Journal des commandes PowerShell" placement="left">
        <Button
          type="primary"
          shape="round"
          icon={<CodeOutlined />}
          onClick={handleOpen}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingRight: 16,
          }}
        >
          Log PS
        </Button>
      </Tooltip>

      <Drawer
        title={
          <Space>
            <CodeOutlined />
            Journal des commandes PowerShell
            <Tag color="blue">{entries.length} entrée(s)</Tag>
          </Space>
        }
        placement="bottom"
        height={480}
        open={open}
        onClose={() => setOpen(false)}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="small">Actualiser</Button>
            <Popconfirm title="Effacer tout le journal ?" onConfirm={clear} okText="Effacer" cancelText="Annuler" okButtonProps={{ danger: true }}>
              <Button icon={<DeleteOutlined />} danger size="small">Effacer</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Table
          dataSource={entries}
          columns={columns}
          rowKey="index"
          loading={loading}
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ y: 320 }}
          rowClassName={rec => rec.Status === 'Failed' ? 'ant-table-row-danger' : ''}
          style={{ fontSize: 12 }}
        />
      </Drawer>
    </>
  );
}
