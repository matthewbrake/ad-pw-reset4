
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
const VERSION = '3.9.0-CORE-FIX';

const app = express();
const PORT = process.env.PORT || 3000;

// --- PERSISTENCE & LOGGING ---
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
        console.error("Critical IO Fault: Log write failed", e.message);
    }
};

fileLog('SYSTEM', '--- INFRASTRUCTURE SESSION START ---');
fileLog('SYSTEM', `AD Notifier Engine v${VERSION} Online`);

const CONFIG_FILE = path.join(CONFIG_DIR, 'app-settings.json');
const PROFILES_FILE = path.join(CONFIG_DIR, 'notification-profiles.json');
const QUEUE_FILE = path.join(CONFIG_DIR, 'delivery-queue.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'audit-history.json');

const writeJsonAtomic = (filePath, data) => {
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
        fileLog('IO', `COMMIT SUCCESS: ${filePath}`);
    } catch (e) {
        fileLog('ERROR', `COMMIT FAILED: ${filePath}`, e.message);
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
        fileLog('WARN', `READ RECOVERY: ${filePath}`, e.message);
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
        fileLog('ERROR', 'Graph Auth Handshake Failure', msg);
        throw new Error(`Graph Auth Failed: ${msg}`);
    }
};

// --- GLOBAL MIDDLEWARE ---
app.use(express.json());

// Request tracking for telemetry
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (res.statusCode >= 400) {
            fileLog('WARN', `Request Trace: ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// --- API ROUTER DEFINITION ---
const apiRouter = express.Router();

apiRouter.get('/ping', (req, res) => {
    res.json({ status: 'online', version: VERSION, timestamp: new Date().toISOString() });
});

apiRouter.get('/config', (req, res) => {
    const config = syncConfig();
    const masked = JSON.parse(JSON.stringify(config));
    if (masked.clientSecret) masked.clientSecret = '********';
    if (masked.smtp && masked.smtp.password) masked.smtp.password = '********';
    res.json(masked);
});

apiRouter.post('/api/config', (req, res) => {
    // Legacy support for misplaced client routes
    res.redirect(307, '/api/config');
});

apiRouter.post('/config', (req, res) => {
    try {
        const update = req.body;
        const current = syncConfig();
        if (update.clientSecret === '********') update.clientSecret = current.clientSecret;
        if (update.smtp && update.smtp.password === '********') update.smtp.password = current.smtp.password;
        const merged = { ...current, ...update, smtp: update.smtp ? { ...current.smtp, ...update.smtp } : current.smtp };
        writeJsonAtomic(CONFIG_FILE, merged);
        fileLog('INFO', 'System Configuration Updated');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

apiRouter.post('/validate-permissions', async (req, res) => {
    const cfg = syncConfig();
    const checks = { connectivity: false, auth: false, userRead: false, groupRead: false };
    try {
        await axios.get('https://login.microsoftonline.com', { timeout: 3000 });
        checks.connectivity = true;
        const token = await getGraphToken(cfg);
        checks.auth = true;
        try { await axios.get('https://graph.microsoft.com/v1.0/users?$top=1', { headers: { Authorization: `Bearer ${token}` } }); checks.userRead = true; } catch (e) {}
        try { await axios.get('https://graph.microsoft.com/v1.0/groups?$top=1', { headers: { Authorization: `Bearer ${token}` } }); checks.groupRead = true; } catch (e) {}
        res.json({ success: checks.userRead && checks.groupRead, results: checks, message: "Permissions verified." });
    } catch (e) { res.status(500).json({ success: false, results: checks, message: e.message }); }
});

apiRouter.get('/users', async (req, res) => {
    try {
        const cfg = syncConfig();
        const token = await getGraphToken(cfg);
        fileLog('DEBUG', 'Initiating User Sync Pipeline');
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
            let daysSinceSet = 0;

            if (last) {
                const setDate = new Date(last);
                daysSinceSet = Math.floor((new Date().getTime() - setDate.getTime()) / 86400000);
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
                daysSinceSet,
                forceChange: u.passwordProfile?.forceChangePasswordNextSignIn || false
            };
        });
        res.json(users);
    } catch (e) {
        fileLog('ERROR', 'API Fault: GET /users', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

apiRouter.get('/profiles', (req, res) => res.json(readJsonSafe(PROFILES_FILE, [])));
apiRouter.post('/profiles', (req, res) => {
    try { 
        writeJsonAtomic(PROFILES_FILE, req.body); 
        fileLog('INFO', 'Logic Profiles Updated');
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

apiRouter.post('/verify-group', async (req, res) => {
    const { groupName } = req.body;
    if (!groupName) return res.status(400).json({ success: false, message: "groupName required" });
    const cfg = syncConfig();
    try {
        const token = await getGraphToken(cfg);
        const groupRes = await axios.get(`https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${groupName}'`, { headers: { Authorization: `Bearer ${token}` } });
        if (groupRes.data.value.length === 0) return res.json({ success: false, message: `Group '${groupName}' not found.` });
        
        const groupId = groupRes.data.value[0].id;
        const membersRes = await axios.get(`https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,userPrincipalName,accountEnabled,passwordPolicies,lastPasswordChangeDateTime,createdDateTime,onPremisesSyncEnabled,passwordProfile,mail&$expand=manager($select=displayName)&$top=99`, { headers: { Authorization: `Bearer ${token}` } });
        
        const detailedMembers = membersRes.data.value.map(u => {
            const isHybrid = u.onPremisesSyncEnabled === true;
            const never = (u.passwordPolicies || "").includes("DisablePasswordExpiration") && !isHybrid;
            let last = u.lastPasswordChangeDateTime || u.createdDateTime;
            let daysRemaining = 999;
            let expiryDate = "Never";
            let daysSinceSet = 0;
            if (last) {
                const setDate = new Date(last);
                daysSinceSet = Math.floor((new Date().getTime() - setDate.getTime()) / 86400000);
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
                daysSinceSet,
                accountEnabled: u.accountEnabled,
                forceChange: u.passwordProfile?.forceChangePasswordNextSignIn || false
            };
        });
        res.json({ success: true, message: `Verified ${groupName}`, sampleMembers: detailedMembers });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

apiRouter.get('/queue', (req, res) => res.json(readJsonSafe(QUEUE_FILE, [])));
apiRouter.post('/queue/clear', (req, res) => { writeJsonAtomic(QUEUE_FILE, []); res.json({ success: true }); });
apiRouter.delete('/queue/:id', (req, res) => {
    const queue = readJsonSafe(QUEUE_FILE, []);
    const filtered = queue.filter(item => item.id !== req.params.id);
    writeJsonAtomic(QUEUE_FILE, filtered);
    res.json({ success: true });
});

apiRouter.get('/history', (req, res) => res.json(readJsonSafe(HISTORY_FILE, [])));

apiRouter.post('/manual-push', async (req, res) => {
    const { userEmails, profileId } = req.body;
    const profiles = readJsonSafe(PROFILES_FILE, []);
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });

    const queue = readJsonSafe(QUEUE_FILE, []);
    userEmails.forEach(email => {
        queue.push({
            id: Math.random().toString(36).substr(2, 9),
            recipient: email,
            profileId: profile.name,
            status: 'pending',
            scheduledFor: new Date().toISOString(),
            template: profile.emailTemplate,
            subject: "[FORCED] " + profile.subjectLine,
            userData: { displayName: "Targeted User", userPrincipalName: email, expiryDate: "Manual", daysUntilExpiry: 0 }
        });
    });
    writeJsonAtomic(QUEUE_FILE, queue);
    res.json({ success: true });
});

