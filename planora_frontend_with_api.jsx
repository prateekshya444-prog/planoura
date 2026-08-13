/**
 * PLANORA MVP - React Frontend with Real Backend Integration
 * 
 * This version connects to the Express backend API.
 * API calls use the same origin by default (Vite proxies /api to the backend).
 * Set VITE_API_URL only if the frontend should talk to a different backend host.
 */

import React, { useState, useEffect } from 'react';
import { ChevronRight, Plus, Clock, CheckCircle2, AlertCircle, Calendar, TrendingUp, Settings, LogOut, Menu, Loader } from 'lucide-react';

// ============================================
// API CLIENT
// ============================================

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

  // Auth
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

  // Onboarding
  async completeOnboarding(data) {
    return this.request('POST', '/api/onboarding/complete', data);
  }

  // Tasks
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

  // Calendar
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

  // Planning
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

  // Analytics
  async getProgress(range = 'week') {
    return this.request('GET', `/api/analytics/progress?range=${range}`);
  }
}

const api = new APIClient(API_URL);

// ============================================
// APP COMPONENT
// ============================================

export default function PlanoraApp() {
  const [screen, setScreen] = useState('splash');
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [todayPlan, setTodayPlan] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check for existing session
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
    setScreen('auth');
  };

  const addTask = async (taskData) => {
    try {
      setLoading(true);
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
      const response = await api.replantToday(availableFrom, availableUntil, energyToday);
      setTodayPlan(response.plan);
      setScreen('plan-view');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // SCREENS
  // ============================================

  if (screen === 'splash') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🌷</div>
          <h1 className="text-3xl font-bold text-slate-900">Planora</h1>
          <p className="text-slate-600 mt-2">Plan your day. Protect your time.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSignUp={handleSignUp} onLogin={handleLogin} loading={loading} error={error} />;
  }

  if (screen === 'onboarding') {
    return <OnboardingScreen user={user} setUser={setUser} onComplete={() => { setScreen('today'); loadData(); }} />;
  }

  if (screen === 'today') {
    return <TodayScreen user={user} tasks={tasks} todayPlan={todayPlan} setScreen={setScreen} completeTask={completeTask} deleteTask={deleteTask} showMenu={showMenu} setShowMenu={setShowMenu} handleLogout={handleLogout} loading={loading} error={error} />;
  }

  if (screen === 'add-task') {
    return <AddTaskScreen onSubmit={(data) => { addTask(data); }} onBack={() => setScreen('today')} loading={loading} />;
  }

  if (screen === 'plan-input') {
    return <PlanInputScreen onSubmit={generateTodayPlan} onBack={() => setScreen('today')} loading={loading} />;
  }

  if (screen === 'plan-view') {
    return <PlanViewScreen todayPlan={todayPlan} completeTask={completeTask} setScreen={setScreen} />;
  }

  if (screen === 'replan') {
    return <ReplanScreen onSubmit={replan} onBack={() => setScreen('plan-view')} loading={loading} />;
  }

  if (screen === 'progress') {
    return <ProgressScreen tasks={tasks} onBack={() => setScreen('today')} />;
  }

  return <TodayScreen user={user} tasks={tasks} todayPlan={todayPlan} setScreen={setScreen} completeTask={completeTask} deleteTask={deleteTask} showMenu={showMenu} setShowMenu={setShowMenu} handleLogout={handleLogout} loading={loading} error={error} />;
}

// ============================================
// SCREEN COMPONENTS
// ============================================

const AuthScreen = ({ onSignUp, onLogin, loading, error }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="text-5xl mb-2">🌷</div>
        <h1 className="text-3xl font-bold text-slate-900">Planora</h1>
        <p className="text-slate-600 mt-2">Plan your day. Protect your time.</p>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}
      <AuthForm onSignUp={onSignUp} onLogin={onLogin} loading={loading} />
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'signup' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            disabled={loading}
            required
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          disabled={loading}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          disabled={loading}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium disabled:opacity-50"
      >
        {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Sign Up'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        disabled={loading}
        className="w-full py-2 text-slate-600 hover:text-slate-900 text-sm disabled:opacity-50"
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </form>
  );
};

