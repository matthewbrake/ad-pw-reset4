
import { User, GraphApiConfig, SmtpConfig, NotificationProfile, LogEntry, PermissionResult, JobResult } from '../types';

let listeners: ((log: LogEntry) => void)[] = [];

/**
 * Streams log entries to the UI Console component.
 */
export const log = (level: LogEntry['level'], message: string, details?: any) => {
    const entry: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        details
    };
    listeners.forEach(l => l(entry));
};

export const subscribeToLogs = (listener: (log: LogEntry) => void) => {
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
};

/**
 * REAL API IMPLEMENTATION
 * All methods now bridge directly to the server.js endpoints.
 */

export const fetchUsers = async (config: GraphApiConfig): Promise<User[]> => {
  // FIX: Change 'info' to uppercase 'INFO' to match LogLevel type
  log('INFO', 'Querying Microsoft Graph via Backend...');
  try {
    const response = await fetch('/api/users');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Graph Query Failed');
    // FIX: Change 'success' to uppercase 'SUCCESS' to match LogLevel type
    log('SUCCESS', `Synchronized ${data.length} user objects.`);
    return data;
  } catch (error: any) {
    // FIX: Change 'error' to uppercase 'ERROR' to match LogLevel type
    log('ERROR', 'AD Synchronization Failed', error.message);
    throw error;
  }
};

export const saveBackendConfig = async (config: GraphApiConfig, smtp: SmtpConfig) => {
    // FIX: Change 'info' to uppercase 'INFO' to match LogLevel type
    log('INFO', 'Committing Configuration to Infrastructure...');
    const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, smtp })
    });
    const data = await response.json();
    // FIX: Change 'error' to uppercase 'ERROR' to match LogLevel type
    if (!response.ok) log('ERROR', 'Config persistence failed', data.message);
    return data;
};

export const validateGraphPermissions = async (config: GraphApiConfig): Promise<{ success: boolean; results?: PermissionResult; message: string }> => {
  // FIX: Change 'info' to uppercase 'INFO' to match LogLevel type
  log('INFO', 'Verifying Infrastructure Permissions...');
  try {
      const response = await fetch('/api/validate-permissions', { method: 'POST' });
      const result = await response.json();
      // FIX: Change 'success' to uppercase 'SUCCESS' to match LogLevel type
      if (result.success) log('SUCCESS', 'Permission Handshake Complete');
      // FIX: Change 'error' to uppercase 'ERROR' to match LogLevel type
      else log('ERROR', 'Handshake Failed', result.message);
      return result;
  } catch (e: any) {
      // FIX: Change 'error' to uppercase 'ERROR' to match LogLevel type
      log('ERROR', 'Network Error during Permission Check', e.message);
      throw e;
  }
};

export const testSmtpConnection = async (config: SmtpConfig): Promise<{ success: boolean; message: string }> => {
    // FIX: Change 'info' to uppercase 'INFO' to match LogLevel type
    log('INFO', 'Probing SMTP Transport...');
    const response = await fetch('/api/test-smtp', { method: 'POST' });
    const result = await response.json();
    // FIX: Change 'success' to uppercase 'SUCCESS' to match LogLevel type
    if (result.success) log('SUCCESS', 'SMTP Transport Active');
    // FIX: Change 'error' to uppercase 'ERROR' to match LogLevel type
    else log('ERROR', 'SMTP Probe Failed', result.message);
    return result;
};

export const runNotificationJob = async (profile: NotificationProfile, mode: 'preview' | 'test' | 'live', currentUserEmail: string = 'admin@local', scheduleTime?: string): Promise<JobResult> => {
    // FIX: Change 'info' to uppercase 'INFO' to match LogLevel type
    log('INFO', `Triggering ${mode.toUpperCase()} Engine Execution...`);
    try {
        const response = await fetch('/api/run-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, mode, testEmail: currentUserEmail, scheduleTime })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Engine execution failed');
        
        if (data.logs && Array.isArray(data.logs)) {
            data.logs.forEach((l: any) => log(l.level, l.message, l.details));
        }
        return data;
    } catch (e: any) {
        // FIX: Change 'error' to uppercase 'ERROR' to match LogLevel type
        log('ERROR', 'Critical Engine Error', e.message);
        throw e;
    }
};

export const fetchProfiles = async (): Promise<NotificationProfile[]> => {
    const response = await fetch('/api/profiles');
    return response.json();
}

export const saveProfile = async (profile: NotificationProfile): Promise<NotificationProfile> => {
    const current = await fetchProfiles();
    const profiles = [...current];
    const index = profiles.findIndex(p => p.id === profile.id);
    if (index !== -1) profiles[index] = profile;
    else profiles.push({ ...profile, id: Date.now().toString() });
    
    await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profiles)
    });
    // FIX: Change 'success' to uppercase 'SUCCESS' to match LogLevel type
    log('SUCCESS', `Saved profile: ${profile.name}`);
    return profile;
}

export const deleteProfile = async (profileId: string): Promise<void> => {
    const current = await fetchProfiles();
    const filtered = current.filter(p => p.id !== profileId);
    await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtered)
    });
}