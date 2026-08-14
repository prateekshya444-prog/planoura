/**
 * Focused API verification for security + reliability hardening.
 * Run: node test-api.js
 */

const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const {
  app,
  pool,
  initDb,
  toPublicUser,
  validateNormalizedSchedule,
  generateDeterministicSchedule,
  sanitizeErrorMessage,
  decodePlanPayload
} = require('./planora_backend_server');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

let server;
let baseUrl;

const request = (method, path, { token, body } = {}) => new Promise((resolve, reject) => {
  const url = new URL(path, baseUrl);
  const payload = body ? JSON.stringify(body) : null;
  const req = http.request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      let json = null;
      try {
        json = data ? JSON.parse(data) : null;
      } catch {
        json = data;
      }
      resolve({ status: res.statusCode, body: json, raw: data });
    });
  });
  req.on('error', reject);
  if (payload) req.write(payload);
  req.end();
});

const assertNoSecrets = (obj, label) => {
  const text = JSON.stringify(obj);
  assert(!text.includes('password_hash'), `${label} leaked password_hash`);
  assert(!text.includes('JWT_SECRET'), `${label} leaked JWT_SECRET`);
  if (OPENROUTER_KEY) {
    assert(!text.includes(OPENROUTER_KEY), `${label} leaked OPENROUTER_API_KEY`);
  }
};

