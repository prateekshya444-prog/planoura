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

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ============================================
// SETUP
// ============================================

const app = express();
const PORT = process.env.PORT || 5000;

const DEV_JWT_FALLBACK = 'dev-secret-key-change-in-production';

const resolveJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    if (IS_PRODUCTION && process.env.JWT_SECRET === DEV_JWT_FALLBACK) {
      console.error('JWT_SECRET must not use the development default in production');
      process.exit(1);
    }
    return process.env.JWT_SECRET;
  }
  if (IS_PRODUCTION) {
    console.error('JWT_SECRET is required in production');
    process.exit(1);
  }
  return DEV_JWT_FALLBACK;
};

const JWT_SECRET = resolveJwtSecret();

const resolveCorsOrigins = () => {
  const configured = process.env.FRONTEND_ORIGIN;
  if (configured) {
    return configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  }
  if (IS_PRODUCTION) {
    console.error('FRONTEND_ORIGIN is required in production');
    process.exit(1);
  }
  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
};

const corsOrigins = resolveCorsOrigins();

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/planora'
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_FREE_MODEL = 'openrouter/free';
const OPENROUTER_TIMEOUT_MS = 15000;

// ============================================
// UTILITIES
// ============================================

const generateId = () => crypto.randomUUID();

const PUBLIC_USER_FIELDS = [
  'id', 'email', 'name', 'wake_time', 'sleep_time', 'preferred_study_hours',
  'preferred_break_duration', 'max_focus_session', 'typical_energy', 'created_at', 'updated_at'
];

const toPublicUser = (user) => {
  if (!user) return null;
  const publicUser = {};
  for (const field of PUBLIC_USER_FIELDS) {
    if (user[field] !== undefined) {
      publicUser[field] = user[field];
    }
  }
  return publicUser;
};

const sanitizeErrorMessage = (err) => {
  const raw = String((err && err.message) || err || 'unknown error');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return raw;
  return raw.split(key).join('[redacted]');
};

const logServerError = (context, err) => {
  console.error(`[${context}]`, sanitizeErrorMessage(err));
};

const sendServerError = (res, context, err, clientMessage = 'Internal server error') => {
  logServerError(context, err);
  res.status(500).json({ error: clientMessage });
};

const UNSCHEDULED_REASONS = {
  NOT_ENOUGH_TIME: 'not_enough_time',
  OUTSIDE_AVAILABLE_HOURS: 'outside_available_hours',
  BLOCKED_BY_CALENDAR: 'blocked_by_calendar',
  INVALID_TASK_DURATION: 'invalid_task_duration'
};

const UNSCHEDULED_MESSAGES = {
  [UNSCHEDULED_REASONS.NOT_ENOUGH_TIME]: 'Not enough available time',
  [UNSCHEDULED_REASONS.OUTSIDE_AVAILABLE_HOURS]: 'Outside available hours',
  [UNSCHEDULED_REASONS.BLOCKED_BY_CALENDAR]: 'Blocked by calendar commitments',
  [UNSCHEDULED_REASONS.INVALID_TASK_DURATION]: 'Invalid task duration'
};

const buildUnscheduledTask = (task, reason) => ({
  task_id: task.id,
  title: task.title,
  reason,
  message: UNSCHEDULED_MESSAGES[reason] || 'Could not be scheduled'
});

const encodePlanPayload = (blocks, unscheduledTasks = []) => ({
  blocks,
  unscheduled_tasks: unscheduledTasks
});

const decodePlanPayload = (stored) => {
  if (Array.isArray(stored)) {
    return { blocks: stored, unscheduled_tasks: [] };
  }
  if (stored && Array.isArray(stored.blocks)) {
    return {
      blocks: stored.blocks,
      unscheduled_tasks: Array.isArray(stored.unscheduled_tasks) ? stored.unscheduled_tasks : []
    };
  }
  return { blocks: [], unscheduled_tasks: [] };
};

const toPlanResponse = (planRow) => {
  if (!planRow) return null;
  const decoded = decodePlanPayload(planRow.plan_blocks);
  return {
    id: planRow.id,
    plan_blocks: decoded.blocks,
    reasoning: planRow.reasoning,
    unscheduled_tasks: decoded.unscheduled_tasks
  };
};

