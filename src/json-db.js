import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read data from a JSON file
 * @param {string} filename 
 * @returns {any}
 */
const readData = (filename) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        // Initialize with default if it doesn't exist
        if (filename === 'accounts.json') return [];
        if (filename === 'schedules.json') return [];
        if (filename === 'settings.json') return {};
        return null;
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Error reading ${filename}:`, err);
        return null;
    }
};

/**
 * Write data to a JSON file atomically
 * @param {string} filename 
 * @param {any} data 
 */
const writeData = (filename, data) => {
    const filePath = path.join(DATA_DIR, filename);
    const tempPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 4), 'utf8');
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (err) {
        console.error(`Error writing ${filename}:`, err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return false;
    }
};

export {
    readData,
    writeData
};
