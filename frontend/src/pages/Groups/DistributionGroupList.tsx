import { useEffect, useState } from 'react';
import { 
  Table, 
  Button, 
  Space, 
  Typography, 
  Tag, 
  message, 
  Modal, 
  Form, 
  Input,
  Tooltip,
  Popconfirm,
  Descriptions,
  Tabs,
} from 'antd';
import { 
  ReloadOutlined, 
  TeamOutlined, 
  PlusOutlined,
  EyeOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { exchangeApi } from '../../services/api.service';
import type { DistributionGroup, CreateGroupRequest, GroupMember } from '../../types/exchange.types';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function DistributionGroupList() {
  const [groups, setGroups] = useState<DistributionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DistributionGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [form] = Form.useForm();

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await exchangeApi.getDistributionGroups();
      setGroups(data);
      message.success(`${data.length} groupes chargés`);
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleCreateGroup = async (values: any) => {
    try {
      const request: CreateGroupRequest = {
        name: values.name,
        displayName: values.displayName,
        alias: values.alias,
        primarySmtpAddress: values.primarySmtpAddress,
        notes: values.notes,
      };

      await exchangeApi.createDistributionGroup(request);
      message.success('Groupe créé avec succès');
      setIsCreateModalVisible(false);
      form.resetFields();
      loadGroups();
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    }
  };

  const handleViewDetails = async (group: DistributionGroup) => {
    try {
      setDetailLoading(true);
      setIsDetailModalVisible(true);
      setSelectedGroup(group);

      // Charger les membres
      const members = await exchangeApi.getGroupMembers(group.primarySmtpAddress || group.name || '');
      setGroupMembers(members);
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
      setIsDetailModalVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteGroup = async (identity: string) => {
    try {
      await exchangeApi.deleteDistributionGroup(identity);
      message.success('Groupe supprimé');
      loadGroups();
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    }
  };

  const closeDetailModal = () => {
    setIsDetailModalVisible(false);
    setSelectedGroup(null);
    setGroupMembers([]);
    setAddMemberInput('');
  };

  const handleAddMember = async () => {
    if (!addMemberInput.trim() || !selectedGroup) return;
    setAddMemberLoading(true);
    try {
      const identity = selectedGroup.primarySmtpAddress || selectedGroup.name || '';
      await exchangeApi.addGroupMember(identity, addMemberInput.trim());
      message.success(`Membre ajouté`);
      setAddMemberInput('');
      const members = await exchangeApi.getGroupMembers(identity);
      setGroupMembers(members);
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRemoveMember = async (memberIdentity: string) => {
    if (!selectedGroup) return;
    try {
      const identity = selectedGroup.primarySmtpAddress || selectedGroup.name || '';
      await exchangeApi.removeGroupMember(identity, memberIdentity);
      message.success(`Membre retiré`);
      const members = await exchangeApi.getGroupMembers(identity);
      setGroupMembers(members);
    } catch (e: any) {
      message.error(`Erreur: ${e.message}`);
    }
  };

  const columns: ColumnsType<DistributionGroup> = [
    {
      title: 'Nom',
      dataIndex: 'displayName',
      key: 'displayName',
      sorter: (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
      render: (text) => (
        <Space>
          <TeamOutlined />
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: 'Adresse email',
      dataIndex: 'primarySmtpAddress',
      key: 'primarySmtpAddress',
    },
    {
      title: 'Gestionnaires',
      dataIndex: 'managedBy',
      key: 'managedBy',
      render: (managedBy: string[]) =>
        managedBy?.map((manager, index) => (
          <Tag key={index} color="blue">
            {manager}
          </Tag>
        )),
    },
    {
      title: 'Restrictions d\'adhésion',
      dataIndex: 'memberJoinRestriction',
      key: 'memberJoinRestriction',
      render: (text) => <Tag>{text}</Tag>,
    },
    {
      title: 'Créé le',
      dataIndex: 'whenCreated',
      key: 'whenCreated',
      render: (date) => (date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-'),
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
              onClick={() => handleViewDetails(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Supprimer le groupe?"
            description="Cette action supprimera le groupe de distribution."
            onConfirm={() => handleDeleteGroup(record.primarySmtpAddress || record.name || '')}
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
          <Title level={2}>Groupes de distribution</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadGroups} loading={loading}>
              Actualiser
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
            >
              Nouveau groupe
            </Button>
          </Space>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey={(record) => record.primarySmtpAddress || record.name || ''}
        loading={loading}
        pagination={{
          pageSize: 50,
          showTotal: (total) => `Total: ${total} groupes`,
        }}
      />

      {/* Modal de création */}
      <Modal
        title="Créer un groupe de distribution"
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateGroup}>
          <Form.Item
            label="Nom"
            name="name"
            rules={[{ required: true, message: 'Le nom est requis' }]}
          >
            <Input placeholder="Ex: Equipe Marketing" />
          </Form.Item>

          <Form.Item
            label="Nom d'affichage"
            name="displayName"
            rules={[{ required: true, message: 'Le nom d\'affichage est requis' }]}
          >
            <Input placeholder="Ex: Équipe Marketing" />
          </Form.Item>

          <Form.Item
            label="Alias"
            name="alias"
            rules={[{ required: true, message: 'L\'alias est requis' }]}
          >
            <Input placeholder="Ex: marketing" />
          </Form.Item>

          <Form.Item
            label="Adresse email"
            name="primarySmtpAddress"
            rules={[
              { required: true, message: 'L\'adresse email est requise' },
              { type: 'email', message: 'Email invalide' },
            ]}
          >
            <Input placeholder="marketing@domain.com" />
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} placeholder="Notes ou description du groupe..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal des détails */}
      <Modal
        title="Détails du groupe"
        open={isDetailModalVisible}
        onCancel={closeDetailModal}
        width={800}
        footer={[
          <Button key="close" onClick={closeDetailModal}>
            Fermer
          </Button>,
        ]}
      >
        {selectedGroup && (
          <Tabs
            items={[
              {
                key: 'general',
                label: 'Général',
                children: (
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Nom d'affichage">
                      {selectedGroup.displayName}
                    </Descriptions.Item>
                    <Descriptions.Item label="Adresse email">
                      {selectedGroup.primarySmtpAddress}
                    </Descriptions.Item>
                    <Descriptions.Item label="Alias">
                      {selectedGroup.alias}
                    </Descriptions.Item>
                    <Descriptions.Item label="Gestionnaires">
                      {selectedGroup.managedBy?.map((m, i) => (
                        <Tag key={i} color="blue">{m}</Tag>
                      )) || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Restriction d'adhésion">
                      <Tag color={selectedGroup.memberJoinRestriction === 'Ouvert' ? 'green' : selectedGroup.memberJoinRestriction === 'Fermé' ? 'red' : 'orange'}>
                        {selectedGroup.memberJoinRestriction || '-'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Restriction de départ">
                      <Tag color={selectedGroup.memberDepartRestriction === 'Ouvert' ? 'green' : selectedGroup.memberDepartRestriction === 'Fermé' ? 'red' : 'orange'}>
                        {selectedGroup.memberDepartRestriction || '-'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Créé le">
                      {selectedGroup.whenCreated ? dayjs(selectedGroup.whenCreated).format('DD/MM/YYYY HH:mm') : '-'}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'members',
                label: `Membres (${groupMembers.length})`,
                children: (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <Input
                        prefix={<UserAddOutlined />}
                        placeholder="Alias, email ou nom du destinataire à ajouter"
                        value={addMemberInput}
                        onChange={e => setAddMemberInput(e.target.value)}
                        onPressEnter={handleAddMember}
                        style={{ flex: 1 }}
                      />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        loading={addMemberLoading}
                        onClick={handleAddMember}
                      >
                        Ajouter
                      </Button>
                    </div>
                    <Table
                      dataSource={groupMembers}
                      loading={detailLoading}
                      rowKey={(m) => m.primarySmtpAddress || m.name || ''}
                      pagination={{ pageSize: 20 }}
                      size="small"
                      columns={[
                        {
                          title: 'Nom',
                          dataIndex: 'displayName',
                          key: 'displayName',
                        },
                        {
                          title: 'Email',
                          dataIndex: 'primarySmtpAddress',
                          key: 'primarySmtpAddress',
                        },
                        {
                          title: 'Type',
                          dataIndex: 'recipientType',
                          key: 'recipientType',
                          render: (type: string) => <Tag color="blue">{type || '—'}</Tag>,
                        },
                        {
                          title: '',
                          width: 60,
                          render: (_, rec) => (
                            <Popconfirm
                              title={`Retirer ${rec.displayName || rec.name} du groupe ?`}
                              okText="Retirer" okType="danger" cancelText="Annuler"
                              onConfirm={() => handleRemoveMember(rec.primarySmtpAddress || rec.name || '')}
                            >
                              <Tooltip title="Retirer du groupe">
                                <Button size="small" danger icon={<MinusCircleOutlined />} />
                              </Tooltip>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
