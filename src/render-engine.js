import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Get media duration using ffprobe
 * @param {string} filePath 
 * @returns {Promise<number>}
 */
const getDuration = (filePath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return resolve(0);
            resolve(metadata.format.duration || 0);
        });
    });
};

/**
 * Fisher-Yates Shuffle for audio randomization
 * @param {string[]} array 
 */
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Generate randomized and looped audio list
 */
const generateAudioList = (audioFiles, songCount, loopCount) => {
    if (audioFiles.length === 0) return [];
    
    let pool = shuffle([...audioFiles]);
    let selected = pool.slice(0, Math.min(songCount, pool.length));
    
    // Fill if needed
    while (selected.length < songCount) {
        selected.push(...shuffle([...audioFiles]));
    }
    selected = selected.slice(0, songCount);

    let final = [];
    for (let i = 0; i < loopCount; i++) {
        final.push(...selected);
    }
    return final;
};

/**
 * Render Video with randomized audio and normalization (Loudnorm)
 */
const renderVideo = async (options) => {
    const {
        videoFile,      // Full path to master video
        audioDir,       // Directory of audio pool
        outputDir,      // Account-specific output dir
        title = 'render',
        loopCount = 1
    } = options;

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const ts = Date.now();
    const tempDir = path.join(__dirname, '..', 'temp', `render-${ts}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
        // 1. Prepare Audio
        const audioFiles = fs.readdirSync(audioDir)
            .filter(f => f.match(/\.(mp3|wav|ogg|flac|aac)$/i))
            .map(f => path.join(audioDir, f));

        if (audioFiles.length === 0) throw new Error("Audio pool is empty.");

        // Automate songCount based on folder's file count minus 3
        let calculatedSongCount = Math.max(1, audioFiles.length - 3);

        const selectedAudios = generateAudioList(audioFiles, calculatedSongCount, loopCount);
        
        // 2. Concat Audio (Direct stream copy without normalization)
        const combinedAudioPath = path.join(tempDir, 'combined.mp3');
        const audioTxtPath = path.join(tempDir, 'list.txt');
        fs.writeFileSync(audioTxtPath, selectedAudios.map(a => `file '${a.replace(/'/g, "'\\''")}'`).join('\n'));

        // Concat without Loudnorm (Pure Copy)
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(audioTxtPath).inputOptions(['-f concat', '-safe 0'])
                .outputOptions(['-c:a copy'])
                .save(combinedAudioPath)
                .on('end', resolve)
                .on('error', reject);
        });

        // 3. Final Merge (Loop Video to match Audio)
        const finalFileName = `${title.replace(/\s+/g, '_')}-${ts}.mp4`;
        const finalPath = path.join(outputDir, finalFileName);

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoFile).inputOptions(['-stream_loop -1'])
                .input(combinedAudioPath)
                .outputOptions([
                    '-map 0:v',
                    '-map 1:a',
                    '-c:v libx264',
                    '-preset fast',
                    '-crf 23',
                    '-c:a copy',
                    '-shortest',
                    '-pix_fmt yuv420p'
                ])
                .save(finalPath)
                .on('end', resolve)
                .on('error', reject);
        });

        fs.rmSync(tempDir, { recursive: true, force: true });
        return { success: true, path: finalPath, filename: finalFileName };

    } catch (err) {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        throw err;
    }
};

export {
    renderVideo,
    getDuration
};
