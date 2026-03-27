import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { readData, writeData } from './json-db.js';
import { renderVideo } from './render-engine.js';
import { uploadVideo, getChannelInfo } from './youtube-uploader.js';
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
                logProcess(`[Render] Encoding video with audio pool at "${audioPoolDir}" (${job.loopCount || 1}x loops)...`);
                renderResult = await renderVideo({
                    videoFile: videoPath,
                    audioDir: audioPoolDir,
                    outputDir: outputDir,
                    title: aiMetadata.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 40),
                    loopCount: job.loopCount || 1
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

                // If deleteRaw is enabled, delete the original video file
                if (job.deleteRaw) {
                    logProcess(`[Cleanup] Option 'Hapus Video Mentah' is active. Deleting source video...`);
                    if (fs.existsSync(videoPath)) {
                        fs.unlinkSync(videoPath);
                        logProcess(`[Cleanup] Source video deleted: ${videoPath}`);
                    }
                }

                // 6. Complete Job
                job.status = 'completed';
                job.videoId = uploadResult.videoId;
                job.completedAt = new Date().toISOString();
                writeData('schedules.json', schedules);
                
                logProcess(`[Success] Channel "${accountTitle}": Upload complete! Video ID: ${uploadResult.videoId}`);

            } catch (err) {
                logProcess(`[Error] Job ${job.id} failed: ${err.message}`, 'ERROR');
                
                // Retry Logic: Repool to +1 minute ahead
                job.retryCount = (job.retryCount || 0) + 1;
                
                if (job.retryCount <= 3) {
                    const nextRetry = new Date();
                    nextRetry.setMinutes(nextRetry.getMinutes() + 1);
                    job.scheduleTime = nextRetry.toISOString();
                    job.status = 'pending';
                    job.error = `Retrying (${job.retryCount}/3)... Last Error: ${err.message}`;
                    logProcess(`[Retry] Rescheduling job ${job.id} for 1 minute from now (Attempt ${job.retryCount}/3).`);
                } else {
                    job.status = 'failed';
                    job.error = `Max retries (3) reached. Final Error: ${err.message}`;
                    logProcess(`[Error] Job ${job.id} failed permanently.`, 'ERROR');
                }
                
                writeData('schedules.json', schedules);

                // CRITICAL: Cleanup if failure occurred during or after render
                if (renderResult && renderResult.path && fs.existsSync(renderResult.path)) {
                    logProcess(`[Cleanup] Deleting failed render file: ${renderResult.path}`, 'WARN');
                    try { fs.unlinkSync(renderResult.path); } catch(e) {}
                }
                
                // Stop processing other jobs in this cron tick to prevent cascading failures
                logProcess(`[Halt] Stopping further job processing in this batch due to error.`);
                break;
            }
        }
    });

    // 2. Periodic Channel Statistics Sync (Every 6 hours)
    // Runs at minute 0 of hours 0, 6, 12, 18
    cron.schedule('0 */6 * * *', async () => {
        logProcess('Starting periodic channel statistics synchronization...');
        const accounts = readData('accounts.json');
        
        for (let i = 0; i < accounts.length; i++) {
            try {
                const acc = accounts[i];
                logProcess(`[Sync] Updating stats for channel: ${acc.title}...`);
                const latestData = await getChannelInfo(acc.clientId, acc.clientSecret, acc.refreshToken);
                
                // Update specific fields to avoid overwriting tokens/ids
                accounts[i] = {
                    ...acc,
                    ...latestData,
                    lastSync: new Date().toISOString()
                };
                
                writeData('accounts.json', accounts);
                logProcess(`[Success] Channel "${acc.title}" statistics updated.`);
            } catch (err) {
                logProcess(`[Error] Failed to sync stats for channel ${accounts[i].title}: ${err.message}`, 'ERROR');
            }
        }
        logProcess('Periodic channel sync complete.');
    });
};

export {
    startScheduler
};