const upsertDailyPlan = async (userId, planDate, planId, schedule, isReplan = false) => {
  const payload = encodePlanPayload(schedule.schedule, schedule.unscheduled_tasks || []);
  const replanClause = isReplan ? ', last_replanned_at = NOW()' : '';
  await pool.query(
    `INSERT INTO daily_plans (id, user_id, date, plan_blocks, reasoning, generated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, date) DO UPDATE SET
      plan_blocks = EXCLUDED.plan_blocks,
      reasoning = EXCLUDED.reasoning,
      generated_at = COALESCE(daily_plans.generated_at, NOW())${replanClause}`,
    [planId, userId, planDate, JSON.stringify(payload), schedule.reasoning]
  );
  const saved = await pool.query(
    'SELECT id, plan_blocks, reasoning FROM daily_plans WHERE user_id = $1 AND date = $2',
    [userId, planDate]
  );
  return saved.rows[0];
};

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
    sendServerError(res, 'auth/signup', err);
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
    res.json({ user: toPublicUser(user), token });
  } catch (err) {
    sendServerError(res, 'auth/login', err);
  }
});

app.post('/api/auth/verify-token', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ valid: true, user: toPublicUser(result.rows[0]) });
  } catch (err) {
    sendServerError(res, 'auth/verify-token', err);
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
    res.json({ user: toPublicUser(result.rows[0]) });
  } catch (err) {
    sendServerError(res, 'onboarding/complete', err);
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
    sendServerError(res, 'tasks/create', err);
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
    sendServerError(res, 'tasks/list', err);
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
    sendServerError(res, 'tasks/update', err);
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
    sendServerError(res, 'tasks/delete', err);
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
    sendServerError(res, 'tasks/complete', err);
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
    sendServerError(res, 'calendar/list', err);
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
    sendServerError(res, 'calendar/create', err);
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
    sendServerError(res, 'calendar/delete', err);
  }
});
// ============================================
// AI SCHEDULING (Core Feature)
// ============================================

const scheduler = require('./planora_scheduler');

const OPENROUTER_SCHEDULER_CONFIG = {
  url: OPENROUTER_URL,
  model: OPENROUTER_FREE_MODEL,
  timeoutMs: OPENROUTER_TIMEOUT_MS
};

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

const fetchOpenRouterSchedule = async (ctx) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_SCHEDULER_CONFIG.timeoutMs);

  try {
    const response = await fetch(OPENROUTER_SCHEDULER_CONFIG.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_SCHEDULER_CONFIG.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: scheduler.buildSchedulePrompt(ctx) }]
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

const runPlanScheduling = async (tasks, { available_from, available_until, energy_today, user, calendar_events }) => {
  const ctx = scheduler.buildSchedulingContext({
    available_from,
    available_until,
    wake_time: user.wake_time,
    sleep_time: user.sleep_time,
    max_focus_session: user.max_focus_session,
    preferred_break_duration: user.preferred_break_duration,
    typical_energy: user.typical_energy,
    energy_today,
    preferred_study_hours: user.preferred_study_hours,
    calendar_events,
    tasks
  });

  return scheduler.generateSchedule(ctx, {
    fetchOpenRouter: process.env.OPENROUTER_API_KEY ? fetchOpenRouterSchedule : null,
    log: (message) => console.error(message)
  });
};

// Backward-compatible wrappers for existing tests
const clipAvailableWindow = scheduler.clipAvailableWindow;
const validateNormalizedSchedule = (blocks, tasksToSchedule, availableFrom, availableUntil, maxFocus, busyIntervals) => {
  const ctx = scheduler.buildSchedulingContext({
    available_from: availableFrom,
    available_until: availableUntil,
    max_focus_session: maxFocus,
    calendar_events: [],
    tasks: tasksToSchedule
  });
  ctx.effective_from = availableFrom;
  ctx.effective_until = availableUntil;
  ctx.effective_from_minutes = scheduler.parseMinutes(availableFrom);
  ctx.effective_until_minutes = scheduler.parseMinutes(availableUntil);
  ctx.busy_intervals = busyIntervals;
  return scheduler.validateSchedule(blocks, ctx);
};

const generateDeterministicSchedule = (tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals = []) => {
  const window = scheduler.clipAvailableWindow(
    availableFrom,
    availableUntil,
    userPreferences.wake_time,
    userPreferences.sleep_time
  );
  const ctx = scheduler.buildSchedulingContext({
    available_from: availableFrom,
    available_until: availableUntil,
    wake_time: userPreferences.wake_time,
    sleep_time: userPreferences.sleep_time,
    max_focus_session: userPreferences.max_focus_session,
    preferred_break_duration: userPreferences.preferred_break_duration,
    typical_energy: userPreferences.typical_energy,
    energy_today: energyLevel,
    preferred_study_hours: userPreferences.preferred_study_hours,
    calendar_events: (busyIntervals || []).map((interval) => ({
      title: interval.title,
      type: interval.type,
      start_datetime: `1970-01-01T${scheduler.minutesToTime(interval.start)}:00`,
      end_datetime: `1970-01-01T${scheduler.minutesToTime(interval.end)}:00`
    })),
    tasks: tasksToSchedule
  });
  return scheduler.generateDeterministicSchedule(ctx);
};

