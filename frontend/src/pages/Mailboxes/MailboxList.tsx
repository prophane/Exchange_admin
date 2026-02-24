import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  message,
  Popconfirm,
  Tooltip,
  Descriptions,
  Spin,
  Tabs,
  Checkbox,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import type { Mailbox, CreateMailboxRequest, MailboxStatistics, UpdateMailboxRequest } from '../../types/exchange.types';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Search } = Input;

// Mapping RecipientTypeDetails — valeurs string ET valeurs numériques Exchange 2010
// (la valeur numérique est retournée quand PS sérialise l'enum sans ToString)
const RECIPIENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  // Valeurs string
  UserMailbox:            { label: 'Utilisateur',  color: 'green'  },
  SharedMailbox:          { label: 'Partagée',      color: 'orange' },
  RoomMailbox:            { label: 'Salle',          color: 'blue'   },
  EquipmentMailbox:       { label: 'Équipement',     color: 'cyan'   },
  LinkedMailbox:          { label: 'Liée',           color: 'purple' },
  DiscoveryMailbox:       { label: 'Découverte',     color: 'gold'   },
  ArbitrationMailbox:     { label: 'Arbitrage',      color: 'lime'   },
  SystemMailbox:          { label: 'Système',        color: 'default'},
  SystemAttendantMailbox: { label: 'Système',        color: 'default'},
  LegacyMailbox:          { label: 'Legacy',         color: 'default'},
  // Valeurs numériques (enum long Exchange 2010)
  '1':         { label: 'Utilisateur',  color: 'green'  },
  '2':         { label: 'Liée',          color: 'purple' },
  '4':         { label: 'Partagée',      color: 'orange' },
  '8':         { label: 'Legacy',        color: 'default'},
  '16':        { label: 'Salle',         color: 'blue'   },
  '32':        { label: 'Équipement',    color: 'cyan'   },
  '8192':      { label: 'Système',       color: 'default'},
  '16384':     { label: 'Système',       color: 'default'},
  '8388608':   { label: 'Arbitrage',     color: 'lime'   },
  '536870912': { label: 'Découverte',    color: 'gold'   },
};

function RecipientTypeTag({ value }: { value?: string }) {
  if (!value) return <Tag>-</Tag>;
  const key = String(value);
  const entry = RECIPIENT_TYPE_LABELS[key];
  if (entry) return <Tag color={entry.color}>{entry.label}</Tag>;
  return <Tag color="default" title={key}>{key}</Tag>;
}

