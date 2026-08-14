/**
 * Planora scheduling engine — unified constraint model for deterministic + OpenRouter paths.
 *
 * preferred_study_hours: only explicit HH:MM–HH:MM ranges are used as soft placement hints
 * in the deterministic scheduler. Ambiguous free-text is passed to OpenRouter only and never
 * treated as a hard constraint.
 */

const SCHEDULE_TYPES = new Set(['task', 'break', 'buffer']);
const MIN_BLOCK_MINUTES = 5;

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

const padTime = (hours, minutes) =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

const parseMinutes = (value) => {
  if (value == null || value === '') return null;
  let text = String(value).trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    text = padTime(value.getHours(), value.getMinutes());
  }
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
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

const toDateKey = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
  }
  return date.toISOString().slice(0, 10);
};

/**
 * Parse only explicit clock ranges from preferred_study_hours free text.
 * Examples: "09:00-12:00", "9:00 to 11:30", "morning 14:00–16:00"
 * Ambiguous phrases without clock times are ignored for hard scheduling.
 */
const parsePreferredStudyHourRanges = (text) => {
  if (!text || typeof text !== 'string') return [];
  const ranges = [];
  const pattern = /(\d{1,2}):(\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const from = Number(match[1]) * 60 + Number(match[2]);
    const until = Number(match[3]) * 60 + Number(match[4]);
    if (until > from) ranges.push({ from, until });
  }
  return ranges;
};

