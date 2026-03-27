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
        timeSlots: [],
        searchQuery: ''
    };

    const checkAuth = () => {
        const token = localStorage.getItem('accessToken');
        const isLoginPage = window.location.href.includes('login.html');
        
        if (!token && !isLoginPage) {
            console.log('[AUTH] No token found, redirecting to login...');
            window.location.href = 'login.html';
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

    // UI Trigger Setup
    const addChannelTop = document.getElementById('btn-add-channel-top');
    if (addChannelTop) addChannelTop.onclick = () => switchTab('add-channel');

    const backDashboard = document.getElementById('btn-back-dashboard');
    if (backDashboard) backDashboard.onclick = () => switchTab('channels');

    const uploadBtn = document.getElementById('btn-upload-media');
    if (uploadBtn) uploadBtn.onclick = () => {
        const hiddenInput = document.getElementById('media-upload-hidden');
        if (hiddenInput) hiddenInput.click();
    };

    const syncBtn = document.getElementById('btn-sync-channel');
    if (syncBtn) {
        syncBtn.onclick = async () => {
            if (!state.activeChannelId) return;
            const originalText = syncBtn.innerHTML;
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Syncing...';
            safeCreateIcons();

            try {
                const res = await apiFetch(`/api/accounts/${state.activeChannelId}/sync`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    // Update state.channels
                    const idx = state.channels.findIndex(c => c.id === state.activeChannelId);
                    if (idx > -1) state.channels[idx] = data.account;
                    
                    // Refresh UI
                    manageChannel(state.activeChannelId);
                    alert('Statistics updated successfully!');
                } else {
                    alert('Sync failed. Please try again later.');
                }
            } catch (err) { console.error(err); }
            
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
            safeCreateIcons();
        };
    }

    // --- JSON Import Logic (Secure & Multi-Account) ---
    const triggerJsonBtn = document.getElementById('btn-trigger-json');
    if (triggerJsonBtn) {
        triggerJsonBtn.onclick = () => {
            const hiddenInput = document.getElementById('a-json-file-hidden');
            if (hiddenInput) hiddenInput.click();
        };
    }

    const jsonFileInput = document.getElementById('a-json-file-hidden');
    if (jsonFileInput) {
        jsonFileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const errorEl = document.getElementById('add-channel-error');
                if (errorEl) {
                    errorEl.classList.add('hidden');
                    errorEl.textContent = '';
                }

                try {
                    const data = JSON.parse(event.target.result);
                    let accountsToAdd = Array.isArray(data) ? data : [data];
                    
                    let successCount = 0;
                    let lastError = null;

                    for (const rawAcc of accountsToAdd) {
                        const clientId = rawAcc.client_id || rawAcc.clientId;
                        const clientSecret = rawAcc.client_secret || rawAcc.clientSecret;
                        const refreshToken = rawAcc.refresh_token || rawAcc.refreshToken;

                        if (!clientId || !clientSecret || !refreshToken) {
                            lastError = `Missing required fields (client_id, client_secret, refresh_token).`;
                            continue;
                        }

                        const res = await apiFetch('/api/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clientId, clientSecret, refreshToken })
                        });

                        if (res.ok) successCount++;
                        else {
                            const errBody = await res.json();
                            lastError = errBody.error || 'Failed to connect account.';
                        }
                    }

                    if (successCount > 0) {
                        alert(`Successfully connected ${successCount} account(s)!`);
                        switchTab('channels');
                    } else if (lastError) {
                        if (errorEl) {
                            errorEl.textContent = lastError;
                            errorEl.classList.remove('hidden');
                        }
                    }
                } catch (err) {
                    if (errorEl) {
                        errorEl.textContent = 'Failed to parse JSON file.';
                        errorEl.classList.remove('hidden');
                    }
                }
                e.target.value = ''; // Reset
            };
            reader.readAsText(file);
        };
    }

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
        } catch (err) { console.error('Dashboard Stats Load Error:', err); }
    };

    const loadChannels = async () => {
        try {
            const res = await apiFetch('/api/accounts');
            state.channels = await res.json();
            renderChannelGrid();
        } catch (err) { console.error('Channels Load Error:', err); }
    };

    const renderChannelGrid = () => {
        const grid = document.getElementById('channels-grid');
        if (!grid) return;
        
        if (state.channels.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; padding: 60px; text-align: center;">
                <p class="text-muted">No channels connected yet.</p>
                <button class="btn primary" onclick="switchTab('add-channel')" style="margin: 20px auto;">Connect Your First Channel</button>
            </div>`;
            return;
        }

        grid.innerHTML = state.channels.map(channel => `
            <div class="channel-card" onclick="manageChannel('${channel.id}')">
                <div class="card-delete-btn" onclick="deleteAccount(event, '${channel.id}', '${channel.title}')">
                    <i data-lucide="trash-2"></i>
                </div>
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
        safeCreateIcons();
    };

    window.deleteAccount = async (event, id, title) => {
        event.stopPropagation();
        if (!confirm(`Are you sure you want to delete the account "${title}"?`)) return;

        try {
            const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
            if (res.ok) {
                alert('Account deleted successfully.');
                loadChannels();
                loadDashboardStats();
            } else {
                const err = await res.json();
                alert('Error: ' + (err.error || 'Failed to delete account'));
            }
        } catch (err) { console.error('Delete Account Error:', err); }
    };

    const formatNum = (num) => new Intl.NumberFormat().format(num || 0);

    // 2. Channel Management
    window.manageChannel = async (id) => {
        state.activeChannelId = id;
        const channel = state.channels.find(c => c.id === id);
        if (!channel) return;

        document.getElementById('m-channel-title').textContent = channel.title;
        document.getElementById('m-channel-desc').textContent = channel.description ? (channel.description.substring(0, 100) + '...') : 'No description provided.';
        document.getElementById('m-channel-link').href = `https://youtube.com/${channel.customUrl || 'channel/' + channel.id}`;
        
        const lastSync = channel.lastSync ? new Date(channel.lastSync).toLocaleString() : 'Never';
        document.getElementById('m-last-sync').textContent = `Last Sync: ${lastSync}`;
        
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
        if (!grid) return;

        const mediaItems = state.media[state.currentMediaType] || [];
        const filtered = mediaItems.filter(i => i.name.toLowerCase().includes(state.searchQuery.toLowerCase()));

        if (filtered.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">No items found.</div>`;
            return;
        }

        grid.innerHTML = filtered.map(item => {
            const isSelected = state.currentMediaType === 'images'
                ? state.selectedThumbnailFiles.includes(item.name)
                : state.selectedMediaFiles.includes(item.name);

            const typeMap = { videos: 'videos', audios: 'audios', images: 'images', rendered: 'rendered' };
            const folderType = typeMap[state.currentMediaType] || state.currentMediaType;

            let thumbHtml = '';
            if (state.currentMediaType === 'images') {
                thumbHtml = `<img src="${item.path}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
            } else if (state.currentMediaType === 'videos' || state.currentMediaType === 'rendered') {
                thumbHtml = `<i data-lucide="play-circle" style="width:36px; height:36px; color:#2c97de;"></i>`;
            } else {
                thumbHtml = `<i data-lucide="music" style="width:36px; height:36px; color:#8957e5;"></i>`;
            }

            return `
                <div class="media-item ${isSelected ? 'selected' : ''}">
                    <div class="thumb-placeholder" onclick="previewMedia('${item.path}', '${item.name}', '${state.currentMediaType}')">
                        ${thumbHtml}
                        <div class="preview-hover-overlay"><i data-lucide="eye" style="width:20px;height:20px;"></i></div>
                    </div>
                    <div class="media-item-footer">
                        <div class="media-select-check ${isSelected ? 'checked' : ''}" onclick="toggleSelectMedia('${item.name}')">
                            <i data-lucide="check" style="width:12px;height:12px;"></i>
                        </div>
                        <div class="title" title="${item.name}">${item.name}</div>
                        <div class="media-delete-btn" onclick="deleteMedia(event, '${item.name}', '${folderType}')" title="Delete file">
                            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                        </div>
                    </div>
                    <div class="meta">${item.size}</div>
                </div>
            `;
        }).join('');
        safeCreateIcons();
    };


    window.toggleSelectMedia = (name) => {
        if (state.currentMediaType === 'images') {
            const idx = state.selectedThumbnailFiles.indexOf(name);
            if (idx > -1) state.selectedThumbnailFiles.splice(idx, 1);
            else state.selectedThumbnailFiles.push(name);
        } else {
            const idx = state.selectedMediaFiles.indexOf(name);
            if (idx > -1) state.selectedMediaFiles.splice(idx, 1);
            else state.selectedMediaFiles.push(name);
        }
        renderGallery();
        updateScheduleCalculations();
    };

    // --- Preview System ---
    window.previewMedia = (filePath, fileName, mediaType) => {
        const container = document.getElementById('preview-container');
        if (!container) return;

        const label = document.querySelector('.preview-label');

        if (mediaType === 'videos' || mediaType === 'rendered') {
            if (label) label.textContent = 'VIDEO PREVIEW';
            container.innerHTML = `
                <video controls autoplay muted style="width:100%; height:100%; object-fit:contain; border-radius:4px;">
                    <source src="${filePath}" type="video/mp4">
                    <source src="${filePath}" type="video/webm">
                    Browser tidak mendukung preview video.
                </video>`;
        } else if (mediaType === 'audios') {
            if (label) label.textContent = 'AUDIO PREVIEW';
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; gap:12px; padding:16px;">
                    <i data-lucide="music" style="width:48px; height:48px; color:#8957e5;"></i>
                    <span style="font-size:12px; color:var(--text-muted); text-align:center; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${fileName}">${fileName}</span>
                    <audio controls style="width:100%; margin-top:8px;">
                        <source src="${filePath}" type="audio/mpeg">
                        <source src="${filePath}" type="audio/ogg">
                        <source src="${filePath}" type="audio/wav">
                        Browser tidak mendukung preview audio.
                    </audio>
                </div>`;
            safeCreateIcons();
        } else if (mediaType === 'images') {
            if (label) label.textContent = 'THUMBNAIL PREVIEW';
            container.innerHTML = `
                <img src="${filePath}" alt="${fileName}" style="width:100%; height:100%; object-fit:contain; border-radius:4px;">`;
        }
    };

    // --- Delete Media ---
    window.deleteMedia = async (event, filename, folderType) => {
        event.stopPropagation();
        if (!state.activeChannelId) return;
        if (!confirm(`Hapus file "${filename}" secara permanen?`)) return;

        try {
            const params = new URLSearchParams({
                channelId: state.activeChannelId,
                type: folderType,
                filename
            });
            const res = await apiFetch(`/api/media?${params}`, { method: 'DELETE' });
            if (res.ok) {
                // Remove from state immediately
                state.media[state.currentMediaType] = state.media[state.currentMediaType].filter(i => i.name !== filename);
                // Remove from selected if was selected
                state.selectedMediaFiles = state.selectedMediaFiles.filter(n => n !== filename);
                state.selectedThumbnailFiles = state.selectedThumbnailFiles.filter(n => n !== filename);
                renderGallery();
                updateScheduleCalculations();
                // Clear preview if it was previewing this file
                const container = document.getElementById('preview-container');
                if (container) container.innerHTML = '<div class="no-preview">Select an item to preview</div>';
            } else {
                const err = await res.json();
                alert('Gagal menghapus: ' + (err.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Delete Media Error:', err);
            alert('Error: ' + err.message);
        }
    };


    const mediaTabs = document.querySelectorAll('.tab-btn');
    mediaTabs.forEach(btn => {
        btn.onclick = () => {
            mediaTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentMediaType = btn.getAttribute('data-target').replace('media-', '');
            document.getElementById('gallery-title').textContent = btn.textContent + ' Gallery';
            renderGallery();
        };
    });

    const searchInput = document.getElementById('media-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.searchQuery = e.target.value;
            renderGallery();
        };
    }

    // 3. Automation Setup
    window.updateScheduleCalculations = () => {
        const preview = document.getElementById('m-slot-preview');
        if (!preview) return;

        if (state.timeSlots.length === 0) {
            preview.innerHTML = `<span class="text-muted small">No slots configured.</span>`;
        } else {
            preview.innerHTML = state.timeSlots.map((s, idx) => `
                <div class="slot-pill">
                    ${s.time} (${s.date.split('-').slice(1).join('/')})
                    <i data-lucide="x" onclick="removeTimeSlot(${idx})"></i>
                </div>
            `).join('');
            safeCreateIcons();
        }
        
        const btn = document.getElementById('btn-schedule-batch');
        if (btn) btn.disabled = state.selectedMediaFiles.length === 0 || state.timeSlots.length === 0;
    };

    window.openScheduleModal = () => {
        renderModalSlots();
        document.getElementById('schedule-modal').classList.remove('hidden');
    };
    window.closeScheduleModal = () => document.getElementById('schedule-modal').classList.add('hidden');

    const renderModalSlots = () => {
        const list = document.getElementById('modal-slot-list');
        list.innerHTML = state.timeSlots.map((s, idx) => `
            <div class="slot-pill" style="padding: 8px 12px; font-size: 13px;">
                ${s.date} @ ${s.time}
                <i data-lucide="trash-2" onclick="removeTimeSlot(${idx}, true)"></i>
            </div>
        `).join('');
        safeCreateIcons();
    };

    window.addTimeSlot = () => {
        const date = document.getElementById('new-slot-date').value;
        const time = document.getElementById('new-slot-time').value;
        if (!date || !time) return alert('Select date and time');
        
        state.timeSlots.push({ date, time });
        renderModalSlots();
    };

    window.removeTimeSlot = (idx, inModal = false) => {
        state.timeSlots.splice(idx, 1);
        if (inModal) renderModalSlots();
        updateScheduleCalculations();
    };

    window.confirmSlots = () => {
        updateScheduleCalculations();
        closeScheduleModal();
    };

    document.getElementById('btn-schedule-batch').onclick = async () => {
        if (!state.activeChannelId || state.selectedMediaFiles.length === 0 || state.timeSlots.length === 0) {
            return alert('Incomplete configuration.');
        }

        const payload = {
            accountId: state.activeChannelId,
            videoFiles: state.selectedMediaFiles,
            thumbnailFiles: state.selectedThumbnailFiles,
            scheduleTimes: state.timeSlots.slice(0, state.selectedMediaFiles.length).map(s => new Date(`${s.date}T${s.time}`).toISOString()),
            niche: document.getElementById('m-niche').value,
            referenceTitle: document.getElementById('m-ref-title').value,
            targetCountry: document.getElementById('m-country').value,
            category: document.getElementById('m-category').value,
            loopCount: parseInt(document.getElementById('m-audio-loops').value) || 1,
            deleteRaw: document.getElementById('m-delete-raw').checked
        };

        try {
            const res = await apiFetch('/api/schedules/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert('Batch production started successfully!');
                switchTab('automation');
            } else {
                const err = await res.json();
                alert('Error: ' + err.error);
            }
        } catch (err) { console.error(err); }
    };

    // 4. Global Queue & Logs
    const loadGlobalSchedules = async () => {
        try {
            const res = await apiFetch('/api/schedules');
            const schedules = await res.json();
            const table = document.getElementById('global-queue-table');
            if (!table) return;

            if (schedules.length === 0) {
                table.innerHTML = `<tr><td colspan="5" style="padding: 40px; text-align: center; color: var(--text-muted);">Execution queue is empty.</td></tr>`;
                return;
            }

            table.innerHTML = schedules.reverse().map(job => `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 12px; font-size: 13px;">${job.videoFile}</td>
                    <td style="padding: 12px; font-size: 13px;">${job.niche || '-'}</td>
                    <td style="padding: 12px;"><span class="status-badge ${job.status}">${job.status}</span></td>
                    <td style="padding: 12px; font-family: monospace; font-size: 12px;">${formatCountdown(job.scheduleTime)}</td>
                    <td style="padding: 12px;"><button class="btn danger small" onclick="cancelJob('${job.id}')">Cancel</button></td>
                </tr>
            `).join('');
        } catch (err) { console.error(err); }
    };

    const formatCountdown = (isoDate) => {
        const diff = new Date(isoDate) - new Date();
        if (diff <= 0) return 'Immediate';
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return `${h}h ${m}m`;
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
                if (log.includes('[Upload]')) color = '#2c97de';
                return `<div style="margin-bottom: 4px; color: ${color}; line-height: 1.4;">${log}</div>`;
            }).join('');
        } catch (err) { console.error(err); }
    };

    window.cancelJob = async (id) => {
        if (!confirm('Permanently cancel this job and remove from queue?')) return;
        try {
            const res = await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' });
            if (res.ok) loadGlobalSchedules();
        } catch (err) { console.error(err); }
    };

    // 5. System Stats
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
            } catch (err) { console.error('Stats Polling Error:', err); }
        };
        updateStats();
        setInterval(updateStats, 8000);
    };

    // 6. Settings
    const loadSettings = async () => {
        try {
            const res = await apiFetch('/api/settings');
            state.settings = await res.json();
            document.getElementById('s-provider').value = state.settings.preferredProvider || 'gemini';
            document.getElementById('s-gemini-key').value = state.settings.geminiApiKey || '';
            document.getElementById('s-groq-key').value = state.settings.groqApiKey || '';
            
            toggleProviderFields(state.settings.preferredProvider || 'gemini');
        } catch (err) { console.error(err); }
    };

    const toggleProviderFields = (val) => {
        document.getElementById('gemini-input-group').classList.toggle('hidden', val !== 'gemini');
        document.getElementById('groq-input-group').classList.toggle('hidden', val !== 'groq');
    };

    document.getElementById('s-provider').onchange = (e) => toggleProviderFields(e.target.value);

    document.getElementById('settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('settings-error');
        const successEl = document.getElementById('settings-success');
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        const payload = {
            preferredProvider: document.getElementById('s-provider').value,
            geminiApiKey: document.getElementById('s-gemini-key').value,
            groqApiKey: document.getElementById('s-groq-key').value
        };

        try {
            const res = await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                successEl.textContent = 'Configuration saved successfully!';
                successEl.classList.remove('hidden');
            } else {
                errorEl.textContent = 'Failed to save settings.';
                errorEl.classList.remove('hidden');
            }
        } catch (err) { console.error(err); }
    };

    // 7. Media Upload
    const mediaUploadInput = document.getElementById('media-upload-hidden');
    if (mediaUploadInput) {
        mediaUploadInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files.length || !state.activeChannelId) return;

            const formData = new FormData();
            for (let f of files) formData.append(state.currentMediaType.slice(0, -1), f);

            try {
                const res = await apiFetch('/api/upload', {
                    method: 'POST',
                    headers: { 'x-channel-id': state.activeChannelId },
                    body: formData
                });
                if (res.ok) {
                    alert('Upload successful!');
                    loadChannelMedia(state.activeChannelId);
                }
            } catch (err) { console.error('Upload Error:', err); }
            e.target.value = ''; // Reset
        };
    }

    // Initial Bootstrap
    checkAuth();
    switchTab('dashboard');
    startSystemPoller();
    loadSettings();
    safeCreateIcons();

    window.switchTab = switchTab; // Expose for HTML onclicks
});
