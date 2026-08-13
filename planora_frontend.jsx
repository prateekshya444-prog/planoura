import React, { useState, useEffect } from 'react';
import { ChevronRight, Plus, Clock, CheckCircle2, AlertCircle, Calendar, TrendingUp, Settings, LogOut, Menu } from 'lucide-react';

// ============================================
// MOCK DATA & UTILITIES
// ============================================

const generateId = () => Math.random().toString(36).substr(2, 9);

const mockAIScheduler = (tasks, availableFrom, availableUntil, energy, calendarEvents = []) => {
  // Simple prioritization algorithm
  const priorityMap = { high: 1, medium: 2, low: 3 };
  const energyMatch = (taskEnergy, userEnergy) => {
    if (taskEnergy === userEnergy) return 0;
    if (userEnergy === 'high') return 1;
    if (userEnergy === 'medium' && taskEnergy === 'low') return 0.5;
    return 2;
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    // Overdue first
    if (a.is_overdue && !b.is_overdue) return -1;
    if (!a.is_overdue && b.is_overdue) return 1;
    // Then priority
    if (priorityMap[a.priority] !== priorityMap[b.priority]) {
      return priorityMap[a.priority] - priorityMap[b.priority];
    }
    // Then energy match
    return energyMatch(a.energy_required, energy) - energyMatch(b.energy_required, energy);
  });

  const [startHour, startMin] = availableFrom.split(':').map(Number);
  const [endHour, endMin] = availableUntil.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const totalAvailable = endMinutes - startMinutes;

  const plan = [];
  let currentMinutes = startMinutes;
  const icons = { study: '🧠', work: '📐', personal: '💭', health: '🏃', errands: '🛒', other: '✨' };

  for (const task of sortedTasks) {
    if (currentMinutes + task.estimated_duration > endMinutes) {
      // Move to buffer at end
      continue;
    }

    const startTime = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`;
    const endTime = `${String(Math.floor((currentMinutes + task.estimated_duration) / 60)).padStart(2, '0')}:${String((currentMinutes + task.estimated_duration) % 60).padStart(2, '0')}`;

    plan.push({
      id: `block-${task.id}`,
      task_id: task.id,
      title: task.title,
      category: task.category,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: task.estimated_duration,
      priority: task.priority,
      completed: false,
      type: 'task',
      icon: icons[task.category] || '✨'
    });

    currentMinutes += task.estimated_duration;

    // Add break if tasks remaining and > 60 minutes session
    if (currentMinutes - startMinutes > 60 && sortedTasks.indexOf(task) < sortedTasks.length - 1) {
      const breakStart = currentMinutes;
      currentMinutes += 15;
      if (currentMinutes <= endMinutes) {
        plan.push({
          id: `break-${generateId()}`,
          title: '☕ Break',
          category: 'break',
          start_time: `${String(Math.floor(breakStart / 60)).padStart(2, '0')}:${String(breakStart % 60).padStart(2, '0')}`,
          end_time: `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`,
          duration_minutes: 15,
          type: 'break'
        });
      }
    }
  }

  // Add buffer at end
  if (currentMinutes < endMinutes) {
    const bufferMinutes = endMinutes - currentMinutes;
    plan.push({
      id: `buffer-${generateId()}`,
      title: '✨ Buffer / Review',
      category: 'buffer',
      start_time: `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`,
      end_time: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
      duration_minutes: bufferMinutes,
      type: 'buffer'
    });
  }

  return {
    plan_blocks: plan,
    reasoning: 'Prioritized by urgency, deadline proximity, and your current energy level. Included breaks to maintain focus.'
  };
};

// ============================================
// APP COMPONENT
// ============================================

export default function PlanoraApp() {
  const [screen, setScreen] = useState('auth');
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [todayPlan, setTodayPlan] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  // ============================================
  // AUTH
  // ============================================

  const handleSignUp = (email, password, name) => {
    setUser({
      id: generateId(),
      email,
      name,
      wake_time: '08:00',
      sleep_time: '23:00',
      preferred_study_hours: '',
      preferred_break_duration: 15,
      max_focus_session: 90,
      typical_energy: 'medium'
    });
    setScreen('onboarding');
  };

  const handleLogin = (email, password) => {
    setUser({
      id: generateId(),
      email,
      name: 'Student',
      wake_time: '08:00',
      sleep_time: '23:00',
      typical_energy: 'medium'
    });
    setScreen('today');
  };

  // ============================================
  // TASK MANAGEMENT
  // ============================================

  const addTask = (taskData) => {
    const newTask = {
      id: generateId(),
      ...taskData,
      completed_at: null,
      status: 'pending',
      is_overdue: false
    };
    setTasks([...tasks, newTask]);
  };

  const completeTask = (taskId) => {
    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, completed_at: new Date().toISOString(), status: 'completed' } : t
    ));
    // Update plan if task was in today's plan
    if (todayPlan) {
      setTodayPlan({
        ...todayPlan,
        plan_blocks: todayPlan.plan_blocks.map(b =>
          b.task_id === taskId ? { ...b, completed: true } : b
        )
      });
    }
  };

  const deleteTask = (taskId) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  // ============================================
  // PLANNING
  // ============================================

  const generateTodayPlan = (availableFrom, availableUntil, energyToday) => {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const plan = mockAIScheduler(pendingTasks, availableFrom, availableUntil, energyToday, calendarEvents);
    setTodayPlan({
      id: generateId(),
      plan_blocks: plan.plan_blocks,
      reasoning: plan.reasoning,
      generated_at: new Date().toISOString()
    });
    setScreen('plan-view');
  };

  const replan = (availableFrom, availableUntil, energyToday) => {
    const unfinishedTasks = tasks.filter(t => t.status === 'pending');
    const plan = mockAIScheduler(unfinishedTasks, availableFrom, availableUntil, energyToday);
    setTodayPlan({
      ...todayPlan,
      plan_blocks: plan.plan_blocks,
      reasoning: plan.reasoning,
      last_replanned_at: new Date().toISOString()
    });
    setScreen('plan-view');
  };

  // ============================================
  // SCREENS
  // ============================================

  const AuthScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🌷</div>
          <h1 className="text-3xl font-bold text-slate-900">Planora</h1>
          <p className="text-slate-600 mt-2">Plan your day. Protect your time.</p>
        </div>
        <AuthForm onSignUp={handleSignUp} onLogin={handleLogin} />
      </div>
    </div>
  );

  const OnboardingScreen = () => (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-2">Let's get you set up</h1>
        <p className="text-slate-600 mb-8">Tell us a bit about your schedule</p>
        <OnboardingForm user={user} setUser={setUser} onComplete={() => setScreen('today')} />
      </div>
    </div>
  );

  const TodayScreen = () => {
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const totalCount = tasks.length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
        <TopNav user={user} setUser={setUser} setScreen={setScreen} showMenu={showMenu} setShowMenu={setShowMenu} />

        <div className="max-w-4xl mx-auto p-4 md:p-6">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900">Good morning, {user?.name} 🌷</h1>
            <p className="text-slate-600 mt-2">Let's make today count</p>
          </div>

          {/* Progress Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="text-sm text-slate-600 mb-1">Tasks Completed</div>
              <div className="text-3xl font-bold text-slate-900">{completedCount}</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Tasks Remaining</div>
              <div className="text-3xl font-bold text-slate-900">{totalCount - completedCount}</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Total Tasks</div>
              <div className="text-3xl font-bold text-slate-900">{totalCount}</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Planned Today</div>
              <div className="text-3xl font-bold text-slate-900">{todayPlan ? '✓' : '—'}</div>
            </Card>
          </div>

          {/* Today's Plan */}
          {todayPlan ? (
            <Card className="mb-8">
              <h2 className="text-xl font-bold mb-4">Today's Plan</h2>
              <div className="space-y-2 mb-6">
                {todayPlan.plan_blocks.map(block => (
                  <div key={block.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition">
                    <div className="text-2xl">{block.icon || (block.type === 'break' ? '☕' : block.type === 'buffer' ? '✨' : '📌')}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{block.title}</div>
                      <div className="text-sm text-slate-600">{block.start_time} → {block.end_time} ({block.duration_minutes}m)</div>
                    </div>
                    {block.type === 'task' && (
                      <button
                        onClick={() => completeTask(block.task_id)}
                        className={`px-3 py-1 rounded text-sm font-medium transition ${
                          block.completed
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {block.completed ? '✓ Done' : 'Mark Done'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-600 italic mb-4">💡 {todayPlan.reasoning}</p>
              <button
                onClick={() => setScreen('replan')}
                className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
              >
                Replan My Day
              </button>
            </Card>
          ) : (
            <Card className="mb-8 text-center py-8">
              <Clock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 mb-4">No plan for today yet</p>
              <button
                onClick={() => setScreen('plan-input')}
                className="inline-block px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
              >
                Plan My Day
              </button>
            </Card>
          )}

          {/* Quick Add Task */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-semibold mb-4">Pending Tasks</h3>
              {tasks.filter(t => t.status === 'pending').length === 0 ? (
                <p className="text-slate-600 text-sm">No pending tasks</p>
              ) : (
                <div className="space-y-2">
                  {tasks.filter(t => t.status === 'pending').map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{task.title}</div>
                        <div className="text-xs text-slate-600">{task.estimated_duration}m · {task.priority}</div>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setScreen('add-task')}
                className="w-full mt-4 py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-slate-400 hover:text-slate-700 transition text-sm font-medium"
              >
                + Add Task
              </button>
            </Card>

            <Card>
              <h3 className="font-semibold mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setScreen('calendar')}
                  className="w-full p-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-left text-sm font-medium text-slate-900 transition"
                >
                  📅 View Calendar
                </button>
                <button
                  onClick={() => setScreen('progress')}
                  className="w-full p-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-left text-sm font-medium text-slate-900 transition"
                >
                  📊 View Progress
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const AddTaskScreen = () => (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={() => setScreen('today')} />
        <h1 className="text-2xl font-bold mb-8">Add a Task</h1>
        <TaskForm onSubmit={(taskData) => { addTask(taskData); setScreen('today'); }} />
      </div>
    </div>
  );

  const PlanInputScreen = () => (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={() => setScreen('today')} />
        <h1 className="text-2xl font-bold mb-8">Plan My Day</h1>
        <PlanInputForm onSubmit={generateTodayPlan} />
      </div>
    </div>
  );

  const PlanViewScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-6">
      <div className="max-w-4xl mx-auto">
        <BackButton onClick={() => setScreen('today')} />
        {todayPlan && (
          <div className="mt-8">
            <h1 className="text-3xl font-bold mb-2">Your Plan</h1>
            <p className="text-slate-600 mb-8">Tap "Mark Done" as you complete tasks</p>

            <div className="space-y-3 mb-8">
              {todayPlan.plan_blocks.map(block => (
                <Card key={block.id}>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{block.icon || '📌'}</div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{block.title}</div>
                      <div className="text-sm text-slate-600">{block.start_time} → {block.end_time}</div>
                    </div>
                    {block.type === 'task' && (
                      <button
                        onClick={() => completeTask(block.task_id)}
                        className={`px-4 py-2 rounded font-medium transition ${
                          block.completed
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {block.completed ? '✓ Done' : 'Mark Done'}
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <Card className="mb-8">
              <p className="text-slate-700 mb-4">
                <span className="font-semibold">Why this order?</span> {todayPlan.reasoning}
              </p>
            </Card>

            <div className="flex gap-4">
              <button
                onClick={() => setScreen('replan')}
                className="flex-1 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
              >
                Replan
              </button>
              <button
                onClick={() => setScreen('today')}
                className="flex-1 py-3 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition font-medium"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const ReplanScreen = () => (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={() => setScreen('plan-view')} />
        <h1 className="text-2xl font-bold mb-8">Adjust Your Plan</h1>
        <PlanInputForm onSubmit={replan} />
      </div>
    </div>
  );

  const CalendarScreen = () => (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={() => setScreen('today')} />
        <h1 className="text-2xl font-bold mb-8">Calendar</h1>
        <CalendarForm onAdd={(event) => { setCalendarEvents([...calendarEvents, { id: generateId(), ...event }]); }} />
        {calendarEvents.length > 0 && (
          <div className="mt-8">
            <h3 className="font-semibold mb-4">Your Commitments</h3>
            <div className="space-y-2">
              {calendarEvents.map(event => (
                <Card key={event.id}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{event.title}</div>
                      <div className="text-sm text-slate-600">{event.start_datetime} → {event.end_datetime}</div>
                    </div>
                    <button
                      onClick={() => setCalendarEvents(calendarEvents.filter(e => e.id !== event.id))}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const ProgressScreen = () => {
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const totalCount = tasks.length;
    const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    return (
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-2xl mx-auto">
          <BackButton onClick={() => setScreen('today')} />
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

  // Render
  if (!user) return <AuthScreen />;
  if (screen === 'onboarding') return <OnboardingScreen />;
  if (screen === 'today') return <TodayScreen />;
  if (screen === 'add-task') return <AddTaskScreen />;
  if (screen === 'plan-input') return <PlanInputScreen />;
  if (screen === 'plan-view') return <PlanViewScreen />;
  if (screen === 'replan') return <ReplanScreen />;
  if (screen === 'calendar') return <CalendarScreen />;
  if (screen === 'progress') return <ProgressScreen />;
  return <TodayScreen />;
}

// ============================================
// COMPONENTS
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

const TopNav = ({ user, setUser, setScreen, showMenu, setShowMenu }) => (
  <div className="bg-white border-b border-slate-200">
    <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
      <div className="text-2xl font-bold">🌷 Planora</div>
      <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-slate-100 rounded">
        <Menu className="w-5 h-5" />
      </button>
      {showMenu && (
        <div className="absolute right-4 top-16 bg-white border border-slate-200 rounded-lg shadow-lg">
          <button onClick={() => setScreen('progress')} className="w-full px-4 py-2 text-left hover:bg-slate-100">Progress</button>
          <button onClick={() => setScreen('settings')} className="w-full px-4 py-2 text-left hover:bg-slate-100">Settings</button>
          <button onClick={() => { setUser(null); setShowMenu(false); }} className="w-full px-4 py-2 text-left hover:bg-slate-100 text-red-600">Logout</button>
        </div>
      )}
    </div>
  </div>
);

const AuthForm = ({ onSignUp, onLogin }) => {
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
          required
        />
      </div>
      <button
        type="submit"
        className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
      >
        {mode === 'login' ? 'Log In' : 'Sign Up'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="w-full py-2 text-slate-600 hover:text-slate-900 text-sm"
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </form>
  );
};

const OnboardingForm = ({ user, setUser, onComplete }) => {
  const [wakeTime, setWakeTime] = useState('08:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [energy, setEnergy] = useState('medium');
  const [breakDuration, setBreakDuration] = useState('15');

  const handleSubmit = (e) => {
    e.preventDefault();
    setUser({
      ...user,
      wake_time: wakeTime,
      sleep_time: sleepTime,
      typical_energy: energy,
      preferred_break_duration: parseInt(breakDuration)
    });
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Wake up time</label>
        <input
          type="time"
          value={wakeTime}
          onChange={(e) => setWakeTime(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Sleep time</label>
        <input
          type="time"
          value={sleepTime}
          onChange={(e) => setSleepTime(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Energy level</label>
        <div className="flex gap-3">
          {['low', 'medium', 'high'].map(e => (
            <button
              key={e}
              type="button"
              onClick={() => setEnergy(e)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                energy === e ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {e === 'low' ? '🔴' : e === 'medium' ? '🟡' : '🟢'} {e}
            </button>
          ))}
        </div>
      </div>
      <button
        type="submit"
        className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
      >
        Let's Go
      </button>
    </form>
  );
};

const TaskForm = ({ onSubmit }) => {
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
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Biology Chapter 4"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Duration (min)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Energy required</label>
        <select value={energy} onChange={(e) => setEnergy(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
          <option value="study">Study</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="health">Health</option>
          <option value="errands">Errands</option>
          <option value="other">Other</option>
        </select>
      </div>
      <button type="submit" className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium">
        Add Task
      </button>
    </form>
  );
};

const PlanInputForm = ({ onSubmit }) => {
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
            <input
              type="time"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Until</label>
            <input
              type="time"
              value={availableUntil}
              onChange={(e) => setAvailableUntil(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            />
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
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
                energy === e ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {e === 'low' ? '🔴' : e === 'medium' ? '🟡' : '🟢'} {e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium text-lg">
        Generate Plan
      </button>
    </form>
  );
};

const CalendarForm = ({ onAdd }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('class');
  const [startDatetime, setStartDatetime] = useState('');
  const [endDatetime, setEndDatetime] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({ title, type, start_datetime: startDatetime, end_datetime: endDatetime });
    setTitle('');
    setStartDatetime('');
    setEndDatetime('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mb-8">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Event</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Biology Lecture"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
          <option value="class">Class</option>
          <option value="exam">Exam</option>
          <option value="appointment">Appointment</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Start</label>
          <input
            type="datetime-local"
            value={startDatetime}
            onChange={(e) => setStartDatetime(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">End</label>
          <input
            type="datetime-local"
            value={endDatetime}
            onChange={(e) => setEndDatetime(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            required
          />
        </div>
      </div>
      <button type="submit" className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium">
        Add to Calendar
      </button>
    </form>
  );
};
