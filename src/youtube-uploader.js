const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Fetch Channel Metadata and Statistics
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} refreshToken
 */
const getChannelInfo = async (clientId, clientSecret, refreshToken) => {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        const response = await youtube.channels.list({
            part: 'snippet,statistics,brandingSettings',
            mine: true
        });

        if (!response.data.items || response.data.items.length === 0) {
            throw new Error('No channel found for this account.');
        }

        const channel = response.data.items[0];
        return {
            title: channel.snippet.title,
            description: channel.snippet.description,
            customUrl: channel.snippet.customUrl,
            profilePic: channel.snippet.thumbnails.medium.url,
            subscribers: channel.statistics.subscriberCount,
            views: channel.statistics.viewCount,
            videoCount: channel.statistics.videoCount,
            country: channel.brandingSettings.channel.country || 'Global'
        };
    } catch (err) {
        console.error('getChannelInfo Error:', err.message);
        throw err;
    }
};

/**
 * Handle YouTube Video Upload with Thumbnail support
 */
const uploadVideo = async (options) => {
    const {
        clientId,
        clientSecret,
        refreshToken,
        videoPath,
        thumbnailPath,
        title,
        description,
        tags = [],
        category = '22',
        privacyStatus = 'public'
    } = options;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { token } = await oauth2Client.getAccessToken();
    oauth2Client.setCredentials({ access_token: token, refresh_token: refreshToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const videoMetadata = {
        snippet: { title, description, tags, categoryId: category },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
    };

    const media = { body: fs.createReadStream(videoPath) };

    try {
        const response = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: videoMetadata,
            media: media,
        });

        const videoId = response.data.id;
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            await youtube.thumbnails.set({
                videoId: videoId,
                media: { body: fs.createReadStream(thumbnailPath) },
            });
        }

        return { success: true, videoId: videoId, data: response.data };
    } catch (err) {
        console.error('uploadVideo Error:', err.message);
        throw err;
    }
};

module.exports = {
    getChannelInfo,
    uploadVideo
};