const clipAvailableWindow = (availableFrom, availableUntil, wakeTime, sleepTime) => {
  const from = parseMinutes(availableFrom);
  const until = parseMinutes(availableUntil);
  if (from == null || until == null || until <= from) {
    return { from: availableFrom, until: availableUntil };
  }

  let clippedFrom = from;
  let clippedUntil = until;
  const wake = parseMinutes(wakeTime);
  const sleep = parseMinutes(sleepTime);
  // Same-day wake→sleep only. Overnight ranges are ambiguous in the existing schema.
  if (wake != null && sleep != null && wake < sleep) {
    clippedFrom = Math.max(clippedFrom, wake);
    clippedUntil = Math.min(clippedUntil, sleep);
  }

  if (clippedUntil <= clippedFrom) {
    return { from: availableFrom, until: availableUntil };
  }
  return { from: minutesToTime(clippedFrom), until: minutesToTime(clippedUntil) };
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

const windowOverlapsStudyRange = (window, studyRanges) =>
  (studyRanges || []).some((range) => window.start < range.until && window.end > range.from);

const buildUnscheduledTask = (task, reason, durations = {}) => {
  const required = durations.required ?? (Number(task.estimated_duration) || 0);
  const scheduled = durations.scheduled ?? 0;
  const remaining = durations.remaining ?? Math.max(0, required - scheduled);
  const entry = {
    task_id: task.id,
    title: task.title,
    reason,
    message: UNSCHEDULED_MESSAGES[reason] || 'Could not be scheduled',
    required_duration: required,
    scheduled_duration: scheduled,
    remaining_duration: remaining
  };
  if (scheduled > 0 && remaining > 0) {
    entry.message = `${UNSCHEDULED_MESSAGES[reason] || 'Could not be scheduled'} (${scheduled}/${required} min scheduled)`;
  }
  return entry;
};

const buildSchedulingContext = ({
  available_from,
  available_until,
  wake_time,
  sleep_time,
  max_focus_session,
  preferred_break_duration,
  typical_energy,
  energy_today,
  preferred_study_hours,
  calendar_events,
  tasks,
  plan_date
}) => {
  const window = clipAvailableWindow(available_from, available_until, wake_time, sleep_time);
  const effectiveFromMinutes = parseMinutes(window.from);
  const effectiveUntilMinutes = parseMinutes(window.until);
  const busyIntervals = toBusyIntervals(calendar_events, window.from, window.until);
  const free = (effectiveFromMinutes != null && effectiveUntilMinutes != null)
    ? freeWindows(effectiveFromMinutes, effectiveUntilMinutes, busyIntervals)
    : [];
  const studyRanges = parsePreferredStudyHourRanges(preferred_study_hours);

  return {
    requested_from: available_from,
    requested_until: available_until,
    effective_from: window.from,
    effective_until: window.until,
    effective_from_minutes: effectiveFromMinutes,
    effective_until_minutes: effectiveUntilMinutes,
    wake_time,
    sleep_time,
    max_focus_session: Number(max_focus_session) > 0 ? Number(max_focus_session) : 90,
    preferred_break_duration: Number(preferred_break_duration) > 0 ? Number(preferred_break_duration) : 15,
    typical_energy: typical_energy || 'medium',
    energy_today: energy_today || typical_energy || 'medium',
    preferred_study_hours: preferred_study_hours || null,
    preferred_study_hour_ranges: studyRanges,
    calendar_events: calendar_events || [],
    busy_intervals: busyIntervals,
    free_windows: free,
    tasks: tasks || [],
    plan_date: plan_date || new Date().toISOString().slice(0, 10),
    min_block_minutes: MIN_BLOCK_MINUTES
  };
};

const validateSchedule = (blocks, ctx) => {
  if (!Array.isArray(blocks)) return false;
  if (blocks.length === 0) return (ctx.tasks || []).length === 0;

  const from = ctx.effective_from_minutes;
  const until = ctx.effective_until_minutes;
  const focusLimit = ctx.max_focus_session;
  const allowedDuration = {};
  const knownIds = new Set();
  for (const task of ctx.tasks || []) {
    allowedDuration[String(task.id)] = Number(task.estimated_duration) || 0;
    knownIds.add(String(task.id));
  }

  const scheduledDuration = {};
  let consecutiveFocus = 0;
  let previousEnd = null;

  for (const block of blocks) {
    const type = String(block.type || '').toLowerCase();
    if (!SCHEDULE_TYPES.has(type)) return false;

    const start = parseMinutes(block.start || block.start_time);
    const end = parseMinutes(block.end || block.end_time);
    if (start == null || end == null || end <= start) return false;
    if (previousEnd != null && start < previousEnd) return false;
    previousEnd = end;

    if (from != null && start < from) return false;
    if (until != null && end > until) return false;
    if (blockOverlapsBusy(start, end, ctx.busy_intervals)) return false;

    const duration = end - start;
    if (type === 'task') {
      if (!block.task_id || !knownIds.has(String(block.task_id))) return false;
      if (duration > focusLimit) return false;
      consecutiveFocus += duration;
      if (consecutiveFocus > focusLimit) return false;
      const id = String(block.task_id);
      scheduledDuration[id] = (scheduledDuration[id] || 0) + duration;
      if (scheduledDuration[id] > (allowedDuration[id] || 0)) return false;
    } else if (type === 'break' || type === 'buffer') {
      consecutiveFocus = 0;
    }
  }
  return true;
};

const scheduledMinutesByTask = (blocks) => {
  const totals = {};
  for (const block of blocks || []) {
    if (block.type !== 'task' || !block.task_id) continue;
    const start = parseMinutes(block.start || block.start_time);
    const end = parseMinutes(block.end || block.end_time);
    if (start == null || end == null) continue;
    const id = String(block.task_id);
    totals[id] = (totals[id] || 0) + (end - start);
  }
  return totals;
};

const buildUnscheduledFromSchedule = (blocks, tasks, defaultReason = UNSCHEDULED_REASONS.NOT_ENOUGH_TIME) => {
  const totals = scheduledMinutesByTask(blocks);
  const unscheduled = [];
  for (const task of tasks || []) {
    const required = Number(task.estimated_duration) || 0;
    const scheduled = totals[String(task.id)] || 0;
    if (scheduled >= required) continue;
    const reason = scheduled === 0 ? defaultReason : UNSCHEDULED_REASONS.NOT_ENOUGH_TIME;
    unscheduled.push(buildUnscheduledTask(task, reason, {
      required,
      scheduled,
      remaining: required - scheduled
    }));
  }
  return unscheduled;
};

const sortTasksDeterministically = (tasks, ctx) => {
  const today = ctx.plan_date;
  const priorityMap = { high: 1, medium: 2, low: 3 };
  const energyLevel = ctx.energy_today;

  const energyMatch = (taskEnergy, userEnergy) => {
    if (taskEnergy === userEnergy) return 0;
    if (userEnergy === 'high') return 1;
    if (userEnergy === 'medium' && taskEnergy === 'low') return 0.5;
    return 2;
  };

  return [...tasks].sort((a, b) => {
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
    const durationDiff = Number(b.estimated_duration || 0) - Number(a.estimated_duration || 0);
    if (durationDiff !== 0) return durationDiff;
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.id).localeCompare(String(b.id));
  });
};

