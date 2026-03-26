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
        timeSlots: ["10:00"] // Default daily slot
    };

    // Init dates
    const sDate = document.getElementById('m-start-date');
    if (sDate) sDate.value = new Date().toISOString().split('T')[0];

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
        if (tabId === 'automation') {
            loadGlobalSchedules();
            startLogPolling();
        } else {
            stopLogPolling();
        }
        if (tabId === 'settings') loadSettings();
    };

    let logInterval = null;
    const startLogPolling = () => {
        stopLogPolling();
        logInterval = setInterval(() => {
            if (state.activeTab === 'automation') window.loadLogs();
        }, 3000); // 3 seconds
    };
    const stopLogPolling = () => {
        if (logInterval) clearInterval(logInterval);
        logInterval = null;
    };
    
    // Safely create icons
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
        state.selectedMediaFiles = [];
        state.selectedThumbnailFiles = [];
        updateScheduleCalculations();
        safeCreateIcons();
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
        safeCreateIcons();
    };

    // 3. Media Actions
    window.toggleSelectMedia = (name) => {
        const isImage = state.currentMediaType === 'images';
        const selectionList = isImage ? state.selectedThumbnailFiles : state.selectedMediaFiles;
        
        const idx = selectionList.indexOf(name);
        if (idx > -1) selectionList.splice(idx, 1);
        else selectionList.push(name);
        
        if (!isImage) updateScheduleCalculations();
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
            safeCreateIcons();
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
        window.loadLogs(); 
    };

    window.loadLogs = async () => {
        try {
            const res = await fetch('/api/logs');
            const data = await res.json();
            const container = document.getElementById('log-container');
            if (!container || !data.logs) return;

            container.innerHTML = data.logs.map(log => {
                let color = '#d1d5db';
                if (log.includes('[ERROR]')) color = '#ff5555';
                if (log.includes('[WARN]')) color = '#ffb86c';
                if (log.includes('[Success]')) color = '#50fa7b';
                
                return `<div style="margin-bottom: 4px; color: ${color}; border-bottom: 1px solid #1f242d; padding-bottom: 2px;">${log}</div>`;
            }).join('');
        } catch (err) { console.error('Log Load Error:', err); }
    };

    window.cancelJob = async (id) => {
        if (!confirm('Are you sure you want to cancel and delete this job?')) return;
        try {
            const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
            if (res.ok) loadGlobalSchedules();
        } catch (err) { console.error(err); }
    };
    // 5. Advanced Scheduling Modal
    window.openScheduleModal = () => {
        const modal = document.getElementById('schedule-modal');
        if (modal) {
            modal.classList.remove('hidden');
            renderModalSlots();
        }
    };

    window.closeScheduleModal = () => {
        const modal = document.getElementById('schedule-modal');
        if (modal) modal.classList.add('hidden');
    };

    const renderModalSlots = () => {
        const list = document.getElementById('modal-slot-list');
        if (!list) return;
        list.innerHTML = state.timeSlots.map((time, idx) => `
            <span class="slot-pill">
                ${time}
                <i data-lucide="x-circle" onclick="removeTimeSlot(${idx})"></i>
            </span>
        `).join('');
        safeCreateIcons();
    };

    window.addTimeSlot = () => {
        const timeInput = document.getElementById('new-slot-time');
        const time = timeInput.value;
        if (time && !state.timeSlots.includes(time)) {
            state.timeSlots.push(time);
            state.timeSlots.sort();
            renderModalSlots();
        }
    };

    window.removeTimeSlot = (idx) => {
        state.timeSlots.splice(idx, 1);
        renderModalSlots();
    };

    window.confirmSlots = () => {
        const preview = document.getElementById('m-slot-preview');
        if (preview) {
            preview.innerHTML = state.timeSlots.map(time => `<span class="slot-pill">${time}</span>`).join('');
        }
        updateScheduleCalculations();
        closeScheduleModal();
    };

    window.updateScheduleCalculations = () => {
        const vPerDay = parseInt(document.getElementById('m-frequency')?.value) || 1;
        const totalVideos = state.selectedMediaFiles.length;
        const startDateVal = document.getElementById('m-start-date')?.value;
        const summaryText = document.getElementById('summary-text');

        if (totalVideos === 0) {
            if (summaryText) summaryText.innerText = 'Select videos to calculate schedule.';
            return;
        }

        const totalDays = Math.ceil(totalVideos / vPerDay);
        const endDate = new Date(startDateVal || new Date());
        endDate.setDate(endDate.getDate() + (totalDays - 1));

        const dateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        if (summaryText) {
            summaryText.innerHTML = `Running for <b>${totalDays} days</b>. Ending on <b>${dateStr}</b>.`;
            if (vPerDay > state.timeSlots.length) {
                summaryText.innerHTML += `<br><span style="color: #f85149; font-size: 10px;">⚠️ Note: Only ${state.timeSlots.length} slots defined. Extra posts will use the last slot.</span>`;
            }
        }
    };

    document.getElementById('btn-schedule-batch').onclick = async () => {
        if (!state.activeChannelId) return alert('Select a channel first.');
        if (state.selectedMediaFiles.length === 0) return alert('Select at least one video from the gallery.');
        if (state.timeSlots.length === 0) return alert('Configure at least one daily time slot.');

        const startDateInput = document.getElementById('m-start-date').value;
        const niche = document.getElementById('m-niche').value;
        const refTitle = document.getElementById('m-ref-title').value;
        const country = document.getElementById('m-country').value;
        const category = document.getElementById('m-category').value;
        const audioCount = parseInt(document.getElementById('m-audio-count').value) || 1;
        const useThumb = document.getElementById('m-use-thumb').checked;
        const freqEl = document.getElementById('m-frequency');
        const vPerDay = freqEl ? parseInt(freqEl.value) : 1;

        if (!startDateInput) return alert('Please select a Start Date.');
        const startDate = new Date(startDateInput);

        // Validation: AI Keys
        const provider = state.settings.preferredProvider || 'gemini';
        const hasKey = provider === 'gemini' ? state.settings.geminiApiKey : state.settings.groqApiKey;
        if (!hasKey) {
            alert(`Missing ${provider.toUpperCase()} API Key. Please configure it in Settings.`);
            return switchTab('settings');
        }

        const videos = state.selectedMediaFiles;
        let allJobs = [];

        for (let i = 0; i < videos.length; i++) {
            const dayOffset = Math.floor(i / vPerDay);
            const slotIdx = i % vPerDay;
            
            // Use time slot or fallback to last one
            const timeStr = state.timeSlots[slotIdx] || state.timeSlots[state.timeSlots.length - 1];
            const [hours, minutes] = timeStr.split(':').map(Number);

            const jobTime = new Date(startDate);
            jobTime.setDate(startDate.getDate() + dayOffset);
            jobTime.setHours(hours, minutes, 0, 0);

            // Skip if past
            if (jobTime < new Date()) {
                console.warn(`Skipping past slot: ${jobTime.toISOString()}`);
                continue; 
            }

            allJobs.push({
                videoFile: videos[i],
                scheduleTime: jobTime.toISOString()
            });
        }

        if (allJobs.length === 0) return alert('None of the chosen slots are in the future. Check your start date/times.');

        const payload = {
            accountId: state.activeChannelId,
            videoFiles: allJobs.map(j => j.videoFile),
            scheduleTimes: allJobs.map(j => j.scheduleTime),
            thumbnailFiles: allJobs.map((j, idx) => {
                if (!useThumb || state.selectedThumbnailFiles.length === 0) return null;
                return state.selectedThumbnailFiles[idx % state.selectedThumbnailFiles.length];
            }),
            niche,
            referenceTitle: refTitle,
            targetCountry: country,
            category,
            audioCount // Passing new production setting
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

    const hiddenInput = document.getElementById('media-upload-hidden');
    if (hiddenInput) {
        hiddenInput.onchange = async () => {
            const files = hiddenInput.files;
            if (files.length === 0) return;

            const formData = new FormData();
            let type = 'video';
            if (state.currentMediaType === 'audios') type = 'audio';
            else if (state.currentMediaType === 'images') type = 'image';
            
            for (let f of files) formData.append(type, f);

            try {
                const uploadBtn = document.getElementById('btn-upload-media');
                if (uploadBtn) {
                    uploadBtn.disabled = true;
                    uploadBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Uploading...';
                    safeCreateIcons();
                }

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
                const uploadBtn = document.getElementById('btn-upload-media');
                if (uploadBtn) {
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = '<i data-lucide="upload"></i> Upload Media';
                    safeCreateIcons();
                }
            }
        };
    }

    // 6. Channel & Settings Forms (Simplified JSON-Only Version)
    const btnTriggerJson = document.getElementById('btn-trigger-json');
    const jsonFileInput = document.getElementById('a-json-file-hidden');
    const addChannelError = document.getElementById('add-channel-error');

    if (btnTriggerJson) {
        btnTriggerJson.onclick = () => jsonFileInput.click();
    }

    if (jsonFileInput) {
        jsonFileInput.onchange = (e) => {
            console.log('[DEBUG] JSON File Selected');
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                console.log('[DEBUG] File Read Complete, parsing...');
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
                    safeCreateIcons();

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
                    safeCreateIcons();
                }
            };
            reader.readAsText(file);
        };
    }

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.onsubmit = async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('settings-error');
            if (errorDiv) errorDiv.classList.add('hidden');
            
            const payload = {
                preferredProvider: document.getElementById('s-provider')?.value,
                geminiApiKey: document.getElementById('s-gemini-key')?.value,
                groqApiKey: document.getElementById('s-groq-key')?.value
            };
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) alert('Settings Saved!');
                else if (errorDiv) {
                    const data = await res.json();
                    errorDiv.textContent = data.error || 'Failed to save settings.';
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) { 
                console.error(err);
                if (errorDiv) {
                    errorDiv.textContent = 'Failed to save settings. Server error.';
                    errorDiv.classList.remove('hidden');
                }
            }
        };
    }

    const loadSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            state.settings = await res.json();
            
            const provider = state.settings.preferredProvider || 'gemini';
            const sProvider = document.getElementById('s-provider');
            const sGemini = document.getElementById('s-gemini-key');
            const sGroq = document.getElementById('s-groq-key');
            
            if (sProvider) sProvider.value = provider;
            if (sGemini) sGemini.value = state.settings.geminiApiKey || '';
            if (sGroq) sGroq.value = state.settings.groqApiKey || '';
            
            toggleSettingsView(provider);
        } catch (err) { console.error(err); }
    };

    const toggleSettingsView = (provider) => {
        const geminiGroup = document.getElementById('gemini-input-group');
        const groqGroup = document.getElementById('groq-input-group');
        
        if (provider === 'gemini') {
            if (geminiGroup) geminiGroup.classList.remove('hidden');
            if (groqGroup) groqGroup.classList.add('hidden');
        } else {
            if (geminiGroup) geminiGroup.classList.add('hidden');
            if (groqGroup) groqGroup.classList.remove('hidden');
        }
    };

    const sProviderEl = document.getElementById('s-provider');
    if (sProviderEl) {
        sProviderEl.addEventListener('change', (e) => {
            toggleSettingsView(e.target.value);
        });
    }

    // Initial Load
    switchTab('dashboard');
    startSystemPoller();
    safeCreateIcons();
});
