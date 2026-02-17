
import { User, GraphApiConfig, SmtpConfig, NotificationProfile, LogEntry, PermissionResult, JobResult } from '../types';

let listeners: ((log: LogEntry) => void)[] = [];

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

const safeFetchJson = async (url: string, options?: RequestInit) => {
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
            throw new Error(`Critical Error: API Endpoint '${url}' is unreachable. Please verify server state.`);
        }
        let errorMessage = `API Fault (${response.status})`;
        try {
            const errorJson = JSON.parse(rawText);
            errorMessage = errorJson.message || errorMessage;
        } catch (e) {
            errorMessage = rawText.substring(0, 100) || errorMessage;
        }
        throw new Error(errorMessage);
    }

    if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Protocol Mismatch: Expected JSON from ${url} but received ${contentType || 'plain text'}.`);
    }

    return JSON.parse(rawText);
  } catch (e: any) {
    if (e.message.includes('Failed to fetch')) {
        throw new Error(`Network Connection Interrupted: Server at ${url} is offline.`);
    }
    console.error(`Fetch Exception [${url}]:`, e.message);
    throw e;
  }
};

export const fetchBackendConfig = async (): Promise<any> => {
    return safeFetchJson('/api/config');
};

export const checkConnectivity = async (): Promise<boolean> => {
    try {
        const res = await safeFetchJson('/api/ping');
        return res.status === 'online';
    } catch (e) {
        return false;
    }
};

export const fetchUsers = async (config?: GraphApiConfig): Promise<User[]> => {
  log('info', 'Executing Global Identity Sync...');
  try {
    const data = await safeFetchJson('/api/users');
    if (!Array.isArray(data)) {
        throw new Error(data.message || 'Identity service returned invalid data format.');
    }
    log('success', `Synchronized ${data.length} identities.`);
    return data;
  } catch (error: any) {
    log('error', 'Sync Failure', error.message);
    throw error;
  }
};

export const saveBackendConfig = async (config: GraphApiConfig, smtp: SmtpConfig) => {
    log('info', 'Committing Infrastructure Delta...');
    try {
        const data = await safeFetchJson('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, smtp })
        });
        log('success', 'Infrastructure updated.');
        return data;
    } catch (e: any) {
        log('error', 'Update Failed', e.message);
        throw e;
    }
};

export const validateGraphPermissions = async (config: GraphApiConfig): Promise<{ success: boolean; results?: PermissionResult; message: string }> => {
  log('info', 'Testing Handshake Logic...');
  try {
      const result = await safeFetchJson('/api/validate-permissions', { method: 'POST' });
      if (result.success) log('success', 'Handshake Validated.');
      else log('error', 'Handshake Rejected', result.message);
      return result;
  } catch (e: any) {
      log('error', 'Protocol Error', e.message);
      throw e;
  }
};

export const testSmtpConnection = async (config: SmtpConfig): Promise<{ success: boolean; message: string }> => {
    log('info', 'Probing SMTP Transport...');
    try {
        const result = await safeFetchJson('/api/test-smtp', { method: 'POST' });
        if (result.success) log('success', 'SMTP Active.');
        else log('error', 'SMTP Probe Failure', result.message);
        return result;
    } catch (e: any) {
        log('error', 'SMTP Protocol Error', e.message);
        throw e;
    }
};

export const runNotificationJob = async (profile: NotificationProfile, mode: 'preview' | 'test' | 'live', currentUserEmail: string = 'admin@local', scheduleTime?: string): Promise<JobResult> => {
    log('info', `Firing ${mode.toUpperCase()} Engine Segment...`);
    try {
        const data = await safeFetchJson('/api/run-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, mode, testEmail: currentUserEmail, scheduleTime })
        });
        
        if (data.logs && Array.isArray(data.logs)) {
            data.logs.forEach((l: any) => log(l.level, l.message, l.details));
        }
        return data;
    } catch (e: any) {
        log('error', 'Critical Engine Halt', e.message);
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
    log('success', `Logic Saved: ${profile.name}`);
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
