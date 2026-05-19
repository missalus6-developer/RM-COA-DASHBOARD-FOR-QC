// ================================================================
// BMP FMS DASHBOARD - WORKING VERSION
// ================================================================

// ⚠️ IMPORTANT: YAHAN APNA APPS SCRIPT URL DAALO ⚠️
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwaxe-8_ekqCL1rEjP_5_AI5IypeksxEyN9iT6Mwjx5AiLYvn7cfCTd69ls4AVebkQ/exec';

let allTasks = [];
let allUsers = [];
let currentUser = null;
let currentTab = 'today';
let searchQuery = '';
let countdownInterval = null;
let alertShown = new Set();

// Load data from Google Sheets
async function loadData() {
    try {
        showToast('📡 Loading FMS data...', false);
        document.getElementById('tasksContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⏳</div>
                <p>Loading tasks from FMS sheet...</p>
            </div>
        `;
        
        const url = `${APPS_SCRIPT_URL}?action=getTasks&t=${Date.now()}`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url);
        const result = await response.json();
        
        console.log('Response:', result);
        
        if (result.success) {
            allTasks = result.tasks || [];
            allUsers = result.users || [
                { name: "Miss Alus", email: "missalus6@gmail.com" },
                { name: "Process Coordinator", email: "processcoordinator03@gmail.com" }
            ];
            
            console.log(`✅ Loaded ${allTasks.length} tasks from FMS sheet`);
            
            renderTeamGrid();
            updateUserSelect();
            
            if (!currentUser && allUsers.length > 0) {
                currentUser = allUsers[0];
                document.getElementById('userSelect').value = currentUser.email;
            }
            
            if (currentUser) {
                renderTasks();
            }
            
            showToast(`✅ Loaded ${allTasks.length} tasks from FMS`, false);
        } else {
            throw new Error(result.error || 'Failed to load data');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('❌ Error loading data: ' + error.message, true);
        document.getElementById('tasksContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <p>Failed to load FMS data</p>
                <p style="font-size:12px;margin-top:8px">Error: ${error.message}</p>
                <p style="font-size:12px">Check Apps Script URL and deploy status</p>
            </div>
        `;
    }
}

// Render team members grid
function renderTeamGrid() {
    const teamGrid = document.getElementById('teamGrid');
    if (!teamGrid) return;
    
    const userStats = {};
    allTasks.forEach(task => {
        if (!userStats[task.assignedTo]) {
            userStats[task.assignedTo] = { total: 0, urgent: 0, overdue: 0 };
        }
        userStats[task.assignedTo].total++;
        if (task.isUrgent) userStats[task.assignedTo].urgent++;
        if (task.isOverdue) userStats[task.assignedTo].overdue++;
    });
    
    teamGrid.innerHTML = allUsers.map(user => {
        const stats = userStats[user.email] || { total: 0, urgent: 0, overdue: 0 };
        const isActive = currentUser && currentUser.email === user.email;
        return `
            <div class="team-card ${isActive ? 'active' : ''}" onclick="selectUser('${user.email}')">
                <div class="team-name">${escapeHtml(user.name)}</div>
                <div class="team-email">${escapeHtml(user.email)}</div>
                <div class="team-stats">
                    <span class="team-stat total">📋 ${stats.total}</span>
                    <span class="team-stat urgent">⚠️ ${stats.urgent}</span>
                    <span class="team-stat overdue">🔴 ${stats.overdue}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Update user dropdown
function updateUserSelect() {
    const select = document.getElementById('userSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select User --</option>' + 
        allUsers.map(user => `<option value="${user.email}">${user.name}</option>`).join('');
}

// Select user
function selectUser(email) {
    currentUser = allUsers.find(u => u.email === email);
    if (document.getElementById('userSelect')) {
        document.getElementById('userSelect').value = email;
    }
    renderTeamGrid();
    renderTasks();
}

// Switch user
function switchUser() {
    const email = document.getElementById('userSelect').value;
    if (email) {
        selectUser(email);
    }
}

// Switch tab
function switchTab(tab) {
    currentTab = tab;
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((t, i) => {
        if ((tab === 'today' && i === 0) || (tab === 'upcoming' && i === 1) || (tab === 'overdue' && i === 2)) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    renderTasks();
}

// Search
function searchTasks() {
    searchQuery = document.getElementById('searchBox')?.value || '';
    renderTasks();
}

// Get filtered tasks
function getFilteredTasks() {
    if (!currentUser) return [];
    
    let tasks = allTasks.filter(t => t.assignedTo === currentUser.email);
    
    const now = new Date();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    
    if (currentTab === 'today') {
        tasks = tasks.filter(t => {
            const taskDate = new Date(t.plannedTs);
            return taskDate >= todayStart && taskDate <= todayEnd && !t.isOverdue;
        });
    } else if (currentTab === 'upcoming') {
        tasks = tasks.filter(t => {
            const taskDate = new Date(t.plannedTs);
            return taskDate > todayEnd && !t.isOverdue;
        });
    } else if (currentTab === 'overdue') {
        tasks = tasks.filter(t => t.isOverdue);
    }
    
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        tasks = tasks.filter(t => 
            (t.materialName || '').toLowerCase().includes(q) ||
            (t.grnNumber || '').toLowerCase().includes(q) ||
            (t.stepName || '').toLowerCase().includes(q)
        );
    }
    
    tasks.sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        return a.timeLeftMins - b.timeLeftMins;
    });
    
    return tasks;
}

// Render tasks
function renderTasks() {
    if (!currentUser) {
        document.getElementById('tasksContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👆</div>
                <p>Select a user to view their tasks</p>
            </div>
        `;
        return;
    }
    
    const tasks = getFilteredTasks();
    
    // Update counts
    const allUserTasks = allTasks.filter(t => t.assignedTo === currentUser.email);
    const todayCount = allUserTasks.filter(t => {
        const taskDate = new Date(t.plannedTs);
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        return taskDate >= todayStart && taskDate <= todayEnd && !t.isOverdue;
    }).length;
    
    const upcomingCount = allUserTasks.filter(t => {
        const taskDate = new Date(t.plannedTs);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        return taskDate > todayEnd && !t.isOverdue;
    }).length;
    
    const overdueCount = allUserTasks.filter(t => t.isOverdue).length;
    
    document.getElementById('todayCount').textContent = todayCount;
    document.getElementById('upcomingCount').textContent = upcomingCount;
    document.getElementById('overdueCount').textContent = overdueCount;
    
    // Stats
    const urgentCount = tasks.filter(t => t.isUrgent && !t.isOverdue).length;
    document.getElementById('statsRow').innerHTML = `
        <div class="stat-card">
            <div class="stat-number blue">${tasks.length}</div>
            <div class="stat-label">Total Tasks</div>
        </div>
        <div class="stat-card">
            <div class="stat-number orange">${urgentCount}</div>
            <div class="stat-label">⚠️ Urgent (≤10 min)</div>
        </div>
        <div class="stat-card">
            <div class="stat-number red">${overdueCount}</div>
            <div class="stat-label">🔴 Overdue</div>
        </div>
    `;
    
    if (tasks.length === 0) {
        document.getElementById('tasksContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎉</div>
                <p>No pending tasks for ${escapeHtml(currentUser.name)}!</p>
            </div>
        `;
        return;
    }
    
    // Render tasks
    const container = document.getElementById('tasksContainer');
    container.innerHTML = tasks.map((task, index) => {
        const cardClass = `task-card ${task.isUrgent ? 'urgent' : ''} ${task.isOverdue ? 'overdue' : ''}`;
        const timeClass = task.isUrgent ? 'urgent' : (task.isOverdue ? 'overdue' : 'normal');
        const plannedDate = new Date(task.plannedTs);
        
        return `
            <div class="${cardClass}" data-task-idx="${index}">
                <div class="task-step">📌 ${escapeHtml(task.stepName)}</div>
                <div class="task-header">
                    <div class="task-title">📦 ${escapeHtml(task.materialName)}</div>
                </div>
                <div class="task-details">
                    <span>📄 ${escapeHtml(task.sheetName)}</span>
                    <span>📍 Row ${task.rowNum}</span>
                    ${task.grnNumber ? `<span>🏷️ GRN: ${escapeHtml(task.grnNumber)}</span>` : ''}
                </div>
                <div class="task-details">
                    📅 Due: ${plannedDate.toLocaleString()}
                </div>
                <div class="task-time ${timeClass}" id="time_${index}">
                    ${task.timeText}
                </div>
                <div class="task-actions">
                    <button class="mark-btn" onclick="markDone(${index})">✅ Mark as Done</button>
                </div>
            </div>
        `;
    }).join('');
    
    window.currentDisplayTasks = tasks;
    startCountdown();
    checkAlerts(tasks);
}

// Start countdown
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        if (!window.currentDisplayTasks) return;
        
        const now = new Date().getTime();
        window.currentDisplayTasks.forEach((task, idx) => {
            const remaining = (task.plannedTs - now) / 60000;
            const timeElem = document.getElementById(`time_${idx}`);
            
            if (timeElem) {
                if (remaining < 0) {
                    timeElem.textContent = `${Math.abs(Math.floor(remaining))} minutes overdue`;
                    timeElem.className = 'task-time overdue';
                } else if (remaining <= 10) {
                    timeElem.textContent = `⚠️ ${Math.ceil(remaining)} minutes left!`;
                    timeElem.className = 'task-time urgent';
                } else if (remaining < 60) {
                    timeElem.textContent = `${Math.floor(remaining)} minutes left`;
                    timeElem.className = 'task-time normal';
                } else {
                    timeElem.textContent = `${Math.floor(remaining / 60)} hours left`;
                    timeElem.className = 'task-time normal';
                }
            }
        });
        
        if (window.currentDisplayTasks) {
            checkAlerts(window.currentDisplayTasks);
        }
    }, 1000);
}

// Check alerts
function checkAlerts(tasks) {
    const now = new Date().getTime();
    
    tasks.forEach(task => {
        const remaining = (task.plannedTs - now) / 60000;
        const alertKey = `${task.id}_${task.assignedTo}`;
        
        if (remaining <= 10 && remaining > 0 && !alertShown.has(alertKey)) {
            alertShown.add(alertKey);
            
            showToast(`⚠️ ALERT: ${task.materialName} - ${task.stepName} has ${Math.ceil(remaining)} minutes left!`, false);
            
            if (Notification.permission === 'granted') {
                new Notification('BMP FMS Alert', {
                    body: `${task.materialName}\n${task.stepName}\n${Math.ceil(remaining)} minutes remaining!`
                });
            }
            
            // Flash title
            const originalTitle = document.title;
            let count = 0;
            const flashInterval = setInterval(() => {
                document.title = count % 2 === 0 ? '🔴 ALERT! ' + originalTitle : originalTitle;
                count++;
                if (count > 10) clearInterval(flashInterval);
            }, 500);
        }
    });
}

// Mark done
async function markDone(index) {
    if (!window.currentDisplayTasks || !window.currentDisplayTasks[index]) return;
    
    const task = window.currentDisplayTasks[index];
    const btn = event?.target;
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }
    
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'markDone',
                sheetName: task.sheetName,
                rowNum: task.rowNum,
                statusCol: task.statusCol,
                actualCol: task.actualCol,
                userEmail: currentUser?.email || 'unknown'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(`✅ Task marked as Done!`, false);
            await loadData();
        } else {
            throw new Error(result.error || 'Failed');
        }
    } catch (error) {
        showToast(`❌ Error: ${error.message}`, true);
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✅ Mark as Done';
        }
    }
}

// Refresh data
function refreshData() {
    loadData();
}

// Show toast
function showToast(message, isError) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = isError ? 'toast error' : 'toast';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Request notification permission
if (Notification.permission === 'default') {
    Notification.requestPermission();
}

// Auto refresh every 30 seconds
setInterval(() => {
    if (currentUser) {
        loadData();
    }
}, 30000);

// Initial load
loadData();
