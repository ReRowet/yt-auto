const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { readData, writeData } = require('./json-db');
const { renderVideo } = require('./render-engine');
const { uploadVideo } = require('./youtube-uploader');
const aiService = require('./ai-service');

/**
 * Initialize and start the background scheduler (v2.0.0)
 */
const startScheduler = () => {
    console.log('[Scheduler] V2.0.0 Started. Polling every minute...');
    
    cron.schedule('* * * * *', async () => {
        const schedules = readData('schedules.json');
        const accounts = readData('accounts.json');
        
        const now = new Date();
        const pendingJobs = schedules.filter(job => 
            job.status === 'pending' && new Date(job.scheduleTime) <= now
        );

        if (pendingJobs.length === 0) return;

        console.log(`[Scheduler] Processing ${pendingJobs.length} active jobs.`);

        for (const job of pendingJobs) {
            try {
                // 1. Lock & Update Status
                job.status = 'processing';
                writeData('schedules.json', schedules);

                const account = accounts.find(a => a.id === job.accountId);
                if (!account) throw new Error('Account not found');

                // Path Isolation
                const videoPath = path.join(__dirname, '..', 'publis', account.id, 'videos', job.videoFile);
                const thumbnailPath = job.thumbnailFile ? path.join(__dirname, '..', 'publis', account.id, 'images', job.thumbnailFile) : null;
                const audioPoolDir = path.join(__dirname, '..', 'publis', account.id, 'audios');
                const outputDir = path.join(__dirname, '..', 'publis', account.id, 'rendered');
                
                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

                // 2. AI Metadata Generation (Targeted)
                console.log(`[AI] Generating strategy for ${account.title}...`);
                const aiMetadata = await aiService.generateMetadata({
                    niche: job.niche || 'General',
                    referenceTitle: job.referenceTitle || '',
                    country: job.targetCountry || account.country || 'Global',
                    fileName: job.videoFile,
                    category: job.category || '22'
                });

                // 3. Render (Loudnorm + Shuffle)
                console.log(`[Render] Starting encoding for ${job.videoFile}...`);
                const renderResult = await renderVideo({
                    videoFile: videoPath,
                    audioDir: audioPoolDir,
                    outputDir: outputDir,
                    title: aiMetadata.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 40)
                });

                // 4. YouTube Upload (with AI Insights & Thumbnail)
                console.log(`[Upload] Content delivery for ${account.title}...`);
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
                console.log(`[Cleanup] Post-processing asset deletion...`);
                if (fs.existsSync(renderResult.path)) fs.unlinkSync(renderResult.path);
                if (thumbnailPath && fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);

                // 6. Complete Job
                job.status = 'completed';
                job.videoId = uploadResult.videoId;
                job.completedAt = new Date().toISOString();
                writeData('schedules.json', schedules);
                
                console.log(`[Success] Channel ${account.title}: Upload complete!`);

            } catch (err) {
                console.error(`[Failure] Job ${job.id}:`, err.message);
                job.status = 'failed';
                job.error = err.message;
                writeData('schedules.json', schedules);
            }
        }
    });
};

module.exports = {
    startScheduler
};
