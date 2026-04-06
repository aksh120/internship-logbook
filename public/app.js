/* ─────────────────────────────────────────────
   Internship Logbook 2026 — Client Application
   ───────────────────────────────────────────── */

const API = '';

// ── State ──
let logsData = {};

// ── DOM refs ──
const logContainer = document.getElementById('log-container');
const loadingState = document.getElementById('loading-state');

const modalBackdrop = document.getElementById('modal-backdrop');
const taskForm = document.getElementById('task-form');
const formDate = document.getElementById('form-date');
const formTaskId = document.getElementById('form-task-id');
const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const formTime = document.getElementById('form-time');
const formRemark = document.getElementById('form-remark');
const modalTitle = document.getElementById('modal-title');
const btnSubmit = document.getElementById('btn-submit');
const btnCancel = document.getElementById('btn-cancel');
const modalClose = document.getElementById('modal-close');

const dayModalBackdrop = document.getElementById('day-modal-backdrop');
const dayForm = document.getElementById('day-form');
const dayDateInput = document.getElementById('day-date-input');
const dayModalClose = document.getElementById('day-modal-close');
const dayCancel = document.getElementById('day-cancel');

const btnExport = document.getElementById('btn-export');
const btnAddDay = document.getElementById('btn-add-day');
const toastContainer = document.getElementById('toast-container');

// ── Helpers ──
function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function getDayNum(dateStr) {
  return parseInt(dateStr.split('-')[2], 10);
}

function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Toast ──
function showToast(message, type = 'success') {
  const icons = { success: '✓', error: '✕' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span>${message}`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ── Confirm Dialog ──
function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" id="confirm-no">Cancel</button>
          <button class="btn-danger" id="confirm-yes">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-yes').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
    overlay.querySelector('#confirm-no').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
  });
}

// ── API Calls ──
async function fetchLogs() {
  try {
    const res = await fetch(`${API}/api/logs`);
    const json = await res.json();
    if (json.success) {
      logsData = json.data;
      renderLogs();
    } else {
      showToast('Failed to load logs', 'error');
    }
  } catch (err) {
    showToast('Server unreachable', 'error');
    console.error(err);
  }
}

async function addTask(date, taskData) {
  try {
    const res = await fetch(`${API}/api/logs/${date}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    const json = await res.json();
    if (json.success) {
      showToast('Task added');
      await fetchLogs();
    } else {
      showToast(json.error || 'Failed to add task', 'error');
    }
  } catch (err) {
    showToast('Error adding task', 'error');
  }
}

async function editTask(date, taskId, taskData) {
  try {
    const res = await fetch(`${API}/api/logs/${date}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    const json = await res.json();
    if (json.success) {
      showToast('Task updated');
      await fetchLogs();
    } else {
      showToast(json.error || 'Failed to edit task', 'error');
    }
  } catch (err) {
    showToast('Error editing task', 'error');
  }
}

async function deleteTask(date, taskId) {
  try {
    const res = await fetch(`${API}/api/logs/${date}/tasks/${taskId}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      showToast('Task deleted');
      await fetchLogs();
    } else {
      showToast(json.error || 'Failed to delete task', 'error');
    }
  } catch (err) {
    showToast('Error deleting task', 'error');
  }
}

