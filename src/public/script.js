document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] DOM Loaded - Initializing StreamBOSS...');
    
    // State management
    let state = {
        activeTab: 'dashboard',
        activeChannelId: null,
        channels: [],
        media: { videos: [], audios: [], images: [], rendered: [] },
        settings: {},
        currentMediaType: 'videos',
        selectedMediaFiles: [],
        selectedThumbnailFiles: [],
        timeSlots: [{date: new Date().toISOString().split('T')[0], time: "10:00"}]
    };

    const checkAuth = () => {
        const token = localStorage.getItem('accessToken');
        if (!token && window.location.pathname !== '/login.html') {
            window.location.href = '/login.html';
        }
    };

    const apiFetch = async (url, options = {}) => {
        let token = localStorage.getItem('accessToken');
        
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };

        let response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            console.log('[AUTH] Access token expired, attempting refresh...');
            const refreshToken = localStorage.getItem('refreshToken');
            
            if (!refreshToken) {
                window.location.href = '/login.html';
                return;
            }

            const refreshRes = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: refreshToken })
            });

            if (refreshRes.ok) {
                const data = await refreshRes.json();
                localStorage.setItem('accessToken', data.accessToken);
                console.log('[AUTH] Token refreshed successfully');
                
                // Retry original request
                headers['Authorization'] = `Bearer ${data.accessToken}`;
                response = await fetch(url, { ...options, headers });
            } else {
                console.error('[AUTH] Refresh failed, redirecting to login');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login.html';
            }
        }

        return response;
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
        if (tabId === 'dashboard') {
            loadDashboardStats();
            startLogPolling();
        } else if (tabId === 'automation') {
            loadGlobalSchedules();
            startLogPolling();
        } else {
            stopLogPolling();
        }
        
        if (tabId === 'channels') loadChannels();
        if (tabId === 'settings') loadSettings();
        if (tabId === 'add-channel') {
            // No specific load needed
        }
    };

    let logInterval = null;
    const startLogPolling = () => {
        stopLogPolling();
        window.loadLogs();
        logInterval = setInterval(() => {
            if (state.activeTab === 'dashboard' || state.activeTab === 'automation') window.loadLogs();
        }, 4000); 
    };
    const stopLogPolling = () => {
        if (logInterval) clearInterval(logInterval);
        logInterval = null;
    };
    
    const safeCreateIcons = () => {
        if (window.lucide) lucide.createIcons();
    };

    const addChannelTop = document.getElementById('btn-add-channel-top');
    if (addChannelTop) addChannelTop.onclick = () => switchTab('add-channel');

    const backDashboard = document.getElementById('btn-back-dashboard');
    if (backDashboard) backDashboard.onclick = () => switchTab('channels');

    const uploadBtn = document.getElementById('btn-upload-media');
    if (uploadBtn) uploadBtn.onclick = () => {
        const hiddenInput = document.getElementById('media-upload-hidden');
        if (hiddenInput) hiddenInput.click();
    };

    // 1. Dashboard & Channels
    const loadDashboardStats = async () => {
        try {
            const res = await apiFetch('/api/accounts');
            state.channels = await res.json();
            
            const schedulesRes = await apiFetch('/api/schedules');
            const schedules = await schedulesRes.json();
            
            document.getElementById('stat-total-channels').textContent = state.channels.length;
            document.getElementById('stat-total-subs').textContent = formatNum(state.channels.reduce((sum, c) => sum + parseInt(c.subscribers || 0), 0));
            document.getElementById('stat-active-jobs').textContent = schedules.filter(j => j.status === 'pending' || j.status === 'processing').length;
            document.getElementById('stat-success-uploads').textContent = schedules.filter(j => j.status === 'completed').length;
        } catch (err) { console.error('Load Dashboard Stats Error:', err); }
    };

    const loadChannels = async () => {
        try {
            const res = await apiFetch('/api/accounts');
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

    // 2. Channel Manage logic (Keeping existing functionality)
    window.manageChannel = async (id) => {
        state.activeChannelId = id;
        const channel = state.channels.find(c => c.id === id);
        if (!channel) return;
        document.getElementById('m-channel-title').textContent = channel.title;
        document.getElementById('m-channel-desc').textContent = channel.description ? (channel.description.substring(0, 60) + '...') : 'No description provided.';
        document.getElementById('m-channel-link').href = `https://youtube.com/${channel.customUrl || 'channel/' + channel.id}`;
        switchTab('channel-manage');
        loadChannelMedia(id);
        state.selectedMediaFiles = [];
        state.selectedThumbnailFiles = [];
        updateScheduleCalculations();
        safeCreateIcons();
    };

    const loadChannelMedia = async (channelId) => {
        try {
            const res = await apiFetch(`/api/media?channelId=${channelId}`);
            state.media = await res.json();
            renderGallery();
        } catch (err) { console.error('Media load error:', err); }
    };

    const renderGallery = () => {
        const grid = document.getElementById('media-grid');
        const mediaItems = state.media[state.currentMediaType] || [];
        if (mediaItems.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">Folder is empty.</div>`;
            return;
        }
        grid.innerHTML = mediaItems.map(item => {
            const isSelected = state.currentMediaType === 'images' ? state.selectedThumbnailFiles.includes(item.name) : state.selectedMediaFiles.includes(item.name);
            return `
                <div class="media-item ${isSelected ? 'selected' : ''}" onclick="toggleSelectMedia('${item.name}')">
                    <div class="thumb-placeholder">
                        ${state.currentMediaType === 'images' ? `<img src="${item.path}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i data-lucide="${state.currentMediaType === 'videos' ? 'video' : 'music'}"></i>`}
                    </div>
                    <div class="title">${item.name}</div>
                    <div class="meta">${item.size}</div>
                </div>
            `;
        }).join('');
        safeCreateIcons();
    };

    window.toggleSelectMedia = (name) => {
        const list = state.currentMediaType === 'images' ? state.selectedThumbnailFiles : state.selectedMediaFiles;
        const idx = list.indexOf(name);
        if (idx > -1) list.splice(idx, 1); else list.push(name);
        renderGallery();
        updateScheduleCalculations();
    };

    window.updateScheduleCalculations = () => { /* Logic to show selection summary */ };

    // 4. System Monitoring
    const startSystemPoller = () => {
        const updateStats = async () => {
            try {
                const res = await apiFetch('/api/system-stats');
                const data = await res.json();
                document.getElementById('cpu-load').textContent = data.cpu;
                document.getElementById('cpu-fill').style.width = data.cpu + '%';
                document.getElementById('ram-load').textContent = data.ram;
                document.getElementById('ram-fill').style.width = data.ram + '%';
                document.getElementById('disk-label').textContent = `Storage (${data.diskLabel})`;
                document.getElementById('disk-fill').style.width = data.diskPercent + '%';
            } catch (err) { console.error(err); }
        };
        updateStats();
        setInterval(updateStats, 8000);
    };

    // 4. Automation Monitor
    const loadGlobalSchedules = async () => {
        try {
            const res = await apiFetch('/api/schedules');
            const schedules = await res.json();
            const table = document.getElementById('global-queue-table');
            if (!table) return;
            table.innerHTML = schedules.reverse().map(job => `
                <tr style="border-bottom: 1px solid #1f242d;">
                    <td style="padding: 12px;">${job.videoFile}</td>
                    <td style="padding: 12px;">${job.niche || '-'}</td>
                    <td style="padding: 12px;"><span class="status-badge ${job.status}">${job.status}</span></td>
                    <td style="padding: 12px;">-</td>
                    <td style="padding: 12px;"><button class="btn danger small" onclick="cancelJob('${job.id}')">Cancel</button></td>
                </tr>
            `).join('');
        } catch (err) { console.error(err); }
    };

    window.loadLogs = async () => {
        try {
            const res = await apiFetch('/api/logs');
            const data = await res.json();
            const container = document.getElementById('log-container');
            if (!container || !data.logs) return;
            container.innerHTML = data.logs.map(log => {
                let color = '#d1d5db';
                if (log.includes('[ERROR]')) color = '#ff5555';
                if (log.includes('[Success]')) color = '#50fa7b';
                return `<div style="margin-bottom: 4px; color: ${color}; font-size: 11px;">${log}</div>`;
            }).join('');
        } catch (err) { console.error(err); }
    };

    window.cancelJob = async (id) => {
        if (!confirm('Cancel this job?')) return;
        try {
            const res = await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' });
            if (res.ok) loadGlobalSchedules();
        } catch (err) { console.error(err); }
    };

    // 5. Batch Scheduling
    document.getElementById('btn-schedule-batch').onclick = async () => {
        if (!state.activeChannelId || state.selectedMediaFiles.length === 0) return alert('Selection missing');
        const payload = {
            accountId: state.activeChannelId,
            videoFiles: state.selectedMediaFiles,
            scheduleTimes: state.timeSlots.slice(0, state.selectedMediaFiles.length).map(s => new Date(s.date + 'T' + s.time).toISOString()),
            niche: document.getElementById('m-niche').value,
            targetCountry: document.getElementById('m-country').value,
            category: document.getElementById('m-category').value,
            loopCount: parseInt(document.getElementById('m-audio-loops')?.value) || 1,
            deleteRaw: document.getElementById('m-delete-raw')?.checked
        };
        try {
            const res = await apiFetch('/api/schedules/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert('Scheduled successfully!');
                switchTab('automation');
            }
        } catch (err) { console.error(err); }
    };

    // AI Settings
    const loadSettings = async () => {
        try {
            const res = await apiFetch('/api/settings');
            state.settings = await res.json();
            document.getElementById('s-provider').value = state.settings.preferredProvider || 'gemini';
            document.getElementById('s-gemini-key').value = state.settings.geminiApiKey || '';
            document.getElementById('s-groq-key').value = state.settings.groqApiKey || '';
        } catch (err) { console.error(err); }
    };

    document.getElementById('settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
            preferredProvider: document.getElementById('s-provider').value,
            geminiApiKey: document.getElementById('s-gemini-key').value,
            groqApiKey: document.getElementById('s-groq-key').value
        };
        await apiFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        alert('Settings saved');
    };

    // Modal & Other UI helpers (Simplified for brevity but functional)
    window.openScheduleModal = () => document.getElementById('schedule-modal').classList.remove('hidden');
    window.closeScheduleModal = () => document.getElementById('schedule-modal').classList.add('hidden');
    
    // Initial Load
    checkAuth();
    switchTab('dashboard');
    startSystemPoller();
    loadSettings();
    safeCreateIcons();

    const refreshLogsBtn = document.getElementById('btn-refresh-logs');
    if (refreshLogsBtn) refreshLogsBtn.onclick = () => window.loadLogs();
});
