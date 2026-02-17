
import { User, GraphApiConfig, SmtpConfig, NotificationProfile, LogEntry, PermissionResult, LogLevel } from '../types';

let listeners: ((log: LogEntry) => void)[] = [];

export const log = (level: LogLevel, message: string, details?: any) => {
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

const safeFetchJson = async (url: string, options?: RequestInit) => {
  log('DEBUG', `Fetch: ${url}`);
  try {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Accept': 'application/json',
            ...(options?.headers || {})
        }
    });
    
    const contentType = response.headers.get('content-type');
    const rawText = await response.text();

    if (!response.ok) {
        if (response.status === 404) {
            log('ERROR', `Endpoint 404: ${url}`);
            throw new Error(`Critical Error: API Endpoint '${url}' is unreachable (404). Please verify backend state and dist build.`);
        }
        let errorMessage = `API Fault (${response.status})`;
        try {
            const errorJson = JSON.parse(rawText);
            errorMessage = errorJson.message || errorMessage;
        } catch (e) {
            errorMessage = rawText.substring(0, 100) || errorMessage;
        }
        log('ERROR', `API Failure [${response.status}] for ${url}`, errorMessage);
        throw new Error(errorMessage);
    }

    if (!contentType || !contentType.includes('application/json')) {
        log('ERROR', `Mime Type Mismatch: ${url}`, contentType);
        throw new Error(`Protocol Mismatch: Expected JSON from ${url} but received ${contentType || 'plain text'}.`);
    }

    return JSON.parse(rawText);
  } catch (e: any) {
    if (e.message.includes('Failed to fetch')) {
        log('ERROR', `Network Connection Refused: ${url}`);
        throw new Error(`Network Connection Interrupted: Server at ${url} is offline.`);
    }
    console.error(`Fetch Exception [${url}]:`, e.message);
    throw e;
  }
};

export const fetchBackendConfig = async (): Promise<any> => {
    return safeFetchJson('/api/config');
};

export const checkConnectivity = async (): Promise<any> => {
    try {
        const res = await safeFetchJson('/api/ping');
        return res;
    } catch (e) {
        return null;
    }
};

export const fetchUsers = async (config?: GraphApiConfig): Promise<User[]> => {
  log('INFO', 'Executing Directory Synchronizer...');
  try {
    const data = await safeFetchJson('/api/users');
    if (!Array.isArray(data)) {
        throw new Error(data.message || 'Identity service returned invalid data format.');
    }
    log('SUCCESS', `Synchronized ${data.length} identities.`);
    return data;
  } catch (error: any) {
    log('ERROR', 'Identity Sync Failure', error.message);
    throw error;
  }
};

export const saveBackendConfig = async (config: GraphApiConfig, smtp: SmtpConfig) => {
    log('INFO', 'Committing Configuration Updates...');
    try {
        const data = await safeFetchJson('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, smtp })
        });
        log('SUCCESS', 'Core configuration updated.');
        return data;
    } catch (e: any) {
        log('ERROR', 'Update Transmission Failure', e.message);
        throw e;
    }
};

export const validateGraphPermissions = async (config: GraphApiConfig): Promise<{ success: boolean; results?: PermissionResult; message: string }> => {
  log('DEBUG', 'Testing Permission Handshake...');
  try {
      const result = await safeFetchJson('/api/validate-permissions', { method: 'POST' });
      if (result.success) log('SUCCESS', 'Permission Logic Validated.');
      else log('ERROR', 'Permission Rejected', result.message);
      return result;
  } catch (e: any) {
      log('ERROR', 'Handshake Protocol Fault', e.message);
      throw e;
  }
};

export const testSmtpConnection = async (config: SmtpConfig): Promise<{ success: boolean; message: string }> => {
    log('DEBUG', 'Probing SMTP Transport...');
    try {
        const result = await safeFetchJson('/api/test-smtp', { method: 'POST' });
        if (result.success) log('SUCCESS', 'SMTP Transport Active.');
        else log('ERROR', 'SMTP Protocol Failure', result.message);
        return result;
    } catch (e: any) {
        log('ERROR', 'SMTP Transmission Error', e.message);
        throw e;
    }
};

export const runNotificationJob = async (profile: NotificationProfile, mode: 'preview' | 'test' | 'live', currentUserEmail: string = 'admin@local', scheduleTime?: string): Promise<any> => {
    log('INFO', `Initializing ${mode.toUpperCase()} Engine Job...`);
    try {
        const data = await safeFetchJson('/api/run-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, mode, testEmail: currentUserEmail, scheduleTime })
        });
        return data;
    } catch (e: any) {
        log('ERROR', 'Engine Job Execution Failed', e.message);
        throw e;
    }
};

export const fetchProfiles = async (): Promise<NotificationProfile[]> => {
    return safeFetchJson('/api/profiles');
}

export const saveProfile = async (profile: NotificationProfile): Promise<NotificationProfile> => {
    const current = await fetchProfiles();
    const profiles = [...current];
    const index = profiles.findIndex(p => p.id === profile.id);
    if (index !== -1) profiles[index] = profile;
    else profiles.push({ ...profile, id: Date.now().toString() });
    
    await safeFetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profiles)
    });
    log('SUCCESS', `Profile Saved: ${profile.name}`);
    return profile;
}

export const deleteProfile = async (profileId: string): Promise<void> => {
    const current = await fetchProfiles();
    const filtered = current.filter(p => p.id !== profileId);
    await safeFetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtered)
    });
}