const OnboardingScreen = ({ user, setUser, onComplete }) => {
  const [wakeTime, setWakeTime] = useState('08:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [energy, setEnergy] = useState('medium');
  const [breakDuration, setBreakDuration] = useState('15');
  const [maxFocus, setMaxFocus] = useState('90');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.completeOnboarding({
        wake_time: wakeTime,
        sleep_time: sleepTime,
        typical_energy: energy,
        preferred_break_duration: parseInt(breakDuration),
        max_focus_session: parseInt(maxFocus)
      });
      onComplete();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-2">Let's get you set up</h1>
        <p className="text-slate-600 mb-8">Tell us a bit about your schedule</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <label className="block text-sm font-medium text-slate-700 mb-2">Wake up time</label>
            <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
          </Card>

          <Card>
            <label className="block text-sm font-medium text-slate-700 mb-2">Sleep time</label>
            <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
          </Card>

          <Card>
            <label className="block text-sm font-medium text-slate-700 mb-2">Energy level</label>
            <div className="flex gap-3">
              {['low', 'medium', 'high'].map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnergy(e)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${energy === e ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {e === 'low' ? '🔴' : e === 'medium' ? '🟡' : '🟢'} {e}
                </button>
              ))}
            </div>
          </Card>

          <button type="submit" className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium">
            Let's Go
          </button>
        </form>
      </div>
    </div>
  );
};

