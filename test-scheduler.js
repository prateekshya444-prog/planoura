/**
 * Scheduler unit tests for Planora trustworthy scheduling engine.
 * Run: node test-scheduler.js
 */

const assert = require('assert');
const scheduler = require('./planora_scheduler');

const task = (id, title, duration, overrides = {}) => ({
  id,
  title,
  estimated_duration: duration,
  priority: 'medium',
  energy_required: 'medium',
  category: 'study',
  created_at: overrides.created_at || '2026-08-01T00:00:00Z',
  due_date: overrides.due_date || null,
  ...overrides
});

const baseCtx = (overrides = {}) => scheduler.buildSchedulingContext({
  available_from: '07:00',
  available_until: '23:00',
  wake_time: '08:00',
  sleep_time: '22:00',
  max_focus_session: 45,
  preferred_break_duration: 10,
  typical_energy: 'medium',
  energy_today: 'medium',
  preferred_study_hours: null,
  calendar_events: [],
  tasks: [],
  plan_date: '2026-08-14',
  ...overrides
});

const calendarEvent = (title, start, end) => ({
  title,
  type: 'appointment',
  start_datetime: `2026-08-14T${start}:00`,
  end_datetime: `2026-08-14T${end}:00`
});

const assertValid = (result, ctx) => {
  assert(scheduler.validateSchedule(result.schedule, ctx), 'schedule must pass validation');
};

const sumTaskMinutes = (blocks, taskId) =>
  blocks.filter((b) => b.type === 'task' && String(b.task_id) === String(taskId))
    .reduce((sum, b) => sum + b.duration_minutes, 0);

const run = async () => {
console.log('--- Preferences: wake/sleep clipping ---');
{
  const ctx = baseCtx();
  assert.equal(ctx.effective_from, '08:00');
  assert.equal(ctx.effective_until, '22:00');
}

console.log('--- Calendar: single event ---');
{
  const events = [calendarEvent('Class', '10:00', '11:00')];
  const ctx = baseCtx({
    calendar_events: events,
    tasks: [task('t1', 'Reading', 30)]
  });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assertValid(result, ctx);
  assert(result.schedule.some((b) => b.type === 'task'));
  assert(!result.schedule.some((b) => {
    const start = scheduler.parseMinutes(b.start);
    const end = scheduler.parseMinutes(b.end);
    return start < 600 && end > 600;
  }), 'task must not overlap 10:00 appointment');
}

console.log('--- Calendar: overlapping events merged ---');
{
  const events = [
    calendarEvent('A', '10:00', '10:45'),
    calendarEvent('B', '10:30', '11:15')
  ];
  const ctx = baseCtx({ calendar_events: events });
  assert.equal(ctx.busy_intervals.length, 1);
  assert.equal(ctx.busy_intervals[0].start, 600);
  assert.equal(ctx.busy_intervals[0].end, 675);
}

console.log('--- Calendar: entire day blocked ---');
{
  const events = [calendarEvent('All day', '08:00', '22:00')];
  const ctx = baseCtx({
    calendar_events: events,
    tasks: [task('t1', 'Essay', 60)]
  });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assert.equal(result.schedule.filter((b) => b.type === 'task').length, 0);
  assert.equal(result.unscheduled_tasks.length, 1);
  assert.equal(result.unscheduled_tasks[0].reason, scheduler.UNSCHEDULED_REASONS.BLOCKED_BY_CALENDAR);
}

console.log('--- Task splitting: 90 min task, 45 max focus ---');
{
  const biology = task('bio', 'Biology', 90, { priority: 'high' });
  const ctx = baseCtx({ tasks: [biology], max_focus_session: 45, preferred_break_duration: 10 });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assertValid(result, ctx);
  const bioBlocks = result.schedule.filter((b) => b.task_id === 'bio');
  assert(bioBlocks.length >= 2, 'Biology should be split');
  assert(bioBlocks.every((b) => b.duration_minutes <= 45));
  assert.equal(sumTaskMinutes(result.schedule, 'bio'), 90);
  assert(result.reasoning.includes('split'), 'reasoning should mention split');
}

console.log('--- Partial fit ---');
{
  const ctx = baseCtx({
    available_from: '09:00',
    available_until: '10:00',
    wake_time: '09:00',
    sleep_time: '22:00',
    max_focus_session: 60,
    tasks: [task('long', 'Long task', 90)]
  });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assertValid(result, ctx);
  assert.equal(sumTaskMinutes(result.schedule, 'long'), 60);
  const unscheduled = result.unscheduled_tasks.find((u) => u.task_id === 'long');
  assert(unscheduled);
  assert.equal(unscheduled.remaining_duration, 30);
  assert.equal(unscheduled.scheduled_duration, 60);
}

console.log('--- Calendar gap: focus resets across commitment ---');
{
  const today = new Date().toISOString().slice(0, 10);
  const ctx = baseCtx({
    available_from: '09:00',
    available_until: '17:00',
    wake_time: '08:00',
    sleep_time: '22:00',
    max_focus_session: 45,
    preferred_break_duration: 15,
    calendar_events: [{
      title: 'Lecture',
      start_datetime: `${today}T14:00:00`,
      end_datetime: `${today}T15:00:00`
    }],
    tasks: [task('huge', 'Huge task', 480, { priority: 'high', energy_required: 'high' })]
  });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assertValid(result, ctx);
  assert(result.schedule.length > 0, 'should schedule across windows separated by calendar commitment');
  assert(sumTaskMinutes(result.schedule, 'huge') > 0, 'huge task should be partially scheduled');
  const unscheduled = result.unscheduled_tasks.find((u) => u.task_id === 'huge');
  assert(unscheduled, 'huge task should remain partially unscheduled');
}

console.log('--- Prioritization: overdue first ---');
{
  const overdue = task('o', 'Overdue', 20, { due_date: '2026-08-10', priority: 'low' });
  const normal = task('n', 'Normal', 20, { due_date: '2026-08-20', priority: 'high' });
  const sorted = scheduler.sortTasksDeterministically([normal, overdue], baseCtx());
  assert.equal(sorted[0].id, 'o');
}

console.log('--- Prioritization: stable tie-breaker ---');
{
  const a = task('a', 'A', 30, { created_at: '2026-08-02T00:00:00Z' });
  const b = task('b', 'B', 30, { created_at: '2026-08-01T00:00:00Z' });
  const sorted = scheduler.sortTasksDeterministically([a, b], baseCtx());
  assert.equal(sorted[0].id, 'b');
}

console.log('--- Preferred study hours parsing ---');
{
  const ranges = scheduler.parsePreferredStudyHourRanges('mornings 09:00-12:00 and 14:00 to 16:00');
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].from, 540);
  assert.equal(ranges[1].until, 960);
  const ambiguous = scheduler.parsePreferredStudyHourRanges('evenings only');
  assert.equal(ambiguous.length, 0);
}