async function toggleAbsent(date) {
  try {
    const res = await fetch(`${API}/api/logs/${date}/absent`, {
      method: 'PATCH'
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Marked as ${json.status}`);
      await fetchLogs();
    } else {
      showToast('Failed to update status', 'error');
    }
  } catch (err) {
    showToast('Error updating status', 'error');
  }
}

// ── Render ──
function renderLogs() {
  const today = getTodayStr();
  const dates = Object.keys(logsData);

  if (dates.length === 0) {
    logContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No entries yet. Your logbook is empty.</p>
      </div>`;
    return;
  }

  let html = '';

  dates.forEach((date, idx) => {
    const entry = logsData[date];
    const isToday = date === today;
    const isAbsent = entry.status === 'absent';
    const classes = ['day-card'];
    if (isToday) classes.push('is-today');
    if (isAbsent) classes.push('is-absent');

    html += `<div class="${classes.join(' ')}" style="animation-delay:${idx * 0.06}s">`;

    // Header
    html += `<div class="day-header">
      <div class="day-date-info">
        <div class="day-number">${getDayNum(date)}</div>
        <div class="day-meta">
          <span class="day-date-text">${formatDate(date)}</span>
          <span class="day-day-name">${getDayName(date)}${isToday ? ' — Today' : ''}</span>
        </div>
      </div>
      <div class="day-actions">
        <span class="day-status-badge ${isAbsent ? 'absent' : 'present'}">${isAbsent ? 'Absent' : 'Present'}</span>
        <button class="btn-absent ${isAbsent ? 'active' : ''}" onclick="toggleAbsent('${date}')" title="Toggle absent">
          ${isAbsent ? '✓ Absent' : 'Mark Absent'}
        </button>
      </div>
    </div>`;

    // Body
    html += `<div class="day-body">`;
    if (entry.tasks.length === 0) {
      html += `<div class="no-tasks">No tasks given and/or done</div>`;
    } else {
      html += `<div class="task-list">`;
      entry.tasks.forEach(task => {
        html += `
          <div class="task-item">
            <div class="task-time-col">
              <span class="task-time">${formatTime12(task.time)}</span>
            </div>
            <div class="task-content">
              <div class="task-title">${escapeHtml(task.title)}</div>
              <div class="task-subtitle">${escapeHtml(task.subtitle)}</div>
              ${task.remark ? `<div class="task-remark">Remark: <span>${escapeHtml(task.remark)}</span></div>` : ''}
            </div>
            <div class="task-actions">
              <button class="btn-icon" onclick="openEditModal('${date}', '${task.id}')" title="Edit">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon danger" onclick="handleDeleteTask('${date}', '${task.id}')" title="Delete">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;

    // Footer — Add Task button
    html += `<div class="day-footer">
      <button class="btn-add-task" onclick="openAddModal('${date}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Task
      </button>
    </div>`;

    html += `</div>`;
  });

  logContainer.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Modal Logic ──
function openModal() {
  modalBackdrop.classList.add('active');
  setTimeout(() => formTitle.focus(), 200);
}

function closeModal() {
  modalBackdrop.classList.remove('active');
  taskForm.reset();
  formTaskId.value = '';
  formDate.value = '';
}

function openAddModal(date) {
  modalTitle.textContent = 'Add Task';
  btnSubmit.textContent = 'Add Task';
  formDate.value = date;
  formTaskId.value = '';
  formTime.value = getCurrentTime();
  openModal();
}

function openEditModal(date, taskId) {
  const entry = logsData[date];
  if (!entry) return;
  const task = entry.tasks.find(t => t.id === taskId);
  if (!task) return;

  modalTitle.textContent = 'Edit Task';
  btnSubmit.textContent = 'Save Changes';
  formDate.value = date;
  formTaskId.value = taskId;
  formTitle.value = task.title;
  formSubtitle.value = task.subtitle;
  formTime.value = task.time;
  formRemark.value = task.remark || '';
  openModal();
}

async function handleDeleteTask(date, taskId) {
  const confirmed = await confirmDialog('Are you sure you want to delete this task?');
  if (confirmed) {
    await deleteTask(date, taskId);
  }
}

// ── Form Submit ──
taskForm.addEventListener('submit', async e => {
  e.preventDefault();
  const date = formDate.value;
  const taskId = formTaskId.value;
  const data = {
    title: formTitle.value.trim(),
    subtitle: formSubtitle.value.trim(),
    time: formTime.value,
    remark: formRemark.value.trim()
  };

  if (!data.title || !data.subtitle) {
    showToast('Title and subtitle are required', 'error');
    return;
  }

  closeModal();

  if (taskId) {
    await editTask(date, taskId, data);
  } else {
    await addTask(date, data);
  }
});

btnCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => {
  if (e.target === modalBackdrop) closeModal();
});

// ── Day Modal ──
function openDayModal() {
  dayDateInput.value = getTodayStr();
  dayModalBackdrop.classList.add('active');
  setTimeout(() => dayDateInput.focus(), 200);
}

function closeDayModal() {
  dayModalBackdrop.classList.remove('active');
  dayForm.reset();
}

btnAddDay.addEventListener('click', openDayModal);
dayModalClose.addEventListener('click', closeDayModal);
dayCancel.addEventListener('click', closeDayModal);
dayModalBackdrop.addEventListener('click', e => {
  if (e.target === dayModalBackdrop) closeDayModal();
});

dayForm.addEventListener('submit', async e => {
  e.preventDefault();
  const date = dayDateInput.value;
  if (!date) return;

  if (logsData[date]) {
    showToast('Entry for this date already exists', 'error');
    return;
  }

  closeDayModal();

  // Create the entry by adding and then immediately use the endpoint
  try {
    const res = await fetch(`${API}/api/logs/${date}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '__init__',
        subtitle: '__init__'
      })
    });
    const json = await res.json();
    if (json.success) {
      // Delete the placeholder task
      await fetch(`${API}/api/logs/${date}/tasks/${json.task.id}`, { method: 'DELETE' });
      showToast('Day entry created');
      await fetchLogs();
    }
  } catch (err) {
    showToast('Error creating day entry', 'error');
  }
});

// ── Export ──
btnExport.addEventListener('click', () => {
  window.location.href = `${API}/api/export`;
});

// ── Keyboard Shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDayModal();
  }
});

// ── Init ──
(async function init() {
  await fetchLogs();
  loadingState?.remove();
})();