const orderWindowsForPlacement = (windows, studyRanges) => {
  if (!studyRanges.length) return [...windows];
  return [...windows].sort((a, b) => {
    const aPref = windowOverlapsStudyRange(a, studyRanges) ? 0 : 1;
    const bPref = windowOverlapsStudyRange(b, studyRanges) ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    return a.start - b.start;
  });
};

const buildScheduleBlock = (start, end, title, taskId, category, type) => ({
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

const buildDeterministicReasoning = (ctx, sortedTasks, schedule, unscheduledTasks, splitTitles, calendarNotes) => {
  const parts = [];
  if (sortedTasks.length > 0) {
    const first = sortedTasks[0];
    const due = toDateKey(first.due_date);
    if (due && due < ctx.plan_date) {
      parts.push(`Scheduled ${first.title} first because it is overdue.`);
    } else if (first.priority === 'high') {
      parts.push(`Scheduled ${first.title} first because it is high priority.`);
    }
  }
  for (const note of calendarNotes) parts.push(note);
  for (const title of splitTitles) {
    parts.push(`${title} was split into multiple focus sessions to respect your ${ctx.max_focus_session}-minute focus limit.`);
  }
  for (const entry of unscheduledTasks) {
    if (entry.reason === UNSCHEDULED_REASONS.INVALID_TASK_DURATION) {
      parts.push(`${entry.title} has an invalid duration and was not scheduled.`);
    } else if (entry.scheduled_duration > 0) {
      parts.push(`${entry.title} was partially scheduled (${entry.scheduled_duration}/${entry.required_duration} min); the rest could not fit.`);
    } else {
      parts.push(`${entry.title} could not fit in the remaining available time.`);
    }
  }
  if (parts.length === 0 && schedule.length > 0) {
    parts.push('Scheduled tasks by deadline, priority, energy match, and available time.');
  }
  if (parts.length === 0) {
    parts.push('No tasks could be scheduled in the available window.');
  }
  return parts.slice(0, 6).join(' ');
};

const generateDeterministicSchedule = (ctx) => {
  const {
    effective_from_minutes: startMinutes,
    effective_until_minutes: endMinutes,
    max_focus_session: maxFocus,
    preferred_break_duration: breakMinutes,
    busy_intervals: busyIntervals,
    free_windows: baseWindows,
    tasks: tasksToSchedule,
    preferred_study_hour_ranges: studyRanges,
    min_block_minutes: minBlock
  } = ctx;

  const sortedTasks = sortTasksDeterministically(tasksToSchedule, ctx);
  const calendarNotes = (busyIntervals || []).map((interval) =>
    `Your ${minutesToTime(interval.start)}–${minutesToTime(interval.end)} ${interval.title || 'appointment'} was treated as fixed time.`
  );

  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return {
      schedule: [],
      unscheduled_tasks: (tasksToSchedule || []).map((task) =>
        buildUnscheduledTask(task, UNSCHEDULED_REASONS.OUTSIDE_AVAILABLE_HOURS, {
          required: Number(task.estimated_duration) || 0,
          scheduled: 0,
          remaining: Number(task.estimated_duration) || 0
        })
      ),
      reasoning: 'The effective planning window is invalid, so no blocks were scheduled.'
    };
  }

  const windows = orderWindowsForPlacement(baseWindows, studyRanges);
  if (windows.length === 0) {
    return {
      schedule: [],
      unscheduled_tasks: (tasksToSchedule || []).map((task) =>
        buildUnscheduledTask(task, UNSCHEDULED_REASONS.BLOCKED_BY_CALENDAR, {
          required: Number(task.estimated_duration) || 0,
          scheduled: 0,
          remaining: Number(task.estimated_duration) || 0
        })
      ),
      reasoning: 'Calendar commitments block the entire available planning window.'
    };
  }

  const schedule = [];
  const taskState = new Map();
  for (const task of sortedTasks) {
    const required = Number(task.estimated_duration);
    if (!Number.isFinite(required) || required <= 0) {
      taskState.set(String(task.id), { task, remaining: 0, invalid: true });
      continue;
    }
    taskState.set(String(task.id), { task, remaining: required, invalid: false, placedAny: false, split: false });
  }

  const pushBlock = (start, end, title, taskId, category, type) => {
    schedule.push(buildScheduleBlock(start, end, title, taskId, category, type));
  };

  for (const window of windows) {
    let currentMinutes = window.start;
    let focusUsed = 0;

    for (const task of sortedTasks) {
      const state = taskState.get(String(task.id));
      if (!state || state.invalid || state.remaining <= 0) continue;

      while (state.remaining > 0) {
        const spaceLeft = window.end - currentMinutes;
        if (spaceLeft < minBlock) break;

        if (focusUsed > 0 && focusUsed >= maxFocus) {
          if (currentMinutes + breakMinutes + minBlock > window.end) break;
          const breakEnd = currentMinutes + breakMinutes;
          pushBlock(currentMinutes, breakEnd, 'Break', null, 'break', 'break');
          currentMinutes = breakEnd;
          focusUsed = 0;
          continue;
        }

        const chunk = Math.min(state.remaining, maxFocus - focusUsed, spaceLeft);
        if (chunk < minBlock && state.remaining >= minBlock) break;
        if (chunk <= 0) break;

        const taskEnd = currentMinutes + chunk;
        pushBlock(currentMinutes, taskEnd, state.task.title, state.task.id, state.task.category || 'other', 'task');
        currentMinutes = taskEnd;
        focusUsed += chunk;
        if (chunk < state.remaining) state.split = true;
        state.remaining -= chunk;
        state.placedAny = true;
      }
    }
  }

  const unscheduledMap = new Map();
  const splitTitles = [];
  for (const [id, state] of taskState) {
    if (state.invalid) {
      unscheduledMap.set(id, buildUnscheduledTask(state.task, UNSCHEDULED_REASONS.INVALID_TASK_DURATION));
      continue;
    }
    const required = Number(state.task.estimated_duration) || 0;
    const scheduled = required - state.remaining;
    if (state.split) splitTitles.push(state.task.title);
    if (state.remaining > 0) {
      const reason = scheduled > 0
        ? UNSCHEDULED_REASONS.NOT_ENOUGH_TIME
        : (windows.length === 0 ? UNSCHEDULED_REASONS.BLOCKED_BY_CALENDAR : UNSCHEDULED_REASONS.NOT_ENOUGH_TIME);
      unscheduledMap.set(id, buildUnscheduledTask(state.task, reason, {
        required,
        scheduled,
        remaining: state.remaining
      }));
    }
  }

  const unscheduled_tasks = Array.from(unscheduledMap.values());
  const reasoning = buildDeterministicReasoning(ctx, sortedTasks, schedule, unscheduled_tasks, splitTitles, calendarNotes);

  if (schedule.length > 0 && !validateSchedule(schedule, ctx)) {
    return {
      schedule: [],
      unscheduled_tasks: (tasksToSchedule || []).map((task) =>
        buildUnscheduledTask(task, UNSCHEDULED_REASONS.NOT_ENOUGH_TIME, {
          required: Number(task.estimated_duration) || 0,
          scheduled: 0,
          remaining: Number(task.estimated_duration) || 0
        })
      ),
      reasoning: 'The deterministic scheduler could not produce a valid schedule; no blocks were saved.'
    };
  }

  return { schedule, unscheduled_tasks, reasoning };
};

const buildSchedulePrompt = (ctx) => {
  const calendarLines = (ctx.busy_intervals || []).length > 0
    ? ctx.busy_intervals.map((interval) =>
      `- ${minutesToTime(interval.start)}–${minutesToTime(interval.end)} "${interval.title || 'Commitment'}" (${interval.type || 'calendar'})`
    ).join('\n')
    : '- none';

  const studyHoursLine = ctx.preferred_study_hours
    ? (ctx.preferred_study_hour_ranges.length > 0
      ? `- Preferred study hours (soft preference): ${ctx.preferred_study_hour_ranges.map((r) => `${minutesToTime(r.from)}–${minutesToTime(r.until)}`).join(', ')}`
      : `- Preferred study hours note (soft preference only): ${ctx.preferred_study_hours}`)
    : '';

  return `You are an intelligent scheduling assistant for Planora, a student planner app.

EFFECTIVE PLANNING WINDOW (hard limits — every block must fit inside):
From: ${ctx.effective_from}
Until: ${ctx.effective_until}

Requested window: ${ctx.requested_from}–${ctx.requested_until}
Wake time: ${ctx.wake_time || 'unspecified'}
Sleep time: ${ctx.sleep_time || 'unspecified'}
Energy today: ${ctx.energy_today}

FIXED COMMITMENTS (occupied time — do NOT schedule anything during these):
${calendarLines}

These are calendar events. Do not schedule tasks, breaks, or buffers over them. Do not modify them. Do not overlap them.

TASKS TO SCHEDULE:
${ctx.tasks.map((t) => `- id:${t.id} "${t.title}" (${t.estimated_duration} min, priority: ${t.priority}, energy: ${t.energy_required}, due: ${t.due_date || 'no deadline'}, category: ${t.category || 'other'})`).join('\n')}

USER PREFERENCES:
- Typical energy: ${ctx.typical_energy}
- Max focus session: ${ctx.max_focus_session} minutes (no single task block may exceed this)
- Preferred break between focus chunks: ${ctx.preferred_break_duration} minutes
${studyHoursLine}

RULES:
1. Never schedule outside the effective planning window.
2. Never overlap FIXED COMMITMENTS.
3. Never create overlapping blocks.
4. Blocks must be in chronological order.
5. Prioritize: overdue → due date → priority → energy match → longer duration.
6. Split tasks longer than ${ctx.max_focus_session} minutes into multiple task blocks with breaks between focus chunks.
7. Preserve each task's total required duration — do not schedule more minutes than listed.
8. Every task block must reference a valid task id from the list above.
9. Only use block types: task, break, buffer.

RETURN ONLY VALID JSON (no markdown):
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
  "reasoning": "1-3 concise sentences explaining prioritization"
}`;
};

const normalizeSchedule = (parsed, ctx) => {
  if (!parsed || !Array.isArray(parsed.schedule)) return null;

  const knownTaskIds = new Set((ctx.tasks || []).map((task) => String(task.id)));
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
    if (type === 'task') {
      if (!taskId || !knownTaskIds.has(taskId)) return null;
    } else {
      taskId = null;
    }

    blocks.push(buildScheduleBlock(startMinutes, endMinutes, String(item.title), taskId, item.category || (type === 'task' ? 'other' : type), type));
  }

  if (blocks.length === 0 && (ctx.tasks || []).length > 0) return null;

  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
    ? parsed.reasoning.trim()
    : 'Schedule generated from your tasks, deadlines, energy, and available time.';

  return {
    schedule: blocks,
    reasoning,
    unscheduled_tasks: buildUnscheduledFromSchedule(blocks, ctx.tasks)
  };
};