const TodayScreen = ({ user, tasks, todayPlan, setScreen, completeTask, deleteTask, showMenu, setShowMenu, handleLogout, loading, error }) => {
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;

  return (
    <div className="min-h-screen bg-[#FBF8EF] text-[#173B3D]">
      <TopNav user={user} showMenu={showMenu} setShowMenu={setShowMenu} handleLogout={handleLogout} setScreen={setScreen} />
      <div className="max-w-4xl mx-auto px-5 md:px-8 pb-16">
        {error && (
          <div className="mt-6 border border-[#D7C58A] bg-[#F8EDBF]/70 px-4 py-3 text-sm text-[#103F43]">
            {error}
          </div>
        )}

        <div className="pt-12 pb-10 md:pt-16 md:pb-14">
          <p className="text-[11px] tracking-[0.28em] uppercase text-[#6F9691]">Today</p>
          <h1 className="mt-4 font-serif text-[2rem] md:text-[2.35rem] font-medium leading-tight text-[#173B3D]">
            Good morning, {user?.name} 🌷
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#657574]">Let's make today count</p>
        </div>

        <div className="mb-12 grid grid-cols-2 border border-[#155E63]/15 bg-white/60 md:grid-cols-4">
          <div className="border-b border-[#155E63]/10 px-5 py-5 md:border-b-0 md:border-r">
            <div className="text-[11px] tracking-[0.18em] uppercase text-[#8C8272]">Tasks Completed</div>
            <div className="mt-3 font-serif text-3xl text-[#155E63]">{completedCount}</div>
          </div>
          <div className="border-b border-[#155E63]/10 px-5 py-5 md:border-b-0 md:border-r">
            <div className="text-[11px] tracking-[0.18em] uppercase text-[#8C8272]">Tasks Remaining</div>
            <div className="mt-3 font-serif text-3xl text-[#173B3D]">{totalCount - completedCount}</div>
          </div>
          <div className="border-b border-[#155E63]/10 px-5 py-5 md:border-b-0 md:border-r">
            <div className="text-[11px] tracking-[0.18em] uppercase text-[#8C8272]">Total Tasks</div>
            <div className="mt-3 font-serif text-3xl text-[#173B3D]">{totalCount}</div>
          </div>
          <div className="px-5 py-5">
            <div className="text-[11px] tracking-[0.18em] uppercase text-[#8C8272]">Planned Today</div>
            <div className="mt-3 font-serif text-3xl text-[#155E63]">{todayPlan ? '✓' : '—'}</div>
          </div>
        </div>

        {todayPlan ? (
          <section className="mb-12 border border-[#155E63]/15 bg-white/70 px-5 py-8 md:px-8 md:py-10">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.28em] uppercase text-[#6F9691]">Agenda</p>
                <h2 className="mt-2 font-serif text-2xl font-medium text-[#173B3D]">Today's Plan</h2>
              </div>
            </div>
            <div className="mb-8">
              {todayPlan.plan_blocks.map((block, index) => {
                const isTask = block.type === 'task';
                const isBreak = block.type === 'break';
                const highlight = isTask && (block.priority === 'high' || index === 0);
                return (
                  <div
                    key={`${block.start_time || block.start}-${block.task_id || block.type}-${index}`}
                    className={`group relative flex gap-5 py-5 transition-colors duration-200 md:gap-8 ${
                      index !== todayPlan.plan_blocks.length - 1 ? 'border-b border-[#155E63]/10' : ''
                    } ${block.completed ? 'opacity-60' : ''}`}
                  >
                    <div className="w-16 shrink-0 pt-0.5 text-right md:w-20">
                      <div className="font-serif text-sm text-[#155E63]">{block.start_time || block.start}</div>
                      <div className="mt-1 text-[11px] tracking-wide text-[#8C8272]">{block.duration_minutes}m</div>
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
                    <div
                      className={`min-w-0 flex-1 px-4 py-2 transition duration-200 ${
                        highlight && !block.completed ? 'bg-[#F8EDBF]/60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-xl leading-none">{block.icon || '📌'}</div>
                        <div className="min-w-0 flex-1">
                          <div className={`font-medium text-[#173B3D] ${block.completed ? 'line-through decoration-[#6F9691]/70' : ''}`}>
                            {block.title}
                          </div>
                          <div className="mt-1 text-sm text-[#657574]">
                            {block.start_time || block.start} → {block.end_time || block.end}
                          </div>
                        </div>
                        {isTask && (
                          <button
                            onClick={() => completeTask(block.task_id)}
                            className={`shrink-0 border px-3.5 py-1.5 text-xs tracking-[0.12em] uppercase transition duration-200 ${
                              block.completed
                                ? 'border-[#6F9691]/40 bg-transparent text-[#6F9691]'
                                : 'border-[#155E63] bg-[#155E63] text-[#FBF8EF] hover:-translate-y-px hover:bg-[#103F43]'
                            }`}
                          >
                            {block.completed ? '✓ Done' : 'Mark Done'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mb-6 border-t border-[#155E63]/10 pt-5 text-sm italic leading-relaxed text-[#657574]">💡 {todayPlan.reasoning}</p>
            <button
              onClick={() => setScreen('replan')}
              className="w-full border border-[#155E63] bg-[#155E63] px-6 py-3 text-sm tracking-[0.16em] uppercase text-[#FBF8EF] transition duration-200 hover:-translate-y-px hover:bg-[#103F43]"
            >
              Replan My Day
            </button>
          </section>
        ) : (
          <section className="mb-12 border border-[#155E63]/15 bg-white/70 px-6 py-14 text-center md:px-10">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8EDBF] ring-1 ring-[#D7C58A]/80">
              <Clock className="h-7 w-7 text-[#155E63]" />
            </div>
            <p className="text-[11px] tracking-[0.28em] uppercase text-[#6F9691]">No plan for today yet</p>
            <p className="mt-3 font-serif text-xl text-[#173B3D]">Your day is ready to be planned.</p>
            <button
              onClick={() => setScreen('plan-input')}
              className="mt-8 inline-block border border-[#155E63] bg-[#155E63] px-8 py-3 text-sm tracking-[0.16em] uppercase text-[#FBF8EF] transition duration-200 hover:-translate-y-px hover:bg-[#103F43]"
            >
              Plan My Day
            </button>
          </section>
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <section className="border border-[#155E63]/15 bg-white/70 p-6 md:p-7">
            <h3 className="font-serif text-xl font-medium text-[#173B3D]">Pending Tasks</h3>
            {tasks.filter(t => t.status === 'pending').length === 0 ? (
              <p className="mt-5 text-sm text-[#657574]">No pending tasks</p>
            ) : (
              <div className="mt-5 divide-y divide-[#155E63]/10">
                {tasks.filter(t => t.status === 'pending').slice(0, 5).map(task => (
                  <div key={task.id} className="flex items-center gap-3 py-3.5">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#155E63]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[#173B3D]">{task.title}</div>
                      <div className="mt-0.5 text-xs tracking-wide text-[#8C8272]">{task.estimated_duration}m · {task.priority}</div>
                    </div>
                    <button onClick={() => deleteTask(task.id)} className="px-1 text-[#8C8272] transition duration-200 hover:text-[#103F43]">×</button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setScreen('add-task')}
              className="mt-5 w-full border border-dashed border-[#6F9691] px-4 py-2.5 text-sm text-[#155E63] transition duration-200 hover:border-[#155E63] hover:bg-[#F8EDBF]/50"
            >
              + Add Task
            </button>
          </section>

          <section className="border border-[#155E63]/15 bg-white/70 p-6 md:p-7">
            <h3 className="font-serif text-xl font-medium text-[#173B3D]">Quick Actions</h3>
            <div className="mt-5">
              <button
                onClick={() => setScreen('progress')}
                className="w-full border border-[#155E63]/15 bg-[#FBF8EF] px-4 py-3.5 text-left text-sm text-[#173B3D] transition duration-200 hover:-translate-y-px hover:border-[#D7C58A] hover:bg-[#F8EDBF]/70"
              >
                📊 View Progress
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const AddTaskScreen = ({ onSubmit, onBack, loading }) => (
  <div className="min-h-screen bg-white p-6">
    <div className="max-w-2xl mx-auto">
      <BackButton onClick={onBack} />
      <h1 className="text-2xl font-bold mb-8">Add a Task</h1>
      <TaskForm onSubmit={onSubmit} loading={loading} />
    </div>
  </div>
);

const PlanInputScreen = ({ onSubmit, onBack, loading }) => (
  <div className="min-h-screen bg-white p-6">
    <div className="max-w-2xl mx-auto">
      <BackButton onClick={onBack} />
      <h1 className="text-2xl font-bold mb-8">Plan My Day</h1>
      <PlanInputForm onSubmit={onSubmit} loading={loading} />
    </div>
  </div>
);

const PlanViewScreen = ({ todayPlan, completeTask, setScreen }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-6">
    <div className="max-w-4xl mx-auto">
      <BackButton onClick={() => setScreen('today')} />
      {todayPlan && (
        <div className="mt-8">
          <h1 className="text-3xl font-bold mb-2">Your Plan</h1>
          <p className="text-slate-600 mb-8">Tap "Mark Done" as you complete tasks</p>
          <div className="space-y-3 mb-8">
            {todayPlan.plan_blocks.map((block, index) => (
              <Card key={`${block.start_time || block.start}-${block.task_id || block.type}-${index}`}>
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{block.icon || '📌'}</div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">{block.title}</div>
                    <div className="text-sm text-slate-600">{block.start_time || block.start} → {block.end_time || block.end}</div>
                  </div>
                  {block.type === 'task' && (
                    <button
                      onClick={() => completeTask(block.task_id)}
                      className={`px-4 py-2 rounded font-medium transition ${block.completed ? 'bg-green-100 text-green-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                    >
                      {block.completed ? '✓ Done' : 'Mark Done'}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Card className="mb-8">
            <p className="text-slate-700 mb-4"><span className="font-semibold">Why this order?</span> {todayPlan.reasoning}</p>
          </Card>
          <div className="flex gap-4">
            <button onClick={() => setScreen('replan')} className="flex-1 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium">
              Replan
            </button>
            <button onClick={() => setScreen('today')} className="flex-1 py-3 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition font-medium">
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);

const ReplanScreen = ({ onSubmit, onBack, loading }) => (
  <div className="min-h-screen bg-white p-6">
    <div className="max-w-2xl mx-auto">
      <BackButton onClick={onBack} />
      <h1 className="text-2xl font-bold mb-8">Adjust Your Plan</h1>
      <PlanInputForm onSubmit={onSubmit} loading={loading} />
    </div>
  </div>
);

const ProgressScreen = ({ tasks, onBack }) => {
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={onBack} />
        <h1 className="text-2xl font-bold mb-8">Your Progress</h1>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card>
            <div className="text-sm text-slate-600 mb-2">Tasks Completed</div>
            <div className="text-3xl font-bold text-green-600">{completedCount}</div>
            <div className="text-xs text-slate-600 mt-2">of {totalCount} total</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-600 mb-2">Completion Rate</div>
            <div className="text-3xl font-bold text-blue-600">{completionRate}%</div>
          </Card>
        </div>
        <Card>
          <h3 className="font-semibold mb-4">By Category</h3>
          <div className="space-y-3">
            {['study', 'work', 'personal', 'health', 'errands'].map(cat => {
              const count = tasks.filter(t => t.category === cat && t.status === 'completed').length;
              return count > 0 && (
                <div key={cat} className="flex justify-between items-center">
                  <span className="text-slate-700 capitalize">{cat}</span>
                  <span className="font-semibold text-slate-900">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================
// SHARED COMPONENTS
// ============================================

const Card = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-xl p-6 ${className}`}>
    {children}
  </div>
);

const BackButton = ({ onClick }) => (
  <button onClick={onClick} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 font-medium">
    ← Back
  </button>
);

const TopNav = ({ user, showMenu, setShowMenu, handleLogout, setScreen }) => (
  <div className="relative border-b border-[#155E63]/15 bg-[#FBF8EF]/90">
    <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 md:px-8">
      <div className="font-serif text-lg tracking-[0.08em] text-[#155E63]">🌷 Planora</div>
      <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-[#155E63] transition duration-200 hover:bg-[#F8EDBF]/70">
        <Menu className="h-5 w-5" />
      </button>
      {showMenu && (
        <div className="absolute right-5 top-14 z-50 min-w-[10rem] border border-[#155E63]/15 bg-[#FBF8EF] shadow-sm md:right-8">
          <button onClick={() => { setScreen('progress'); setShowMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm text-[#173B3D] transition duration-200 hover:bg-[#F8EDBF]/80">
            📊 Progress
          </button>
          <button onClick={() => { handleLogout(); setShowMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm text-[#8C8272] transition duration-200 hover:bg-[#F8EDBF]/80 hover:text-[#103F43]">
            Logout
          </button>
        </div>
      )}
    </div>
  </div>
);

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Task</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Biology Chapter 4" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" disabled={loading} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Duration (min)</label>
          <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Energy required</label>
        <select value={energy} onChange={(e) => setEnergy(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading}>
          <option value="study">Study</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="health">Health</option>
          <option value="errands">Errands</option>
        </select>
      </div>
      <button type="submit" disabled={loading} className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium disabled:opacity-50">
        {loading ? 'Adding...' : 'Add Task'}
      </button>
    </form>
  );
};

const PlanInputForm = ({ onSubmit, loading }) => {
  const [availableFrom, setAvailableFrom] = useState('18:00');
  const [availableUntil, setAvailableUntil] = useState('22:00');
  const [energy, setEnergy] = useState('medium');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(availableFrom, availableUntil, energy);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <h3 className="font-semibold mb-4">When are you available?</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">From</label>
            <input type="time" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Until</label>
            <input type="time" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={loading} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">How's your energy today?</h3>
        <div className="flex gap-3">
          {['low', 'medium', 'high'].map(e => (
            <button
              key={e}
              type="button"
              onClick={() => setEnergy(e)}
              disabled={loading}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${energy === e ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} disabled:opacity-50`}
            >
              {e === 'low' ? '🔴' : e === 'medium' ? '🟡' : '🟢'} {e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      <button type="submit" disabled={loading} className="w-full py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium text-lg disabled:opacity-50">
        {loading ? 'Generating...' : 'Generate Plan'}
      </button>
    </form>
  );
};
