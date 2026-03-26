import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { readData, writeData } from './json-db.js';
import { startScheduler } from './scheduler.js';
import { getChannelInfo } from './youtube-uploader.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('--- RE-Publis v2.8.0 System Health Booting ---');

startScheduler();

const app = express();
const PORT = process.env.PORT || 3005;

// Configuration for Multer (File Uploads)
// Isolated per channel: publis/[channelId]/videos/...
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const channelId = req.headers['x-channel-id'] || 'global';
        let dir = path.join(__dirname, '..', 'publis', channelId);
        
        if (file.fieldname === 'video') dir = path.join(dir, 'videos');
        else if (file.fieldname === 'audio') dir = path.join(dir, 'audios');
        else if (file.fieldname === 'image') dir = path.join(dir, 'images');
        
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/publis', express.static(path.join(__dirname, '..', 'publis')));

// --- API ROUTES v2.2 ---

// 1. Channel Management
app.get('/api/accounts', (req, res) => {
    res.json(readData('accounts.json'));
});

app.post('/api/accounts', async (req, res) => {
    const { clientId, clientSecret, refreshToken } = req.body;
    if (!clientId || !clientSecret || !refreshToken) {
        return res.status(400).json({ error: 'Missing OAuth credentials' });
    }

    try {
        console.log('[API] Fetching YouTube Channel Info...');
        const channelData = await getChannelInfo(clientId, clientSecret, refreshToken);
        
        const accounts = readData('accounts.json');
        const newAccount = {
            id: uuidv4(),
            ...channelData, // title, customUrl, profilePic, subscribers, views, country
            clientId,
            clientSecret,
            refreshToken,
            createdAt: new Date().toISOString(),
            lastSync: new Date().toISOString()
        };

        accounts.push(newAccount);
        writeData('accounts.json', accounts);
        res.json({ success: true, account: newAccount });
    } catch (err) {
        res.status(500).json({ error: `Failed to fetch YouTube info: ${err.message}` });
    }
});

app.post('/api/accounts/:id/sync', async (req, res) => {
    const accounts = readData('accounts.json');
    const index = accounts.findIndex(a => a.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Account not found' });

    try {
        const acc = accounts[index];
        const channelData = await getChannelInfo(acc.clientId, acc.clientSecret, acc.refreshToken);
        accounts[index] = { ...acc, ...channelData, lastSync: new Date().toISOString() };
        writeData('accounts.json', accounts);
        res.json({ success: true, account: accounts[index] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Media Management (Per Channel + Metadata)
app.get('/api/media', (req, res) => {
    const channelId = req.query.channelId || 'global';
    const baseDir = path.join(__dirname, '..', 'publis', channelId);
    
    const getFilesWithMetadata = (dir) => {
        const fullPath = path.join(baseDir, dir);
        if (!fs.existsSync(fullPath)) return [];
        return fs.readdirSync(fullPath)
            .filter(f => !f.startsWith('.'))
            .map(f => {
                const stats = fs.statSync(path.join(fullPath, f));
                return {
                    name: f,
                    size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
                    mtime: stats.mtime,
                    path: `/publis/${channelId}/${dir}/${f}`
                };
            });
    };

    res.json({
        videos: getFilesWithMetadata('videos'),
        audios: getFilesWithMetadata('audios'),
        images: getFilesWithMetadata('images'),
        rendered: getFilesWithMetadata('rendered')
    });
});

app.post('/api/upload', upload.fields([
    { name: 'video', maxCount: 20 },
    { name: 'audio', maxCount: 20 },
    { name: 'image', maxCount: 20 }
]), (req, res) => {
    res.json({ success: true, files: req.files });
});

// 3. Settings
app.get('/api/settings', (req, res) => {
    res.json(readData('settings.json'));
});

app.post('/api/settings', (req, res) => {
    const settings = readData('settings.json');
    const updated = { ...settings, ...req.body };
    writeData('settings.json', updated);
    res.json({ success: true, settings: updated });
});

// 4. Scheduling
app.get('/api/schedules', (req, res) => {
    res.json(readData('schedules.json'));
});

app.post('/api/schedules/batch', (req, res) => {
    const { 
        accountId, videoFiles, scheduleTimes, thumbnailFiles, 
        niche, referenceTitle, targetCountry, category, audioCount
    } = req.body;

    if (!accountId || !videoFiles) return res.status(400).json({ error: 'Missing fields' });

    const schedules = readData('schedules.json');
    const newJobs = [];

    videoFiles.forEach((file, idx) => {
        const jobTime = scheduleTimes ? scheduleTimes[idx] : new Date().toISOString();
        const newJob = {
            id: uuidv4(),
            accountId,
            videoFile: file,
            thumbnailFile: (thumbnailFiles && thumbnailFiles[idx]) || null,
            niche,
            referenceTitle,
            targetCountry,
            category: category || '22',
            audioCount: audioCount || 1,
            scheduleTime: jobTime,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        newJobs.push(newJob);
        schedules.push(newJob);
    });

    writeData('schedules.json', schedules);
    res.json({ success: true, jobs: newJobs });
});

app.delete('/api/schedules/:id', (req, res) => {
    let schedules = readData('schedules.json');
    const initialLength = schedules.length;
    schedules = schedules.filter(j => j.id !== req.params.id);
    
    if (schedules.length === initialLength) {
        return res.status(404).json({ error: 'Job not found' });
    }

    writeData('schedules.json', schedules);
    res.json({ success: true });
});

// 5. System Monitoring
app.get('/api/system-stats', (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsedPercent = (((totalMem - freeMem) / totalMem) * 100).toFixed(1);

        // Disk stats for the current project folder
        const stats = fs.statfsSync(__dirname);
        const totalDisk = stats.bsize * stats.blocks;
        const freeDisk = stats.bsize * stats.bfree;
        const diskUsedPercent = (((totalDisk - freeDisk) / totalDisk) * 100).toFixed(1);

        res.json({
            cpu: (os.loadavg()[0] * 10 || Math.random() * 20).toFixed(1), // Fallback for Windows
            ram: memUsedPercent,
            diskPercent: diskUsedPercent,
            diskLabel: `${((totalDisk - freeDisk) / (1024**3)).toFixed(1)} GB / ${(totalDisk / (1024**3)).toFixed(1)} GB`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Logs & Diagnostics
app.get('/api/logs', (req, res) => {
    const logPath = path.join(__dirname, '..', 'data', 'process.log');
    if (!fs.existsSync(logPath)) return res.json({ logs: ['No logs found yet.'] });
    
    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim() !== '');
        res.json({ logs: lines.slice(-50).reverse() }); // Last 50 lines, newest first
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`[OK] RE-Publis v2.2.0 running at http://localhost:${PORT}`);
});
