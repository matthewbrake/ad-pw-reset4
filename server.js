
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import nodemailer from 'nodemailer';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VERSION = '4.1.0-ENTERPRISE-STABLE';

const app = express();
const PORT = process.env.PORT || 3000;

// --- PERSISTENCE INFRASTRUCTURE ---
const DATA_ROOT = path.join(__dirname, 'data');
const CONFIG_DIR = path.join(DATA_ROOT, 'config');
const LOGS_DIR = path.join(DATA_ROOT, 'logs');

[DATA_ROOT, CONFIG_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const getLogFileName = () => path.join(LOGS_DIR, `engine-${new Date().toISOString().split('T')[0]}.log`);

const fileLog = (level, message, details = '') => {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message} ${details ? (typeof details === 'object' ? JSON.stringify(details) : details) : ''}\n`;
    try {
        fs.appendFileSync(getLogFileName(), line);
    } catch (e) {
        console.error("LOG_IO_FAULT:", e.message);
    }
};

fileLog('SYSTEM', `BOOT_SEQUENCE: AD Notifier v${VERSION} Initializing`);

const CONFIG_FILE = path.join(CONFIG_DIR, 'app-settings.json');
const PROFILES_FILE = path.join(CONFIG_DIR, 'notification-profiles.json');
const QUEUE_FILE = path.join(CONFIG_DIR, 'delivery-queue.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'audit-history.json');

const writeJsonAtomic = (filePath, data) => {
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
        fileLog('IO', `COMMIT: ${filePath}`);
    } catch (e) {
        fileLog('ERROR', `COMMIT_FAILED: ${filePath}`, e.message);
        if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch (u) {}
        throw e;
    }
};

const readJsonSafe = (filePath, defaultValue = []) => {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        return content ? JSON.parse(content) : defaultValue;
    } catch (e) {
        fileLog('WARN', `READ_RECOVERY: ${filePath}`, e.message);
        return defaultValue;
    }
};

const syncConfig = () => {
    const saved = readJsonSafe(CONFIG_FILE, null);
    const smtpDefault = {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE !== 'false',
        username: process.env.SMTP_USERNAME || '',
        password: process.env.SMTP_PASSWORD || '',
        fromEmail: process.env.SMTP_FROM || 'notifier@company.com'
    };
    return {
        tenantId: process.env.AZURE_TENANT_ID || (saved ? saved.tenantId : ''),
        clientId: process.env.AZURE_CLIENT_ID || (saved ? saved.clientId : ''),
        clientSecret: process.env.AZURE_CLIENT_SECRET || (saved ? saved.clientSecret : ''),
        defaultExpiryDays: parseInt(process.env.DEFAULT_EXPIRY_DAYS) || (saved ? saved.defaultExpiryDays : 90),
        smtp: (saved && saved.smtp) ? { ...smtpDefault, ...saved.smtp } : smtpDefault
    };
};

const getGraphToken = async (cfg) => {
    try {
        const response = await axios.post(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, new URLSearchParams({
            client_id: cfg.clientId,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: cfg.clientSecret,
            grant_type: 'client_credentials'
        }), { timeout: 10000 });
        return response.data.access_token;
    } catch (e) {
        const msg = e.response?.data?.error_description || e.message;
        fileLog('ERROR', 'OAUTH_HANDSHAKE_FAILURE', msg);
        throw new Error(`Graph Auth Failed: ${msg}`);
    }
};

// --- CRITICAL: GLOBAL MIDDLEWARE ---
app.use(express.json());

// Request Trace (Verbose)
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (res.statusCode >= 400) {
            fileLog('TRACE', `${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// --- API ROUTER (High Priority) ---
const api = express.Router();

api.get('/ping', (req, res) => {
    res.json({ status: 'online', version: VERSION, timestamp: new Date().toISOString() });
});

api.get('/config', (req, res) => {
    const config = syncConfig();
    const masked = JSON.parse(JSON.stringify(config));
    if (masked.clientSecret) masked.clientSecret = '********';
    if (masked.smtp && masked.smtp.password) masked.smtp.password = '********';
    res.json(masked);
});

api.post('/config', (req, res) => {
    try {
        const update = req.body;
        const current = syncConfig();
        if (update.clientSecret === '********') update.clientSecret = current.clientSecret;
        if (update.smtp && update.smtp.password === '********') update.smtp.password = current.smtp.password;
        const merged = { ...current, ...update, smtp: update.smtp ? { ...current.smtp, ...update.smtp } : current.smtp };
        writeJsonAtomic(CONFIG_FILE, merged);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.get('/users', async (req, res) => {
    try {
        const cfg = syncConfig();
        const token = await getGraphToken(cfg);
        const response = await axios.get('https://graph.microsoft.com/v1.0/users', {
            headers: { Authorization: `Bearer ${token}` },
            params: { 
                '$select': 'id,displayName,userPrincipalName,accountEnabled,passwordPolicies,lastPasswordChangeDateTime,createdDateTime,onPremisesSyncEnabled,passwordProfile,mail', 
                '$expand': 'manager($select=displayName)',
                '$top': 999 
            }
        });
        const users = response.data.value.map(u => {
            const isHybrid = u.onPremisesSyncEnabled === true;
            const never = (u.passwordPolicies || "").includes("DisablePasswordExpiration") && !isHybrid;
            let last = u.lastPasswordChangeDateTime || u.createdDateTime;
            let daysRemaining = 999;
            let expiryDate = "Never";
            if (last) {
                const setDate = new Date(last);
                if (!never) {
                    let exp = new Date(setDate);
                    exp.setDate(exp.getDate() + (cfg.defaultExpiryDays || 90));
                    expiryDate = exp.toISOString();
                    daysRemaining = Math.ceil((exp.getTime() - new Date().getTime()) / 86400000);
                }
            }
            return {
                id: u.id,
                displayName: u.displayName || u.userPrincipalName,
                userPrincipalName: u.userPrincipalName,
                accountEnabled: u.accountEnabled,
                passwordLastSetDateTime: last,
                passwordExpiresInDays: daysRemaining,
                passwordExpiryDate: never ? null : expiryDate,
                neverExpires: never,
                managerName: u.manager?.displayName || "N/A",
                emailAddress: u.mail || u.userPrincipalName,
                isHybrid,
                forceChange: u.passwordProfile?.forceChangePasswordNextSignIn || false
            };
        });
        res.json(users);
    } catch (e) {
        fileLog('ERROR', 'FETCH_USERS_FAULT', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

api.get('/profiles', (req, res) => res.json(readJsonSafe(PROFILES_FILE, [])));
api.post('/profiles', (req, res) => {
    try { writeJsonAtomic(PROFILES_FILE, req.body); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.post('/verify-group', async (req, res) => {
    const { groupName } = req.body;
    if (!groupName) return res.status(400).json({ success: false, message: "groupName required" });
    const cfg = syncConfig();
    try {
        const token = await getGraphToken(cfg);
        const groupRes = await axios.get(`https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${groupName}'`, { headers: { Authorization: `Bearer ${token}` } });
        if (groupRes.data.value.length === 0) return res.json({ success: false, message: "Target group not found in Directory." });
        
        const groupId = groupRes.data.value[0].id;
        const membersRes = await axios.get(`https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,userPrincipalName,accountEnabled,passwordPolicies,lastPasswordChangeDateTime,createdDateTime,onPremisesSyncEnabled,passwordProfile,mail&$expand=manager($select=displayName)&$top=99`, { headers: { Authorization: `Bearer ${token}` } });
        
        const detailedMembers = membersRes.data.value.map(u => {
            const isHybrid = u.onPremisesSyncEnabled === true;
            const never = (u.passwordPolicies || "").includes("DisablePasswordExpiration") && !isHybrid;
            let last = u.lastPasswordChangeDateTime || u.createdDateTime;
            let daysRemaining = 999;
            let expiryDate = "Never";
            if (last) {
                const setDate = new Date(last);
                if (!never) {
                    let exp = new Date(setDate);
                    exp.setDate(exp.getDate() + (cfg.defaultExpiryDays || 90));
                    expiryDate = exp.toLocaleDateString();
                    daysRemaining = Math.ceil((exp.getTime() - new Date().getTime()) / 86400000);
                }
            }
            return {
                displayName: u.displayName,
                userPrincipalName: u.userPrincipalName,
                managerName: u.manager?.displayName || "N/A",
                isHybrid,
                neverExpires: never,
                daysRemaining,
                expiryDate,
                accountEnabled: u.accountEnabled
            };
        });
        res.json({ success: true, message: `Logic Scope Verified for ${groupName}`, sampleMembers: detailedMembers });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.get('/queue', (req, res) => res.json(readJsonSafe(QUEUE_FILE, [])));
api.post('/queue/clear', (req, res) => { writeJsonAtomic(QUEUE_FILE, []); res.json({ success: true }); });
api.get('/history', (req, res) => res.json(readJsonSafe(HISTORY_FILE, [])));

app.use('/api', api);

// API Guard (Prevent fallthrough to SPA for /api calls)
app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `API_END_NOT_FOUND: ${req.url}` });
});

// --- STATIC FILES & SPA ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`[CORE] Enterprise Logic Engine Active on port ${PORT}`));
