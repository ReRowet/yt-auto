import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { readData, writeData } from './json-db.js';
import { renderVideo } from './render-engine.js';
import { uploadVideo } from './youtube-uploader.js';
import aiService from './ai-service.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'process.log');

/**
 * Log a message to the data/process.log file
 */
const logProcess = (message, type = 'INFO') => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${type}] ${message}\n`;
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, entry);
        console.log(`[Scheduler] ${message}`);
    } catch (err) {
        console.error('Failed to write to process.log:', err);
    }
};

/**
 * Initialize and start the background scheduler (v3.0.0)
 */
const startScheduler = () => {
    logProcess('Automation engine v3.0.0 initialized.');
    
    cron.schedule('* * * * *', async () => {
        const schedules = readData('schedules.json');
        const accounts = readData('accounts.json');
        
        const now = new Date();
        const pendingJobs = schedules.filter(job => 
            job.status === 'pending' && new Date(job.scheduleTime) <= now
        );

        if (pendingJobs.length === 0) return;

        logProcess(`Analyzing ${pendingJobs.length} active jobs...`);

        for (const job of pendingJobs) {
            let renderResult = null;
            let thumbnailPath = null;
            let accountTitle = 'Unknown';
            
            try {
                // 1. Lock & Update Status
                job.status = 'processing';
                writeData('schedules.json', schedules);

                const account = accounts.find(a => a.id === job.accountId);
                if (!account) throw new Error('Account not found');
                accountTitle = account.title;

                logProcess(`[${accountTitle}] Starting job ${job.id} for ${job.videoFile}`);

                // Path Isolation
                const videoPath = path.join(__dirname, '..', 'publis', account.id, 'videos', job.videoFile);
                thumbnailPath = job.thumbnailFile ? path.join(__dirname, '..', 'publis', account.id, 'images', job.thumbnailFile) : null;
                const audioPoolDir = path.join(__dirname, '..', 'publis', account.id, 'audios');
                const outputDir = path.join(__dirname, '..', 'publis', account.id, 'rendered');
                
                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

                // 2. AI Metadata Generation (Targeted)
                logProcess(`[AI] Generating viral strategy for "${accountTitle}"...`);
                const aiMetadata = await aiService.generateMetadata({
                    niche: job.niche || 'General',
                    referenceTitle: job.referenceTitle || '',
                    country: job.targetCountry || account.country || 'Global',
                    fileName: job.videoFile,
                    category: job.category || '22'
                });

                // 3. Render (Loudnorm + Shuffle)
                logProcess(`[Render] Encoding video with audio pool at "${audioPoolDir}" (${job.audioCount || 1} tracks)...`);
                renderResult = await renderVideo({
                    videoFile: videoPath,
                    audioDir: audioPoolDir,
                    outputDir: outputDir,
                    title: aiMetadata.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 40),
                    songCount: job.audioCount || 1
                });

                // 4. YouTube Upload (with AI Insights & Thumbnail)
                logProcess(`[Upload] Delivering content to YouTube channel: ${accountTitle}...`);
                const uploadResult = await uploadVideo({
                    clientId: account.clientId,
                    clientSecret: account.clientSecret,
                    refreshToken: account.refreshToken,
                    videoPath: renderResult.path,
                    thumbnailPath: thumbnailPath,
                    title: aiMetadata.title,
                    description: aiMetadata.description,
                    tags: aiMetadata.tags,
                    category: aiMetadata.category,
                    privacyStatus: 'public'
                });

                // 5. Cleanup Resources
                logProcess(`[Cleanup] Cleaning up temporary production assets...`);
                if (renderResult && fs.existsSync(renderResult.path)) fs.unlinkSync(renderResult.path);

                // 6. Complete Job
                job.status = 'completed';
                job.videoId = uploadResult.videoId;
                job.completedAt = new Date().toISOString();
                writeData('schedules.json', schedules);
                
                logProcess(`[Success] Channel "${accountTitle}": Upload complete! Video ID: ${uploadResult.videoId}`);

            } catch (err) {
                logProcess(`[Error] Job ${job.id} failed: ${err.message}`, 'ERROR');
                job.status = 'failed';
                job.error = err.message;
                writeData('schedules.json', schedules);

                // CRITICAL: Cleanup if failure occurred during or after render
                if (renderResult && renderResult.path && fs.existsSync(renderResult.path)) {
                    logProcess(`[Cleanup] Deleting failed render file: ${renderResult.path}`, 'WARN');
                    try { fs.unlinkSync(renderResult.path); } catch(e) {}
                }
            }
        }
    });
};

export {
    startScheduler
};
