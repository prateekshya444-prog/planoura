/**
 * PLANORA MVP - Backend Server
 * Express.js + PostgreSQL
 * 
 * Run: npm install express cors dotenv pg jsonwebtoken bcrypt
 * Then: node planora_backend_server.js
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const crypto = require('crypto');

dotenv.config();

// ============================================
// SETUP
// ============================================

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/planora'
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_FREE_MODEL = 'openrouter/free';
const OPENROUTER_TIMEOUT_MS = 15000;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// ============================================
// UTILITIES
// ============================================

const generateId = () => crypto.randomUUID();

const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const createToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.userId = decoded.userId;
  next();
};

// ============================================
// DATABASE INITIALIZATION
// ============================================

const initDb = async () => {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        wake_time TIME DEFAULT '08:00',
        sleep_time TIME DEFAULT '23:00',
        preferred_study_hours TEXT,
        preferred_break_duration INTEGER DEFAULT 15,
        max_focus_session INTEGER DEFAULT 90,
        typical_energy VARCHAR(50) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date DATE,
        due_time TIME,
        estimated_duration INTEGER NOT NULL,
        priority VARCHAR(50) DEFAULT 'medium',
        energy_required VARCHAR(50) DEFAULT 'medium',
        category VARCHAR(50) DEFAULT 'other',
        completed_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Calendar events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        start_datetime TIMESTAMP NOT NULL,
        end_datetime TIMESTAMP NOT NULL,
        is_recurring BOOLEAN DEFAULT FALSE,
        recurrence_pattern TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Daily plans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        plan_blocks JSONB NOT NULL,
        reasoning TEXT,
        generated_at TIMESTAMP DEFAULT NOW(),
        last_replanned_at TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_plans_user_date ON daily_plans(user_id, date)`);

    console.log('✓ Database initialized');
  } finally {
    client.release();
  }
};

// ============================================
// AUTH ENDPOINTS
// ============================================

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const passwordHash = await hashPassword(password);
    const userId = generateId();

    await pool.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [userId, email, passwordHash, name]
    );

    const token = createToken(userId);
    res.json({ user: { id: userId, email, name }, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createToken(user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        wake_time: user.wake_time,
        sleep_time: user.sleep_time,
        typical_energy: user.typical_energy
      },
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/verify-token', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ valid: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ONBOARDING ENDPOINTS
// ============================================

app.post('/api/onboarding/complete', authMiddleware, async (req, res) => {
  try {
    const { wake_time, sleep_time, preferred_study_hours, preferred_break_duration, max_focus_session, typical_energy } = req.body;

    await pool.query(
      `UPDATE users SET 
        wake_time = $1,
        sleep_time = $2,
        preferred_study_hours = $3,
        preferred_break_duration = $4,
        max_focus_session = $5,
        typical_energy = $6,
        updated_at = NOW()
       WHERE id = $7`,
      [wake_time, sleep_time, preferred_study_hours, preferred_break_duration, max_focus_session, typical_energy, req.userId]
    );

    const result = await pool.query(
      `SELECT id, email, name, wake_time, sleep_time, preferred_study_hours,
              preferred_break_duration, max_focus_session, typical_energy
       FROM users WHERE id = $1`,
      [req.userId]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// TASK ENDPOINTS
// ============================================

app.post('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const { title, description, due_date, due_time, estimated_duration, priority, energy_required, category } = req.body;
    if (!title || !estimated_duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const taskId = generateId();
    await pool.query(
      `INSERT INTO tasks (id, user_id, title, description, due_date, due_time, estimated_duration, priority, energy_required, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [taskId, req.userId, title, description || null, due_date || null, due_time || null, estimated_duration, priority || 'medium', energy_required || 'medium', category || 'other']
    );

    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const { status, date } = req.query;
    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params = [req.userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (date) {
      query += ` AND due_date = $${params.length + 1}`;
      params.push(date);
    }

    query += ' ORDER BY due_date ASC, priority ASC';

    const result = await pool.query(query, params);
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verify ownership
    const taskResult = await pool.query('SELECT user_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0 || taskResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const fields = Object.keys(updates).filter(k => ['title', 'description', 'due_date', 'due_time', 'estimated_duration', 'priority', 'energy_required', 'category', 'status'].includes(k));
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = [id, ...fields.map(f => updates[f])];

    await pool.query(`UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $1`, values);

    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const taskResult = await pool.query('SELECT user_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0 || taskResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/tasks/:id/complete', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const taskResult = await pool.query('SELECT user_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0 || taskResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('UPDATE tasks SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2', ['completed', id]);

    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// CALENDAR ENDPOINTS
// ============================================

app.get('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = 'SELECT * FROM calendar_events WHERE user_id = $1';
    const params = [req.userId];

    if (start_date && end_date) {
      query += ` AND start_datetime >= $${params.length + 1} AND end_datetime <= $${params.length + 2}`;
      params.push(start_date, end_date);
    }

    query += ' ORDER BY start_datetime ASC';
    const result = await pool.query(query, params);
    res.json({ events: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/calendar/events', authMiddleware, async (req, res) => {
  try {
    const { title, type, start_datetime, end_datetime, is_recurring, recurrence_pattern } = req.body;
    if (!title || !type || !start_datetime || !end_datetime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const eventId = generateId();
    await pool.query(
      `INSERT INTO calendar_events (id, user_id, title, type, start_datetime, end_datetime, is_recurring, recurrence_pattern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, req.userId, title, type, start_datetime, end_datetime, is_recurring || false, recurrence_pattern || null]
    );

    const result = await pool.query('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
    res.json({ event: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/calendar/events/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const eventResult = await pool.query('SELECT user_id FROM calendar_events WHERE id = $1', [id]);
    if (eventResult.rows.length === 0 || eventResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM calendar_events WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// AI SCHEDULING (Core Feature)
// ============================================

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const SCHEDULE_TYPES = new Set(['task', 'break', 'buffer']);

const padTime = (hours, minutes) =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

const parseMinutes = (value) => {
  if (!value || !TIME_RE.test(String(value).trim())) return null;
  const [hours, minutes] = String(value).trim().split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (total) => padTime(Math.floor(total / 60), total % 60);

const clockMinutesFromDatetime = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const match = value.match(/[T ](\d{2}):(\d{2})/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
};

const toBusyIntervals = (events, availableFrom, availableUntil) => {
  const from = parseMinutes(availableFrom);
  const until = parseMinutes(availableUntil);
  if (from == null || until == null) return [];

  const raw = [];
  for (const event of events || []) {
    const start = clockMinutesFromDatetime(event.start_datetime);
    const end = clockMinutesFromDatetime(event.end_datetime);
    if (start == null || end == null || end <= start) continue;
    const clippedStart = Math.max(start, from);
    const clippedEnd = Math.min(end, until);
    if (clippedEnd <= clippedStart) continue;
    raw.push({
      start: clippedStart,
      end: clippedEnd,
      title: event.title,
      type: event.type
    });
  }

  raw.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of raw) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
};

const freeWindows = (from, until, busyIntervals) => {
  const windows = [];
  let cursor = from;
  for (const interval of busyIntervals || []) {
    if (interval.end <= from || interval.start >= until) continue;
    const start = Math.max(interval.start, from);
    const end = Math.min(interval.end, until);
    if (start > cursor) windows.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < until) windows.push({ start: cursor, end: until });
  return windows.filter((window) => window.end > window.start);
};

const blockOverlapsBusy = (startMinutes, endMinutes, busyIntervals) =>
  (busyIntervals || []).some((interval) => startMinutes < interval.end && interval.start < endMinutes);

const scheduleOverlapsBusy = (blocks, busyIntervals) =>
  (blocks || []).some((block) => {
    const start = parseMinutes(block.start || block.start_time);
    const end = parseMinutes(block.end || block.end_time);
    if (start == null || end == null) return false;
    return blockOverlapsBusy(start, end, busyIntervals);
  });

const loadTodayCalendarEvents = async (userId) => {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT title, type, start_datetime, end_datetime
     FROM calendar_events
     WHERE user_id = $1
       AND start_datetime < ($2::date + INTERVAL '1 day')
       AND end_datetime > $2::date
     ORDER BY start_datetime ASC`,
    [userId, today]
  );
  return result.rows;
};

const toDateKey = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
  }
  return date.toISOString().slice(0, 10);
};

const sanitizeErrorMessage = (err) => {
  const raw = String((err && err.message) || err || 'unknown error');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return raw;
  return raw.split(key).join('[redacted]');
};

const buildSchedulePrompt = (tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals = []) => {
  const calendarLines = (busyIntervals || []).length > 0
    ? busyIntervals.map((interval) =>
      `- ${minutesToTime(interval.start)}–${minutesToTime(interval.end)} "${interval.title || 'Commitment'}" (${interval.type || 'calendar'})`
    ).join('\n')
    : '- none';

  return `You are an intelligent scheduling assistant for Planora, a student planner app.

AVAILABLE TIME:
From: ${availableFrom}
Until: ${availableUntil}
Energy Level: ${energyLevel}

FIXED CALENDAR COMMITMENTS (occupied time — not tasks to complete):
${calendarLines}

TASKS TO SCHEDULE:
${tasksToSchedule.map(t => `- id:${t.id} "${t.title}" (${t.estimated_duration} min, priority: ${t.priority}, energy: ${t.energy_required}, due: ${t.due_date || 'no deadline'}, category: ${t.category || 'other'})`).join('\n')}

USER PREFERENCES:
- Max focus session: ${userPreferences.max_focus_session} minutes
- Preferred break: ${userPreferences.preferred_break_duration} minutes

RULES:
1. Never schedule more than available time allows
2. Prioritize: overdue → urgent deadlines → high priority → long tasks → energy-matched
3. Include reasonable breaks (${userPreferences.preferred_break_duration} min every ${userPreferences.max_focus_session} min)
4. Avoid excessive context switching
5. Match task energy requirements to user's current energy level
6. Never overlap fixed calendar commitments. Those intervals are unavailable.
7. You may schedule tasks before and after calendar commitments when time remains.

RETURN ONLY VALID JSON (no markdown, no explanation):
{
  "schedule": [
    {
      "start": "HH:MM",
      "end": "HH:MM",
      "title": "string",
      "task_id": "uuid or null",
      "category": "string",
      "type": "task|break|buffer"
    }
  ],
  "reasoning": "1-2 sentences explaining prioritization"
}`;
};

const normalizeSchedule = (parsed, tasksToSchedule) => {
  if (!parsed || !Array.isArray(parsed.schedule)) return null;

  const knownTaskIds = new Set(tasksToSchedule.map((task) => String(task.id)));
  const blocks = [];

  for (const item of parsed.schedule) {
    if (!item || typeof item !== 'object') continue;
    const start = item.start || item.start_time;
    const end = item.end || item.end_time;
    const startMinutes = parseMinutes(start);
    const endMinutes = parseMinutes(end);
    const type = String(item.type || '').toLowerCase();
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) continue;
    if (!SCHEDULE_TYPES.has(type)) continue;
    if (!item.title) continue;

    let taskId = item.task_id == null || item.task_id === 'null' ? null : String(item.task_id);
    if (type !== 'task') taskId = null;
    if (taskId && !knownTaskIds.has(taskId)) taskId = null;

    blocks.push({
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      start_time: minutesToTime(startMinutes),
      end_time: minutesToTime(endMinutes),
      duration_minutes: endMinutes - startMinutes,
      title: String(item.title),
      task_id: taskId,
      category: item.category || (type === 'task' ? 'other' : type),
      type
    });
  }

  if (blocks.length === 0) return null;

  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
    ? parsed.reasoning.trim()
    : 'Schedule generated from your tasks, deadlines, energy, and available time.';

  return { schedule: blocks, reasoning };
};

const generateDeterministicSchedule = (tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals = []) => {
  const startMinutes = parseMinutes(availableFrom);
  const endMinutes = parseMinutes(availableUntil);
  const maxFocus = Number(userPreferences.max_focus_session) > 0 ? Number(userPreferences.max_focus_session) : 90;
  const breakMinutes = Number(userPreferences.preferred_break_duration) > 0 ? Number(userPreferences.preferred_break_duration) : 15;
  const today = new Date().toISOString().slice(0, 10);
  const priorityMap = { high: 1, medium: 2, low: 3 };

  const energyMatch = (taskEnergy, userEnergy) => {
    if (taskEnergy === userEnergy) return 0;
    if (userEnergy === 'high') return 1;
    if (userEnergy === 'medium' && taskEnergy === 'low') return 0.5;
    return 2;
  };

  const sortedTasks = [...tasksToSchedule].sort((a, b) => {
    const aDue = toDateKey(a.due_date);
    const bDue = toDateKey(b.due_date);
    const aOverdue = Boolean(aDue && aDue < today);
    const bOverdue = Boolean(bDue && bDue < today);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    const aPriority = priorityMap[a.priority] || 2;
    const bPriority = priorityMap[b.priority] || 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const energyDiff = energyMatch(a.energy_required, energyLevel) - energyMatch(b.energy_required, energyLevel);
    if (energyDiff !== 0) return energyDiff;
    return Number(b.estimated_duration || 0) - Number(a.estimated_duration || 0);
  });

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return {
      schedule: [],
      reasoning: 'Available time window is invalid, so no blocks were scheduled.'
    };
  }

  const windows = freeWindows(startMinutes, endMinutes, busyIntervals);
  const schedule = [];
  const queue = [...sortedTasks];
  let lastCursor = null;
  let lastWindowEnd = null;

  const pushBlock = (start, end, title, taskId, category, type) => {
    schedule.push({
      start: minutesToTime(start),
      end: minutesToTime(end),
      start_time: minutesToTime(start),
      end_time: minutesToTime(end),
      duration_minutes: end - start,
      title,
      task_id: taskId,
      category,
      type
    });
  };

  for (const window of windows) {
    let currentMinutes = window.start;
    let focusUsed = 0;
    const leftover = [];

    for (const task of queue) {
      const duration = Number(task.estimated_duration);
      if (!Number.isFinite(duration) || duration <= 0) continue;

      if (focusUsed > 0 && focusUsed + duration > maxFocus && currentMinutes + breakMinutes + duration <= window.end) {
        const breakEnd = currentMinutes + breakMinutes;
        pushBlock(currentMinutes, breakEnd, 'Break', null, 'break', 'break');
        currentMinutes = breakEnd;
        focusUsed = 0;
      }

      if (currentMinutes + duration > window.end) {
        leftover.push(task);
        continue;
      }

      const taskEnd = currentMinutes + duration;
      pushBlock(currentMinutes, taskEnd, task.title, task.id, task.category || 'other', 'task');
      currentMinutes = taskEnd;
      focusUsed += duration;
    }

    queue.length = 0;
    queue.push(...leftover);
    lastCursor = currentMinutes;
    lastWindowEnd = window.end;
  }

  if (lastCursor != null && lastCursor < lastWindowEnd) {
    pushBlock(lastCursor, lastWindowEnd, 'Buffer / Review', null, 'buffer', 'buffer');
  }

  return {
    schedule,
    reasoning: busyIntervals.length > 0
      ? 'Prioritized by overdue tasks, deadline proximity, priority, energy match, and duration. Protected calendar commitments as occupied time and placed remaining work in the free windows around them.'
      : 'Prioritized by overdue tasks, deadline proximity, priority, energy match, and duration. Included breaks to protect focus within the available time.'
  };
};

const generateScheduleWithOpenRouter = async (tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals = []) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_FREE_MODEL,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: buildSchedulePrompt(tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals)
        }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed (${response.status})`);
    }

    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const jsonStr = String(content || '').replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(jsonStr);
  } finally {
    clearTimeout(timeout);
  }
};

const generateSchedule = async (tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals = []) => {
  const fallback = generateDeterministicSchedule(
    tasksToSchedule,
    availableFrom,
    availableUntil,
    energyLevel,
    userPreferences,
    busyIntervals
  );

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OpenRouter API key is not set; using deterministic scheduler');
    return fallback;
  }

  try {
    const parsed = await generateScheduleWithOpenRouter(
      tasksToSchedule,
      availableFrom,
      availableUntil,
      energyLevel,
      userPreferences,
      busyIntervals
    );
    const normalized = normalizeSchedule(parsed, tasksToSchedule);
    if (!normalized) {
      console.error('OpenRouter returned unusable schedule data; using deterministic scheduler');
      return fallback;
    }
    if (scheduleOverlapsBusy(normalized.schedule, busyIntervals)) {
      console.error('OpenRouter schedule overlapped calendar commitments; using deterministic scheduler');
      return fallback;
    }
    return normalized;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.error('OpenRouter request timed out; using deterministic scheduler');
    } else {
      console.error('OpenRouter schedule generation failed; using deterministic scheduler:', sanitizeErrorMessage(err));
    }
    return fallback;
  }
};

app.post('/api/plan/generate-today', authMiddleware, async (req, res) => {
  try {
    const { available_from, available_until, energy_today, include_calendar } = req.body;
    if (!available_from || !available_until || !energy_today) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Get user preferences
    const userResult = await pool.query(
      'SELECT max_focus_session, preferred_break_duration FROM users WHERE id = $1',
      [req.userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get pending tasks
    const tasksResult = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 AND status = $2 ORDER BY due_date ASC, priority ASC',
      [req.userId, 'pending']
    );
    const tasks = tasksResult.rows;

    if (tasks.length === 0) {
      return res.json({
        plan: {
          id: generateId(),
          plan_blocks: [],
          reasoning: 'No pending tasks for today.'
        }
      });
    }

    const calendarEvents = await loadTodayCalendarEvents(req.userId);
    const busyIntervals = toBusyIntervals(calendarEvents, available_from, available_until);

    // Generate schedule using OpenRouter, with deterministic fallback
    const schedule = await generateSchedule(tasks, available_from, available_until, energy_today, {
      max_focus_session: user.max_focus_session,
      preferred_break_duration: user.preferred_break_duration
    }, busyIntervals);

    // Save plan to database
    const planId = generateId();
    const today = new Date().toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO daily_plans (id, user_id, date, plan_blocks, reasoning, generated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, date) DO UPDATE SET
        plan_blocks = $4,
        reasoning = $5,
        generated_at = NOW()`,
      [planId, req.userId, today, JSON.stringify(schedule.schedule), schedule.reasoning]
    );

    res.json({
      plan: {
        id: planId,
        plan_blocks: schedule.schedule,
        reasoning: schedule.reasoning
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to generate plan' });
  }
});

app.post('/api/plan/replan', authMiddleware, async (req, res) => {
  try {
    const { date, unfinished_tasks, available_from, available_until, energy_today } = req.body;

    const userResult = await pool.query(
      'SELECT max_focus_session, preferred_break_duration FROM users WHERE id = $1',
      [req.userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get remaining pending tasks
    const tasksResult = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 AND status = $2',
      [req.userId, 'pending']
    );
    const tasks = tasksResult.rows;

    if (tasks.length === 0) {
      return res.json({
        plan: {
          plan_blocks: [],
          reasoning: 'All tasks completed!'
        }
      });
    }

    const calendarEvents = await loadTodayCalendarEvents(req.userId);
    const busyIntervals = toBusyIntervals(calendarEvents, available_from, available_until);

    // Generate new schedule
    const schedule = await generateSchedule(tasks, available_from, available_until, energy_today, {
      max_focus_session: user.max_focus_session,
      preferred_break_duration: user.preferred_break_duration
    }, busyIntervals);

    // Update plan
    const planDate = date || new Date().toISOString().split('T')[0];
    await pool.query(
      `UPDATE daily_plans SET 
        plan_blocks = $1,
        reasoning = $2,
        last_replanned_at = NOW()
       WHERE user_id = $3 AND date = $4`,
      [JSON.stringify(schedule.schedule), schedule.reasoning, req.userId, planDate]
    );

    res.json({
      plan: {
        plan_blocks: schedule.schedule,
        reasoning: schedule.reasoning
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to replan' });
  }
});

app.get('/api/plan/today', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT * FROM daily_plans WHERE user_id = $1 AND date = $2',
      [req.userId, today]
    );

    if (result.rows.length === 0) {
      return res.json({ plan: null });
    }

    const plan = result.rows[0];
    res.json({
      plan: {
        id: plan.id,
        plan_blocks: plan.plan_blocks,
        reasoning: plan.reasoning
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

app.get('/api/analytics/progress', authMiddleware, async (req, res) => {
  try {
    const { range } = req.query; // 'week' or 'month'
    const days = range === 'month' ? 30 : 7;

    const completedResult = await pool.query(
      `SELECT COUNT(*) as count FROM tasks
       WHERE user_id = $1 AND status = 'completed' AND completed_at >= NOW() - make_interval(days => $2)`,
      [req.userId, days]
    );

    const totalResult = await pool.query(
      `SELECT COUNT(*) as count FROM tasks
       WHERE user_id = $1 AND created_at >= NOW() - make_interval(days => $2)`,
      [req.userId, days]
    );

    const completedCount = parseInt(completedResult.rows[0].count);
    const totalCount = parseInt(totalResult.rows[0].count);

    // By category
    const categoryResult = await pool.query(
      `SELECT category, COUNT(*) as count FROM tasks
       WHERE user_id = $1 AND status = 'completed' AND completed_at >= NOW() - make_interval(days => $2)
       GROUP BY category`,
      [req.userId, days]
    );

    const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    res.json({
      tasks_completed: completedCount,
      tasks_total: totalCount,
      completion_rate: completionRate,
      by_category: categoryResult.rows.map(r => ({ category: r.category, completed: parseInt(r.count) })),
      insights: [
        completionRate > 80 ? '🔥 You\'re crushing it this week!' : null,
        completionRate < 30 && totalCount > 5 ? '💪 Let\'s focus on finishing these tasks' : null,
        completedCount > 10 ? `📊 ${completedCount} tasks completed!` : null
      ].filter(Boolean)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// START SERVER
// ============================================

const start = async () => {
  try {
    // Test database connection
    const client = await pool.connect();
    console.log('✓ Connected to database');
    client.release();

    // Initialize database
    await initDb();

    // Start server
    app.listen(PORT, () => {
      console.log(`🌷 Planora backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`\nAPI endpoints ready:`);
      console.log(`  POST   /api/auth/signup`);
      console.log(`  POST   /api/auth/login`);
      console.log(`  POST   /api/tasks`);
      console.log(`  GET    /api/tasks`);
      console.log(`  POST   /api/plan/generate-today`);
      console.log(`  POST   /api/plan/replan`);
      console.log(`  GET    /api/analytics/progress`);
      console.log(`\nDocumentation: See PLANORA_ARCHITECTURE.md`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

module.exports = { app, pool, initDb };

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});