const generateSchedule = async (ctx, { fetchOpenRouter, log } = {}) => {
  const logFn = log || (() => {});
  const fallback = generateDeterministicSchedule(ctx);

  if (!fetchOpenRouter) {
    logFn('OpenRouter not configured; using deterministic scheduler');
    return fallback;
  }

  try {
    const parsed = await fetchOpenRouter(ctx);
    const normalized = normalizeSchedule(parsed, ctx);
    if (!normalized) {
      logFn('OpenRouter returned unusable schedule data; using deterministic scheduler');
      return fallback;
    }
    if (!validateSchedule(normalized.schedule, ctx)) {
      logFn('OpenRouter schedule failed hard constraint validation; using deterministic scheduler');
      return fallback;
    }
    return {
      ...normalized,
      unscheduled_tasks: buildUnscheduledFromSchedule(normalized.schedule, ctx.tasks)
    };
  } catch (err) {
    logFn(`OpenRouter schedule generation failed; using deterministic scheduler: ${err && err.message ? err.message : err}`);
    return fallback;
  }
};

module.exports = {
  SCHEDULE_TYPES,
  MIN_BLOCK_MINUTES,
  UNSCHEDULED_REASONS,
  UNSCHEDULED_MESSAGES,
  parseMinutes,
  minutesToTime,
  parsePreferredStudyHourRanges,
  clipAvailableWindow,
  toBusyIntervals,
  freeWindows,
  buildSchedulingContext,
  validateSchedule,
  sortTasksDeterministically,
  buildUnscheduledTask,
  buildUnscheduledFromSchedule,
  generateDeterministicSchedule,
  normalizeSchedule,
  buildSchedulePrompt,
  generateSchedule,
  scheduledMinutesByTask
};
