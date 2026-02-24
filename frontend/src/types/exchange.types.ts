// Types pour les boîtes aux lettres
export interface Mailbox {
  // Get-Mailbox
  name?: string;
  displayName?: string;
  primarySmtpAddress?: string;
  alias?: string;
  database?: string;
  organizationalUnit?: string;
  recipientType?: string;
  recipientTypeDetails?: string;
  whenCreated?: string;
  whenChanged?: string;
  issueWarningQuota?: string;
  prohibitSendQuota?: string;
  prohibitSendReceiveQuota?: string;
  useDatabaseQuotaDefaults?: boolean;
  hiddenFromAddressListsEnabled?: boolean;
  emailAddresses?: string[];
  mailTip?: string;
  forwardingAddress?: string;
  deliverToMailboxAndForward?: boolean;
  userPrincipalName?: string;

  // Get-User
  firstName?: string;
  lastName?: string;
  initials?: string;
  phone?: string;
  mobilePhone?: string;
  fax?: string;
  title?: string;
  department?: string;
  company?: string;
  office?: string;
  manager?: string;
  streetAddress?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  countryOrRegion?: string;
  notes?: string;
}

export interface MailboxStatistics {
  displayName?: string;
  itemCount?: number;
  totalItemSize?: string;
  totalDeletedItemSize?: string;
  lastLogonTime?: string;
  lastLogoffTime?: string;
  database?: string;
}

export interface CreateMailboxRequest {
  name: string;
  alias: string;
  userPrincipalName: string;
  firstName?: string;
  lastName?: string;
  password: string;
  database?: string;
  organizationalUnit?: string;
  resetPasswordOnNextLogon?: string;
}

export interface UpdateMailboxRequest {
  // Set-Mailbox
  displayName?: string;
  alias?: string;
  issueWarningQuota?: string;
  prohibitSendQuota?: string;
  prohibitSendReceiveQuota?: string;
  useDatabaseQuotaDefaults?: boolean;
  hiddenFromAddressListsEnabled?: boolean;
  mailTip?: string;
  forwardingAddress?: string;
  deliverToMailboxAndForward?: boolean;

  // Set-User
  firstName?: string;
  lastName?: string;
  initials?: string;
  phone?: string;
  mobilePhone?: string;
  fax?: string;
  title?: string;
  department?: string;
  company?: string;
  office?: string;
  manager?: string;
  streetAddress?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  countryOrRegion?: string;
  notes?: string;
}

// Types pour les groupes de distribution
export interface DistributionGroup {
  name?: string;
  displayName?: string;
  primarySmtpAddress?: string;
  alias?: string;
  managedBy?: string[];
  memberJoinRestriction?: string;
  memberDepartRestriction?: string;
  whenCreated?: string;
}

export interface GroupMember {
  name?: string;
  displayName?: string;
  primarySmtpAddress?: string;
  recipientType?: string;
}

export interface CreateGroupRequest {
  name: string;
  displayName?: string;
  alias: string;
  primarySmtpAddress?: string;
  notes?: string;
  managedBy?: string[];
  organizationalUnit?: string;
}

// Types pour les bases de données
export interface MailboxDatabase {
  name?: string;
  server?: string;
  edbFilePath?: string;
  logFolderPath?: string;
  issueWarningQuota?: string;
  prohibitSendQuota?: string;
  prohibitSendReceiveQuota?: string;
  mounted?: boolean;
}

// Types pour les files d'attente
export interface Queue {
  identity?: string;
  deliveryType?: string;
  status?: string;
  messageCount?: number;
  nextHopDomain?: string;
  lastError?: string;
}

export interface QueueMessage {
  identity?: string;
  subject?: string;
  fromAddress?: string;
  status?: string;
  size?: number;
  messageSourceName?: string;
  dateReceived?: string;
}

// Types pour les permissions
export interface MailboxPermission {
  identity?: string;
  user?: string;
  accessRights?: string[];
  deny?: boolean;
}

export interface AddPermissionRequest {
  user: string;
  accessRights: string[];
}

// Types génériques de réponse API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Types pour l'audit
export interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  details?: string;
  success: boolean;
}

// Types pour les certificats
export interface Certificate {
  thumbprint: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  isSelfSigned: boolean;
  services: string[];
  status: string;
  friendlyName?: string;
  hasPrivateKey?: boolean;
}

// Types pour les répertoires virtuels
export interface VirtualDirectory {
  identity: string;
  server: string;
  internalUrl: string;
  externalUrl: string;
  authenticationMethods: string[];
}

export interface UpdateVirtualDirectoryRequest {
  internalUrl: string;
  externalUrl: string;
}

// Types pour les connecteurs SMTP
export interface Connector {
  identity: string;
  server: string;
  bindings: string[];
  enabled: boolean;
  maxMessageSize: string;
  remoteIPRanges: string[];
  authMechanism?: string[];
  smartHosts?: string[];
}

export interface CreateReceiveConnectorRequest {
  name: string;
  bindings: string[];
  remoteIPRanges?: string[];
  maxMessageSize?: number;
  enabled?: boolean;
}

export interface CreateSendConnectorRequest {
  name: string;
  smartHosts: string[];
  addressSpaces?: string[];
  maxMessageSize?: number;
  enabled?: boolean;
}