const generateSchedule = async (tasksToSchedule, availableFrom, availableUntil, energyLevel, userPreferences, busyIntervals = []) =>
  runPlanScheduling(tasksToSchedule, {
    available_from: availableFrom,
    available_until: availableUntil,
    energy_today: energyLevel,
    user: userPreferences,
    calendar_events: (busyIntervals || []).map((interval) => ({
      title: interval.title,
      type: interval.type,
      start_datetime: `1970-01-01T${scheduler.minutesToTime(interval.start)}:00`,
      end_datetime: `1970-01-01T${scheduler.minutesToTime(interval.end)}:00`
    }))
  });

app.post('/api/plan/generate-today', authMiddleware, async (req, res) => {
  try {
    const { available_from, available_until, energy_today, include_calendar } = req.body;
    if (!available_from || !available_until || !energy_today) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Get user preferences
    const userResult = await pool.query(
      `SELECT wake_time, sleep_time, preferred_study_hours, preferred_break_duration, max_focus_session, typical_energy
       FROM users WHERE id = $1`,
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
    const today = new Date().toISOString().split('T')[0];
    const planId = generateId();

    if (tasks.length === 0) {
      const emptySchedule = {
        schedule: [],
        unscheduled_tasks: [],
        reasoning: 'No pending tasks for today.'
      };
      const saved = await upsertDailyPlan(req.userId, today, planId, emptySchedule, false);
      return res.json({ plan: toPlanResponse(saved) });
    }

    const calendarEvents = await loadTodayCalendarEvents(req.userId);

    const schedule = await runPlanScheduling(tasks, {
      available_from,
      available_until,
      energy_today,
      user,
      calendar_events: calendarEvents
    });

    const saved = await upsertDailyPlan(req.userId, today, planId, schedule, false);
    res.json({ plan: toPlanResponse(saved) });
  } catch (err) {
    sendServerError(res, 'plan/generate-today', err, 'Failed to generate plan');
  }
});

app.post('/api/plan/replan', authMiddleware, async (req, res) => {
  try {
    const { date, unfinished_tasks, available_from, available_until, energy_today } = req.body;

    const userResult = await pool.query(
      `SELECT wake_time, sleep_time, preferred_study_hours, preferred_break_duration, max_focus_session, typical_energy
       FROM users WHERE id = $1`,
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
    const planDate = date || new Date().toISOString().split('T')[0];
    const planId = generateId();

    if (tasks.length === 0) {
      const emptySchedule = {
        schedule: [],
        unscheduled_tasks: [],
        reasoning: 'All tasks completed!'
      };
      const saved = await upsertDailyPlan(req.userId, planDate, planId, emptySchedule, true);
      return res.json({ plan: toPlanResponse(saved) });
    }

    const calendarEvents = await loadTodayCalendarEvents(req.userId);

    const schedule = await runPlanScheduling(tasks, {
      available_from,
      available_until,
      energy_today,
      user,
      calendar_events: calendarEvents
    });

    const saved = await upsertDailyPlan(req.userId, planDate, planId, schedule, true);
    res.json({ plan: toPlanResponse(saved) });
  } catch (err) {
    sendServerError(res, 'plan/replan', err, 'Failed to replan');
  }
});

app.get('/api/plan/today', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT id, plan_blocks, reasoning FROM daily_plans WHERE user_id = $1 AND date = $2',
      [req.userId, today]
    );

    if (result.rows.length === 0) {
      return res.json({ plan: null });
    }

    res.json({ plan: toPlanResponse(result.rows[0]) });
  } catch (err) {
    sendServerError(res, 'plan/today', err);
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
    sendServerError(res, 'analytics/progress', err);
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

module.exports = {
  app,
  pool,
  initDb,
  toPublicUser,
  toPlanResponse,
  decodePlanPayload,
  validateNormalizedSchedule,
  generateDeterministicSchedule,
  generateSchedule,
  runPlanScheduling,
  sanitizeErrorMessage,
  resolveJwtSecret,
  resolveCorsOrigins,
  scheduler
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});
