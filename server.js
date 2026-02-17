
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

const app = express();
const PORT = process.env.PORT || 3000;

// Essential Middleware
app.use(express.json());

// Request Logging for Production Observability
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- PERSISTENCE LAYER ---
const DATA_ROOT = path.join(__dirname, 'data');
const CONFIG_DIR = path.join(DATA_ROOT, 'config');
const LOGS_DIR = path.join(DATA_ROOT, 'logs');

[DATA_ROOT, CONFIG_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const CONFIG_FILE = path.join(CONFIG_DIR, 'app-settings.json');
const PROFILES_FILE = path.join(CONFIG_DIR, 'notification-profiles.json');
const QUEUE_FILE = path.join(CONFIG_DIR, 'delivery-queue.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'audit-history.json');

const writeJsonAtomic = (filePath, data) => {
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
    } catch (e) {
        console.error(`Atomic IO Failure: ${filePath}`, e);
        if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (u) {}
        }
        throw e;
    }
};

const readJsonSafe = (filePath, defaultValue = []) => {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (!content) return defaultValue;
        return JSON.parse(content);
    } catch (e) {
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
        throw new Error(`Graph Auth Failed: ${msg}`);
    }
};

// --- API DEFINITION ---
const api = express.Router();

// Boundary Health Check
api.get('/ping', (req, res) => res.json({ status: 'online', version: '3.0.0-PROD' }));

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

api.post('/validate-permissions', async (req, res) => {
    const cfg = syncConfig();
    const checks = { connectivity: false, auth: false, userRead: false, groupRead: false };
    try {
        await axios.get('https://login.microsoftonline.com', { timeout: 3000 });
        checks.connectivity = true;
        const token = await getGraphToken(cfg);
        checks.auth = true;
        try { await axios.get('https://graph.microsoft.com/v1.0/users?$top=1', { headers: { Authorization: `Bearer ${token}` } }); checks.userRead = true; } catch (e) {}
        try { await axios.get('https://graph.microsoft.com/v1.0/groups?$top=1', { headers: { Authorization: `Bearer ${token}` } }); checks.groupRead = true; } catch (e) {}
        res.json({ success: checks.userRead && checks.groupRead, results: checks, message: "Handshake Active." });
    } catch (e) { res.status(500).json({ success: false, results: checks, message: e.message }); }
});