apiRouter.post('/run-job', async (req, res) => {
    const { profile, mode, testEmail } = req.body;
    const previewData = [];
    const cfg = syncConfig();
    try {
        const token = await getGraphToken(cfg);
        const userRes = await axios.get('https://graph.microsoft.com/v1.0/users', {
            headers: { Authorization: `Bearer ${token}` },
            params: { '$select': 'id,displayName,userPrincipalName,accountEnabled,passwordPolicies,lastPasswordChangeDateTime,createdDateTime,onPremisesSyncEnabled,mail', '$top': 999 }
        });
        const allUsers = userRes.data.value;
        let targetedUsers = allUsers;
        if (profile.assignedGroups && profile.assignedGroups.length > 0 && !profile.assignedGroups.includes('All Users')) {
            const groupRes = await axios.get(`https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${profile.assignedGroups[0]}'`, { headers: { Authorization: `Bearer ${token}` } });
            if (groupRes.data.value.length > 0) {
                const members = await axios.get(`https://graph.microsoft.com/v1.0/groups/${groupRes.data.value[0].id}/members?$top=999`, { headers: { Authorization: `Bearer ${token}` } });
                const memberIds = new Set(members.data.value.map(m => m.id));
                targetedUsers = allUsers.filter(u => memberIds.has(u.id));
            }
        }
        const currentQueue = readJsonSafe(QUEUE_FILE, []);
        for (const u of targetedUsers) {
            const isHybrid = u.onPremisesSyncEnabled === true;
            const never = (u.passwordPolicies || "").includes("DisablePasswordExpiration") && !isHybrid;
            if (never) continue;
            const last = u.lastPasswordChangeDateTime || u.createdDateTime;
            if (!last) continue;
            const exp = new Date(last);
            exp.setDate(exp.getDate() + (cfg.defaultExpiryDays || 90));
            const diff = Math.ceil((exp.getTime() - new Date().getTime()) / 86400000);
            if (profile.cadence.daysBefore.includes(diff)) {
                previewData.push({ user: u.displayName, email: u.userPrincipalName, daysUntilExpiry: diff, expiryDate: exp.toLocaleDateString(), group: profile.assignedGroups[0] });
                if (mode === 'live' || mode === 'test') {
                    currentQueue.push({
                        id: Math.random().toString(36).substr(2, 9),
                        recipient: mode === 'test' ? testEmail : (u.mail || u.userPrincipalName),
                        profileId: profile.name, status: 'pending', scheduledFor: new Date().toISOString(),
                        template: profile.emailTemplate, subject: profile.subjectLine,
                        userData: { displayName: u.displayName, userPrincipalName: u.userPrincipalName, expiryDate: exp.toLocaleDateString(), daysUntilExpiry: diff }
                    });
                }
            }
        }
        if (mode === 'live' || mode === 'test') writeJsonAtomic(QUEUE_FILE, currentQueue);
        res.json({ success: true, previewData });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

apiRouter.post('/test-smtp', async (req, res) => {
    const cfg = syncConfig();
    try {
        if (!cfg.smtp.host) throw new Error('SMTP Host missing');
        const transporter = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure, auth: { user: cfg.smtp.username, pass: cfg.smtp.password } });
        await transporter.verify();
        res.json({ success: true, message: "SMTP connection verified." });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Mounting Router
app.use('/api', apiRouter);

// Explicit Catch-all for failed API requests
app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `Logic Error: API Endpoint '${req.url}' does not exist.` });
});

// --- STATIC FILES & SPA FALLBACK ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Front-end build (dist) not found. Re-build recommended.");
    }
});

app.listen(PORT, () => console.log(`[CORE] AD Notifier Engine v${VERSION} listening on port ${PORT}`));
