const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx-js-style');

const app = express();
const PORT = 3000;

// Use /tmp on Vercel (read-only filesystem), local data/ dir otherwise
const IS_VERCEL = process.env.VERCEL === '1';
const DATA_FILE = IS_VERCEL
  ? path.join('/tmp', 'logbook.json')
  : path.join(__dirname, 'data', 'logbook.json');
const SEED_FILE = path.join(__dirname, 'data', 'logbook.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory and file exist
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    // On Vercel, seed from repo data if available
    if (IS_VERCEL && fs.existsSync(SEED_FILE)) {
      fs.copyFileSync(SEED_FILE, DATA_FILE);
    } else {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), 'utf-8');
    }
  }
}

// Read logbook data
function readData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

// Write logbook data
function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Get today's date string in YYYY-MM-DD
function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Auto-create today's entry if not exists
function ensureTodayEntry(data) {
  const today = getTodayString();
  if (!data[today]) {
    data[today] = { status: 'present', tasks: [] };
    writeData(data);
  }
  return data;
}

// ───── API ENDPOINTS ─────

// GET /api/logs — Get all logs (sorted by date descending)
app.get('/api/logs', (req, res) => {
  try {
    let data = readData();
    data = ensureTodayEntry(data);

    // Sort by date descending
    const sorted = {};
    Object.keys(data)
      .sort((a, b) => b.localeCompare(a))
      .forEach(key => { sorted[key] = data[key]; });

    res.json({ success: true, data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/logs/:date/tasks — Add task to a date
app.post('/api/logs/:date/tasks', (req, res) => {
  try {
    const { date } = req.params;
    const { title, subtitle, time, remark } = req.body;

    if (!title || !subtitle) {
      return res.status(400).json({ success: false, error: 'Title and subtitle are required.' });
    }

    const data = readData();
    if (!data[date]) {
      data[date] = { status: 'present', tasks: [] };
    }

    const task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      subtitle,
      time: time || new Date().toTimeString().slice(0, 5),
      remark: remark || ''
    };

    data[date].tasks.push(task);
    writeData(data);

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/logs/:date/tasks/:taskId — Edit a task
app.put('/api/logs/:date/tasks/:taskId', (req, res) => {
  try {
    const { date, taskId } = req.params;
    const { title, subtitle, time, remark } = req.body;
    const data = readData();

    if (!data[date]) {
      return res.status(404).json({ success: false, error: 'Date entry not found.' });
    }

    const taskIndex = data[date].tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    if (title !== undefined) data[date].tasks[taskIndex].title = title;
    if (subtitle !== undefined) data[date].tasks[taskIndex].subtitle = subtitle;
    if (time !== undefined) data[date].tasks[taskIndex].time = time;
    if (remark !== undefined) data[date].tasks[taskIndex].remark = remark;

    writeData(data);
    res.json({ success: true, task: data[date].tasks[taskIndex] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/logs/:date/tasks/:taskId — Delete a task
app.delete('/api/logs/:date/tasks/:taskId', (req, res) => {
  try {
    const { date, taskId } = req.params;
    const data = readData();

    if (!data[date]) {
      return res.status(404).json({ success: false, error: 'Date entry not found.' });
    }

    const taskIndex = data[date].tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    data[date].tasks.splice(taskIndex, 1);
    writeData(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/logs/:date/absent — Toggle absent status
app.patch('/api/logs/:date/absent', (req, res) => {
  try {
    const { date } = req.params;
    const data = readData();

    if (!data[date]) {
      data[date] = { status: 'absent', tasks: [] };
    } else {
      data[date].status = data[date].status === 'absent' ? 'present' : 'absent';
    }

    writeData(data);
    res.json({ success: true, status: data[date].status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/export — Export to Excel
app.get('/api/export', (req, res) => {
  try {
    const data = readData();
    const rows = [];

    // Row 1: Title row — Name | blank | Social Media | Internship Logbook | blank | 2026
    rows.push(['Akshat Apoorv', '2026', '', 'Social Media Internship Logbook', '', '']);

    // Row 2: Blank spacer
    rows.push(['', '', '', '', '', '']);

    // Row 3: Blank spacer
    rows.push(['', '', '', '', '', '']);

    // Row 4: Column headers
    rows.push(['Date', 'Status', 'Title', 'Work Done', 'Time', 'Remark']);

    // Row 5: Blank spacer
    rows.push(['', '', '', '', '', '']);

    // Row 6+: Data
    const sortedDates = Object.keys(data).sort((a, b) => a.localeCompare(b));

    for (const date of sortedDates) {
      const entry = data[date];
      const status = entry.status === 'absent' ? 'Absent' : 'Present';

      if (entry.tasks.length === 0) {
        rows.push([date, status, 'No tasks given and/or done', '', '', '']);
      } else {
        entry.tasks.forEach(task => {
          rows.push([date, status, task.title, task.subtitle, task.time, task.remark]);
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 10 }, { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 30 }
    ];

    // Center-align the header row (index 3)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 3, c });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Internship Logbook');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Internship_Logbook_2026.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export for Vercel serverless, start locally
module.exports = app;

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    ensureDataFile();
    console.log(`\n  🚀 Internship Logbook server running at http://localhost:${PORT}\n`);
  });
}
