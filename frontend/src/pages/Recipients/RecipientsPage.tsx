import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Typography } from 'antd';
import { MailOutlined, ShareAltOutlined, HomeOutlined, ContactsOutlined, TeamOutlined } from '@ant-design/icons';
import MailboxList from '../Mailboxes/MailboxList';
import SharedMailboxList from './SharedMailboxList';
import ResourceList from './ResourceList';
import ContactList from './ContactList';
import DistributionGroupList from '../../pages/Groups/DistributionGroupList';

const { Title } = Typography;

const VALID_TABS = ['mailboxes', 'shared', 'resources', 'contacts', 'groups'];

export default function RecipientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'mailboxes';
  const activeTab = VALID_TABS.includes(tab) ? tab : 'mailboxes';

  useEffect(() => {
    if (!VALID_TABS.includes(tab)) {
      setSearchParams({ tab: 'mailboxes' }, { replace: true });
    }
  }, [tab]);

  const items = [
    {
      key: 'mailboxes',
      label: <span><MailOutlined /> Boîtes aux lettres</span>,
      children: <MailboxList />,
    },
    {
      key: 'shared',
      label: <span><ShareAltOutlined /> Boîtes partagées</span>,
      children: <SharedMailboxList />,
    },
    {
      key: 'resources',
      label: <span><HomeOutlined /> Ressources</span>,
      children: <ResourceList />,
    },
    {
      key: 'contacts',
      label: <span><ContactsOutlined /> Contacts</span>,
      children: <ContactList />,
    },
    {
      key: 'groups',
      label: <span><TeamOutlined /> Groupes de distribution</span>,
      children: <DistributionGroupList />,
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>
        <MailOutlined style={{ marginRight: 8 }} />
        Destinataires
      </Title>
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
        items={items}
      />
    </div>
  );
}
