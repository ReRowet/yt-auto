document.addEventListener('DOMContentLoaded', () => {
    // State management
    let state = {
        activeTab: 'dashboard',
        activeChannelId: null,
        channels: [],
        media: { videos: [], audios: [], images: [], rendered: [] },
        settings: {},
        currentMediaType: 'videos',
        selectedMediaFiles: [],
        selectedThumbnailFiles: []
    };

    // Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    const switchTab = (tabId) => {
        state.activeTab = tabId;
        navItems.forEach(i => i.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
        if (targetNav) targetNav.classList.add('active');
        
        const targetContent = document.getElementById(tabId);
        if (targetContent) targetContent.classList.add('active');
        
        loadTabContent(tabId);
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.getAttribute('data-tab'));
        });
    });

    const loadTabContent = (tabId) => {
        if (tabId === 'dashboard') loadDashboardStats();
        if (tabId === 'channels') loadChannels();
        if (tabId === 'automation') loadGlobalSchedules();
        if (tabId === 'settings') loadSettings();
    };
    
    document.getElementById('btn-add-channel-top').onclick = () => switchTab('add-channel');

    // 1. Dashboard & Channels
    const loadDashboardStats = async () => {
        try {
            const res = await fetch('/api/accounts');
            state.channels = await res.json();
            
            const schedulesRes = await fetch('/api/schedules');
            const schedules = await schedulesRes.json();
            
            document.getElementById('stat-total-channels').textContent = state.channels.length;
            document.getElementById('stat-total-subs').textContent = formatNum(state.channels.reduce((sum, c) => sum + parseInt(c.subscribers || 0), 0));
            document.getElementById('stat-active-jobs').textContent = schedules.filter(j => j.status === 'pending' || j.status === 'processing').length;
            document.getElementById('stat-success-uploads').textContent = schedules.filter(j => j.status === 'completed').length;
        } catch (err) { console.error('Load Dashboard Stats Error:', err); }
    };

    const loadChannels = async () => {
        try {
            const res = await fetch('/api/accounts');
            state.channels = await res.json();
            renderChannelGrid();
        } catch (err) { console.error('Load Channels Error:', err); }
    };

    const renderChannelGrid = () => {
        const grid = document.getElementById('channels-grid');
        if (!grid) return;
        
        grid.innerHTML = state.channels.map(channel => `
            <div class="channel-card" onclick="manageChannel('${channel.id}')">
                <div class="card-profile">
                    <img src="${channel.profilePic}" alt="Profile">
                    <div class="info">
                        <h3>${channel.title}</h3>
                        <p>${channel.customUrl || channel.country || 'No custom URL'}</p>
                    </div>
                </div>
                <div class="card-stats">
                    <div class="stat-item"><span>Subscribers</span><b>${formatNum(channel.subscribers)}</b></div>
                    <div class="stat-item"><span>Views</span><b>${formatNum(channel.views)}</b></div>
                    <div class="stat-item"><span>Videos</span><b>${formatNum(channel.videoCount)}</b></div>
                </div>
            </div>
        `).join('');
    };

    const formatNum = (num) => new Intl.NumberFormat().format(num || 0);

    // 2. Channel Drill-down (Manage)
    window.manageChannel = async (id) => {
        state.activeChannelId = id;
        const channel = state.channels.find(c => c.id === id);
        if (!channel) return;

        // UI Setup
        document.getElementById('m-channel-title').textContent = channel.title;
        document.getElementById('m-channel-desc').textContent = channel.description ? (channel.description.substring(0, 60) + '...') : 'No description provided.';
        document.getElementById('m-channel-link').href = `https://youtube.com/${channel.customUrl || 'channel/' + channel.id}`;
        
        switchTab('channel-manage');
        loadChannelMedia(id);
        lucide.createIcons();
    };

    const loadChannelMedia = async (channelId) => {
        try {
            const res = await fetch(`/api/media?channelId=${channelId}`);
            state.media = await res.json();
            renderGallery();
        } catch (err) { console.error('Media load error:', err); }
    };

    const renderGallery = () => {
        const grid = document.getElementById('media-grid');
        const mediaItems = state.media[state.currentMediaType] || [];
        const typeLabel = state.currentMediaType === 'videos' ? 'Video Gallery' : 'Audio Gallery';
        document.getElementById('gallery-title').textContent = typeLabel;

        if (mediaItems.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">Folder is empty. Upload ${state.currentMediaType} to start.</div>`;
            return;
        }

        grid.innerHTML = mediaItems.map(item => {
            const isSelected = state.currentMediaType === 'images' 
                ? state.selectedThumbnailFiles.includes(item.name)
                : state.selectedMediaFiles.includes(item.name);
                
            return `
                <div class="media-item ${isSelected ? 'selected' : ''}" onclick="toggleSelectMedia('${item.name}')">
                    <div class="thumb-placeholder">
                        ${state.currentMediaType === 'images' 
                            ? `<img src="${item.path}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`
                            : `<i data-lucide="${state.currentMediaType === 'videos' ? 'video' : 'music'}"></i>`
                        }
                    </div>
                    <div class="title" title="${item.name}">${item.name}</div>
                    <div class="meta">${item.size} • ${new Date(item.mtime).toLocaleDateString()}</div>
                    <button class="btn-preview-toggle" style="margin-top: 8px;" onclick="event.stopPropagation(); previewFile('${item.path}')">Preview</button>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    };

    // 3. Media Actions
    window.toggleSelectMedia = (name) => {
        const isImage = state.currentMediaType === 'images';
        const selectionList = isImage ? state.selectedThumbnailFiles : state.selectedMediaFiles;
        
        const idx = selectionList.indexOf(name);
        if (idx > -1) selectionList.splice(idx, 1);
        else selectionList.push(name);
        renderGallery();
    };

    window.previewFile = (path) => {
        const container = document.getElementById('preview-container');
        const isVideo = state.currentMediaType === 'videos';
        const isImage = state.currentMediaType === 'images';
        
        if (isVideo) {
            container.innerHTML = `<video src="${path}" controls autoplay loop></video>`;
        } else if (isImage) {
            container.innerHTML = `<img src="${path}" style="width: 100%; height: 100%; object-fit: contain;">`;
        } else {
            container.innerHTML = `<div style="color: var(--accent); padding: 20px; text-align: center;">
                <i data-lucide="music-2" style="width: 48px; height: 48px; margin-bottom: 12px;"></i>
                <p>Audio Preview</p>
                <audio src="${path}" controls autoplay style="width: 100%; margin-top: 12px;"></audio>
            </div>`;
            lucide.createIcons();
        }
    };

    // 4. System Monitoring Poller
    const startSystemPoller = () => {
        const updateStats = async () => {
            try {
                const res = await fetch('/api/system-stats');
                const data = await res.json();
                
                document.getElementById('cpu-load').textContent = data.cpu;
                document.getElementById('cpu-fill').style.width = data.cpu + '%';
                
                document.getElementById('ram-load').textContent = data.ram;
                document.getElementById('ram-fill').style.width = data.ram + '%';
                
                document.getElementById('disk-label').textContent = `Storage (${data.diskLabel})`;
                document.getElementById('disk-fill').style.width = data.diskPercent + '%';
            } catch (err) { console.error('Stats Poller Error:', err); }
        };
        updateStats();
        setInterval(updateStats, 5000);
    };

    // Tab buttons in Manage view
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const target = btn.dataset.target;
            if (target === 'media-videos') state.currentMediaType = 'videos';
            else if (target === 'media-audios') state.currentMediaType = 'audios';
            else if (target === 'media-images') state.currentMediaType = 'images';
            
            renderGallery();
        });
    });

    // 4. Automation Monitor (V3.0 with Countdown & Cancel)
    const loadGlobalSchedules = async () => {
        try {
            const res = await fetch('/api/schedules');
            const schedules = await res.json();
            const table = document.getElementById('global-queue-table');
            if (!table) return;

            table.innerHTML = schedules.reverse().map(job => {
                const now = new Date();
                const jobDate = new Date(job.scheduleTime);
                const diff = jobDate - now;

                let countdownHtml = '-';
                if (job.status === 'pending') {
                    if (diff > 0) {
                        const mins = Math.floor((diff / 1000) / 60);
                        const hours = Math.floor(mins / 60);
                        const days = Math.floor(hours / 24);
                        
                        if (days > 0) countdownHtml = `${days}d ${hours % 24}h left`;
                        else if (hours > 0) countdownHtml = `${hours}h ${mins % 60}m left`;
                        else countdownHtml = `${mins}m left`;
                    } else {
                        countdownHtml = 'Due soon...';
                    }
                }

                return `
                <tr style="border-bottom: 1px solid #1f242d;">
                    <td style="padding: 12px; font-size: 13px;">${job.videoFile}</td>
                    <td style="padding: 12px; font-size: 13px;">${job.niche || '-'}</td>
                    <td style="padding: 12px;"><span class="status-badge ${job.status}">${job.status}</span></td>
                    <td style="padding: 12px; font-size: 13px;">${countdownHtml}</td>
                    <td style="padding: 12px;">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${job.videoId ? `<a href="https://youtu.be/${job.videoId}" target="_blank" class="link small">View</a>` : ''}
                            ${job.status === 'pending' ? `<button class="btn danger" onclick="cancelJob('${job.id}')">Cancel</button>` : ''}
                        </div>
                    </td>
                </tr>
                `;
            }).join('');
        } catch (err) { console.error('Global Queue Load Error:', err); }
    };

    window.cancelJob = async (id) => {
        if (!confirm('Are you sure you want to cancel and delete this job?')) return;
        try {
            const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
            if (res.ok) loadGlobalSchedules();
        } catch (err) { console.error(err); }
    };
    document.getElementById('btn-schedule-batch').onclick = async () => {
        if (!state.activeChannelId) return alert('Select a channel first.');
        if (state.selectedMediaFiles.length === 0) return alert('Select at least one video from the gallery.');

        const startDateInput = document.getElementById('m-start-date').value;
        const endDateInput = document.getElementById('m-end-date').value;
        const uploadTime = document.getElementById('m-time').value; // e.g., "10:00"

        if (!startDateInput || !endDateInput) return alert('Please select Start and End date.');

        const startDate = new Date(startDateInput);
        const endDate = new Date(endDateInput);
        const [hours, minutes] = uploadTime.split(':').map(Number);

        // Calculate total days (inclusive)
        const diffTime = Math.abs(endDate - startDate);
        const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        if (totalDays <= 0) return alert('End date must be after Start date.');

        // Validation V3.0: Check AI Keys
        const provider = state.settings.preferredProvider || 'gemini';
        const hasKey = provider === 'gemini' ? state.settings.geminiApiKey : state.settings.groqApiKey;
        if (!hasKey) {
            alert(`Missing ${provider.toUpperCase()} API Key. Please configure it in Settings.`);
            return switchTab('settings');
        }

        const videos = state.selectedMediaFiles;
        const vPerDay = Math.ceil(videos.length / totalDays);
        
        let allJobs = [];
        let currentVideoIdx = 0;

        for (let d = 0; d < totalDays; d++) {
            if (currentVideoIdx >= videos.length) break;

            const currentDayDate = new Date(startDate);
            currentDayDate.setDate(startDate.getDate() + d);
            currentDayDate.setHours(hours, minutes, 0, 0);

            // Validation V3.0: No Past Schedules
            if (currentDayDate < new Date()) {
                console.warn(`Skipping past date: ${currentDayDate.toDateString()}`);
                continue; 
            }

            // Distribution: spread videos for this specific day
            for (let i = 0; i < vPerDay; i++) {
                if (currentVideoIdx >= videos.length) break;

                // Add 5 min buffer between videos on the same day
                const jobTime = new Date(currentDayDate.getTime() + (i * 5 * 60000));
                
                allJobs.push({
                    videoFile: videos[currentVideoIdx],
                    scheduleTime: jobTime.toISOString()
                });
                currentVideoIdx++;
            }
        }

        const payload = {
            accountId: state.activeChannelId,
            videoFiles: allJobs.map(j => j.videoFile),
            scheduleTimes: allJobs.map(j => j.scheduleTime),
            thumbnailFiles: allJobs.map((j, idx) => {
                // Logic: Cycle thumbnails if fewer than videos
                if (state.selectedThumbnailFiles.length === 0) return null;
                return state.selectedThumbnailFiles[idx % state.selectedThumbnailFiles.length];
            }),
            niche: document.getElementById('m-niche').value,
            referenceTitle: document.getElementById('m-ref-title').value,
            targetCountry: document.getElementById('m-country').value,
            category: document.getElementById('m-category').value
        };

        try {
            const res = await fetch('/api/schedules/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert(`Successfully scheduled ${allJobs.length} videos over ${totalDays} days!`);
                state.selectedMediaFiles = [];
                renderGallery();
            }
        } catch (err) { console.error('Schedule failed:', err); }
    };

    // 5. Upload Handling
    const uploadBtn = document.getElementById('btn-upload-media');
    const hiddenInput = document.getElementById('media-upload-hidden');

    uploadBtn.onclick = () => hiddenInput.click();
    hiddenInput.onchange = async () => {
        const files = hiddenInput.files;
        if (files.length === 0) return;

        const formData = new FormData();
        let type = 'video';
        if (state.currentMediaType === 'audios') type = 'audio';
        else if (state.currentMediaType === 'images') type = 'image';
        
        for (let f of files) formData.append(type, f);

        try {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Uploading...';
            lucide.createIcons();

            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'x-channel-id': state.activeChannelId },
                body: formData
            });

            if (res.ok) {
                loadChannelMedia(state.activeChannelId);
            }
        } catch (err) { console.error(err); }
        finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i data-lucide="upload"></i> Upload Media';
            lucide.createIcons();
        }
    };

    // 6. Channel & Settings Forms (Simplified JSON-Only Version)
    const btnTriggerJson = document.getElementById('btn-trigger-json');
    const jsonFileInput = document.getElementById('a-json-file-hidden');
    const addChannelError = document.getElementById('add-channel-error');

    if (btnTriggerJson) {
        btnTriggerJson.onclick = () => jsonFileInput.click();
    }

    if (jsonFileInput) {
        jsonFileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    addChannelError.classList.add('hidden');
                    addChannelError.textContent = '';
                    
                    const config = JSON.parse(event.target.result);
                    const base = config.web || config.installed || config;
                    
                    const clientId = base.client_id || base.clientId || '';
                    const clientSecret = base.client_secret || base.clientSecret || '';
                    const refreshToken = base.refresh_token || base.refreshToken || config.refresh_token || config.refreshToken || '';

                    if (!clientId || !clientSecret || !refreshToken) {
                        throw new Error('JSON tidak lengkap. Pastikan ada client_id, client_secret, dan refresh_token.');
                    }

                    // Visual Feedback
                    btnTriggerJson.disabled = true;
                    btnTriggerJson.innerHTML = '<i data-lucide="loader" class="spin"></i> Menghubungkan...';
                    lucide.createIcons();

                    const res = await fetch('/api/accounts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clientId, clientSecret, refreshToken })
                    });
                    
                    const data = await res.json();
                    
                    if (res.ok) { 
                        alert('Channel "' + data.account.title + '" berhasil terhubung!');
                        switchTab('dashboard'); 
                        jsonFileInput.value = ''; // Reset file input
                    } else {
                        addChannelError.textContent = data.error || 'Gagal menghubungkan channel.';
                        addChannelError.classList.remove('hidden');
                    }
                } catch (err) {
                    console.error(err);
                    addChannelError.textContent = 'Error: ' + err.message;
                    addChannelError.classList.remove('hidden');
                } finally {
                    btnTriggerJson.disabled = false;
                    btnTriggerJson.innerHTML = '<i data-lucide="file-json"></i> Pilih File JSON & Hubungkan';
                    lucide.createIcons();
                }
            };
            reader.readAsText(file);
        };
    }

    document.getElementById('settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('settings-error');
        errorDiv.classList.add('hidden');
        
        const payload = {
            preferredProvider: document.getElementById('s-provider').value,
            geminiApiKey: document.getElementById('s-gemini-key').value,
            groqApiKey: document.getElementById('s-groq-key').value
        };
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) alert('Settings Saved!');
            else {
                const data = await res.json();
                errorDiv.textContent = data.error || 'Failed to save settings.';
                errorDiv.classList.remove('hidden');
            }
        } catch (err) { 
            console.error(err);
            errorDiv.textContent = 'Failed to save settings. Server error.';
            errorDiv.classList.remove('hidden');
        }
    };

    const loadSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            state.settings = await res.json();
            
            const provider = state.settings.preferredProvider || 'gemini';
            document.getElementById('s-provider').value = provider;
            document.getElementById('s-gemini-key').value = state.settings.geminiApiKey || '';
            document.getElementById('s-groq-key').value = state.settings.groqApiKey || '';
            
            toggleSettingsView(provider);
        } catch (err) { console.error(err); }
    };

    const toggleSettingsView = (provider) => {
        if (provider === 'gemini') {
            document.getElementById('gemini-input-group').classList.remove('hidden');
            document.getElementById('groq-input-group').classList.add('hidden');
        } else {
            document.getElementById('gemini-input-group').classList.add('hidden');
            document.getElementById('groq-input-group').classList.remove('hidden');
        }
    };

    document.getElementById('s-provider').addEventListener('change', (e) => {
        toggleSettingsView(e.target.value);
    });

    // Initial Load
    switchTab('dashboard');
    startSystemPoller();
    lucide.createIcons();
});
