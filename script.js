// Configuration
const SHEET_ID = '1-X13zaPr0TepTByy0UnQ8ZxeFirKUbR__JCcii3Jcrw';
const USERS = [
    { name: 'Miss Alus', email: 'missalus6@gmail.com', role: 'user' },
    { name: 'Process Coordinator', email: 'processcoordinator03@gmail.com', role: 'admin' },
    { name: 'Production Team', email: 'production@example.com', role: 'user' },
    { name: 'Quality Team', email: 'quality@example.com', role: 'user' },
    { name: 'Logistics Team', email: 'logistics@example.com', role: 'user' }
];

let allTasks = [];
let currentUser = null;
let activeTab = 'today';
let searchQuery = '';
let filterFrom = '';
let filterTo = '';
let alertShownForTasks = new Set();
let countdownInterval = null;

// Load data from Google Sheets (via Google Apps Script API)
async function loadData() {
    try {
        const response = await fetch(`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=getTasks&sheetId=${SHEET_ID}`);
        const data = await response.json();
        
        if (data.success) {
            allTasks = data.tasks.map(task => ({
                ...task,
                plannedTs: new Date(task.plannedDate).getTime(),
                assignedTo: task.assignedTo || getRandomUser(task)
            }));
            updateTeamStats();
            if (currentUser) {
                renderUserTasks();
            }
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Error loading data: ' + error.message, 'err');
    }
}

function getRandomUser(task) {
    // Simple round-robin assignment based on task hash
    const index = Math.abs(task.materialName.length + task.stepName.length) % USERS.length;
    return USERS[index];
}

function updateTeamStats() {
    const teamStatsDiv = document.getElementById('teamStats');
    const userSelect = document.getElementById('userSelect');
    
    // Update user dropdown
    userSelect.innerHTML = '<option value="">Select User...</option>' + 
        USERS.map(user => `<option value="${user.email}" ${currentUser?.email === user.email ? 'selected' : ''}>${user.name}</option>`).join('');
    
    // Calculate stats for each user
    const userStats = USERS.map(user => {
        const userTasks = allTasks.filter(t => t.assignedTo?.email === user.email && !t.done);
        const urgentTasks = userTasks.filter(t => {
            const remaining = (t.plannedTs - Date.now()) / 1000;
            return remaining <= 600 && remaining > 0;
        });
        const overdueTasks = userTasks.filter(t => t.plannedTs < Date.now());
        
        return { user, total: userTasks.length, urgent: urgentTasks.length, overdue: overdueTasks.length };
    });
    
    teamStatsDiv.innerHTML = userStats.map(stat => `
        <div class="user-card ${currentUser?.email === stat.user.email ? 'selected' : ''}" onclick="selectUser('${stat.user.email}')">
            <div class="user-name">${stat.user.name}</div>
            <div class="user-stats">
                <span>📋 ${stat.total}</span>
                <span class="urgent-count">⚠️ ${stat.urgent}</span>
                <span class="overdue-count">🔴 ${stat.overdue}</span>
            </div>
        </div>
    `).join('');
    
    document.getElementById('sheetLink').href = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
}

function selectUser(email) {
    currentUser = USERS.find(u => u.email === email);
    renderUserTasks();
    updateTeamStats();
}

function switchUser() {
    const email = document.getElementById('userSelect').value;
    if (email) {
        selectUser(email);
    } else {
        currentUser = null;
        document.getElementById('cardsGrid').innerHTML = '<div class="empty-state"><p>Select a user to view tasks...</p></div>';
        updateTeamStats();
    }
}

function renderUserTasks() {
    if (!currentUser) return;
    
    const userTasks = allTasks.filter(t => t.assignedTo?.email === currentUser.email && !t.done);
    const todayTasks = userTasks.filter(t => {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        return t.plannedTs >= todayStart.getTime() && t.plannedTs < tomorrowStart.getTime();
    });
    const overdueTasks = userTasks.filter(t => t.plannedTs < new Date().setHours(0, 0, 0, 0));
    
    document.getElementById('todayCount').textContent = todayTasks.length;
    document.getElementById('backlogCount').textContent = overdueTasks.length;
    
    renderCards();
    startCountdownUpdates();
    
    // Check for 10-minute alerts
    checkAndShowAlerts(userTasks);
}

function checkAndShowAlerts(tasks) {
    const now = Date.now();
    const tenMinutesInMs = 10 * 60 * 1000;
    
    tasks.forEach(task => {
        const remaining = task.plannedTs - now;
        const taskId = `${task.id}_${task.assignedTo?.email}`;
        
        // Alert when 10 minutes or less remaining, and not already alerted
        if (remaining <= tenMinutesInMs && remaining > 0 && !alertShownForTasks.has(taskId)) {
            alertShownForTasks.add(taskId);
            showNotification(task);
            
            // Also show in-app alert
            showToast(`⚠️ ALERT: ${task.materialName} - ${task.stepName} has ${Math.ceil(remaining / 60000)} minutes remaining!`, 'urgent');
            
            // Create browser notification
            if (Notification.permission === 'granted') {
                new Notification('BMP Deadline Alert', {
                    body: `${task.materialName}\nStep: ${task.stepName}\nDue: ${formatDateTime(new Date(task.plannedTs))}`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/190/190411.png'
                });
            }
        }
        
        // Clear alert if task is completed
        if (task.done && alertShownForTasks.has(taskId)) {
            alertShownForTasks.delete(taskId);
        }
    });
}

function showNotification(task) {
    // Play sound if available
    try {
        const audio = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');
        audio.play().catch(e => console.log('Audio play failed'));
    } catch(e) {}
    
    // Flash title
    let originalTitle = document.title;
    let flashCount = 0;
    const flashInterval = setInterval(() => {
        document.title = flashCount % 2 === 0 ? '🔴 ALERT! ' + originalTitle : originalTitle;
        flashCount++;
        if (flashCount > 10) {
            clearInterval(flashInterval);
            document.title = originalTitle;
        }
    }, 500);
}

function renderCards() {
    if (!currentUser) return;
    
    let tasks = allTasks.filter(t => t.assignedTo?.email === currentUser.email && !t.done);
    
    if (activeTab === 'today') {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tasks = tasks.filter(t => t.plannedTs >= todayStart.getTime() && t.plannedTs < tomorrowStart.getTime());
    } else if (activeTab === 'backlog') {
        tasks = tasks.filter(t => t.plannedTs < new Date().setHours(0, 0, 0, 0));
        
        // Apply date filter for backlog
        if (filterFrom || filterTo) {
            tasks = tasks.filter(t => {
                if (filterFrom && t.plannedTs < new Date(filterFrom).setHours(0, 0, 0, 0)) return false;
                if (filterTo && t.plannedTs > new Date(filterTo).setHours(23, 59, 59, 999)) return false;
                return true;
            });
        }
    }
    
    // Apply search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        tasks = tasks.filter(t => 
            t.materialName.toLowerCase().includes(q) || 
            t.grnNumber.toLowerCase().includes(q) || 
            t.stepName.toLowerCase().includes(q)
        );
    }
    
    // Update stats
    const urgent = tasks.filter(t => {
        const remaining = (t.plannedTs - Date.now()) / 1000;
        return remaining <= 600 && remaining > 0;
    }).length;
    
    const overdue = tasks.filter(t => t.plannedTs < Date.now()).length;
    
    document.getElementById('statsRow').innerHTML = `
        <div class="stat-card"><div class="stat-label">Total Tasks</div><div class="stat-value blue">${tasks.length}</div></div>
        <div class="stat-card"><div class="stat-label">Urgent (≤10min)</div><div class="stat-value amber">${urgent}</div></div>
        <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value red">${overdue}</div></div>
    `;
    
    if (tasks.length === 0) {
        document.getElementById('cardsGrid').innerHTML = '<div class="empty-state"><p>No tasks found for ${currentUser.name}</p></div>';
        return;
    }
    
    document.getElementById('cardsGrid').innerHTML = tasks.map((task, index) => {
        const remaining = (task.plannedTs - Date.now()) / 1000;
        const isUrgent = remaining <= 600 && remaining > 0;
        const isOverdue = remaining < 0;
        
        let cardClass = 'card';
        let countdownText = '';
        let countdownClass = 'normal';
        
        if (isOverdue) {
            cardClass += ' overdue';
            countdownClass = 'overdue';
            const overdueMs = Math.abs(remaining);
            const hours = Math.floor(overdueMs / 3600);
            const minutes = Math.floor((overdueMs % 3600) / 60);
            countdownText = `Overdue by ${hours}h ${minutes}m`;
        } else if (isUrgent) {
            cardClass += ' urgent';
            countdownClass = 'urgent';
            const minutes = Math.ceil(remaining / 60);
            countdownText = `⚠️ ${minutes} minutes remaining!`;
        } else {
            const minutes = Math.floor(remaining / 60);
            const hours = Math.floor(minutes / 60);
            if (hours > 0) {
                countdownText = `${hours}h ${minutes % 60}m remaining`;
            } else {
                countdownText = `${minutes} minutes remaining`;
            }
        }
        
        return `
            <div class="${cardClass}" id="card_${index}">
                <div class="card-step">${escapeHtml(task.stepName)}</div>
                <div class="card-header">
                    <div class="card-title">${escapeHtml(task.materialName)}</div>
                </div>
                <div class="card-meta">
                    <span class="meta-chip">📋 ${escapeHtml(task.sheetName)}</span>
                    <span class="meta-chip">Row ${task.rowNum}</span>
                    ${task.grnNumber ? `<span class="meta-chip">GRN: ${escapeHtml(task.grnNumber)}</span>` : ''}
                </div>
                <div class="planned-time">⏱ Due: ${formatDateTime(new Date(task.plannedTs))}</div>
                ${isOverdue ? '<div class="perf-alert">⚠️ Performance alert: Task overdue!</div>' : ''}
                <div class="countdown ${countdownClass}" id="cd_${index}">${countdownText}</div>
                <div class="card-footer">
                    <button class="mark-btn" onclick="markTaskDone(${index})">✓ Mark Done</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Store tasks for countdown updates
    window.currentTasks = tasks;
}

function formatDateTime(date) {
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function startCountdownUpdates() {
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        if (window.currentTasks) {
            window.currentTasks.forEach((task, index) => {
                const cdElement = document.getElementById(`cd_${index}`);
                if (cdElement && !task.done) {
                    const remaining = (task.plannedTs - Date.now()) / 1000;
                    let text = '';
                    
                    if (remaining < 0) {
                        const overdueMs = Math.abs(remaining);
                        const hours = Math.floor(overdueMs / 3600);
                        const minutes = Math.floor((overdueMs % 3600) / 60);
                        text = `Overdue by ${hours}h ${minutes}m`;
                    } else if (remaining <= 600) {
                        const minutes = Math.ceil(remaining / 60);
                        text = `⚠️ ${minutes} minutes remaining!`;
                    } else {
                        const minutes = Math.floor(remaining / 60);
                        const hours = Math.floor(minutes / 60);
                        if (hours > 0) {
                            text = `${hours}h ${minutes % 60}m remaining`;
                        } else {
                            text = `${minutes} minutes remaining`;
                        }
                    }
                    
                    cdElement.textContent = text;
                    
                    // Re-check for alerts
                    if (remaining <= 600 && remaining > 0) {
                        checkAndShowAlerts([task]);
                    }
                }
            });
        }
    }, 1000);
}

async function markTaskDone(index) {
    if (!currentUser || !window.currentTasks[index]) return;
    
    const task = window.currentTasks[index];
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        const response = await fetch('https://script.google.com/macros/s/AKfycbx1et8mJUSFFFP8qKBF7Adr_-kUsozQog_ilGS4EJNgtuf18TWWwduaeTlWJC1s4vXB/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'markDone',
                sheetId: SHEET_ID,
                sheetName: task.sheetName,
                rowNum: task.rowNum,
                statusCol: task.statusCol,
                actualCol: task.actualCol,
                userEmail: currentUser.email
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            task.done = true;
            showToast(`✓ Task marked done by ${currentUser.name}`, 'ok');
            renderUserTasks();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast('Error marking task: ' + error.message, 'err');
        btn.disabled = false;
        btn.textContent = '✓ Mark Done';
    }
}

function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tabToday').className = 'tab' + (tab === 'today' ? ' active' : '');
    document.getElementById('tabBacklog').className = 'tab' + (tab === 'backlog' ? ' active' : '');
    document.getElementById('dateFilterBar').style.display = tab === 'backlog' ? 'flex' : 'none';
    renderUserTasks();
}

function onSearch() {
    searchQuery = document.getElementById('searchBox').value;
    renderUserTasks();
}

function applyDateFilter() {
    filterFrom = document.getElementById('dfFrom').value;
    filterTo = document.getElementById('dfTo').value;
    renderUserTasks();
}

function clearDateFilter() {
    filterFrom = '';
    filterTo = '';
    document.getElementById('dfFrom').value = '';
    document.getElementById('dfTo').value = '';
    renderUserTasks();
}

function forceRefresh() {
    loadData();
    showToast('Refreshing data...', 'ok');
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Request notification permission on load
if (Notification.permission === 'default') {
    Notification.requestPermission();
}

// Initialize
loadData();
setInterval(() => {
    if (currentUser) {
        loadData();
    }
}, 30000);