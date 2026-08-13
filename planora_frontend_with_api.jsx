/**
 * PLANORA MVP - React Frontend with Real Backend Integration
 *
 * This version connects to the Express backend API.
 * API calls use the same origin by default (Vite proxies /api to the backend).
 * Set VITE_API_URL only if the frontend should talk to a different backend host.
 */

import React, { useState, useEffect } from 'react';
import { Plus, Clock, Calendar, TrendingUp, LogOut, Menu } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).trim()) || '';

class APIClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('token');
  }

  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(response.ok ? 'Invalid server response' : `HTTP ${response.status}`);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${method} ${endpoint}]:`, err);
      throw err;
    }
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async signup(email, password, name) {
    const response = await this.request('POST', '/api/auth/signup', { email, password, name });
    this.setToken(response.token);
    return response;
  }

  async login(email, password) {
    const response = await this.request('POST', '/api/auth/login', { email, password });
    this.setToken(response.token);
    return response;
  }

  async logout() {
    this.setToken(null);
  }

  async verifyToken() {
    return this.request('POST', '/api/auth/verify-token');
  }

  async completeOnboarding(data) {
    return this.request('POST', '/api/onboarding/complete', data);
  }

  async createTask(taskData) {
    return this.request('POST', '/api/tasks', taskData);
  }

  async getTasks(status = null, date = null) {
    let url = '/api/tasks';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (date) params.append('date', date);
    if (params.toString()) url += `?${params.toString()}`;
    return this.request('GET', url);
  }

  async updateTask(id, updates) {
    return this.request('PUT', `/api/tasks/${id}`, updates);
  }

  async deleteTask(id) {
    return this.request('DELETE', `/api/tasks/${id}`);
  }

  async completeTask(id) {
    return this.request('PATCH', `/api/tasks/${id}/complete`);
  }

  async getCalendarEvents(startDate = null, endDate = null) {
    let url = '/api/calendar';
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (params.toString()) url += `?${params.toString()}`;
    return this.request('GET', url);
  }

  async addCalendarEvent(eventData) {
    return this.request('POST', '/api/calendar/events', eventData);
  }

  async deleteCalendarEvent(id) {
    return this.request('DELETE', `/api/calendar/events/${id}`);
  }

  async generateTodayPlan(availableFrom, availableUntil, energyToday) {
    return this.request('POST', '/api/plan/generate-today', {
      available_from: availableFrom,
      available_until: availableUntil,
      energy_today: energyToday
    });
  }

  async replantToday(availableFrom, availableUntil, energyToday) {
    return this.request('POST', '/api/plan/replan', {
      available_from: availableFrom,
      available_until: availableUntil,
      energy_today: energyToday
    });
  }

  async getTodayPlan() {
    return this.request('GET', '/api/plan/today');
  }

  async getProgress(range = 'week') {
    return this.request('GET', `/api/analytics/progress?range=${range}`);
  }
}

const api = new APIClient(API_URL);

const friendlyError = (message) => {
  if (!message) return 'Something went quietly wrong. Please try again.';
  if (/invalid email or password/i.test(message)) return 'That email or password doesn’t match.';
  if (/already exists/i.test(message)) return 'An account with that email already exists.';
  if (/missing fields|missing required/i.test(message)) return 'A few details are still needed.';
  if (/forbidden/i.test(message)) return 'That item is no longer available.';
  if (/HTTP \d+/i.test(message) || /invalid server response/i.test(message)) {
    return 'We couldn’t reach Planora just now. Please try again.';
  }
  return message;
};

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatLongDate = (value = new Date()) =>
  new Date(value).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

const dueMeta = (due) => {
  if (!due) return null;
  const key = String(due).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (key < today) return { label: 'Overdue', kind: 'overdue' };
  if (key === today) return { label: 'Due today', kind: 'today' };
  return {
    label: new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    kind: 'later'
  };
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export default function PlanoraApp() {
  const [screen, setScreen] = useState('splash');
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [todayPlan, setTodayPlan] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await api.verifyToken();
          setUser(response.user);
          setScreen('today');
          loadData();
        } catch (err) {
          api.setToken(null);
          setScreen('auth');
        }
      } else {
        setScreen('auth');
      }
    };
    checkSession();
  }, []);

  const goTo = (next) => {
    setShowMenu(false);
    setError(null);
    setScreen(next);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tasksRes, planRes, eventsRes] = await Promise.all([
        api.getTasks(),
        api.getTodayPlan(),
        api.getCalendarEvents()
      ]);
      setTasks(tasksRes.tasks || []);
      setTodayPlan(planRes.plan || null);
      setCalendarEvents(eventsRes.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (email, password, name) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.signup(email, password, name);
      setUser(response.user);
      setScreen('onboarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.login(email, password);
      setUser(response.user);
      setScreen('today');
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setTasks([]);
    setTodayPlan(null);
    setCalendarEvents([]);
    setError(null);
    setScreen('auth');
  };

  const addTask = async (taskData) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.createTask(taskData);
      setTasks([...tasks, response.task]);
      setScreen('today');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const completeTask = async (taskId) => {
    if (!taskId) return;
    try {
      await api.completeTask(taskId);
      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, status: 'completed', completed_at: new Date().toISOString() } : t
      ));
      if (todayPlan) {
        setTodayPlan({
          ...todayPlan,
          plan_blocks: todayPlan.plan_blocks.map(b =>
            b.task_id === taskId ? { ...b, completed: true } : b
          )
        });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      setError(err.message);
    }
  };

  const generateTodayPlan = async (availableFrom, availableUntil, energyToday) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.generateTodayPlan(availableFrom, availableUntil, energyToday);
      setTodayPlan(response.plan);
      setScreen('plan-view');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const replan = async (availableFrom, availableUntil, energyToday) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.replantToday(availableFrom, availableUntil, energyToday);
      setTodayPlan(response.plan);
      setScreen('plan-view');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addCalendarEvent = async (eventData) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.addCalendarEvent(eventData);
      setCalendarEvents([...calendarEvents, response.event]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteCalendarEvent = async (id) => {
    try {
      await api.deleteCalendarEvent(id);
      setCalendarEvents(calendarEvents.filter((event) => event.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const shell = {
    user,
    screen,
    showMenu,
    setShowMenu,
    handleLogout,
    goTo
  };

  if (screen === 'splash') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF8EF] px-6">
        <div className="text-center">
          <p className="font-serif text-lg tracking-[0.28em] text-[#155E63]">Planora</p>
          <p className="mt-4 text-sm tracking-[0.18em] uppercase text-[#6F9691]">Plan your day. Protect your time.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSignUp={handleSignUp} onLogin={handleLogin} loading={loading} error={error} />;
  }

  if (screen === 'onboarding') {
    return <OnboardingScreen onComplete={() => { setScreen('today'); loadData(); }} />;
  }

  if (screen === 'today') {
    return (
      <TodayScreen
        {...shell}
        tasks={tasks}
        todayPlan={todayPlan}
        completeTask={completeTask}
        deleteTask={deleteTask}
        loading={loading}
        error={error}
      />
    );
  }

  if (screen === 'add-task') {
    return (
      <AppShell {...shell} title="Add a task">
        <AddTaskScreen onSubmit={addTask} loading={loading} error={error} />
      </AppShell>
    );
  }

  if (screen === 'plan-input') {
    return (
      <AppShell {...shell} title="Plan my day">
        <PlanInputScreen onSubmit={generateTodayPlan} loading={loading} error={error} />
      </AppShell>
    );
  }

  if (screen === 'plan-view') {
    return (
      <AppShell {...shell} title="Today’s plan">
        <PlanViewScreen todayPlan={todayPlan} completeTask={completeTask} goTo={goTo} />
      </AppShell>
    );
  }

  if (screen === 'replan') {
    return (
      <AppShell {...shell} title="Adjust your plan">
        <ReplanScreen onSubmit={replan} loading={loading} error={error} />
      </AppShell>
    );
  }

  if (screen === 'progress') {
    return (
      <AppShell {...shell} title="Progress">
        <ProgressScreen tasks={tasks} />
      </AppShell>
    );
  }

  if (screen === 'calendar') {
    return (
      <AppShell {...shell} title="Calendar">
        <CalendarScreen
          events={calendarEvents}
          onSubmit={addCalendarEvent}
          onDelete={deleteCalendarEvent}
          loading={loading}
          error={error}
        />
      </AppShell>
    );
  }

  return (
    <TodayScreen
      {...shell}
      tasks={tasks}
      todayPlan={todayPlan}
      completeTask={completeTask}
      deleteTask={deleteTask}
      loading={loading}
      error={error}
    />
  );
}

const AppShell = ({ children, title, user, screen, showMenu, setShowMenu, handleLogout, goTo }) => (
  <div className="min-h-screen bg-[#FBF8EF] text-[#173B3D]">
    <TopNav
      user={user}
      screen={screen}
      showMenu={showMenu}
      setShowMenu={setShowMenu}
      handleLogout={handleLogout}
      goTo={goTo}
    />
    <div className="mx-auto max-w-4xl px-5 pb-28 pt-8 md:px-8 md:pb-16 md:pt-10">
      <BackLink onClick={() => goTo('today')} />
      {title && (
        <h1 className="mt-4 font-serif text-[1.85rem] font-medium leading-tight text-[#173B3D] md:text-[2.1rem]">
          {title}
        </h1>
      )}
      <div className="mt-8">{children}</div>
    </div>
    <MobileDock screen={screen} goTo={goTo} />
  </div>
);

const AuthScreen = ({ onSignUp, onLogin, loading, error }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#FBF8EF] px-5 py-12">
    <div className="w-full max-w-md">
      <p className="font-serif text-lg tracking-[0.22em] text-[#155E63]">Planora</p>
      <h1 className="mt-6 font-serif text-[2rem] font-medium leading-tight text-[#173B3D]">
        Plan your day.<br />Protect your time.
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#657574]">
        A calm place to turn a crowded task list into a day you can actually keep.
      </p>
      <ErrorBanner message={error} />
      <div className="mt-8">
        <AuthForm onSignUp={onSignUp} onLogin={onLogin} loading={loading} />
      </div>
    </div>
  </div>
);

const AuthForm = ({ onSignUp, onLogin, loading }) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'login') {
      onLogin(email, password);
    } else {
      onSignUp(email, password, name);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {mode === 'signup' && (
        <div>
          <label className="planora-label">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="planora-input" disabled={loading} required />
        </div>
      )}
      <div>
        <label className="planora-label">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" className="planora-input" disabled={loading} required />
      </div>
      <div>
        <label className="planora-label">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="planora-input" disabled={loading} required />
      </div>
      <PrimaryButton type="submit" disabled={loading} className="w-full">
        {loading ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
      </PrimaryButton>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        disabled={loading}
        className="w-full py-3 text-sm tracking-wide text-[#657574] transition duration-200 hover:text-[#155E63] disabled:opacity-50"
      >
        {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
      </button>
    </form>
  );
};

const OnboardingScreen = ({ onComplete }) => {
  const [wakeTime, setWakeTime] = useState('08:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [energy, setEnergy] = useState('medium');
  const [breakDuration, setBreakDuration] = useState('15');
  const [maxFocus, setMaxFocus] = useState('90');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await api.completeOnboarding({
        wake_time: wakeTime,
        sleep_time: sleepTime,
        typical_energy: energy,
        preferred_break_duration: parseInt(breakDuration),
        max_focus_session: parseInt(maxFocus)
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8EF] px-5 py-12 text-[#173B3D] md:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#6F9691]">Welcome</p>
        <h1 className="mt-4 font-serif text-[2rem] font-medium leading-tight">A few quiet preferences</h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#657574]">
          Planora uses these to keep your schedule realistic — never packed beyond the time you actually have.
        </p>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="planora-label">Wake time</label>
              <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="planora-input" />
            </div>
            <div>
              <label className="planora-label">Sleep time</label>
              <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} className="planora-input" />
            </div>
            <div>
              <label className="planora-label">Preferred break</label>
              <input type="number" min="5" value={breakDuration} onChange={(e) => setBreakDuration(e.target.value)} className="planora-input" />
            </div>
            <div>
              <label className="planora-label">Max focus session</label>
              <input type="number" min="15" value={maxFocus} onChange={(e) => setMaxFocus(e.target.value)} className="planora-input" />
            </div>
          </div>
          <div>
            <p className="planora-label">Typical energy</p>
            <ChoiceRow value={energy} onChange={setEnergy} options={['low', 'medium', 'high']} />
          </div>
          <PrimaryButton type="submit" disabled={saving} className="w-full md:w-auto">
            {saving ? 'Saving…' : 'Begin'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
};

const TodayScreen = ({
  user,
  tasks,
  todayPlan,
  completeTask,
  deleteTask,
  loading,
  error,
  screen,
  showMenu,
  setShowMenu,
  handleLogout,
  goTo
}) => {
  const pending = tasks.filter((t) => t.status === 'pending');
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;
  const remaining = totalCount - completedCount;

  return (
    <div className="min-h-screen bg-[#FBF8EF] text-[#173B3D]">
      <TopNav
        user={user}
        screen={screen}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        handleLogout={handleLogout}
        goTo={goTo}
      />
      <div className="mx-auto max-w-4xl px-5 pb-28 pt-10 md:px-8 md:pb-16 md:pt-14">
        <ErrorBanner message={error} />

        <header className="pb-10 md:pb-14">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#6F9691]">{formatLongDate()}</p>
          <h1 className="mt-4 max-w-2xl font-serif text-[2rem] font-medium leading-[1.15] text-[#173B3D] md:text-[2.45rem]">
            {greetingForNow()}, {user?.name}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#657574]">
            {todayPlan
              ? 'Your day is arranged. Move through it one block at a time.'
              : 'Nothing is wrong — the day simply hasn’t been planned yet.'}
          </p>
        </header>

        <div className="mb-12 grid grid-cols-2 border border-[#155E63]/15 bg-white/50 md:grid-cols-4">
          <Stat label="Completed" value={completedCount} accent />
          <Stat label="Remaining" value={remaining} />
          <Stat label="All tasks" value={totalCount} />
          <Stat label="Today’s plan" value={todayPlan ? 'Set' : 'Open'} accent={Boolean(todayPlan)} last />
        </div>

        {loading && !todayPlan && pending.length === 0 ? (
          <TodaySkeleton />
        ) : todayPlan && todayPlan.plan_blocks && todayPlan.plan_blocks.length > 0 ? (
          <section className="mb-14">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[#6F9691]">Agenda</p>
                <h2 className="mt-2 font-serif text-2xl font-medium">Today’s plan</h2>
              </div>
            </div>
            <AgendaTimeline plan={todayPlan} tasks={tasks} completeTask={completeTask} />
            {todayPlan.reasoning && (
              <p className="mt-8 max-w-2xl border-t border-[#155E63]/10 pt-5 text-sm italic leading-relaxed text-[#657574]">
                {todayPlan.reasoning}
              </p>
            )}
            <PrimaryButton onClick={() => goTo('replan')} className="mt-8 w-full md:w-auto">
              Replan my day
            </PrimaryButton>
          </section>
        ) : (
          <section className="mb-14 py-6 md:py-10">
            <Clock className="h-6 w-6 text-[#155E63]" />
            <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-[#6F9691]">Unplanned</p>
            <h2 className="mt-3 font-serif text-2xl font-medium">Your day is ready when you are.</h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#657574]">
              Add a few tasks, then let Planora arrange them around the time you actually have.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton onClick={() => goTo('plan-input')}>Plan my day</PrimaryButton>
              <SecondaryButton onClick={() => goTo('add-task')}>Add a task</SecondaryButton>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-12 md:grid-cols-5">
          <section className="md:col-span-3">
            <h3 className="font-serif text-xl font-medium">Pending</h3>
            {pending.length === 0 ? (
              <p className="mt-5 text-sm leading-relaxed text-[#657574]">
                No open tasks. When something needs time, add it here.
              </p>
            ) : (
              <div className="mt-5 divide-y divide-[#155E63]/10">
                {pending.slice(0, 6).map((task) => (
                  <TaskRow key={task.id} task={task} onDelete={() => deleteTask(task.id)} onComplete={() => completeTask(task.id)} />
                ))}
              </div>
            )}
            <button
              onClick={() => goTo('add-task')}
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm tracking-[0.12em] uppercase text-[#155E63] transition duration-200 hover:text-[#103F43]"
            >
              <Plus className="h-4 w-4" /> Add task
            </button>
          </section>

          <section className="md:col-span-2">
            <h3 className="font-serif text-xl font-medium">Move with intention</h3>
            <div className="mt-5 space-y-2">
              <QuietAction onClick={() => goTo('plan-input')} label="Plan my day" hint="Arrange remaining work" />
              <QuietAction onClick={() => goTo('calendar')} label="Calendar" hint="Fixed commitments" />
              <QuietAction onClick={() => goTo('progress')} label="Progress" hint="What you have already kept" />
            </div>
          </section>
        </div>
      </div>
      <MobileDock screen={screen} goTo={goTo} />
    </div>
  );
};

const AddTaskScreen = ({ onSubmit, loading, error }) => (
  <div>
    <p className="max-w-lg text-[15px] leading-relaxed text-[#657574]">
      Capture what needs time. Priority, energy, and due date help Planora protect the rest of your day.
    </p>
    <ErrorBanner message={error} />
    <div className="mt-8">
      <TaskForm onSubmit={onSubmit} loading={loading} />
    </div>
  </div>
);

const PlanInputScreen = ({ onSubmit, loading, error }) => (
  <div>
    <p className="max-w-lg text-[15px] leading-relaxed text-[#657574]">
      Tell Planora the hours you actually have. It will not invent time you don’t.
    </p>
    <ErrorBanner message={error} />
    <div className="mt-8">
      <PlanInputForm onSubmit={onSubmit} loading={loading} submitLabel="Generate plan" />
    </div>
  </div>
);

const PlanViewScreen = ({ todayPlan, completeTask, goTo }) => {
  if (!todayPlan) {
    return (
      <div>
        <p className="text-[15px] leading-relaxed text-[#657574]">There isn’t a plan for today yet.</p>
        <PrimaryButton onClick={() => goTo('plan-input')} className="mt-6">Plan my day</PrimaryButton>
      </div>
    );
  }

  return (
    <div>
      <p className="max-w-lg text-[15px] leading-relaxed text-[#657574]">
        Mark each block as you finish. The order is already chosen so you don’t have to decide again.
      </p>
      <div className="mt-8">
        <AgendaTimeline plan={todayPlan} completeTask={completeTask} />
      </div>
      {todayPlan.reasoning && (
        <p className="mt-8 max-w-2xl border-t border-[#155E63]/10 pt-5 text-sm italic leading-relaxed text-[#657574]">
          {todayPlan.reasoning}
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton onClick={() => goTo('replan')}>Replan</PrimaryButton>
        <SecondaryButton onClick={() => goTo('today')}>Back to today</SecondaryButton>
      </div>
    </div>
  );
};

const ReplanScreen = ({ onSubmit, loading, error }) => (
  <div>
    <p className="max-w-lg text-[15px] leading-relaxed text-[#657574]">
      Time shifted. Energy changed. Rebuild the rest of the day from what’s still open.
    </p>
    <ErrorBanner message={error} />
    <div className="mt-8">
      <PlanInputForm onSubmit={onSubmit} loading={loading} submitLabel="Rebuild plan" />
    </div>
  </div>
);

const ProgressScreen = ({ tasks }) => {
  const completed = tasks.filter((t) => t.status === 'completed');
  const totalCount = tasks.length;
  const completionRate = totalCount === 0 ? 0 : Math.round((completed.length / totalCount) * 100);
  const categories = ['study', 'work', 'personal', 'health', 'errands'];

  return (
    <div>
      <p className="max-w-lg text-[15px] leading-relaxed text-[#657574]">
        A quiet record of what you finished — not a scoreboard.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <p className="planora-label">Completed</p>
          <p className="font-serif text-4xl text-[#155E63]">{completed.length}</p>
          <p className="mt-2 text-sm text-[#8C8272]">of {totalCount} tasks</p>
        </div>
        <div>
          <p className="planora-label">Kept</p>
          <p className="font-serif text-4xl text-[#173B3D]">{completionRate}%</p>
          <div className="mt-4 h-px w-full bg-[#155E63]/15">
            <div className="h-px bg-[#155E63] transition-all duration-300" style={{ width: `${completionRate}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-12">
        <h3 className="font-serif text-xl font-medium">By category</h3>
        <div className="mt-5 divide-y divide-[#155E63]/10">
          {categories.map((cat) => {
            const count = completed.filter((t) => t.category === cat).length;
            if (!count) return null;
            return (
              <div key={cat} className="flex items-center justify-between py-3.5">
                <span className="capitalize text-[#173B3D]">{cat}</span>
                <span className="font-serif text-lg text-[#155E63]">{count}</span>
              </div>
            );
          })}
          {completed.length === 0 && (
            <p className="py-4 text-sm text-[#657574]">Nothing completed yet. The day is still ahead.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const CalendarScreen = ({ events, onSubmit, onDelete, loading, error }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('class');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title,
      type,
      start_datetime: start,
      end_datetime: end
    });
    setTitle('');
    setStart('');
    setEnd('');
  };

  const sorted = [...(events || [])].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

  return (
    <div>
      <p className="max-w-lg text-[15px] leading-relaxed text-[#657574]">
        Fixed commitments stay visible so planning never pretends those hours are free.
      </p>
      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label className="planora-label">Commitment</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture, lab, appointment" className="planora-input" required disabled={loading} />
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <label className="planora-label">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="planora-input" disabled={loading}>
              <option value="class">Class</option>
              <option value="exam">Exam</option>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="planora-label">Starts</label>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="planora-input" required disabled={loading} />
          </div>
          <div>
            <label className="planora-label">Ends</label>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="planora-input" required disabled={loading} />
          </div>
        </div>
        <PrimaryButton type="submit" disabled={loading}>{loading ? 'Saving…' : 'Add to calendar'}</PrimaryButton>
      </form>

      <div className="mt-12">
        <h3 className="font-serif text-xl font-medium">Upcoming</h3>
        {sorted.length === 0 ? (
          <p className="mt-5 text-sm leading-relaxed text-[#657574]">No commitments recorded. Your calendar is clear.</p>
        ) : (
          <div className="mt-5 divide-y divide-[#155E63]/10">
            {sorted.map((event) => (
              <div key={event.id} className="flex items-start gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[#173B3D]">{event.title}</div>
                  <div className="mt-1 text-sm text-[#657574]">
                    {formatDateTime(event.start_datetime)} → {formatDateTime(event.end_datetime)}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8C8272]">{event.type}</div>
                </div>
                <button
                  onClick={() => onDelete(event.id)}
                  className="min-h-11 px-2 text-sm text-[#8C8272] transition duration-200 hover:text-[#103F43]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AgendaTimeline = ({ plan, tasks = [], completeTask }) => {
  const blocks = plan?.plan_blocks || [];
  const taskById = Object.fromEntries(tasks.map((task) => [String(task.id), task]));

  return (
    <div>
      {blocks.map((block, index) => {
        const isTask = block.type === 'task';
        const isBreak = block.type === 'break';
        const linked = block.task_id ? taskById[String(block.task_id)] : null;
        const highlight = isTask && ((linked && linked.priority === 'high') || block.priority === 'high' || index === 0);
        const start = block.start_time || block.start;
        const end = block.end_time || block.end;
        return (
          <div
            key={`${start}-${block.task_id || block.type}-${index}`}
            className={`group relative flex gap-5 py-5 transition-opacity duration-200 md:gap-8 ${
              index !== blocks.length - 1 ? 'border-b border-[#155E63]/10' : ''
            } ${block.completed ? 'opacity-55' : ''}`}
          >
            <div className="w-16 shrink-0 pt-0.5 text-right md:w-20">
              <div className="font-serif text-sm text-[#155E63]">{start}</div>
              <div className="mt-1 text-[11px] tracking-wide text-[#8C8272]">
                {block.duration_minutes ? `${block.duration_minutes}m` : ''}
              </div>
            </div>
            <div className="relative w-px shrink-0 bg-[#155E63]/20">
              <span
                className={`absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border ${
                  highlight
                    ? 'border-[#D7C58A] bg-[#F3E6A5]'
                    : isBreak
                      ? 'border-[#6F9691] bg-[#FBF8EF]'
                      : 'border-[#155E63] bg-[#155E63]'
                }`}
              />
            </div>
            <div className={`min-w-0 flex-1 px-1 py-1 transition duration-200 md:px-4 ${highlight && !block.completed ? 'bg-[#F8EDBF]/50' : ''}`}>
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] text-[#173B3D] ${block.completed ? 'line-through decoration-[#6F9691]/70' : ''}`}>
                    {block.title}
                  </div>
                  <div className="mt-1 text-sm text-[#657574]">{start} → {end}</div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-[#8C8272]">
                    {isBreak && <span>Break</span>}
                    {block.type === 'buffer' && <span>Buffer</span>}
                    {linked?.priority && <span>{linked.priority} priority</span>}
                    {linked?.category && <span>{linked.category}</span>}
                    {linked?.energy_required && <span>{linked.energy_required} energy</span>}
                  </div>
                </div>
                {isTask && (
                  <button
                    onClick={() => completeTask(block.task_id)}
                    className={`min-h-11 shrink-0 border px-3.5 text-xs tracking-[0.12em] uppercase transition duration-200 ${
                      block.completed
                        ? 'border-[#6F9691]/40 bg-transparent text-[#6F9691]'
                        : 'border-[#155E63] bg-[#155E63] text-[#FBF8EF] hover:-translate-y-px hover:bg-[#103F43] active:translate-y-px'
                    }`}
                  >
                    {block.completed ? 'Done' : 'Mark done'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TaskRow = ({ task, onDelete, onComplete }) => {
  const due = dueMeta(task.due_date);
  return (
    <div className="flex items-start gap-3 py-4">
      <button
        onClick={onComplete}
        aria-label={`Complete ${task.title}`}
        className="mt-1 h-4 w-4 shrink-0 rounded-full border border-[#155E63] transition duration-200 hover:bg-[#F3E6A5]"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[#173B3D]">{task.title}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-[#8C8272]">
          <span>{task.estimated_duration}m</span>
          <span>{task.priority}</span>
          {task.energy_required && <span>{task.energy_required} energy</span>}
          {task.category && <span>{task.category}</span>}
          {due && (
            <span className={due.kind === 'overdue' ? 'text-[#155E63]' : ''}>{due.label}</span>
          )}
        </div>
      </div>
      <button onClick={onDelete} className="min-h-11 px-1 text-[#8C8272] transition duration-200 hover:text-[#103F43]" aria-label={`Delete ${task.title}`}>
        ×
      </button>
    </div>
  );
};

const TaskForm = ({ onSubmit, loading }) => {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('60');
  const [priority, setPriority] = useState('medium');
  const [energy, setEnergy] = useState('medium');
  const [category, setCategory] = useState('study');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title,
      estimated_duration: parseInt(duration),
      priority,
      energy_required: energy,
      category,
      due_date: dueDate || null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="planora-label">Task</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Biology Chapter 4" className="planora-input" disabled={loading} required />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="planora-label">Duration (min)</label>
          <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="planora-input" disabled={loading} />
        </div>
        <div>
          <label className="planora-label">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="planora-input" disabled={loading} />
        </div>
      </div>
      <div>
        <p className="planora-label">Priority</p>
        <ChoiceRow value={priority} onChange={setPriority} options={['low', 'medium', 'high']} disabled={loading} />
      </div>
      <div>
        <p className="planora-label">Energy required</p>
        <ChoiceRow value={energy} onChange={setEnergy} options={['low', 'medium', 'high']} disabled={loading} />
      </div>
      <div>
        <label className="planora-label">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="planora-input" disabled={loading}>
          <option value="study">Study</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="health">Health</option>
          <option value="errands">Errands</option>
        </select>
      </div>
      <PrimaryButton type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? 'Adding…' : 'Add task'}
      </PrimaryButton>
    </form>
  );
};

const PlanInputForm = ({ onSubmit, loading, submitLabel = 'Generate plan' }) => {
  const [availableFrom, setAvailableFrom] = useState('18:00');
  const [availableUntil, setAvailableUntil] = useState('22:00');
  const [energy, setEnergy] = useState('medium');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(availableFrom, availableUntil, energy);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h3 className="font-serif text-xl font-medium">When are you available?</h3>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="planora-label">From</label>
            <input type="time" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className="planora-input" disabled={loading} />
          </div>
          <div>
            <label className="planora-label">Until</label>
            <input type="time" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} className="planora-input" disabled={loading} />
          </div>
        </div>
      </div>
      <div>
        <h3 className="font-serif text-xl font-medium">How is your energy?</h3>
        <div className="mt-5">
          <ChoiceRow value={energy} onChange={setEnergy} options={['low', 'medium', 'high']} disabled={loading} />
        </div>
      </div>
      <PrimaryButton type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? 'Arranging…' : submitLabel}
      </PrimaryButton>
    </form>
  );
};

const TopNav = ({ showMenu, setShowMenu, handleLogout, goTo }) => (
  <div className="sticky top-0 z-40 border-b border-[#155E63]/10 bg-[#FBF8EF]/92 backdrop-blur-sm">
    <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5 md:px-8">
      <button onClick={() => goTo('today')} className="font-serif text-[17px] tracking-[0.14em] text-[#155E63] transition duration-200 hover:text-[#103F43]">
        Planora
      </button>
      <div className="hidden items-center gap-7 text-[12px] uppercase tracking-[0.16em] text-[#6F9691] md:flex">
        <NavText onClick={() => goTo('today')} label="Today" />
        <NavText onClick={() => goTo('add-task')} label="Task" />
        <NavText onClick={() => goTo('plan-input')} label="Plan" />
        <NavText onClick={() => goTo('calendar')} label="Calendar" />
        <NavText onClick={() => goTo('progress')} label="Progress" />
      </div>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2.5 text-[#155E63] transition duration-200 hover:bg-[#F8EDBF]/70 md:hidden"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        onClick={handleLogout}
        className="hidden p-2.5 text-[#6F9691] transition duration-200 hover:text-[#103F43] md:inline-flex"
        aria-label="Log out"
      >
        <LogOut className="h-4 w-4" />
      </button>
      {showMenu && (
        <div className="absolute right-5 top-14 z-50 min-w-[12rem] border border-[#155E63]/15 bg-[#FBF8EF] shadow-quiet md:right-8">
          <button onClick={() => goTo('progress')} className="w-full px-4 py-3 text-left text-sm text-[#173B3D] transition duration-200 hover:bg-[#F8EDBF]/80">Progress</button>
          <button onClick={() => goTo('calendar')} className="w-full px-4 py-3 text-left text-sm text-[#173B3D] transition duration-200 hover:bg-[#F8EDBF]/80">Calendar</button>
          <button onClick={() => { handleLogout(); setShowMenu(false); }} className="w-full px-4 py-3 text-left text-sm text-[#8C8272] transition duration-200 hover:bg-[#F8EDBF]/80 hover:text-[#103F43]">Log out</button>
        </div>
      )}
    </div>
  </div>
);

const MobileDock = ({ screen, goTo }) => (
  <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#155E63]/10 bg-[#FBF8EF]/95 backdrop-blur-sm md:hidden">
    <div className="mx-auto grid max-w-4xl grid-cols-4 px-2 py-1.5">
      <DockItem active={screen === 'today'} label="Today" onClick={() => goTo('today')} icon={<span className="h-1.5 w-1.5 rounded-full bg-current" />} />
      <DockItem active={screen === 'add-task'} label="Task" onClick={() => goTo('add-task')} icon={<Plus className="h-4 w-4" />} />
      <DockItem active={['plan-input', 'plan-view', 'replan'].includes(screen)} label="Plan" onClick={() => goTo('plan-input')} icon={<Clock className="h-4 w-4" />} />
      <DockItem active={screen === 'progress'} label="More" onClick={() => goTo('progress')} icon={<TrendingUp className="h-4 w-4" />} />
    </div>
  </nav>
);

const DockItem = ({ active, label, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.16em] transition duration-200 ${
      active ? 'text-[#155E63]' : 'text-[#8C8272]'
    }`}
  >
    {icon}
    {label}
  </button>
);

const NavText = ({ onClick, label }) => (
  <button onClick={onClick} className="transition duration-200 hover:text-[#155E63]">
    {label}
  </button>
);

const PrimaryButton = ({ children, className = '', ...props }) => (
  <button
    {...props}
    className={`inline-flex min-h-12 items-center justify-center border border-[#155E63] bg-[#155E63] px-7 text-sm tracking-[0.16em] uppercase text-[#FBF8EF] transition duration-200 hover:-translate-y-px hover:bg-[#103F43] active:translate-y-px disabled:translate-y-0 disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

const SecondaryButton = ({ children, className = '', ...props }) => (
  <button
    {...props}
    className={`inline-flex min-h-12 items-center justify-center border border-[#155E63]/35 bg-transparent px-7 text-sm tracking-[0.16em] uppercase text-[#155E63] transition duration-200 hover:-translate-y-px hover:border-[#155E63] hover:bg-[#F8EDBF]/50 active:translate-y-px ${className}`}
  >
    {children}
  </button>
);

const ChoiceRow = ({ value, onChange, options, disabled }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => (
      <button
        key={option}
        type="button"
        disabled={disabled}
        onClick={() => onChange(option)}
        className={`min-h-11 min-w-[5.5rem] border px-4 text-xs uppercase tracking-[0.16em] transition duration-200 ${
          value === option
            ? 'border-[#155E63] bg-[#155E63] text-[#FBF8EF]'
            : 'border-[#155E63]/20 bg-white/50 text-[#173B3D] hover:border-[#D7C58A] hover:bg-[#F8EDBF]/70'
        } disabled:opacity-50`}
      >
        {option}
      </button>
    ))}
  </div>
);

const ErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div className="mt-6 border border-[#D7C58A] bg-[#F8EDBF]/70 px-4 py-3 text-sm leading-relaxed text-[#103F43]">
      {friendlyError(message)}
    </div>
  );
};

const BackLink = ({ onClick }) => (
  <button onClick={onClick} className="text-[12px] uppercase tracking-[0.18em] text-[#6F9691] transition duration-200 hover:text-[#155E63]">
    ← Today
  </button>
);

const Stat = ({ label, value, accent, last }) => (
  <div className={`border-[#155E63]/10 px-5 py-5 ${last ? '' : 'border-b md:border-b-0 md:border-r'}`}>
    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8C8272]">{label}</div>
    <div className={`mt-3 font-serif text-3xl ${accent ? 'text-[#155E63]' : 'text-[#173B3D]'}`}>{value}</div>
  </div>
);

const QuietAction = ({ onClick, label, hint }) => (
  <button
    onClick={onClick}
    className="w-full border-b border-[#155E63]/10 py-4 text-left transition duration-200 hover:translate-x-0.5 hover:border-[#D7C58A]"
  >
    <div className="text-sm text-[#173B3D]">{label}</div>
    <div className="mt-1 text-xs tracking-wide text-[#8C8272]">{hint}</div>
  </button>
);

const TodaySkeleton = () => (
  <div className="mb-14 animate-pulse space-y-6">
    <div className="h-3 w-24 bg-[#155E63]/10" />
    <div className="h-8 w-48 bg-[#155E63]/10" />
    <div className="space-y-3 pt-4">
      <div className="h-16 bg-[#155E63]/8" />
      <div className="h-16 bg-[#155E63]/8" />
      <div className="h-16 bg-[#155E63]/8" />
    </div>
  </div>
);
