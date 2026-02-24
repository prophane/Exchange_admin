import React from 'react';
import { Alert, Card, Typography } from 'antd';
import { FilterOutlined } from '@ant-design/icons';

const { Title } = Typography;

const ProtectionPage: React.FC = () => (
  <div style={{ padding: 24 }}>
    <Title level={3}>
      <FilterOutlined style={{ marginRight: 8 }} />
      Protection
    </Title>
    <Card>
      <Alert
        message="Fonctionnalité non disponible"
        description="La gestion de la protection (anti-spam, anti-malware, filtrage de contenu) n'est pas disponible dans Exchange 2010 on-premises via l'API REST. Ces paramètres sont configurables depuis la console Exchange Management Console."
        type="info"
        showIcon
      />
    </Card>
  </div>
);

export default ProtectionPage;
