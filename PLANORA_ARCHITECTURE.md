# PLANORA MVP - Architecture & Build Guide

## Framework-Agnostic Architecture

This document outlines the core architecture in a way that works with **any** backend framework (Node/Express, Python/Django, Rust/Axum, Go/Gin, etc.) and **any** frontend framework.

---

## Layer 1: Core Data Models

### User Model
```json
{
  "id": "uuid",
  "email": "string (unique)",
  "password_hash": "string",
  "name": "string",
  "wake_time": "HH:MM (24h)",
  "sleep_time": "HH:MM (24h)",
  "preferred_study_hours": "string (optional)",
  "preferred_break_duration": "number (minutes)",
  "max_focus_session": "number (minutes)",
  "typical_energy": "low | medium | high",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

### Task Model
```json
{
  "id": "uuid",
  "user_id": "uuid (FK)",
  "title": "string",
  "description": "string (optional)",
  "due_date": "YYYY-MM-DD (optional)",
  "due_time": "HH:MM (optional)",
  "estimated_duration": "number (minutes)",
  "priority": "low | medium | high",
  "energy_required": "low | medium | high",
  "category": "study | work | personal | health | errands | other",
  "completed_at": "ISO 8601 (null if incomplete)",
  "status": "pending | in_progress | completed",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

### Calendar Event Model
```json
{
  "id": "uuid",
  "user_id": "uuid (FK)",
  "title": "string",
  "type": "class | exam | appointment | work | personal",
  "start_datetime": "ISO 8601",
  "end_datetime": "ISO 8601",
  "is_recurring": "boolean",
  "recurrence_pattern": "string (optional, cron-like)",
  "created_at": "ISO 8601"
}
```

### Daily Plan Model
```json
{
  "id": "uuid",
  "user_id": "uuid (FK)",
  "date": "YYYY-MM-DD",
  "plan_blocks": [
    {
      "id": "string",
      "task_id": "uuid (nullable, for calendar events)",
      "title": "string",
      "category": "string",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "duration_minutes": "number",
      "priority": "low | medium | high",
      "completed": "boolean",
      "type": "task | event | break | buffer"
    }
  ],
  "reasoning": "string (brief explanation of prioritization)",
  "generated_at": "ISO 8601",
  "last_replanned_at": "ISO 8601 (optional)"
}
```

---

## Layer 2: Core APIs

### Authentication Endpoints

```
POST /api/auth/signup
Body: { email, password, name }
Response: { user, token }

POST /api/auth/login
Body: { email, password }
Response: { user, token }

POST /api/auth/logout
Headers: { Authorization: Bearer TOKEN }
Response: { success }

POST /api/auth/reset-password
Body: { email }
Response: { sent }

POST /api/auth/verify-token
Headers: { Authorization: Bearer TOKEN }
Response: { valid, user }
```

### Onboarding Endpoints

```
POST /api/onboarding/complete
Headers: { Authorization: Bearer TOKEN }
Body: {
  wake_time: "HH:MM",
  sleep_time: "HH:MM",
  preferred_study_hours: "string (optional)",
  preferred_break_duration: "number",
  max_focus_session: "number",
  typical_energy: "low | medium | high"
}
Response: { user }
```

### Task Endpoints

```
POST /api/tasks
Headers: { Authorization: Bearer TOKEN }
Body: { title, due_date, due_time, estimated_duration, priority, energy_required, category }
Response: { task }

GET /api/tasks
Headers: { Authorization: Bearer TOKEN }
Query: ?status=pending&date=YYYY-MM-DD
Response: { tasks[] }

PUT /api/tasks/:id
Headers: { Authorization: Bearer TOKEN }
Body: { title, due_date, ... (any field) }
Response: { task }

DELETE /api/tasks/:id
Headers: { Authorization: Bearer TOKEN }
Response: { deleted }

PATCH /api/tasks/:id/complete
Headers: { Authorization: Bearer TOKEN }
Response: { task (with completed_at) }
```

### Calendar Endpoints

```
GET /api/calendar
Headers: { Authorization: Bearer TOKEN }
Query: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Response: { events[] }

POST /api/calendar/events
Headers: { Authorization: Bearer TOKEN }
Body: { title, type, start_datetime, end_datetime, is_recurring, recurrence_pattern }
Response: { event }

DELETE /api/calendar/events/:id
Headers: { Authorization: Bearer TOKEN }
Response: { deleted }
```

### Planning Endpoints (Core Feature)

```
POST /api/plan/generate-today
Headers: { Authorization: Bearer TOKEN }
Body: {
  available_from: "HH:MM",
  available_until: "HH:MM",
  energy_today: "low | medium | high",
  include_calendar: "boolean"
}
Response: {
  plan: {
    id: "uuid",
    plan_blocks[],
    reasoning: "string"
  }
}

POST /api/plan/replan
Headers: { Authorization: Bearer TOKEN }
Body: {
  date: "YYYY-MM-DD",
  unfinished_tasks: ["task_id"],
  available_from: "HH:MM",
  available_until: "HH:MM",
  energy_today: "low | medium | high"
}
Response: {
  plan: {
    id: "uuid",
    plan_blocks[],
    reasoning: "string"
  }
}

GET /api/plan/today
Headers: { Authorization: Bearer TOKEN }
Response: { plan (or null) }
```

### Analytics Endpoints

```
GET /api/analytics/progress
Headers: { Authorization: Bearer TOKEN }
Query: ?range=week | month
Response: {
  tasks_completed: number,
  tasks_total: number,
  planned_hours: number,
  completed_hours: number,
  days_planned: number,
  insights: [
    { label: "string", value: "string" }
  ]
}
```

---

## Layer 3: AI Scheduling Logic

### AI Scheduler Interface (Language-Agnostic)

The scheduling algorithm should accept this input and produce optimized output:

```
INPUT:
{
  available_blocks: [
    { start: "HH:MM", end: "HH:MM", date: "YYYY-MM-DD" }
  ],
  tasks: [
    {
      id, title, due_date, due_time, duration, priority,
      energy_required, category, is_overdue
    }
  ],
  calendar_events: [
    { start, end, title, type }
  ],
  user_energy: "low | medium | high",
  user_preferences: {
    max_focus_session: number,
    preferred_break_duration: number,
    avoid_context_switching: boolean
  }
}

ALGORITHM:
1. Classify tasks by urgency:
   - Tier 1: Overdue (do today)
   - Tier 2: Due tomorrow/soon (prioritize)
   - Tier 3: High priority
   - Tier 4: Medium priority
   - Tier 5: Low priority / flexible

2. For each tier, sort by:
   a) Duration (longer tasks first)
   b) Energy match (match task energy to current energy level)
   c) Deadline proximity

3. Place tasks into available blocks:
   - Respect max_focus_session (break after N minutes)
   - Add breaks between context switches
   - Avoid scheduling beyond available time
   - If tasks don't fit, move low-priority to next day

4. Output:
   {
     schedule: [
       { start, end, task_id, title, duration, type }
     ],
     unscheduled_tasks: [ { id, title, reason } ],
     reasoning: "string"
   }

OUTPUT:
{
  plan_blocks: [
    {
      start_time: "HH:MM",
      end_time: "HH:MM",
      task_id: "uuid or null",
      title: "string",
      type: "task | break | buffer",
      category: "string"
    }
  ],
  unscheduled: [
    { id, title, reason: "not enough time | moved to tomorrow" }
  ],
  reasoning: "string"
}
```

### Claude API Integration (for MVP)

```javascript
// Pseudocode for any backend framework

function generatePlan(input) {
  const prompt = `
    You are an intelligent scheduling assistant for a student planner called Planora.
    
    Available time blocks: ${formatTimeBlocks(input.available_blocks)}
    Current energy level: ${input.user_energy}
    
    Tasks to schedule:
    ${input.tasks.map(t => `- ${t.title} (${t.duration}min, due ${t.due_date}, priority: ${t.priority}, energy: ${t.energy_required})`).join('\n')}
    
    Calendar commitments:
    ${input.calendar_events.map(e => `- ${e.title} ${e.start} to ${e.end}`).join('\n')}
    
    User preferences:
    - Max focus session: ${input.user_preferences.max_focus_session} minutes
    - Preferred break: ${input.user_preferences.preferred_break_duration} minutes
    
    Rules:
    1. Prioritize: overdue > urgent deadlines > high priority > long tasks > energy-matched
    2. Never schedule more than available time allows
    3. Include reasonable breaks
    4. Avoid excessive context switching
    5. Respect calendar commitments
    
    Create a realistic daily schedule. Return ONLY valid JSON:
    {
      "schedule": [
        { "start": "HH:MM", "end": "HH:MM", "title": "string", "type": "task|break|buffer" }
      ],
      "reasoning": "Brief explanation of prioritization"
    }
  `;

  const response = await claudeAPI.call({
    model: "claude-opus",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }]
  });

  return parseSchedule(response.content);
}
```

---

## Layer 4: Security & Authorization

### Authentication
- Use **JWT tokens** (stateless, scalable)
- Store only `user_id` and `iat` in token
- Token expiry: 7 days
- Refresh tokens stored in httpOnly cookies (optional)

### Authorization
- All endpoints require valid JWT
- Verify `user_id` in token matches resource owner
- Example: `GET /api/tasks/:id` should verify user owns task

### Data Privacy
- Never expose password hashes
- Encrypt sensitive data at rest
- Use HTTPS only
- No API keys in frontend code
- Validate all inputs server-side

---

## Layer 5: Database Schema (SQL)

```sql
CREATE TABLE users (
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
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TIME,
  estimated_duration INTEGER NOT NULL, -- minutes
  priority VARCHAR(50) DEFAULT 'medium',
  energy_required VARCHAR(50) DEFAULT 'medium',
  category VARCHAR(50) DEFAULT 'other',
  completed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  start_datetime TIMESTAMP NOT NULL,
  end_datetime TIMESTAMP NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  plan_blocks JSONB NOT NULL,
  reasoning TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  last_replanned_at TIMESTAMP,
  UNIQUE(user_id, date)
);

CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_calendar_user ON calendar_events(user_id);
CREATE INDEX idx_plans_user_date ON daily_plans(user_id, date);
```

---

## Build Checklist

### Phase 1: Auth + Database Setup
- [ ] Database schema (PostgreSQL, MongoDB, SQLite, etc.)
- [ ] User sign up / login / logout
- [ ] JWT token generation & validation
- [ ] Password hashing (bcrypt or Argon2)
- [ ] Error handling (duplicate email, wrong password, etc.)

### Phase 2: Task CRUD
- [ ] Create task
- [ ] Read tasks (filtered by user, status, date)
- [ ] Update task
- [ ] Delete task
- [ ] Mark complete (updates completed_at)

### Phase 3: Today Dashboard
- [ ] Fetch today's plan (or null)
- [ ] Display task progress
- [ ] Real-time completion tracking
- [ ] UI showing tasks completed / remaining

### Phase 4: Calendar
- [ ] Create calendar events
- [ ] Fetch events for date range
- [ ] Delete events
- [ ] Validation (no overlapping events)

### Phase 5: AI Plan Generation
- [ ] Fetch user's tasks, calendar, availability
- [ ] Call Claude API with formatted prompt
- [ ] Parse response into plan blocks
- [ ] Save plan to daily_plans table
- [ ] Handle Claude API errors gracefully

### Phase 6: Replan
- [ ] Accept unfinished tasks + new availability
- [ ] Call scheduler with updated inputs
- [ ] Replace previous plan
- [ ] Show reasoning for changes

### Phase 7: Analytics
- [ ] Count completed tasks (this week/month)
- [ ] Calculate total planned/completed time
- [ ] Generate insights (productivity patterns)
- [ ] UI dashboard

### Phase 8: Notifications (Optional MVP)
- [ ] Scheduled notifications for task start times
- [ ] Browser notifications or email reminders
- [ ] User can disable per-task or globally

### Phase 9: Subscription (Optional MVP)
- [ ] Use Stripe or Lemonsqueezy for payments
- [ ] Track subscription status in users table
- [ ] Gate features behind Pro subscription
- [ ] Do NOT build this manually

### Phase 10: Deployment & Polish
- [ ] Environment variables (DB, API keys, etc.)
- [ ] Error handling & logging
- [ ] Rate limiting
- [ ] CORS configuration
- [ ] Testing (at least critical paths)
- [ ] Deploy to production

---

## Recommended Tech Stacks (Pick One)

### Option A: JavaScript/TypeScript (Easiest to iterate)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Frontend:** React + TypeScript + Tailwind
- **Deployment:** Vercel (frontend) + Railway/Render (backend)

### Option B: Python
- **Backend:** Python + FastAPI
- **Database:** PostgreSQL + SQLAlchemy
- **Frontend:** React (or Vue, Svelte)
- **Deployment:** Heroku or Railway

### Option C: Go
- **Backend:** Golang + Gin
- **Database:** PostgreSQL + gorm
- **Frontend:** React
- **Deployment:** Railway or DigitalOcean

### Option D: Rust
- **Backend:** Rust + Axum
- **Database:** PostgreSQL + sqlx
- **Frontend:** React
- **Deployment:** Railway or Fly.io

---

## Key Principles (Build Defensively)

1. **Do authentication correctly** — no shortcuts
2. **Validate all inputs** server-side
3. **Don't expose sensitive data** (password hashes, API keys)
4. **Use environment variables** for secrets
5. **Log important events** (auth, errors, AI calls)
6. **Handle errors gracefully** (don't crash on invalid input)
7. **Test the core loop** manually before optimizing

---

## Success Metrics (MVP)

✅ Users can sign up and log in
✅ Users can create and manage tasks
✅ Users can see today's plan
✅ AI generates a realistic schedule (using Claude)
✅ Users can replan when life changes
✅ No data leaks or auth issues
✅ Fast enough to use daily (< 2s response time)

That's it. If these work, ship it.
