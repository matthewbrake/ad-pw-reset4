
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
const VERSION = '4.2.0-ENTERPRISE-STABLE';

const app = express();
const PORT = process.env.PORT || 3000;

// --- PERSISTENCE ---
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
        console.error("LOG_FAULT:", e.message);
    }
};

const CONFIG_FILE = path.join(CONFIG_DIR, 'app-settings.json');
const PROFILES_FILE = path.join(CONFIG_DIR, 'notification-profiles.json');
const QUEUE_FILE = path.join(CONFIG_DIR, 'delivery-queue.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'audit-history.json');

const readJsonSafe = (filePath, defaultValue = []) => {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        return content ? JSON.parse(content) : defaultValue;
    } catch (e) {
        fileLog('WARN', `READ_ERROR: ${filePath}`, e.message);
        return defaultValue;
    }
};

const writeJsonAtomic = (filePath, data) => {
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
    } catch (e) {
        fileLog('ERROR', `COMMIT_FAILED: ${filePath}`, e.message);
        throw e;
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
        }));
        return response.data.access_token;
    } catch (e) {
        throw new Error(e.response?.data?.error_description || e.message);
    }
};

// --- API ROUTER (PRIORITY 1) ---
const api = express.Router();
app.use(express.json());

api.get('/ping', (req, res) => res.json({ status: 'online', version: VERSION }));

api.get('/config', (req, res) => {
    const config = syncConfig();
    const masked = JSON.parse(JSON.stringify(config));
    if (masked.clientSecret) masked.clientSecret = '********';
    if (masked.smtp?.password) masked.smtp.password = '********';
    res.json(masked);
});

api.post('/config', (req, res) => {
    try {
        const update = req.body;
        const current = syncConfig();
        if (update.clientSecret === '********') update.clientSecret = current.clientSecret;
        if (update.smtp?.password === '********') update.smtp.password = current.smtp.password;
        writeJsonAtomic(CONFIG_FILE, { ...current, ...update });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.get('/users', async (req, res) => {
    try {
        const cfg = syncConfig();
        const token = await getGraphToken(cfg);
        const response = await axios.get('https://graph.microsoft.com/v1.0/users', {
            headers: { Authorization: `Bearer ${token}` },
            params: { '$select': 'id,displayName,userPrincipalName,accountEnabled,passwordPolicies,lastPasswordChangeDateTime,createdDateTime,onPremisesSyncEnabled,mail', '$expand': 'manager($select=displayName)', '$top': 999 }
        });
        const users = response.data.value.map(u => {
            const isHybrid = u.onPremisesSyncEnabled === true;
            const never = (u.passwordPolicies || "").includes("DisablePasswordExpiration") && !isHybrid;
            let last = u.lastPasswordChangeDateTime || u.createdDateTime;
            let daysRemaining = 999;
            if (last) {
                const setDate = new Date(last);
                if (!never) {
                    let exp = new Date(setDate);
                    exp.setDate(exp.getDate() + (cfg.defaultExpiryDays || 90));
                    daysRemaining = Math.ceil((exp.getTime() - new Date().getTime()) / 86400000);
                }
            }
            return {
                id: u.id,
                displayName: u.displayName || u.userPrincipalName,
                userPrincipalName: u.userPrincipalName,
                accountEnabled: u.accountEnabled,
                passwordExpiresInDays: daysRemaining,
                isHybrid,
                neverExpires: never,
                managerName: u.manager?.displayName || "N/A"
            };
        });
        res.json(users);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.get('/profiles', (req, res) => res.json(readJsonSafe(PROFILES_FILE, [])));
api.post('/profiles', (req, res) => {
    try { writeJsonAtomic(PROFILES_FILE, req.body); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.post('/verify-group', async (req, res) => {
    const { groupName } = req.body;
    const cfg = syncConfig();
    try {
        const token = await getGraphToken(cfg);
        const groupRes = await axios.get(`https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${groupName}'`, { headers: { Authorization: `Bearer ${token}` } });
        if (!groupRes.data.value.length) return res.status(404).json({ success: false, message: "Group not found." });
        
        const groupId = groupRes.data.value[0].id;
        const membersRes = await axios.get(`https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,userPrincipalName,onPremisesSyncEnabled&$expand=manager($select=displayName)`, { headers: { Authorization: `Bearer ${token}` } });
        
        res.json({ success: true, sampleMembers: membersRes.data.value.map(u => ({
            displayName: u.displayName,
            userPrincipalName: u.userPrincipalName,
            managerName: u.manager?.displayName || "N/A",
            isHybrid: u.onPremisesSyncEnabled === true
        }))});
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.get('/history', (req, res) => res.json(readJsonSafe(HISTORY_FILE, [])));
api.get('/queue', (req, res) => res.json(readJsonSafe(QUEUE_FILE, [])));

app.use('/api', api);

// API Guard (Prevent fallthrough)
app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `API Endpoint ${req.url} does not exist.` });
});

// --- STATIC FILES (LAST PRIORITY) ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => {
    fileLog('SYSTEM', `READY: Engine v${VERSION} on port ${PORT}`);
    console.log(`[CORE] AD Notifier Engine Online: ${PORT}`);
});
