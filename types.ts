
export interface User {
  id: string;
  displayName: string;
  userPrincipalName: string;
  accountEnabled?: boolean; 
  passwordLastSetDateTime: string;
  onPremisesSyncEnabled?: boolean;
  passwordExpiresInDays: number;
  passwordExpiryDate: string | null; 
  neverExpires: boolean;
  assignedGroups?: string[];
  // Extended Metadata for Deep Intelligence
  managerName?: string;
  emailAddress?: string;
  forceChange?: boolean;
  daysSinceSet?: number;
  isHybrid?: boolean;
}

export interface GraphApiConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  defaultExpiryDays?: number;
}

export interface PermissionResult {
    connectivity: boolean;
    auth: boolean;
    userRead: boolean;
    groupRead: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
}

export interface NotificationProfile {
    id: string;
    name: string;
    description: string;
    emailTemplate: string;
    subjectLine: string;
    preferredTime?: string; 
    cadence: {
        daysBefore: number[];
    };
    recipients: {
        toUser: boolean;
        toManager: boolean;
        toAdmins: string[];
        readReceipt: boolean;
    };
    assignedGroups: string[];
}

export interface QueueItem {
    id: string;
    recipient: string;
    profileId: string;
    status: 'pending' | 'processing' | 'sent' | 'failed' | 'paused';
    scheduledFor: string;
    template: string;
    subject: string;
    error?: string;
    userData: {
        displayName: string;
        userPrincipalName: string;
        expiryDate: string;
        daysUntilExpiry: number;
    };
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'skip' | 'queue';
  message: string;
  details?: any;
}

export interface AuditEntry {
    timestamp: string;
    email: string;
    profileId: string;
    status: 'sent' | 'failed' | 'manual';
    details: string;
    rawPayload?: any;
}

export interface JobResult {
    success: boolean;
    logs: LogEntry[];
    previewData?: {
        user: string;
        email: string;
        daysUntilExpiry: number;
        expiryDate: string;
        group: string;
    }[];
}
