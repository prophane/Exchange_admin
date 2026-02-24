import axios, { AxiosInstance } from 'axios';
import type {
  Mailbox,
  MailboxStatistics,
  CreateMailboxRequest,
  UpdateMailboxRequest,
  DistributionGroup,
  GroupMember,
  CreateGroupRequest,
  MailboxDatabase,
  Queue,
  QueueMessage,
  MailboxPermission,
  AddPermissionRequest,
  ApiResponse,
  Certificate,
  VirtualDirectory,
  UpdateVirtualDirectoryRequest,
  Connector,
  CreateReceiveConnectorRequest,
  CreateSendConnectorRequest,
} from '../types/exchange.types';
import { getStoredToken } from '../context/auth.utils';

class ExchangeApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: '/api',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Injecter le token JWT dans chaque requête
    this.api.interceptors.request.use((config) => {
      const token = getStoredToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    // Rediriger vers /login en cas de 401
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        const errorData = error?.response?.data;

        // 401 direct OU session Exchange expirée (backend redémarré, credentials perdus)
        const isSessionExpired = status === 401 || errorData?.error === 'SESSION_EXPIRED';
        if (isSessionExpired) {
          localStorage.removeItem('exchange_admin_token');
          localStorage.removeItem('exchange_admin_user');
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login?reason=session_expired';
          }
        }
        console.error('API Error:', error);
        return Promise.reject(error);
      }
    );
  }

  // ============================================================================
  // Authentification
  // ============================================================================

  /** Retourne la liste des infrastructures Exchange disponibles (endpoint public). */
  async getInfrastructures(): Promise<Array<{
    id: string; label: string; version: string; server: string;
  }>> {
    const response = await this.api.get('/auth/infrastructures');
    return response.data.data || [];
  }

  // ============================================================================
  // Mailboxes
  // ============================================================================

  async getMailboxes(resultSize: number = 1000): Promise<Mailbox[]> {
    const response = await this.api.get<ApiResponse<Mailbox[]>>('/mailboxes', {
      params: { resultSize },
    });
    return response.data.data || [];
  }

  async getMailbox(identity: string): Promise<Mailbox | null> {
    const response = await this.api.get<ApiResponse<Mailbox>>(`/mailboxes/${encodeURIComponent(identity)}`);
    return response.data.data || null;
  }

  async getMailboxStatistics(identity: string): Promise<MailboxStatistics | null> {
    const response = await this.api.get<ApiResponse<MailboxStatistics>>(
      `/mailboxes/${encodeURIComponent(identity)}/statistics`
    );
    return response.data.data || null;
  }

  async createMailbox(request: CreateMailboxRequest): Promise<Mailbox> {
    const response = await this.api.post<ApiResponse<Mailbox>>('/mailboxes', request);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Échec de création de la boîte aux lettres');
    }
    return response.data.data;
  }

  async updateMailbox(identity: string, request: UpdateMailboxRequest): Promise<Mailbox> {
    const response = await this.api.put<ApiResponse<Mailbox>>(
      `/mailboxes/${encodeURIComponent(identity)}`,
      request
    );
    if (!response.data.data) {
      throw new Error(response.data.error || 'Échec de modification de la boîte aux lettres');
    }
    return response.data.data;
  }

  async deleteMailbox(identity: string, permanent: boolean = false): Promise<void> {
    await this.api.delete(`/mailboxes/${encodeURIComponent(identity)}`, {
      params: { permanent },
    });
  }

  // ============================================================================
  // Distribution Groups
  // ============================================================================

  async getDistributionGroups(resultSize: number = 1000): Promise<DistributionGroup[]> {
    const response = await this.api.get<ApiResponse<DistributionGroup[]>>('/distributiongroups', {
      params: { resultSize },
    });
    return response.data.data || [];
  }

  async getDistributionGroup(identity: string): Promise<DistributionGroup | null> {
    const response = await this.api.get<ApiResponse<DistributionGroup>>(
      `/distributiongroups/${encodeURIComponent(identity)}`
    );
    return response.data.data || null;
  }

  async getGroupMembers(identity: string): Promise<GroupMember[]> {
    const response = await this.api.get<ApiResponse<GroupMember[]>>(
      `/distributiongroups/${encodeURIComponent(identity)}/members`
    );
    return response.data.data || [];
  }

  async createDistributionGroup(request: CreateGroupRequest): Promise<DistributionGroup> {
    const response = await this.api.post<ApiResponse<DistributionGroup>>('/distributiongroups', request);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Échec de création du groupe');
    }
    return response.data.data;
  }

  async addGroupMember(groupIdentity: string, memberIdentity: string): Promise<void> {
    await this.api.post(`/distributiongroups/${encodeURIComponent(groupIdentity)}/members`, {
      memberIdentity,
    });
  }

  async removeGroupMember(groupIdentity: string, memberIdentity: string): Promise<void> {
    await this.api.delete(
      `/distributiongroups/${encodeURIComponent(groupIdentity)}/members/${encodeURIComponent(memberIdentity)}`
    );
  }

  async deleteDistributionGroup(identity: string): Promise<void> {
    await this.api.delete(`/distributiongroups/${encodeURIComponent(identity)}`);
  }

  // ============================================================================
  // Databases
  // ============================================================================

  async getDatabases(): Promise<MailboxDatabase[]> {
    const response = await this.api.get<ApiResponse<MailboxDatabase[]>>('/databases');
    return response.data.data || [];
  }

  async getOrganizationalUnits(): Promise<string[]> {
    const response = await this.api.get<ApiResponse<string[]>>('/mailboxes/organizational-units');
    return response.data.data || [];
  }

  async getDatabase(identity: string): Promise<MailboxDatabase | null> {
    const response = await this.api.get<ApiResponse<MailboxDatabase>>(
      `/databases/${encodeURIComponent(identity)}`
    );
    return response.data.data || null;
  }

  async updateDatabase(identity: string, data: {
    IssueWarningQuota?: string;
    ProhibitSendQuota?: string;
    ProhibitSendReceiveQuota?: string;
    MailboxRetention?: string;
    DeletedItemRetention?: string;
  }): Promise<void> {
    await this.api.put(`/databases/${encodeURIComponent(identity)}`, data);
  }

  // ============================================================================
  // Queues
  // ============================================================================

  async getQueues(server?: string): Promise<Queue[]> {
    const response = await this.api.get<ApiResponse<Queue[]>>('/queues', {
      params: { server },
    });
    return response.data.data || [];
  }

  async getQueueMessages(queueIdentity: string): Promise<QueueMessage[]> {
    const response = await this.api.get<ApiResponse<QueueMessage[]>>(
      `/queues/${encodeURIComponent(queueIdentity)}/messages`
    );
    return response.data.data || [];
  }

  async retryQueue(queueIdentity: string): Promise<void> {
    await this.api.post(`/queues/${encodeURIComponent(queueIdentity)}/retry`);
  }

  // ============================================================================
  // Permissions
  // ============================================================================

  async getMailboxPermissions(identity: string): Promise<MailboxPermission[]> {
    const response = await this.api.get<ApiResponse<MailboxPermission[]>>(
      `/mailboxes/${encodeURIComponent(identity)}/permissions`
    );
    return response.data.data || [];
  }

  async addMailboxPermission(identity: string, request: AddPermissionRequest): Promise<void> {
    await this.api.post(`/mailboxes/${encodeURIComponent(identity)}/permissions`, request);
  }

  async removeMailboxPermission(
    identity: string,
    user: string,
    accessRights: string[]
  ): Promise<void> {
    await this.api.delete(`/mailboxes/${encodeURIComponent(identity)}/permissions`, {
      params: { user, accessRights },
    });
  }

  // ============================================================================
  // Configuration - Certificats
  // ============================================================================

  async getCertificates(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/certificates', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getCertificate(thumbprint: string): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>(
      `/certificates/${encodeURIComponent(thumbprint)}`
    );
    return response.data.data;
  }

  // Let's Encrypt DNS-01 challenge
  async startLetsEncryptOrder(data: {
    email: string;
    domains: string[];
    dnsServer?: string;
    dnsUsername?: string;
    dnsPassword?: string;
    staging?: boolean;
  }): Promise<{ orderId: string; staging: boolean; dnsServer: string; challenges: Array<{ domain: string; zone: string; recordName: string; fullName: string; txtValue: string; autoCreated: boolean; autoCreateError?: string }> }> {
    const response = await this.api.post('/certificates/letsencrypt/start', data);
    return response.data;
  }

  async validateLetsEncryptOrder(data: {
    orderId: string;
    services?: string[];
  }): Promise<{ thumbprint: string }> {
    const response = await this.api.post('/certificates/letsencrypt/validate', data);
    return response.data;
  }

  async enableCertificateServices(thumbprint: string, services: string[]): Promise<void> {
    await this.api.post(`/certificates/${encodeURIComponent(thumbprint)}/services`, { services });
  }

  async deleteCertificate(thumbprint: string): Promise<void> {
    await this.api.delete(`/certificates/${encodeURIComponent(thumbprint)}`);
  }

  async renewCertificate(thumbprint: string, services: string[], server: string): Promise<{ thumbprint: string }> {
    const response = await this.api.post(`/certificates/${encodeURIComponent(thumbprint)}/renew`, { server, services });
    return response.data;
  }

  async newCertificateRequest(data: {
    server: string;
    subjectName: string;
    domainNames: string[];
    friendlyName?: string;
    keySize?: number;
    services?: string[];
  }): Promise<{ csr: string }> {
    const response = await this.api.post('/certificates/request', {
      Server: data.server,
      SubjectName: data.subjectName,
      DomainNames: data.domainNames,
      FriendlyName: data.friendlyName ?? data.domainNames[0],
      KeySize: data.keySize ?? 2048,
      Services: data.services ?? ['SMTP', 'IIS'],
    });
    return response.data;
  }

  async importCertificateResponse(data: {
    server: string;
    base64Certificate: string;
    services?: string[];
    pfxPassword?: string;
  }): Promise<{ thumbprint: string }> {
    const response = await this.api.post('/certificates/import', {
      Server: data.server,
      Base64Certificate: data.base64Certificate,
      Services: data.services ?? ['SMTP', 'IIS'],
      PfxPassword: data.pfxPassword,
    });
    return response.data;
  }

  // ============================================================================
  // Configuration - Répertoires Virtuels
  // ============================================================================

  async getAllVirtualDirectories(server?: string, adOnly?: boolean): Promise<{
    owa: any[]; ecp: any[]; eas: any[]; ews: any[]; oab: any[]; powershell: any[]; rpc: any[]; mapi: any[];
  }> {
    const response = await this.api.get<ApiResponse<any>>('/virtualdirectories/all', {
      params: { ...(server ? { server } : {}), ...(adOnly ? { adOnly: true } : {}) },
    });
    const d = response.data.data || {};
    return {
      owa:        d.owa        || [],
      ecp:        d.ecp        || [],
      eas:        d.eas        || [],
      ews:        d.ews        || [],
      oab:        d.oab        || [],
      powershell: d.powershell || [],
      rpc:        d.rpc        || [],
      mapi:       d.mapi       || [],
    };
  }

  async getOwaVirtualDirectories(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/virtualdirectories/owa', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getEcpVirtualDirectories(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/virtualdirectories/ecp', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getEasVirtualDirectories(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/virtualdirectories/eas', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getEwsVirtualDirectories(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/virtualdirectories/ews', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getOabVirtualDirectories(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/virtualdirectories/oab', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getPowerShellVirtualDirectories(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/virtualdirectories/powershell', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async updateVirtualDirectory(type: string, identity: string, data: any): Promise<void> {
    await this.api.put(`/virtualdirectories/${type}/${encodeURIComponent(identity)}`, data);
  }

  // ============================================================================
  // Configuration - Connecteurs SMTP
  // ============================================================================

  async getReceiveConnectors(server?: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/connectors/receive', {
      params: server ? { server } : {},
    });
    return response.data.data || [];
  }

  async getSendConnectors(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/connectors/send');
    return response.data.data || [];
  }

  async createReceiveConnector(data: any): Promise<void> {
    await this.api.post('/connectors/receive', data);
  }

  async createSendConnector(data: any): Promise<void> {
    await this.api.post('/connectors/send', data);
  }

  async updateReceiveConnector(identity: string, data: any): Promise<void> {
    await this.api.patch(`/connectors/receive/${encodeURIComponent(identity)}`, data);
  }

  async updateSendConnector(identity: string, data: any): Promise<void> {
    await this.api.patch(`/connectors/send/${encodeURIComponent(identity)}`, data);
  }

  async deleteConnector(type: string, identity: string): Promise<void> {
    await this.api.delete(`/connectors/${type}/${encodeURIComponent(identity)}`);
  }

  async getConnectorCertificates(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/connectors/certificates');
    return response.data.data || [];
  }

  async enableCertificateForSmtp(thumbprint: string): Promise<void> {
    await this.api.post('/connectors/certificates/enable', { Thumbprint: thumbprint });
  }

  // ============================================================================
  // Organisation
  // ============================================================================

  async getOrganizationConfig(): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>('/organization/config');
    return response.data.data || {};
  }

  async setOrganizationConfig(fields: Record<string, any>): Promise<void> {
    await this.api.put('/organization/config', fields);
  }

  async getAcceptedDomains(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/accepted-domains');
    return response.data.data || [];
  }

  async setAcceptedDomain(identity: string, data: { DomainType?: string; MakeDefault?: boolean }): Promise<void> {
    await this.api.put(`/organization/accepted-domains/${encodeURIComponent(identity)}`, data);
  }

  async createAcceptedDomain(data: { Name: string; DomainName: string; DomainType: string }): Promise<void> {
    await this.api.post('/organization/accepted-domains', data);
  }

  async deleteAcceptedDomain(identity: string): Promise<void> {
    await this.api.delete(`/organization/accepted-domains/${encodeURIComponent(identity)}`);
  }

  async getEmailAddressPolicies(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/email-address-policies');
    return response.data.data || [];
  }

  async applyEmailAddressPolicy(identity: string): Promise<void> {
    await this.api.post(`/organization/email-address-policies/${encodeURIComponent(identity)}/apply`, {});
  }

  async createEmailAddressPolicy(data: { Name: string; SmtpTemplate: string; IncludedRecipients: string; Priority?: number }): Promise<void> {
    await this.api.post('/organization/email-address-policies', data);
  }

  async updateEmailAddressPolicy(identity: string, data: { SmtpTemplate?: string; IncludedRecipients?: string; Priority?: number }): Promise<void> {
    await this.api.patch(`/organization/email-address-policies/${encodeURIComponent(identity)}`, data);
  }

  async deleteEmailAddressPolicy(identity: string): Promise<void> {
    await this.api.delete(`/organization/email-address-policies/${encodeURIComponent(identity)}`);
  }

  async getCmdletLog(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/cmdlet-log');
    return response.data.data || [];
  }

  async clearCmdletLog(): Promise<void> {
    await this.api.delete('/cmdlet-log');
  }

  async getTransportConfig(): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>('/organization/transport-config');
    return response.data.data || {};
  }

  async setTransportConfig(fields: Record<string, any>): Promise<void> {
    await this.api.put('/organization/transport-config', fields);
  }

  // Serveurs
  async getExchangeServers(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/servers');
    return response.data.data || [];
  }

  async getServerHealth(serverName: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>(`/organization/servers/${encodeURIComponent(serverName)}/health`);
    return response.data.data || [];
  }

  async getServerQueues(serverName: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>(`/organization/servers/${encodeURIComponent(serverName)}/queues`);
    return response.data.data || [];
  }

  // Utilisateurs
  async getRetentionPolicies(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/retention-policies');
    return response.data.data || [];
  }

  async getRetentionPolicyTags(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/retention-policy-tags');
    return response.data.data || [];
  }

  async getRoleAssignmentPolicies(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/role-assignment-policies');
    return response.data.data || [];
  }

  async updateRoleAssignmentPolicy(name: string, description: string): Promise<void> {
    await this.api.put(`/organization/role-assignment-policies/${encodeURIComponent(name)}`, { description });
  }

  async getMailboxPlans(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/mailbox-plans');
    return response.data.data || [];
  }

  async getAddressLists(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/address-lists');
    return response.data.data || [];
  }

  async getGlobalAddressLists(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/global-address-lists');
    return response.data.data || [];
  }

  async getOfflineAddressBooks(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/offline-address-books');
    return response.data.data || [];
  }

  async getSharingPolicies(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/sharing-policies');
    return response.data.data || [];
  }

  // Autorisations
  async getRoleGroups(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/role-groups');
    return response.data.data || [];
  }

  async getRoleGroupMembers(name: string): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>(`/organization/role-groups/${encodeURIComponent(name)}/members`);
    return response.data.data || [];
  }

  async createRoleGroup(name: string, description?: string): Promise<void> {
    await this.api.post('/organization/role-groups', { name, description });
  }

  async updateRoleGroup(name: string, description: string): Promise<void> {
    await this.api.put(`/organization/role-groups/${encodeURIComponent(name)}`, { description });
  }

  async deleteRoleGroup(name: string): Promise<void> {
    await this.api.delete(`/organization/role-groups/${encodeURIComponent(name)}`);
  }

  async addRoleGroupMember(groupName: string, member: string): Promise<void> {
    await this.api.post(`/organization/role-groups/${encodeURIComponent(groupName)}/members/${encodeURIComponent(member)}`);
  }

  async removeRoleGroupMember(groupName: string, member: string): Promise<void> {
    await this.api.delete(`/organization/role-groups/${encodeURIComponent(groupName)}/members/${encodeURIComponent(member)}`);
  }

  async getOwaMailboxPolicies(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/owa-policies');
    return response.data.data || [];
  }

  async updateOwaMailboxPolicy(name: string, fields: {
    // Communication
    instantMessagingEnabled?: boolean; textMessagingEnabled?: boolean;
    activeSyncIntegrationEnabled?: boolean; contactsEnabled?: boolean;
    // Informations
    journalEnabled?: boolean; notesEnabled?: boolean;
    remindersAndNotificationsEnabled?: boolean;
    // Sécurité
    changePasswordEnabled?: boolean; junkEmailEnabled?: boolean;
    sMimeEnabled?: boolean; iRMEnabled?: boolean;
    displayPhotosEnabled?: boolean; setPhotoEnabled?: boolean;
    // Expérience
    themeSelectionEnabled?: boolean; premiumClientEnabled?: boolean;
    spellCheckerEnabled?: boolean;
    // Carnet d'adresses
    allAddressListsEnabled?: boolean; globalAddressListEnabled?: boolean;
    publicFoldersEnabled?: boolean;
    // Organisation
    calendarEnabled?: boolean; tasksEnabled?: boolean;
    rulesEnabled?: boolean; signaturesEnabled?: boolean;
    delegateAccessEnabled?: boolean; recoverDeletedItemsEnabled?: boolean;
    searchFoldersEnabled?: boolean; wacEditingEnabled?: boolean;
    // Accès fichiers
    directFileAccessOnPublicComputersEnabled?: boolean;
    directFileAccessOnPrivateComputersEnabled?: boolean;
    webReadyDocumentViewingOnPublicComputersEnabled?: boolean;
    webReadyDocumentViewingOnPrivateComputersEnabled?: boolean;
    wacViewingOnPublicComputersEnabled?: boolean;
    wacViewingOnPrivateComputersEnabled?: boolean;
    wSSAccessOnPublicComputersEnabled?: boolean;
    uNCAccessOnPublicComputersEnabled?: boolean;
    // Enum
    actionForUnknownFileAndMIMETypes?: string;
  }): Promise<void> {
    await this.api.put(`/organization/owa-policies/${encodeURIComponent(name)}`, fields);
  }

  // Conformité
  async getJournalRules(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/journal-rules');
    return response.data.data || [];
  }

  // Mobile
  async getActiveSyncPolicies(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/activesync-policies');
    return response.data.data || [];
  }

  async getMobileDeviceAccessRules(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/mobile-device-access-rules');
    return response.data.data || [];
  }

  // Dossiers publics
  async getPublicFolderDatabases(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/public-folder-databases');
    return response.data.data || [];
  }

  // Serveurs — DAG
  async getDatabaseAvailabilityGroups(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/organization/dag');
    return response.data.data || [];
  }

  async createDag(data: { name: string; witnessServer: string; witnessDirectory: string }): Promise<void> {
    await this.api.post('/organization/dag', { Name: data.name, WitnessServer: data.witnessServer, WitnessDirectory: data.witnessDirectory });
  }

  async updateDag(name: string, data: { witnessServer?: string; witnessDirectory?: string }): Promise<void> {
    await this.api.put(`/organization/dag/${encodeURIComponent(name)}`, { WitnessServer: data.witnessServer, WitnessDirectory: data.witnessDirectory });
  }

  async deleteDag(name: string): Promise<void> {
    await this.api.delete(`/organization/dag/${encodeURIComponent(name)}`);
  }

  async addDagMember(dagName: string, serverName: string): Promise<void> {
    await this.api.post(`/organization/dag/${encodeURIComponent(dagName)}/members/${encodeURIComponent(serverName)}`, {});
  }

  async removeDagMember(dagName: string, serverName: string): Promise<void> {
    await this.api.delete(`/organization/dag/${encodeURIComponent(dagName)}/members/${encodeURIComponent(serverName)}`);
  }

  // ============================================================================
  // Recipients (Shared Mailboxes, Resources, Contacts)
  // ============================================================================

  async getSharedMailboxes(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/recipients/shared');
    return response.data.data || [];
  }

  async createSharedMailbox(req: { name: string; alias: string; userPrincipalName: string; database?: string; organizationalUnit?: string }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/recipients/shared', req);
    return response.data.data;
  }

  async setSharedMailboxPermission(identity: string, user: string, accessRight: string): Promise<void> {
    await this.api.post(`/recipients/shared/${encodeURIComponent(identity)}/permissions`, { user, accessRight });
  }

  async getResources(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/recipients/resources');
    return response.data.data || [];
  }

  async createResource(req: { type: string; name: string; alias: string; userPrincipalName: string; database?: string; organizationalUnit?: string }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/recipients/resources', req);
    return response.data.data;
  }

  async getContacts(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/recipients/contacts');
    return response.data.data || [];
  }

  async createContact(req: { name: string; externalEmailAddress: string; alias?: string; organizationalUnit?: string }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/recipients/contacts', req);
    return response.data.data;
  }

  async deleteContact(identity: string): Promise<void> {
    await this.api.delete(`/recipients/contacts/${encodeURIComponent(identity)}`);
  }

  async searchRecipients(q: string): Promise<any[]> {
    if (q.length < 2) return [];
    const response = await this.api.get<ApiResponse<any[]>>('/recipients/search', { params: { q } });
    return response.data.data || [];
  }

  // ============================================================================
  // Mail Flow (Transport Rules, Message Tracking)
  // ============================================================================

  async getTransportRules(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/mailflow/rules');
    return response.data.data || [];
  }

  async setTransportRuleState(identity: string, enabled: boolean): Promise<void> {
    await this.api.patch(`/mailflow/rules/${encodeURIComponent(identity)}/state`, { enabled });
  }

  async createTransportRule(data: {
    name: string;
    conditionType?: string;
    conditionValue?: string;
    actionType: string;
    actionValue?: string;
    priority?: number;
    enabled?: boolean;
    comments?: string;
  }): Promise<void> {
    await this.api.post('/mailflow/rules', data);
  }

  async deleteTransportRule(identity: string): Promise<void> {
    await this.api.delete(`/mailflow/rules/${encodeURIComponent(identity)}`);
  }

  async trackMessages(params: { sender?: string; recipient?: string; start?: string; end?: string; maxResults?: number }): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/mailflow/tracking', { params });
    return response.data.data || [];
  }

  async getMailFlowSendConnectors(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/mailflow/send-connectors');
    return response.data.data || [];
  }

  async getMailFlowReceiveConnectors(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/mailflow/receive-connectors');
    return response.data.data || [];
  }

  // ============================================================================
  // System
  // ============================================================================

  async testConnection(): Promise<any> {
    const response = await this.api.get('/exchange/test');
    return response.data;
  }

  async getHealth(): Promise<any> {
    const response = await this.api.get('/health');
    return response.data;
  }
}

export const exchangeApi = new ExchangeApiService();