api.get('/users', async (req, res) => {
    try {
        const cfg = syncConfig();
        if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
            return res.status(400).json({ success: false, message: 'Azure credentials missing in config.' });
        }
        const token = await getGraphToken(cfg);
        const response = await axios.get('https://graph.microsoft.com/v1.0/users', {
            headers: { Authorization: `Bearer ${token}` },
            params: { '$select': 'id,displayName,userPrincipalName,accountEnabled,passwordPolicies,lastPasswordChangeDateTime,createdDateTime,onPremisesSyncEnabled,passwordProfile,mail', '$expand': 'manager($select=displayName)', '$top': 999 }
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
                ...u,
                id: u.id,
                displayName: u.displayName || u.userPrincipalName,
                userPrincipalName: u.userPrincipalName,
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
        console.error('API Error /users:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

api.get('/profiles', (req, res) => res.json(readJsonSafe(PROFILES_FILE, [])));

api.post('/profiles', (req, res) => {
    try {
        writeJsonAtomic(PROFILES_FILE, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.post('/verify-group', async (req, res) => {
    const { groupName } = req.body;
    const cfg = syncConfig();
    try {
        const token = await getGraphToken(cfg);
        const groupRes = await axios.get(`https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${groupName}'`, { headers: { Authorization: `Bearer ${token}` } });
        if (groupRes.data.value.length === 0) return res.status(200).json({ success: false, message: `Group '${groupName}' not found.` });
        
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
                id: u.id,
                displayName: u.displayName,
                userPrincipalName: u.userPrincipalName,
                managerName: u.manager?.displayName || "N/A",
                emailAddress: u.mail || u.userPrincipalName,
                isHybrid,
                neverExpires: never,
                daysRemaining,
                expiryDate,
                daysSinceSet,
                accountEnabled: u.accountEnabled,
                forceChange: u.passwordProfile?.forceChangePasswordNextSignIn || false
            };
        });

        res.json({ success: true, message: `Intelligence Loaded. Found ${groupName}`, sampleMembers: detailedMembers });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.get('/queue', (req, res) => res.json(readJsonSafe(QUEUE_FILE, [])));
api.post('/queue/clear', (req, res) => { writeJsonAtomic(QUEUE_FILE, []); res.json({ success: true }); });
api.delete('/queue/:id', (req, res) => {
    const queue = readJsonSafe(QUEUE_FILE, []);
    const filtered = queue.filter(item => item.id !== req.params.id);
    writeJsonAtomic(QUEUE_FILE, filtered);
    res.json({ success: true });
});

api.get('/history', (req, res) => res.json(readJsonSafe(HISTORY_FILE, [])));

api.post('/manual-push', async (req, res) => {
    const { userEmails, profileId } = req.body;
    const profiles = readJsonSafe(PROFILES_FILE, []);
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });

    const queue = readJsonSafe(QUEUE_FILE, []);
    const now = new Date().toISOString();

    userEmails.forEach(email => {
        queue.push({
            id: Math.random().toString(36).substr(2, 9),
            recipient: email,
            profileId: profile.name,
            status: 'pending',
            scheduledFor: now,
            template: profile.emailTemplate,
            subject: "[FORCED] " + profile.subjectLine,
            userData: { displayName: "Targeted Override", userPrincipalName: email, expiryDate: "N/A", daysUntilExpiry: 0 }
        });
    });

    writeJsonAtomic(QUEUE_FILE, queue);
    res.json({ success: true, count: userEmails.length });
});

api.post('/run-job', async (req, res) => {
    const { profile, mode, testEmail } = req.body;
    const logs = [];
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
                    const recipient = mode === 'test' ? testEmail : (u.mail || u.userPrincipalName);
                    let sched = new Date();
                    if (profile.preferredTime) {
                        const [h, m] = profile.preferredTime.split(':');
                        sched.setHours(parseInt(h), parseInt(m), 0, 0);
                        if (sched < new Date()) sched.setDate(sched.getDate() + 1);
                    }
                    currentQueue.push({
                        id: Math.random().toString(36).substr(2, 9),
                        recipient, profileId: profile.name, status: 'pending', scheduledFor: sched.toISOString(),
                        template: profile.emailTemplate, subject: profile.subjectLine,
                        userData: { displayName: u.displayName, userPrincipalName: u.userPrincipalName, expiryDate: exp.toLocaleDateString(), daysUntilExpiry: diff }
                    });
                }
            }
        }
        if (mode === 'live' || mode === 'test') writeJsonAtomic(QUEUE_FILE, currentQueue);
        res.json({ success: true, logs, previewData });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

api.post('/test-smtp', async (req, res) => {
    const cfg = syncConfig();
    try {
        if (!cfg.smtp.host) throw new Error('SMTP Host not configured');
        const transporter = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure, auth: { user: cfg.smtp.username, pass: cfg.smtp.password } });
        await transporter.verify();
        res.json({ success: true, message: "SMTP Transport Ready." });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Mount API Router first
app.use('/api', api);

// Static Asset Serving
app.use(express.static(path.join(__dirname, 'dist')));

// Explicit SPA Catch-all
app.get('*', (req, res) => {
    // If we're here and the path starts with /api, it's a true 404
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint Not Found', path: req.path });
    }
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Web Application build missing. Run npm run build.');
    }
});

// --- ENGINE DAEMON ---
setInterval(async () => {
    const queue = readJsonSafe(QUEUE_FILE, []);
    const cfg = syncConfig();
    const items = queue.filter(i => i.status === 'pending' && new Date(i.scheduledFor) <= new Date());
    if (items.length === 0 || !cfg.smtp.host) return;
    const transporter = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure, auth: { user: cfg.smtp.username, pass: cfg.smtp.password } });
    for (const item of items) {
        try {
            item.status = 'processing';
            let body = item.template.replace(/{{user.displayName}}/g, item.userData.displayName).replace(/{{user.userPrincipalName}}/g, item.userData.userPrincipalName).replace(/{{expiryDate}}/g, item.userData.expiryDate).replace(/{{daysUntilExpiry}}/g, item.userData.daysUntilExpiry);
            let sub = item.subject.replace(/{{daysUntilExpiry}}/g, item.userData.daysUntilExpiry);
            const info = await transporter.sendMail({ from: cfg.smtp.fromEmail, to: item.recipient, subject: sub, text: body });
            item.status = 'sent';
            const history = readJsonSafe(HISTORY_FILE, []);
            history.push({ 
                timestamp: new Date().toISOString(), 
                email: item.recipient, 
                profileId: item.profileId, 
                status: 'sent', 
                details: 'Engine Delivery',
                rawPayload: info 
            });
            writeJsonAtomic(HISTORY_FILE, history);
        } catch (e) { item.status = 'failed'; item.error = e.message; }
    }
    writeJsonAtomic(QUEUE_FILE, queue.filter(i => i.status === 'pending' || i.status === 'failed'));
}, 60000);

app.listen(PORT, () => console.log(`[CORE] AD Notifier PROD Engine listening on port ${PORT}`));