const uniqueEmail = () => `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function run() {
  process.env.NODE_ENV = 'test';
  await initDb();

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  console.log('--- Authentication ---');

  const emailA = uniqueEmail();
  const signupA = await request('POST', '/api/auth/signup', {
    body: { email: emailA, password: 'password123', name: 'User A' }
  });
  assert.equal(signupA.status, 200, 'signup should succeed');
  assert(signupA.body.token, 'signup should return token');
  assertNoSecrets(signupA.body, 'signup');

  const loginA = await request('POST', '/api/auth/login', {
    body: { email: emailA, password: 'password123' }
  });
  assert.equal(loginA.status, 200, 'login should succeed');
  assertNoSecrets(loginA.body, 'login');
  assert.equal(loginA.body.user.password_hash, undefined, 'login must not return password_hash');

  const tokenA = loginA.body.token;
  const verifyA = await request('POST', '/api/auth/verify-token', { token: tokenA });
  assert.equal(verifyA.status, 200, 'verify-token should succeed');
  assertNoSecrets(verifyA.body, 'verify-token');

  const onboarding = await request('POST', '/api/onboarding/complete', {
    token: tokenA,
    body: {
      wake_time: '08:00',
      sleep_time: '22:00',
      preferred_study_hours: 'morning',
      preferred_break_duration: 15,
      max_focus_session: 60,
      typical_energy: 'medium'
    }
  });
  assert.equal(onboarding.status, 200, 'onboarding should succeed');
  assertNoSecrets(onboarding.body, 'onboarding');
  assert.equal(onboarding.body.user.password_hash, undefined, 'onboarding must not return password_hash');

  const emailB = uniqueEmail();
  const signupB = await request('POST', '/api/auth/signup', {
    body: { email: emailB, password: 'password123', name: 'User B' }
  });
  const tokenB = signupB.body.token;

  console.log('--- Task ownership ---');

  const taskA = await request('POST', '/api/tasks', {
    token: tokenA,
    body: { title: 'Task A', estimated_duration: 30, priority: 'high' }
  });
  assert.equal(taskA.status, 200);
  const taskAId = taskA.body.task.id;

  const readB = await request('GET', `/api/tasks`, { token: tokenB });
  assert.equal(readB.body.tasks.length, 0, 'user B should not see user A tasks');

  const updateB = await request('PUT', `/api/tasks/${taskAId}`, {
    token: tokenB,
    body: { title: 'Hijacked' }
  });
  assert.equal(updateB.status, 403, 'user B cannot update user A task');

  const deleteB = await request('DELETE', `/api/tasks/${taskAId}`, { token: tokenB });
  assert.equal(deleteB.status, 403, 'user B cannot delete user A task');

  console.log('--- Calendar ownership ---');

  const eventA = await request('POST', '/api/calendar/events', {
    token: tokenA,
    body: {
      title: 'Class',
      type: 'class',
      start_datetime: '2026-08-14T10:00:00',
      end_datetime: '2026-08-14T11:00:00'
    }
  });
  assert.equal(eventA.status, 200);
  const eventAId = eventA.body.event.id;

  const deleteEventB = await request('DELETE', `/api/calendar/events/${eventAId}`, { token: tokenB });
  assert.equal(deleteEventB.status, 403, 'user B cannot delete user A calendar event');

  console.log('--- Planning ---');

  const planBody = {
    available_from: '09:00',
    available_until: '17:00',
    energy_today: 'medium'
  };

  const generate = await request('POST', '/api/plan/generate-today', {
    token: tokenA,
    body: planBody
  });
  assert.equal(generate.status, 200, 'generate-today should succeed');
  assertNoSecrets(generate.body, 'generate-today');
  assert(generate.body.plan.id, 'plan should have id');
  assert(Array.isArray(generate.body.plan.plan_blocks), 'plan should have plan_blocks');
  assert(typeof generate.body.plan.reasoning === 'string', 'plan should have reasoning');
  assert(Array.isArray(generate.body.plan.unscheduled_tasks), 'plan should have unscheduled_tasks');

  const today = await request('GET', '/api/plan/today', { token: tokenA });
  assert.equal(today.status, 200);
  assert.equal(today.body.plan.id, generate.body.plan.id, 'GET today should return persisted plan');

  console.log('--- Replan (existing row) ---');

  const replanUpdate = await request('POST', '/api/plan/replan', {
    token: tokenA,
    body: planBody
  });
  assert.equal(replanUpdate.status, 200);
  assert(replanUpdate.body.plan.id, 'replan should return plan id');
  assert(Array.isArray(replanUpdate.body.plan.plan_blocks));

  const todayAfterReplan = await request('GET', '/api/plan/today', { token: tokenA });
  assert.equal(todayAfterReplan.body.plan.reasoning, replanUpdate.body.plan.reasoning);

  console.log('--- Replan (insert when no row) ---');

  await pool.query('DELETE FROM daily_plans WHERE user_id = $1', [loginA.body.user.id]);

  const replanInsert = await request('POST', '/api/plan/replan', {
    token: tokenA,
    body: planBody
  });
  assert.equal(replanInsert.status, 200);
  assert(replanInsert.body.plan.id, 'replan insert should return plan id');

  const todayAfterInsert = await request('GET', '/api/plan/today', { token: tokenA });
  assert(todayAfterInsert.body.plan, 'replan insert should persist plan');
  assert.equal(todayAfterInsert.body.plan.id, replanInsert.body.plan.id);

  console.log('--- Zero-task behavior ---');

  await pool.query('UPDATE tasks SET status = $1 WHERE user_id = $2', ['completed', loginA.body.user.id]);
  const zeroTask = await request('POST', '/api/plan/generate-today', {
    token: tokenA,
    body: planBody
  });
  assert.equal(zeroTask.status, 200);
  assert.equal(zeroTask.body.plan.plan_blocks.length, 0);
  const zeroToday = await request('GET', '/api/plan/today', { token: tokenA });
  assert(zeroToday.body.plan, 'zero-task plan should be persisted');

  console.log('--- Schedule validation unit checks ---');

  const tasks = [{ id: 't1', title: 'Math', estimated_duration: 30, priority: 'high', energy_required: 'medium' }];
  const invalidOutside = [{
    start: '08:00', end: '08:30', type: 'task', task_id: 't1', title: 'Math'
  }];
  assert.equal(
    validateNormalizedSchedule(invalidOutside, tasks, '09:00', '17:00', 60, []),
    false,
    'blocks outside window should be rejected'
  );

  const overlapping = [{
    start: '10:00', end: '10:30', type: 'task', task_id: 't1', title: 'Math'
  }];
  const busy = [{ start: 600, end: 660, title: 'Meeting', type: 'class' }];
  assert.equal(
    validateNormalizedSchedule(overlapping, tasks, '09:00', '17:00', 60, busy),
    false,
    'calendar collisions should be rejected'
  );

  const deterministic = generateDeterministicSchedule(
    [
      { id: 'big', title: 'Huge task', estimated_duration: 600, priority: 'high', energy_required: 'medium' },
      { id: 'small', title: 'Small task', estimated_duration: 15, priority: 'low', energy_required: 'low' }
    ],
    '09:00',
    '10:00',
    'medium',
    { max_focus_session: 60, preferred_break_duration: 15 }
  );
  assert(deterministic.unscheduled_tasks.length > 0, 'unscheduled tasks should be reported');

  const sanitized = sanitizeErrorMessage(new Error(`failed with key ${OPENROUTER_KEY || 'test-key'}`));
  if (OPENROUTER_KEY) {
    assert(!sanitized.includes(OPENROUTER_KEY), 'sanitizeErrorMessage should redact API key');
  }

  const decoded = decodePlanPayload({ blocks: [{ title: 'x' }], unscheduled_tasks: [{ task_id: '1' }] });
  assert.equal(decoded.blocks.length, 1);
  assert.equal(decoded.unscheduled_tasks.length, 1);

  const publicUser = toPublicUser({ id: '1', email: 'a@b.com', password_hash: 'secret' });
  assert.equal(publicUser.password_hash, undefined);

  console.log('--- Deterministic fallback (no OpenRouter key) ---');
  const prevKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  const emailC = uniqueEmail();
  const signupC = await request('POST', '/api/auth/signup', {
    body: { email: emailC, password: 'password123', name: 'User C' }
  });
  const tokenC = signupC.body.token;
  await request('POST', '/api/tasks', {
    token: tokenC,
    body: { title: 'Fallback task', estimated_duration: 25, priority: 'medium' }
  });
  const fallbackPlan = await request('POST', '/api/plan/generate-today', {
    token: tokenC,
    body: planBody
  });
  assert.equal(fallbackPlan.status, 200);
  assert(fallbackPlan.body.plan.plan_blocks.length >= 0);

  if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;

  console.log('--- Production JWT guard ---');
  await new Promise((resolve) => {
    const childEnv = { ...process.env, NODE_ENV: 'production' };
    delete childEnv.JWT_SECRET;
    delete childEnv.FRONTEND_ORIGIN;
    const child = spawn(process.execPath, ['-e', `
      process.chdir('/tmp');
      require('${process.cwd().replace(/\\/g, '/')}/planora_backend_server');
    `], { stdio: 'pipe', env: childEnv });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      assert.equal(code, 1, 'production without JWT_SECRET should exit');
      assert(stderr.includes('JWT_SECRET'), 'should mention JWT_SECRET requirement');
      resolve();
    });
  });

  console.log('--- Production CORS guard ---');
  await new Promise((resolve) => {
    const childEnv = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'production-test-secret' };
    delete childEnv.FRONTEND_ORIGIN;
    const child = spawn(process.execPath, ['-e', `
      process.chdir('/tmp');
      require('${process.cwd().replace(/\\/g, '/')}/planora_backend_server');
    `], { stdio: 'pipe', env: childEnv });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      assert.equal(code, 1, 'production without FRONTEND_ORIGIN should exit');
      assert(stderr.includes('FRONTEND_ORIGIN'), 'should mention FRONTEND_ORIGIN requirement');
      resolve();
    });
  });

  console.log('\nAll API verification checks passed.');
}

run()
  .catch((err) => {
    console.error('TEST FAILURE:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });
