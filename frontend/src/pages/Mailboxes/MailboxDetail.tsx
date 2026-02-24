import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Typography,
  Spin,
  message,
  Tabs,
  Form,
  Input,
  Modal,
  Switch,
  Tag,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  MailOutlined,
  UserOutlined,
  PhoneOutlined,
  BankOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { exchangeApi } from '../../services/api.service';
import type { Mailbox, MailboxStatistics, UpdateMailboxRequest } from '../../types/exchange.types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function MailboxDetail() {
  const { identity } = useParams<{ identity: string }>();
  const navigate = useNavigate();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [stats, setStats] = useState<MailboxStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [form] = Form.useForm();

  const loadMailboxData = async () => {
    if (!identity) return;
    try {
      setLoading(true);
      const decodedIdentity = decodeURIComponent(identity);
      const [mailboxData, statsData] = await Promise.all([
        exchangeApi.getMailbox(decodedIdentity),
        exchangeApi.getMailboxStatistics(decodedIdentity).catch(() => null),
      ]);
      setMailbox(mailboxData);
      setStats(statsData);
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMailboxData();
  }, [identity]);

  const openEditModal = () => {
    if (mailbox) {
      form.setFieldsValue({
        displayName: mailbox.displayName,
        firstName: mailbox.firstName,
        lastName: mailbox.lastName,
        initials: mailbox.initials,
        alias: mailbox.alias,
        hiddenFromAddressListsEnabled: mailbox.hiddenFromAddressListsEnabled ?? false,
        title: mailbox.title,
        department: mailbox.department,
        company: mailbox.company,
        office: mailbox.office,
        manager: mailbox.manager,
        phone: mailbox.phone,
        mobilePhone: mailbox.mobilePhone,
        fax: mailbox.fax,
        streetAddress: mailbox.streetAddress,
        city: mailbox.city,
        stateOrProvince: mailbox.stateOrProvince,
        postalCode: mailbox.postalCode,
        countryOrRegion: mailbox.countryOrRegion,
        notes: mailbox.notes,
        issueWarningQuota: mailbox.issueWarningQuota,
        prohibitSendQuota: mailbox.prohibitSendQuota,
        prohibitSendReceiveQuota: mailbox.prohibitSendReceiveQuota,
        useDatabaseQuotaDefaults: mailbox.useDatabaseQuotaDefaults ?? false,
        mailTip: mailbox.mailTip,
        forwardingAddress: mailbox.forwardingAddress,
        deliverToMailboxAndForward: mailbox.deliverToMailboxAndForward ?? false,
      });
    }
    setIsEditModalVisible(true);
  };

  const handleUpdate = async (values: any) => {
    if (!identity) return;
    try {
      setSaving(true);
      const decodedIdentity = decodeURIComponent(identity);
      const request: UpdateMailboxRequest = {
        displayName: values.displayName,
        firstName: values.firstName,
        lastName: values.lastName,
        initials: values.initials,
        alias: values.alias,
        hiddenFromAddressListsEnabled: values.hiddenFromAddressListsEnabled,
        title: values.title,
        department: values.department,
        company: values.company,
        office: values.office,
        manager: values.manager,
        phone: values.phone,
        mobilePhone: values.mobilePhone,
        fax: values.fax,
        streetAddress: values.streetAddress,
        city: values.city,
        stateOrProvince: values.stateOrProvince,
        postalCode: values.postalCode,
        countryOrRegion: values.countryOrRegion,
        notes: values.notes,
        issueWarningQuota: values.useDatabaseQuotaDefaults ? undefined : values.issueWarningQuota,
        prohibitSendQuota: values.useDatabaseQuotaDefaults ? undefined : values.prohibitSendQuota,
        prohibitSendReceiveQuota: values.useDatabaseQuotaDefaults ? undefined : values.prohibitSendReceiveQuota,
        useDatabaseQuotaDefaults: values.useDatabaseQuotaDefaults,
        mailTip: values.mailTip,
        forwardingAddress: values.forwardingAddress,
        deliverToMailboxAndForward: values.deliverToMailboxAndForward,
      };
      await exchangeApi.updateMailbox(decodedIdentity, request);
      message.success('Boite aux lettres modifiee avec succes');
      setIsEditModalVisible(false);
      loadMailboxData();
    } catch (error: any) {
      message.error(`Erreur: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-container"><Spin size="large" /></div>;
  }

  if (!mailbox) {
    return <div>Boite aux lettres non trouvee</div>;
  }

  const editModalTabs = [
    {
      key: 'general',
      label: <span><UserOutlined /> General</span>,
      children: (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Prenom" name="firstName">
              <Input />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item label="Initiales" name="initials">
              <Input maxLength={6} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Nom" name="lastName">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Nom d'affichage" name="displayName" rules={[{ required: true, message: 'Requis' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Alias" name="alias">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="UPN (lecture seule)">
              <Input value={mailbox.userPrincipalName ?? ''} disabled />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Masquer dans les listes d'adresses" name="hiddenFromAddressListsEnabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      ),
    },
    {
      key: 'contact',
      label: <span><PhoneOutlined /> Coordonnees</span>,
      children: (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Titre/Fonction" name="title">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Service" name="department">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Societe" name="company">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Bureau" name="office">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Responsable" name="manager">
              <Input placeholder="alias ou adresse email" />
            </Form.Item>
          </Col>
          <Col span={24}><Divider style={{ margin: '4px 0 12px' }} /></Col>
          <Col span={8}>
            <Form.Item label="Telephone" name="phone">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Mobile" name="mobilePhone">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Fax" name="fax">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Adresse" name="streetAddress">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Ville" name="city">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Region/Province" name="stateOrProvince">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Code postal" name="postalCode">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Pays/Region" name="countryOrRegion">
              <Input placeholder="FR, US, BE..." />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Notes" name="notes">
              <TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>
      ),
    },
    {
      key: 'quotas',
      label: <span><SettingOutlined /> Quotas</span>,
      children: (
        <>
          <Form.Item label="Utiliser les quotas de la base de donnees" name="useDatabaseQuotaDefaults" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.useDatabaseQuotaDefaults !== cur.useDatabaseQuotaDefaults}>
            {({ getFieldValue }) => !getFieldValue('useDatabaseQuotaDefaults') && (
              <>
                <Form.Item label="Quota d'avertissement" name="issueWarningQuota" extra="Ex: 1.9 GB">
                  <Input />
                </Form.Item>
                <Form.Item label="Quota d'interdiction d'envoi" name="prohibitSendQuota" extra="Ex: 2 GB">
                  <Input />
                </Form.Item>
                <Form.Item label="Quota d'interdiction d'envoi/reception" name="prohibitSendReceiveQuota" extra="Ex: 2.3 GB">
                  <Input />
                </Form.Item>
              </>
            )}
          </Form.Item>
        </>
      ),
    },
    {
      key: 'mailtip',
      label: <span><MailOutlined /> MailTip</span>,
      children: (
        <Form.Item
          label="Message MailTip"
          name="mailTip"
          extra="Ce message s'affiche dans Outlook lorsque quelqu'un compose un email vers cette boite."
        >
          <TextArea rows={4} showCount maxLength={175} />
        </Form.Item>
      ),
    },
    {
      key: 'forwarding',
      label: <span><BankOutlined /> Transfert</span>,
      children: (
        <>
          <Form.Item label="Transferer vers" name="forwardingAddress" extra="Alias ou adresse email de destination">
            <Input placeholder="alias@domaine.com" allowClear />
          </Form.Item>
          <Form.Item label="Conserver une copie dans cette boite" name="deliverToMailboxAndForward" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/recipients')}>
              Retour
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              {mailbox.displayName}
            </Title>
            {mailbox.hiddenFromAddressListsEnabled && <Tag color="orange">Masque</Tag>}
            {mailbox.deliverToMailboxAndForward && <Tag color="blue">Transfert actif</Tag>}
          </Space>
          <Button type="primary" icon={<EditOutlined />} onClick={openEditModal}>
            Modifier
          </Button>
        </div>

        <Tabs
          defaultActiveKey="1"
          items={[
            {
              key: '1',
              label: 'General',
              children: (
                <Card>
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="Prenom">{mailbox.firstName || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Nom">{mailbox.lastName || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Initiales">{mailbox.initials || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Nom d'affichage">{mailbox.displayName}</Descriptions.Item>
                    <Descriptions.Item label="Alias">{mailbox.alias}</Descriptions.Item>
                    <Descriptions.Item label="Adresse principale">{mailbox.primarySmtpAddress}</Descriptions.Item>
                    <Descriptions.Item label="UPN">{mailbox.userPrincipalName || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Masque">{mailbox.hiddenFromAddressListsEnabled ? 'Oui' : 'Non'}</Descriptions.Item>
                    <Descriptions.Item label="Base de donnees">{mailbox.database}</Descriptions.Item>
                    <Descriptions.Item label="Unite organisationnelle">{mailbox.organizationalUnit}</Descriptions.Item>
                    <Descriptions.Item label="Type">{mailbox.recipientTypeDetails}</Descriptions.Item>
                    <Descriptions.Item label="Cree le">
                      {mailbox.whenCreated ? dayjs(mailbox.whenCreated).format('DD/MM/YYYY HH:mm') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Modifie le">
                      {mailbox.whenChanged ? dayjs(mailbox.whenChanged).format('DD/MM/YYYY HH:mm') : '-'}
                    </Descriptions.Item>
                  </Descriptions>
                  {mailbox.emailAddresses && mailbox.emailAddresses.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Text strong>Adresses email :</Text>
                      <div style={{ marginTop: 8 }}>
                        {mailbox.emailAddresses.map((addr) => (
                          <Tag
                            key={addr}
                            color={addr === mailbox.primarySmtpAddress ? 'blue' : 'default'}
                            style={{ marginBottom: 4 }}
                          >
                            {addr === mailbox.primarySmtpAddress ? `${addr} (principale)` : addr}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ),
            },
            {
              key: '2',
              label: 'Coordonnees',
              children: (
                <Card>
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="Titre/Fonction">{mailbox.title || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Service">{mailbox.department || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Societe">{mailbox.company || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Bureau">{mailbox.office || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Responsable">{mailbox.manager || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Telephone">{mailbox.phone || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Mobile">{mailbox.mobilePhone || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Fax">{mailbox.fax || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Adresse" span={2}>{mailbox.streetAddress || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Ville">{mailbox.city || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Region/Province">{mailbox.stateOrProvince || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Code postal">{mailbox.postalCode || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Pays/Region">{mailbox.countryOrRegion || '-'}</Descriptions.Item>
                    {mailbox.notes && (
                      <Descriptions.Item label="Notes" span={2}>{mailbox.notes}</Descriptions.Item>
                    )}
                  </Descriptions>
                </Card>
              ),
            },
            {
              key: '3',
              label: 'Statistiques',
              children: stats ? (
                <Card>
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="Nombre d'elements">{stats.itemCount?.toLocaleString('fr-FR') ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Taille totale">{stats.totalItemSize || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Elements supprimes">{stats.totalDeletedItemSize || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Derniere connexion">
                      {stats.lastLogonTime ? dayjs(stats.lastLogonTime).format('DD/MM/YYYY HH:mm') : 'Jamais'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Base de donnees">{stats.database}</Descriptions.Item>
                  </Descriptions>
                </Card>
              ) : (
                <Card>Aucune statistique disponible</Card>
              ),
            },
            {
              key: '4',
              label: 'Quotas',
              children: (
                <Card>
                  <Descriptions bordered column={1}>
                    <Descriptions.Item label="Utiliser les quotas de la base">
                      {mailbox.useDatabaseQuotaDefaults ? <Tag color="green">Oui</Tag> : <Tag color="orange">Non</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Quota d'avertissement">
                      {mailbox.issueWarningQuota || '(base de donnees)'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Quota d'interdiction d'envoi">
                      {mailbox.prohibitSendQuota || '(base de donnees)'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Quota d'interdiction d'envoi/reception">
                      {mailbox.prohibitSendReceiveQuota || '(base de donnees)'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ),
            },
            {
              key: '5',
              label: 'Transfert & MailTip',
              children: (
                <Card>
                  <Descriptions bordered column={1}>
                    <Descriptions.Item label="Transferer vers">
                      {mailbox.forwardingAddress ? <Tag color="blue">{mailbox.forwardingAddress}</Tag> : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Conserver une copie">
                      {mailbox.deliverToMailboxAndForward ? <Tag color="green">Oui</Tag> : <Tag>Non</Tag>}
                    </Descriptions.Item>
                    {mailbox.mailTip && (
                      <Descriptions.Item label="MailTip">{mailbox.mailTip}</Descriptions.Item>
                    )}
                  </Descriptions>
                </Card>
              ),
            },
          ]}
        />
      </Space>

      <Modal
        title={`Modifier — ${mailbox.displayName}`}
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={720}
        okText="Enregistrer"
        cancelText="Annuler"
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate}>
          <Tabs items={editModalTabs} size="small" />
        </Form>
      </Modal>
    </div>
  );
}
