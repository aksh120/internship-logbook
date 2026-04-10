require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx-js-style');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;
const IS_VERCEL = process.env.VERCEL === '1';

// ── Supabase client ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ──
function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convert 24hr time string to 12hr format
function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Format date as "7th Apr 2026"
function formatDatePretty(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const suffix = (day % 10 === 1 && day !== 11) ? 'st'
    : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
  return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Ensure today's day_entry exists (uses upsert to avoid extra select)
async function ensureTodayEntry() {
  const today = getTodayString();
  await supabase
    .from('day_entries')
    .upsert({ date: today, status: 'present' }, { onConflict: 'date', ignoreDuplicates: true });
}

// ═════════════════════════════════════════════
// API ENDPOINTS
// ═════════════════════════════════════════════

// GET /api/logs — Get all logs (sorted by date descending)
app.get('/api/logs', async (req, res) => {
  try {
    // Run all queries in parallel
    const [, daysResult, tasksResult] = await Promise.all([
      ensureTodayEntry(),
      supabase.from('day_entries').select('date, status').order('date', { ascending: false }),
      supabase.from('tasks').select('id, day_date, subtitle, time, remark').order('created_at', { ascending: true })
    ]);

    if (daysResult.error) throw daysResult.error;
    if (tasksResult.error) throw tasksResult.error;

    const days = daysResult.data;
    const tasks = tasksResult.data;

    // Build the same shape the frontend expects: { "YYYY-MM-DD": { status, tasks[] } }
    const tasksByDate = {};
    for (const t of tasks) {
      if (!tasksByDate[t.day_date]) tasksByDate[t.day_date] = [];
      tasksByDate[t.day_date].push({ id: t.id, subtitle: t.subtitle, time: t.time, remark: t.remark });
    }

    const result = {};
    for (const day of days) {
      result[day.date] = {
        status: day.status,
        tasks: tasksByDate[day.date] || []
      };
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/logs/:date/day — Create a day entry (for Add Day)
app.post('/api/logs/:date/day', async (req, res) => {
  try {
    const { date } = req.params;

    const { data: existing } = await supabase
      .from('day_entries')
      .select('date')
      .eq('date', date)
      .single();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Entry for this date already exists.' });
    }

    const { error } = await supabase
      .from('day_entries')
      .insert({ date, status: 'present' });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/logs/:date/tasks — Add task to a date
app.post('/api/logs/:date/tasks', async (req, res) => {
  try {
    const { date } = req.params;
    const { subtitle, time, remark } = req.body;

    if (!subtitle) {
      return res.status(400).json({ success: false, error: 'Work Done is required.' });
    }

    // Ensure day entry exists
    const { data: existing } = await supabase
      .from('day_entries')
      .select('date')
      .eq('date', date)
      .single();

    if (!existing) {
      await supabase.from('day_entries').insert({ date, status: 'present' });
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        day_date: date,
        title: '',
        subtitle,
        time: time || new Date().toTimeString().slice(0, 5),
        remark: remark || ''
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/logs/:date/tasks/:taskId — Edit a task
app.put('/api/logs/:date/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { subtitle, time, remark } = req.body;

    const updates = {};
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (time !== undefined) updates.time = time;
    if (remark !== undefined) updates.remark = remark;

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/logs/:date/tasks/:taskId — Delete a task
app.delete('/api/logs/:date/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/logs/:date/absent — Toggle absent status
app.patch('/api/logs/:date/absent', async (req, res) => {
  try {
    const { date } = req.params;

    // Get current status
    const { data: entry, error: fetchErr } = await supabase
      .from('day_entries')
      .select('status')
      .eq('date', date)
      .single();

    if (fetchErr || !entry) {
      // Create as absent if doesn't exist
      await supabase.from('day_entries').insert({ date, status: 'absent' });
      return res.json({ success: true, status: 'absent' });
    }

    const newStatus = entry.status === 'absent' ? 'present' : 'absent';

    const { error } = await supabase
      .from('day_entries')
      .update({ status: newStatus })
      .eq('date', date);

    if (error) throw error;
    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/export — Export to Excel (styled)
app.get('/api/export', async (req, res) => {
  try {
    const { data: days } = await supabase
      .from('day_entries')
      .select('date, status')
      .order('date', { ascending: true });

    const { data: tasks } = await supabase
      .from('tasks')
      .select('day_date, subtitle, time, remark')
      .order('created_at', { ascending: true });

    // ── Style definitions ──
    const navy = '1B2A4A';
    const purple = '4A3080';
    const lightPurple = 'E8E0F0';
    const white = 'FFFFFF';
    const lightGray = 'F5F5F8';
    const borderColor = 'C0C0D0';
    const greenText = '1B7A3D';
    const greenBg = 'E6F5EC';
    const redText = 'A83232';
    const redBg = 'FDE8E8';

    const thinBorder = { style: 'thin', color: { rgb: borderColor } };
    const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    const titleStyle = {
      font: { name: 'Calibri', bold: true, sz: 16, color: { rgb: white } },
      fill: { fgColor: { rgb: navy } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: borders
    };

    const headerStyle = {
      font: { name: 'Calibri', bold: true, sz: 12, color: { rgb: white } },
      fill: { fgColor: { rgb: purple } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: borders
    };

    const dataStyleEven = {
      font: { name: 'Calibri', sz: 11, color: { rgb: '333333' } },
      fill: { fgColor: { rgb: white } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borders
    };

    const dataStyleOdd = {
      font: { name: 'Calibri', sz: 11, color: { rgb: '333333' } },
      fill: { fgColor: { rgb: lightGray } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borders
    };

    const workDoneStyleEven = {
      ...dataStyleEven,
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
    };

    const workDoneStyleOdd = {
      ...dataStyleOdd,
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
    };

    const presentStyle = (base) => ({
      ...base,
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: greenText } },
      fill: { fgColor: { rgb: greenBg } }
    });

    const absentStyle = (base) => ({
      ...base,
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: redText } },
      fill: { fgColor: { rgb: redBg } }
    });

    const spacerStyle = {
      fill: { fgColor: { rgb: white } },
      border: {}
    };

    // ── Build rows ──
    const rows = [];

    // Row 0: Title
    rows.push([
      { v: '2026', s: titleStyle },
      { v: '', s: titleStyle },
      { v: 'Social Media Internship Logbook', s: titleStyle },
      { v: '', s: titleStyle },
      { v: 'Akshat Apoorv', s: titleStyle }
    ]);

    // Row 1: Spacer
    rows.push([
      { v: '', s: spacerStyle }, { v: '', s: spacerStyle },
      { v: '', s: spacerStyle }, { v: '', s: spacerStyle },
      { v: '', s: spacerStyle }
    ]);

    // Row 2: Spacer
    rows.push([
      { v: '', s: spacerStyle }, { v: '', s: spacerStyle },
      { v: '', s: spacerStyle }, { v: '', s: spacerStyle },
      { v: '', s: spacerStyle }
    ]);

    // Row 3: Headers
    rows.push([
      { v: 'Date', s: headerStyle },
      { v: 'Time', s: headerStyle },
      { v: 'Work Done', s: headerStyle },
      { v: 'Status', s: headerStyle },
      { v: "Supervisor's Remark", s: headerStyle }
    ]);

    // Row 4: Spacer
    rows.push([
      { v: '', s: spacerStyle }, { v: '', s: spacerStyle },
      { v: '', s: spacerStyle }, { v: '', s: spacerStyle },
      { v: '', s: spacerStyle }
    ]);

    // Row 5+: Data
    let dataRowIndex = 0;
    for (const day of (days || [])) {
      const dayTasks = (tasks || []).filter(t => t.day_date === day.date);
      const status = day.status === 'absent' ? 'Absent' : 'Present';
      const isOdd = dataRowIndex % 2 === 1;
      const baseStyle = isOdd ? dataStyleOdd : dataStyleEven;
      const wdStyle = isOdd ? workDoneStyleOdd : workDoneStyleEven;
      const statusCellStyle = status === 'Absent' ? absentStyle(baseStyle) : presentStyle(baseStyle);

      if (dayTasks.length === 0) {
        rows.push([
          { v: formatDatePretty(day.date), s: baseStyle },
          { v: '', s: baseStyle },
          { v: 'No tasks given or done', s: { ...wdStyle, font: { ...wdStyle.font, italic: true, color: { rgb: '999999' } } } },
          { v: status, s: statusCellStyle },
          { v: '', s: baseStyle }
        ]);
        dataRowIndex++;
      } else {
        dayTasks.forEach(task => {
          const isOddInner = dataRowIndex % 2 === 1;
          const bStyle = isOddInner ? dataStyleOdd : dataStyleEven;
          const wStyle = isOddInner ? workDoneStyleOdd : workDoneStyleEven;
          const sCellStyle = status === 'Absent' ? absentStyle(bStyle) : presentStyle(bStyle);

          rows.push([
            { v: formatDatePretty(day.date), s: bStyle },
            { v: formatTime12(task.time), s: bStyle },
            { v: task.subtitle, s: wStyle },
            { v: status, s: sCellStyle },
            { v: task.remark || '', s: bStyle }
          ]);
          dataRowIndex++;
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 18 }, { wch: 14 }, { wch: 44 }, { wch: 12 }, { wch: 32 }
    ];

    // Row heights
    ws['!rows'] = [
      { hpt: 36 },  // Title row
      { hpt: 8 },   // Spacer
      { hpt: 8 },   // Spacer
      { hpt: 28 },  // Header row
      { hpt: 8 },   // Spacer
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Akshat\'s Internship Logbook');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Akshat\'s_Internship_Logbook_2026.xlsx"');
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
    console.log(`\n  🚀 Internship Logbook server running at http://localhost:${PORT}\n`);
  });
}