export default function MailboxList() {
  const navigate = useNavigate();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [filteredMailboxes, setFilteredMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState<Mailbox | null>(null);
  const [mailboxStats, setMailboxStats] = useState<MailboxStatistics | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [ous, setOus] = useState<string[]>([]);
  const [ousLoading, setOusLoading] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const loadMailboxes = async () => {
    try {
      setLoading(true);
      const data = await exchangeApi.getMailboxes();
      setMailboxes(data);
      setFilteredMailboxes(data);
      message.success(`${data.length} boîtes aux lettres chargées`);
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMailboxes();
    exchangeApi.getDatabases().then((dbs: any[]) => {
      setDatabases(dbs.map((d: any) => d.Name || d.name).filter(Boolean));
    }).catch(() => {});
  }, []);

  const openCreateModal = () => {
    setIsCreateModalVisible(true);
    if (ous.length === 0) {
      setOusLoading(true);
      exchangeApi.getOrganizationalUnits()
        .then(setOus)
        .catch(() => {})
        .finally(() => setOusLoading(false));
    }
  };

  useEffect(() => {
    if (!searchTerm) {
      setFilteredMailboxes(mailboxes);
      return;
    }

    const filtered = mailboxes.filter(
      (mb) =>
        mb.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mb.primarySmtpAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mb.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredMailboxes(filtered);
  }, [searchTerm, mailboxes]);

  const handleCreateMailbox = async (values: any) => {
    try {
      const request: CreateMailboxRequest = {
        name: values.name,
        alias: values.alias,
        userPrincipalName: values.userPrincipalName,
        firstName: values.firstName,
        lastName: values.lastName,
        password: values.password,
        database: values.database,
        organizationalUnit: values.organizationalUnit,
        resetPasswordOnNextLogon: values.resetPasswordOnNextLogon ? 'true' : undefined,
      };

      await exchangeApi.createMailbox(request);
      message.success('Boîte aux lettres créée avec succès');
      setIsCreateModalVisible(false);
      form.resetFields();
      loadMailboxes();
    } catch (error: any) {
      message.error(`Erreur: ${error.response?.data?.error || error.message}`);
    }
  };;

  const handleDeleteMailbox = async (identity: string) => {
    try {
      await exchangeApi.deleteMailbox(identity, false);
      message.success('Boîte aux lettres supprimée');
      loadMailboxes();
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    }
  };

  const handleViewDetails = async (mailbox: Mailbox, editMode: boolean = false) => {
    try {
      setDetailLoading(true);
      setIsDetailModalVisible(true);
      setIsEditMode(editMode);
      setSelectedMailbox(mailbox);

      // Charger les données complètes
      const [mailboxData, statsData] = await Promise.all([
        exchangeApi.getMailbox(mailbox.primarySmtpAddress || ''),
        exchangeApi.getMailboxStatistics(mailbox.primarySmtpAddress || '').catch(() => null),
      ]);

      setSelectedMailbox(mailboxData);
      setMailboxStats(statsData);

      if (editMode && mailboxData) {
        editForm.setFieldsValue({
          displayName: mailboxData.displayName,
          issueWarningQuota: mailboxData.issueWarningQuota,
          prohibitSendQuota: mailboxData.prohibitSendQuota,
          prohibitSendReceiveQuota: mailboxData.prohibitSendReceiveQuota,
          useDatabaseQuotaDefaults: mailboxData.useDatabaseQuotaDefaults,
        });
      }
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
      setIsDetailModalVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdateMailbox = async (values: any) => {
    if (!selectedMailbox?.primarySmtpAddress) return;

    try {
      const request: UpdateMailboxRequest = {
        displayName: values.displayName,
        issueWarningQuota: values.issueWarningQuota,
        prohibitSendQuota: values.prohibitSendQuota,
        prohibitSendReceiveQuota: values.prohibitSendReceiveQuota,
        useDatabaseQuotaDefaults: values.useDatabaseQuotaDefaults,
      };

      await exchangeApi.updateMailbox(selectedMailbox.primarySmtpAddress, request);
      message.success('Boîte aux lettres modifiée');
      setIsDetailModalVisible(false);
      setIsEditMode(false);
      editForm.resetFields();
      loadMailboxes();
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    }
  };

  const closeDetailModal = () => {
    setIsDetailModalVisible(false);
    setIsEditMode(false);
    setSelectedMailbox(null);
    setMailboxStats(null);
    editForm.resetFields();
  };

  const columns: ColumnsType<Mailbox> = [
    {
      title: 'Nom d\'affichage',
      dataIndex: 'displayName',
      key: 'displayName',
      sorter: (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Adresse email',
      dataIndex: 'primarySmtpAddress',
      key: 'primarySmtpAddress',
      sorter: (a, b) =>
        (a.primarySmtpAddress || '').localeCompare(b.primarySmtpAddress || ''),
    },
    {
      title: 'Alias',
      dataIndex: 'alias',
      key: 'alias',
    },
    {
      title: 'Base de données',
      dataIndex: 'database',
      key: 'database',
      render: (text) => text ? <Tag color="blue">{text}</Tag> : '-',
    },
    {
      title: 'Type',
      dataIndex: 'recipientTypeDetails',
      key: 'recipientTypeDetails',
      render: (text) => <RecipientTypeTag value={text} />,
      filters: [
        { text: 'Utilisateur',  value: 'UserMailbox'        },
        { text: 'Partagée',     value: 'SharedMailbox'       },
        { text: 'Salle',        value: 'RoomMailbox'         },
        { text: 'Équipement',   value: 'EquipmentMailbox'    },
        { text: 'Découverte',   value: 'DiscoveryMailbox'    },
        { text: 'Arbitrage',    value: 'ArbitrationMailbox'  },
        { text: 'Liée',         value: 'LinkedMailbox'       },
      ],
      onFilter: (value, record) => {
        const v = String(record.recipientTypeDetails ?? '');
        const entry = RECIPIENT_TYPE_LABELS[v];
        // Comparer le label plutôt que la valeur brute (couvre numérique + string)
        return entry?.label === RECIPIENT_TYPE_LABELS[String(value)]?.label;
      },
    },
    {
      title: 'Créé le',
      dataIndex: 'whenCreated',
      key: 'whenCreated',
      render: (date) => (date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-'),
      sorter: (a, b) => {
        if (!a.whenCreated) return -1;
        if (!b.whenCreated) return 1;
        return dayjs(a.whenCreated).unix() - dayjs(b.whenCreated).unix();
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small" className="action-buttons">
          <Tooltip title="Voir détails">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record, false)}
            />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => navigate(`/mailboxes/${encodeURIComponent(record.primarySmtpAddress || '')}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Supprimer la boîte aux lettres?"
            description="Cette action désactivera la boîte aux lettres."
            onConfirm={() => handleDeleteMailbox(record.primarySmtpAddress || '')}
            okText="Oui"
            cancelText="Non"
          >
            <Tooltip title="Supprimer">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={2}>Boîtes aux lettres</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadMailboxes} loading={loading}>
              Actualiser
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              Nouvelle boîte aux lettres
            </Button>
          </Space>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Search
          placeholder="Rechercher par nom, email..."
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
        dataSource={filteredMailboxes}
        rowKey={(record) => record.primarySmtpAddress || ''}
        loading={loading}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showTotal: (total) => `Total: ${total} boîtes aux lettres`,
        }}
      />

      <Modal
        title="Créer une boîte aux lettres"
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={620}
      >
        <Alert
          message="Les champs Prénom, Nom et OU permettent de pré-remplir l'objet AD."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={handleCreateMailbox}>
          <Form.Item
            label="Nom complet (DisplayName AD)"
            name="name"
            rules={[{ required: true, message: 'Requis' }]}
          >
            <Input placeholder="Pierre DUMAY" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="Prénom" name="firstName" style={{ flex: 1 }}>
              <Input placeholder="Pierre" />
            </Form.Item>
            <Form.Item label="Nom" name="lastName" style={{ flex: 1 }}>
              <Input placeholder="DUMAY" />
            </Form.Item>
          </div>

          <Form.Item
            label="Alias (sam)"
            name="alias"
            rules={[{ required: true, message: 'Requis' }, { pattern: /^[a-zA-Z0-9._-]+$/, message: 'Caractères alphaNumériques, . _ - uniquement' }]}
          >
            <Input placeholder="pierre.dumay" />
          </Form.Item>

          <Form.Item
            label="Adresse e-mail (UPN)"
            name="userPrincipalName"
            rules={[
              { required: true, message: 'Requis' },
              { type: 'email', message: 'Format email invalide' },
            ]}
          >
            <Input placeholder="pierre.dumay@domaine.com" />
          </Form.Item>

          <Form.Item
            label="Mot de passe"
            name="password"
            rules={[
              { required: true, message: 'Requis' },
              { min: 8, message: 'Minimum 8 caractères' },
            ]}
          >
            <Input.Password placeholder="••••••••" />
          </Form.Item>

          <Form.Item name="resetPasswordOnNextLogon" valuePropName="checked" initialValue={false}>
            <Checkbox>Forcer le changement de mot de passe à la première connexion</Checkbox>
          </Form.Item>

          <Form.Item label="Base de données" name="database">
            <Select placeholder="Sélectionner une base..." allowClear showSearch>
              {databases.map((db) => (
                <Select.Option key={db} value={db}>{db}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Unité organisationnelle (OU)"
            name="organizationalUnit"
            tooltip="DistinguishedName complet, ex: OU=Utilisateurs,DC=domaine,DC=local"
          >
            <Select
              placeholder="Sélectionner une OU..."
              allowClear
              showSearch
              loading={ousLoading}
              filterOption={(input, option) =>
                (option?.value as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              notFoundContent={ousLoading ? <Spin size="small" /> : 'Aucune OU trouvée'}
            >
              {ous.map((ou) => (
                <Select.Option key={ou} value={ou}>
                  <Tooltip title={ou}>
                    <span style={{ fontSize: 12 }}>{ou.split(',')[0]?.replace('OU=', '')}</span>
                  </Tooltip>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Détails/Modification */}
      <Modal
        title={isEditMode ? 'Modifier la boîte aux lettres' : 'Détails de la boîte aux lettres'}
        open={isDetailModalVisible}
        onCancel={closeDetailModal}
        width={800}
        footer={
          isEditMode ? [
            <Button key="cancel" onClick={closeDetailModal}>
              Annuler
            </Button>,
            <Button key="submit" type="primary" onClick={() => editForm.submit()}>
              Enregistrer
            </Button>,
          ] : [
            <Button key="close" onClick={closeDetailModal}>
              Fermer
            </Button>,
            <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => {
              closeDetailModal();
              navigate(`/mailboxes/${encodeURIComponent(selectedMailbox?.primarySmtpAddress || '')}`);
            }}>
              Modifier
            </Button>,
          ]
        }
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
          </div>
        ) : selectedMailbox ? (
          isEditMode ? (
            <Form form={editForm} layout="vertical" onFinish={handleUpdateMailbox}>
              <Form.Item label="Nom d'affichage" name="displayName">
                <Input />
              </Form.Item>
              <Form.Item label="Quota d'avertissement" name="issueWarningQuota">
                <Input placeholder="Ex: 1.5GB" />
              </Form.Item>
              <Form.Item label="Quota interdiction envoi" name="prohibitSendQuota">
                <Input placeholder="Ex: 2GB" />
              </Form.Item>
              <Form.Item label="Quota interdiction envoi/réception" name="prohibitSendReceiveQuota">
                <Input placeholder="Ex: 2.5GB" />
              </Form.Item>
            </Form>
          ) : (
            <Tabs
              items={[
                {
                  key: 'general',
                  label: 'Général',
                  children: (
                    <Descriptions column={1} bordered>
                      <Descriptions.Item label="Nom d'affichage">
                        {selectedMailbox.displayName}
                      </Descriptions.Item>
                      <Descriptions.Item label="Adresse email">
                        {selectedMailbox.primarySmtpAddress}
                      </Descriptions.Item>
                      <Descriptions.Item label="Alias">
                        {selectedMailbox.alias}
                      </Descriptions.Item>
                      <Descriptions.Item label="Base de données">
                        <Tag color="blue">{selectedMailbox.database}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Type">
                        <RecipientTypeTag value={selectedMailbox.recipientTypeDetails ?? undefined} />
                      </Descriptions.Item>
                      <Descriptions.Item label="Unité organisationnelle">
                        {selectedMailbox.organizationalUnit || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Créé le">
                        {selectedMailbox.whenCreated ? dayjs(selectedMailbox.whenCreated).format('DD/MM/YYYY HH:mm') : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Modifié le">
                        {selectedMailbox.whenChanged ? dayjs(selectedMailbox.whenChanged).format('DD/MM/YYYY HH:mm') : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'quotas',
                  label: 'Quotas',
                  children: (
                    <Descriptions column={1} bordered>
                      <Descriptions.Item label="Utilise les quotas par défaut">
                        <Tag color={selectedMailbox.useDatabaseQuotaDefaults ? 'green' : 'orange'}>
                          {selectedMailbox.useDatabaseQuotaDefaults ? 'Oui' : 'Non'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Quota d'avertissement">
                        {selectedMailbox.issueWarningQuota || 'Par défaut'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Quota interdiction envoi">
                        {selectedMailbox.prohibitSendQuota || 'Par défaut'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Quota interdiction envoi/réception">
                        {selectedMailbox.prohibitSendReceiveQuota || 'Par défaut'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                ...(mailboxStats ? [{
                  key: 'stats',
                  label: 'Statistiques',
                  children: (
                    <Descriptions column={1} bordered>
                      <Descriptions.Item label="Nombre d'éléments">
                        {mailboxStats.itemCount?.toLocaleString() || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Taille totale">
                        {mailboxStats.totalItemSize || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Dernière connexion">
                        {mailboxStats.lastLogonTime ? dayjs(mailboxStats.lastLogonTime).format('DD/MM/YYYY HH:mm') : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                }] : []),
              ]}
            />
          )
        ) : null}
      </Modal>
    </div>
  );
}