console.log('--- AI validation: outside window ---');
{
  const t = task('t1', 'Math', 30);
  const ctx = baseCtx({ tasks: [t] });
  const invalid = [{
    start: '07:00', end: '07:30', type: 'task', task_id: 't1', title: 'Math'
  }];
  assert.equal(scheduler.validateSchedule(invalid, ctx), false);
}

console.log('--- AI validation: calendar collision ---');
{
  const events = [calendarEvent('Meeting', '10:00', '11:00')];
  const ctx = baseCtx({ calendar_events: events, tasks: [task('t1', 'Math', 30)] });
  const invalid = [{
    start: '10:15', end: '10:45', type: 'task', task_id: 't1', title: 'Math'
  }];
  assert.equal(scheduler.validateSchedule(invalid, ctx), false);
}

console.log('--- AI validation: overlapping blocks ---');
{
  const ctx = baseCtx({ tasks: [task('t1', 'Math', 60)] });
  const invalid = [
    { start: '09:00', end: '09:30', type: 'task', task_id: 't1', title: 'Math' },
    { start: '09:15', end: '09:45', type: 'task', task_id: 't1', title: 'Math' }
  ];
  assert.equal(scheduler.validateSchedule(invalid, ctx), false);
}

console.log('--- AI validation: excessive focus ---');
{
  const ctx = baseCtx({ tasks: [task('t1', 'Math', 60)], max_focus_session: 45 });
  const invalid = [{
    start: '09:00', end: '10:00', type: 'task', task_id: 't1', title: 'Math'
  }];
  assert.equal(scheduler.validateSchedule(invalid, ctx), false);
}

console.log('--- AI validation: unknown task id ---');
{
  const ctx = baseCtx({ tasks: [task('t1', 'Math', 30)] });
  const normalized = scheduler.normalizeSchedule({
    schedule: [{ start: '09:00', end: '09:30', type: 'task', task_id: 'unknown', title: 'X' }],
    reasoning: 'test'
  }, ctx);
  assert.equal(normalized, null);
}

console.log('--- AI validation: duplicate duration ---');
{
  const ctx = baseCtx({ tasks: [task('t1', 'Math', 30)] });
  const invalid = [
    { start: '09:00', end: '09:20', type: 'task', task_id: 't1', title: 'Math' },
    { start: '09:25', end: '09:45', type: 'task', task_id: 't1', title: 'Math' }
  ];
  assert.equal(scheduler.validateSchedule(invalid, ctx), false);
}

console.log('--- AI fallback on invalid schedule ---');
{
  const t = task('t1', 'Math', 30);
  const ctx = baseCtx({ tasks: [t] });
  const fallback = scheduler.generateDeterministicSchedule(ctx);
  const result = await scheduler.generateSchedule(ctx, {
    fetchOpenRouter: async () => ({
      schedule: [{ start: '07:00', end: '07:30', type: 'task', task_id: 't1', title: 'Math' }],
      reasoning: 'bad ai'
    })
  });
  assertValid(result, ctx);
  assert.equal(sumTaskMinutes(result.schedule, 't1'), 30);
}

console.log('--- Zero tasks ---');
{
  const ctx = baseCtx({ tasks: [] });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assert.equal(result.schedule.length, 0);
  assert.equal(result.unscheduled_tasks.length, 0);
  assert(scheduler.validateSchedule([], ctx));
}

console.log('--- Invalid task duration ---');
{
  const ctx = baseCtx({ tasks: [task('bad', 'Bad', 0)] });
  const result = scheduler.generateDeterministicSchedule(ctx);
  assert.equal(result.unscheduled_tasks.length, 1);
  assert.equal(result.unscheduled_tasks[0].reason, scheduler.UNSCHEDULED_REASONS.INVALID_TASK_DURATION);
}

console.log('\nAll scheduler tests passed.');
};

run().catch((err) => {
  console.error('SCHEDULER TEST FAILURE:', err);
  process.exitCode = 1;
});
