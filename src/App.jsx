import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { api } from './api/client';
import { greetingForNow, formatLongDate, isCompletedToday, formatDuration, formatDateTime } from './lib/utils';
import { focusFromBlocks, blockDuration, isBlockDone } from './lib/planUtils';
import { AppShell, DesktopSidebar, MobileDock } from './components/layout/AppShell';
import { ErrorBanner, EmptyState, LoadingState, StatCard, ConfirmDialog } from './components/ui/States';
import { PrimaryButton, SecondaryButton, ChoiceRow, FieldLabel, TextInput, SelectInput } from './components/ui/Button';
import { TaskForm } from './components/tasks/TaskForm';
import { TaskCard } from './components/tasks/TaskCard';
import { Timeline, UnscheduledPanel, FocusStrip } from './components/timeline/Timeline';
import { PlanInputForm, PlanViewContent } from './components/plan/PlanForms';

function AuthScreen({ onSignUp, onLogin, loading, error }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-serif text-lg tracking-[0.22em] text-teal">Planora</p>
        <h1 className="mt-6 font-serif text-[2rem] font-medium leading-tight text-ink">Plan your day.<br />Protect your time.</h1>
        <p className="mt-4 max-w-sm text-body text-mist">A calm place to turn a crowded task list into a day you can actually keep.</p>
        <ErrorBanner message={error} />
        <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); mode === 'login' ? onLogin(email, password) : onSignUp(email, password, name); }}>
          {mode === 'signup' && (<div><FieldLabel htmlFor="auth-name">Name</FieldLabel><TextInput id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" disabled={loading} required /></div>)}
          <div><FieldLabel htmlFor="auth-email">Email</FieldLabel><TextInput id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" disabled={loading} required /></div>
          <div><FieldLabel htmlFor="auth-password">Password</FieldLabel><TextInput id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={loading} required /></div>
          <PrimaryButton type="submit" disabled={loading} className="w-full">{loading ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}</PrimaryButton>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} disabled={loading} className="w-full py-3 text-sm text-mist hover:text-teal">{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}</button>
        </form>
      </div>
    </div>
  );
}

function OnboardingScreen({ onComplete }) {
  const [wakeTime, setWakeTime] = useState('08:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [energy, setEnergy] = useState('medium');
  const [breakDuration, setBreakDuration] = useState('15');
  const [maxFocus, setMaxFocus] = useState('90');
  const [studyHours, setStudyHours] = useState('');
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await api.completeOnboarding({
        wake_time: wakeTime,
        sleep_time: sleepTime,
        typical_energy: energy,
        preferred_break_duration: parseInt(breakDuration, 10),
        max_focus_session: parseInt(maxFocus, 10),
        preferred_study_hours: studyHours || null
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory px-5 py-12 md:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-eyebrow text-teal-muted">Welcome</p>
        <h1 className="mt-4 font-serif text-[2rem] font-medium">{step === 0 ? 'Tell us how you naturally work.' : 'A few quiet preferences'}</h1>
        <p className="mt-4 max-w-lg text-body text-mist">{step === 0 ? 'Planora uses this to shape realistic days — never packed beyond the time you actually have.' : 'Wake, sleep, and focus limits become boundaries when planning your day.'}</p>
        <ErrorBanner message={error} />
        {step === 0 ? <div className="mt-10"><PrimaryButton onClick={() => setStep(1)}>Continue</PrimaryButton></div> : (
          <form className="mt-10 space-y-8" onSubmit={save}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div><FieldLabel htmlFor="wake">Wake time</FieldLabel><TextInput id="wake" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} /></div>
              <div><FieldLabel htmlFor="sleep">Sleep time</FieldLabel><TextInput id="sleep" type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} /></div>
              <div><FieldLabel htmlFor="break">Preferred break (min)</FieldLabel><TextInput id="break" type="number" min="5" value={breakDuration} onChange={(e) => setBreakDuration(e.target.value)} /></div>
              <div><FieldLabel htmlFor="focus">Max focus session (min)</FieldLabel><TextInput id="focus" type="number" min="15" value={maxFocus} onChange={(e) => setMaxFocus(e.target.value)} /></div>
            </div>
            <div><p className="planora-label">Typical energy</p><ChoiceRow value={energy} onChange={setEnergy} options={['low', 'medium', 'high']} /></div>
            <div><FieldLabel htmlFor="study">Preferred study hours (optional)</FieldLabel><TextInput id="study" value={studyHours} onChange={(e) => setStudyHours(e.target.value)} placeholder="e.g., 09:00-12:00" /><p className="mt-2 text-xs text-mist">Clear times like 09:00–12:00 help most.</p></div>
            <PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Begin'}</PrimaryButton>
          </form>
        )}
      </div>
    </div>
  );
}

function TodayPage({ user, tasks, todayPlan, completeTask, loading, error, screen, goTo, onLogout }) {
  const pending = tasks.filter((t) => t.status === 'pending');
  const completedToday = tasks.filter(isCompletedToday).length;
  const taskById = Object.fromEntries(tasks.map((t) => [String(t.id), t]));
  const blocks = todayPlan?.plan_blocks || [];
  const hasAgenda = Boolean(todayPlan && blocks.length > 0);
  const focus = hasAgenda ? focusFromBlocks(blocks) : { kind: null, block: null };
  const scheduledDone = blocks.reduce((s, b) => (isBlockDone(b, taskById) ? s + blockDuration(b) : s), 0);
  const scheduledLeft = blocks.reduce((s, b) => (isBlockDone(b, taskById) ? s : s + blockDuration(b)), 0);

  return (
    <div className="flex min-h-screen bg-ivory text-ink">
      <DesktopSidebar screen={screen} goTo={goTo} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <ErrorBanner message={error} />
          <header className="pb-8 lg:pb-10">
            <p className="text-eyebrow text-teal-muted">{formatLongDate()}</p>
            <h1 className="mt-3 max-w-2xl font-serif text-[1.85rem] font-medium leading-[1.12] md:text-[2.45rem]">{greetingForNow()}, {user?.name}.</h1>
            <p className="mt-3 max-w-xl text-body text-mist">{hasAgenda ? 'Here’s your day.' : 'Let’s keep today manageable.'}</p>
          </header>

          <div className="surface mb-8 grid grid-cols-2 lg:grid-cols-4">
            <StatCard label="Completed" value={completedToday} accent />
            <StatCard label="Remaining" value={pending.length} />
            <StatCard label="Scheduled" value={hasAgenda ? formatDuration(scheduledDone) : '—'} />
            <StatCard label="Time left" value={hasAgenda ? formatDuration(scheduledLeft) : '—'} accent={hasAgenda} last />
          </div>

          {loading && !hasAgenda ? <LoadingState /> : hasAgenda ? (
            <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1fr_18rem]">
              <section>
                <FocusStrip focus={focus} taskById={taskById} onComplete={completeTask} />
                <div className="mt-8">
                  <p className="text-eyebrow text-teal-muted">Timeline</p>
                  <h2 className="mt-2 font-serif text-2xl">Today’s plan</h2>
                </div>
                <div className="mt-6"><Timeline plan={todayPlan} tasks={tasks} onComplete={completeTask} highlightNow /></div>
                {todayPlan.reasoning && <p className="mt-6 border-l-2 border-butter pl-4 text-sm italic text-mist">{todayPlan.reasoning}</p>}
                <UnscheduledPanel items={todayPlan.unscheduled_tasks} />
                <PrimaryButton onClick={() => goTo('replan')} className="mt-8">Replan</PrimaryButton>
              </section>
              <aside className="hidden xl:block">
                <p className="text-eyebrow text-teal-muted">Pending</p>
                <div className="mt-4 divide-y divide-teal/10">
                  {pending.slice(0, 5).map((task) => <TaskCard key={task.id} task={task} compact />)}
                </div>
              </aside>
            </div>
          ) : (
            <EmptyState icon={Clock} eyebrow="Unplanned" title="Your day is ready to be planned." description="Add a few tasks, then let Planora arrange them around the time you actually have." action={<div className="flex flex-col gap-3 sm:flex-row"><PrimaryButton onClick={() => goTo('plan-input')}>Plan my day</PrimaryButton><SecondaryButton onClick={() => goTo('add-task')}>Add a task</SecondaryButton></div>} />
          )}
        </main>
        <MobileDock screen={screen} goTo={goTo} />
      </div>
    </div>
  );
}

function TasksPage({ tasks, loading, error, goTo, onLogout, onComplete, onEdit, onDeleteRequest }) {
  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'completed');
  return (
    <AppShell title="Tasks" subtitle="Everything that needs time" screen="tasks" goTo={goTo} onLogout={onLogout} showBack>
      <ErrorBanner message={error} />
      <p className="text-body text-mist">Capture work once. Planora protects the rest of your day around it.</p>
      <div className="mt-8 flex justify-end"><PrimaryButton onClick={() => goTo('add-task')}>Add task</PrimaryButton></div>
      {loading ? <LoadingState className="mt-8" /> : (
        <>
          <section className="mt-10"><h2 className="font-serif text-xl">Open</h2><div className="mt-4 divide-y divide-teal/10">{pending.length ? pending.map((t) => <TaskCard key={t.id} task={t} onComplete={onComplete} onEdit={onEdit} onDelete={onDeleteRequest} />) : <p className="py-4 text-sm text-mist">No open tasks.</p>}</div></section>
          <section className="mt-12"><h2 className="font-serif text-xl text-mist">Completed</h2><div className="mt-4 divide-y divide-teal/10">{completed.length ? completed.map((t) => <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDeleteRequest} />) : <p className="py-4 text-sm text-mist">Nothing completed yet.</p>}</div></section>
        </>
      )}
    </AppShell>
  );
}

function CalendarPage({ events, loading, error, goTo, onLogout, onSubmit, onDeleteRequest }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('class');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const sorted = [...events].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

  return (
    <AppShell title="Calendar" subtitle="Fixed commitments" screen="calendar" goTo={goTo} onLogout={onLogout} showBack>
      <ErrorBanner message={error} />
      <p className="text-body text-mist">These are the commitments Planora protects. They stay fixed while your tasks move around them.</p>
      <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmit({ title, type, start_datetime: start, end_datetime: end }); setTitle(''); setStart(''); setEnd(''); }}>
        <div><FieldLabel htmlFor="ev-title">Commitment</FieldLabel><TextInput id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture, lab, appointment" required disabled={loading} /></div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div><FieldLabel htmlFor="ev-type">Type</FieldLabel><SelectInput id="ev-type" value={type} onChange={(e) => setType(e.target.value)} disabled={loading}><option value="class">Class</option><option value="exam">Exam</option><option value="work">Work</option><option value="personal">Personal</option><option value="other">Other</option></SelectInput></div>
          <div><FieldLabel htmlFor="ev-start">Starts</FieldLabel><TextInput id="ev-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required disabled={loading} /></div>
          <div><FieldLabel htmlFor="ev-end">Ends</FieldLabel><TextInput id="ev-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required disabled={loading} /></div>
        </div>
        <PrimaryButton type="submit" disabled={loading}>{loading ? 'Saving…' : 'Add commitment'}</PrimaryButton>
      </form>
      <section className="mt-12">
        <h2 className="font-serif text-xl">Upcoming</h2>
        {sorted.length === 0 ? <p className="mt-4 text-sm text-mist">No commitments recorded.</p> : (
          <ul className="mt-4 divide-y divide-teal/10">{sorted.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-4 py-4">
              <div><div className="font-medium">{event.title}</div><div className="mt-1 text-sm text-mist">{formatDateTime(event.start_datetime)} → {formatDateTime(event.end_datetime)}</div><div className="mt-1 text-meta text-taupe">{event.type}</div></div>
              <button type="button" onClick={() => onDeleteRequest(event)} className="min-h-11 text-sm text-taupe hover:text-ink">Remove</button>
            </li>
          ))}</ul>
        )}
      </section>
    </AppShell>
  );
}

function ProgressPage({ goTo, onLogout }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getProgress(range).then((res) => { if (active) { setData(res); setError(null); } }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  return (
    <AppShell title="Progress" subtitle="A quiet record" screen="progress" goTo={goTo} onLogout={onLogout} showBack>
      <ErrorBanner message={error} />
      <p className="text-body text-mist">What you’ve kept — not a scoreboard.</p>
      <div className="mt-6"><ChoiceRow value={range} onChange={setRange} options={['week', 'month']} /></div>
      {loading ? <LoadingState /> : data && (
        <>
          <div className="mt-10 grid grid-cols-2 gap-8">
            <div><p className="planora-label">Tasks completed</p><p className="font-serif text-4xl text-teal">{data.tasks_completed}</p><p className="mt-2 text-sm text-taupe">of {data.tasks_total}</p></div>
            <div><p className="planora-label">Completion rate</p><p className="font-serif text-4xl text-ink">{data.completion_rate}%</p><div className="mt-4 h-px bg-teal/15"><div className="h-px bg-teal transition-all" style={{ width: `${data.completion_rate}%` }} /></div></div>
          </div>
          {data.insights?.length > 0 && <ul className="mt-8 space-y-2 text-sm text-mist">{data.insights.map((line) => <li key={line}>{line}</li>)}</ul>}
          <div className="mt-12"><h3 className="font-serif text-xl">By category</h3><div className="mt-4 divide-y divide-teal/10">{(data.by_category || []).length ? data.by_category.map((row) => (<div key={row.category} className="flex justify-between py-3"><span className="capitalize">{row.category}</span><span className="font-serif text-lg text-teal">{row.completed}</span></div>)) : <p className="py-4 text-sm text-mist">No completed tasks in this period.</p>}</div></div>
        </>
      )}
    </AppShell>
  );
}

function SettingsPage({ user, goTo, onLogout, onSaved }) {
  const [wakeTime, setWakeTime] = useState(user?.wake_time?.slice(0, 5) || '08:00');
  const [sleepTime, setSleepTime] = useState(user?.sleep_time?.slice(0, 5) || '23:00');
  const [energy, setEnergy] = useState(user?.typical_energy || 'medium');
  const [breakDuration, setBreakDuration] = useState(String(user?.preferred_break_duration || 15));
  const [maxFocus, setMaxFocus] = useState(String(user?.max_focus_session || 90));
  const [studyHours, setStudyHours] = useState(user?.preferred_study_hours || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const res = await api.completeOnboarding({
        wake_time: wakeTime,
        sleep_time: sleepTime,
        typical_energy: energy,
        preferred_break_duration: parseInt(breakDuration, 10),
        max_focus_session: parseInt(maxFocus, 10),
        preferred_study_hours: studyHours || null
      });
      onSaved(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Settings" subtitle="Planning preferences" screen="settings" goTo={goTo} onLogout={onLogout} showBack>
      <ErrorBanner message={error} />
      {saved && <p className="text-sm text-teal" role="status">Preferences saved.</p>}
      <form className="mt-6 max-w-xl space-y-6" onSubmit={save}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div><FieldLabel htmlFor="s-wake">Wake time</FieldLabel><TextInput id="s-wake" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} /></div>
          <div><FieldLabel htmlFor="s-sleep">Sleep time</FieldLabel><TextInput id="s-sleep" type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} /></div>
          <div><FieldLabel htmlFor="s-break">Break (min)</FieldLabel><TextInput id="s-break" type="number" value={breakDuration} onChange={(e) => setBreakDuration(e.target.value)} /></div>
          <div><FieldLabel htmlFor="s-focus">Max focus (min)</FieldLabel><TextInput id="s-focus" type="number" value={maxFocus} onChange={(e) => setMaxFocus(e.target.value)} /></div>
        </div>
        <div><p className="planora-label">Typical energy</p><ChoiceRow value={energy} onChange={setEnergy} options={['low', 'medium', 'high']} /></div>
        <div><FieldLabel htmlFor="s-study">Study hours note</FieldLabel><TextInput id="s-study" value={studyHours} onChange={(e) => setStudyHours(e.target.value)} /></div>
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</PrimaryButton>
      </form>
      <div className="mt-12 border-t border-teal/10 pt-8"><SecondaryButton onClick={onLogout}>Log out</SecondaryButton></div>
    </AppShell>
  );
}

export default function App() {
  const [screen, setScreen] = useState('splash');
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [todayPlan, setTodayPlan] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const goTo = (next) => { setError(null); setScreen(next); };
  const onLogout = async () => { await api.logout(); setUser(null); setTasks([]); setTodayPlan(null); setCalendarEvents([]); goTo('auth'); };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, planRes, eventsRes] = await Promise.all([api.getTasks(), api.getTodayPlan(), api.getCalendarEvents()]);
      setTasks(tasksRes.tasks || []);
      setTodayPlan(planRes.plan || null);
      setCalendarEvents(eventsRes.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setScreen('auth'); return; }
    api.verifyToken().then((res) => { setUser(res.user); setScreen('today'); loadData(); }).catch(() => { api.setToken(null); setScreen('auth'); });
  }, []);

  const completeTask = async (taskId) => {
    if (!taskId) return;
    try {
      await api.completeTask(taskId);
      const completedAt = new Date().toISOString();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'completed', completed_at: completedAt } : t)));
      setTodayPlan((prev) => prev ? { ...prev, plan_blocks: (prev.plan_blocks || []).map((b) => (b.task_id === taskId ? { ...b, completed: true } : b)) } : prev);
    } catch (err) { setError(err.message); }
  };

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(confirmDelete)}
      title={confirmDelete?.type === 'task' ? 'Delete task?' : 'Remove commitment?'}
      message={confirmDelete?.type === 'task' ? `“${confirmDelete?.item?.title}” will be removed.` : `“${confirmDelete?.item?.title}” will be removed from your calendar.`}
      onCancel={() => setConfirmDelete(null)}
      onConfirm={async () => {
        try {
          if (confirmDelete?.type === 'task') {
            await api.deleteTask(confirmDelete?.item?.id);
            setTasks((prev) => prev.filter((t) => t.id !== confirmDelete?.item?.id));
          } else {
            await api.deleteCalendarEvent(confirmDelete?.item?.id);
            setCalendarEvents((prev) => prev.filter((e) => e.id !== confirmDelete?.item?.id));
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setConfirmDelete(null);
        }
      }}
    />
  );

  if (screen === 'splash') {
    return <div className="flex min-h-screen items-center justify-center bg-ivory"><div className="text-center"><p className="font-serif text-lg tracking-[0.28em] text-teal">Planora</p><p className="mt-4 text-eyebrow text-teal-muted">Plan your day. Protect your time.</p></div></div>;
  }

  if (!user) {
    return (
      <AuthScreen
        onSignUp={async (e, p, n) => { try { setLoading(true); const r = await api.signup(e, p, n); setUser(r.user); goTo('onboarding'); } catch (err) { setError(err.message); } finally { setLoading(false); } }}
        onLogin={async (e, p) => { try { setLoading(true); const r = await api.login(e, p); setUser(r.user); goTo('today'); loadData(); } catch (err) { setError(err.message); } finally { setLoading(false); } }}
        loading={loading}
        error={error}
      />
    );
  }

  if (screen === 'onboarding') {
    return <OnboardingScreen onComplete={() => { goTo('today'); loadData(); }} />;
  }

  const shell = { goTo, onLogout, screen };

  let content;
  if (screen === 'today') content = <TodayPage user={user} tasks={tasks} todayPlan={todayPlan} completeTask={completeTask} loading={loading} error={error} {...shell} />;
  else if (screen === 'tasks') content = <TasksPage tasks={tasks} loading={loading} error={error} {...shell} onComplete={completeTask} onEdit={(t) => { setEditingTask(t); goTo('edit-task'); }} onDeleteRequest={(t) => setConfirmDelete({ type: 'task', item: t })} />;
  else if (screen === 'add-task') content = <AppShell title="Add a task" screen="add-task" showBack {...shell}><ErrorBanner message={error} /><p className="text-body text-mist">Capture what needs time.</p><div className="mt-8"><TaskForm onSubmit={async (data) => { try { setLoading(true); const r = await api.createTask(data); setTasks((prev) => [...prev, r.task]); goTo('tasks'); } catch (err) { setError(err.message); } finally { setLoading(false); } }} loading={loading} submitLabel="Add task" /></div></AppShell>;
  else if (screen === 'edit-task') {
    content = editingTask ? (
      <AppShell title="Edit task" screen="edit-task" showBack {...shell}>
        <ErrorBanner message={error} />
        <div className="mt-8">
          <TaskForm
            initialTask={editingTask}
            onSubmit={async (data) => {
              try {
                setLoading(true);
                const r = await api.updateTask(editingTask.id, data);
                setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? r.task : t)));
                setEditingTask(null);
                goTo('tasks');
              } catch (err) {
                setError(err.message);
              } finally {
                setLoading(false);
              }
            }}
            loading={loading}
            submitLabel="Save changes"
          />
        </div>
      </AppShell>
    ) : (
      <TasksPage tasks={tasks} loading={loading} error={error} {...shell} onComplete={completeTask} onEdit={(t) => { setEditingTask(t); goTo('edit-task'); }} onDeleteRequest={(t) => setConfirmDelete({ type: 'task', item: t })} />
    );
  }
  else if (screen === 'plan-input') content = <AppShell title="Plan my day" subtitle="Available hours" screen="plan-input" showBack {...shell}><ErrorBanner message={error} /><div className="mt-4"><PlanInputForm onSubmit={async (f, u, e) => { try { setLoading(true); const r = await api.generateTodayPlan(f, u, e); setTodayPlan(r.plan); goTo('plan-view'); } catch (err) { setError(err.message); } finally { setLoading(false); } }} loading={loading} /></div></AppShell>;
  else if (screen === 'plan-view') content = <AppShell title="Today’s plan" screen="plan-view" showBack {...shell}><PlanViewContent todayPlan={todayPlan} tasks={tasks} onComplete={completeTask} onReplan={() => goTo('replan')} onToday={() => goTo('today')} /></AppShell>;
  else if (screen === 'replan') content = <AppShell title="Replan" subtitle="Something changed?" screen="replan" showBack {...shell}><p className="text-body text-mist">Let’s adjust the rest of your day. Completed work stays kept.</p><ErrorBanner message={error} /><div className="mt-8"><PlanInputForm submitLabel="Replan" onSubmit={async (f, u, e) => { try { setLoading(true); const r = await api.replantToday(f, u, e); setTodayPlan(r.plan); goTo('plan-view'); } catch (err) { setError(err.message); } finally { setLoading(false); } }} loading={loading} /></div></AppShell>;
  else if (screen === 'calendar') content = <CalendarPage events={calendarEvents} loading={loading} error={error} {...shell} onSubmit={async (data) => { try { setLoading(true); const r = await api.addCalendarEvent(data); setCalendarEvents((prev) => [...prev, r.event]); } catch (err) { setError(err.message); } finally { setLoading(false); } }} onDeleteRequest={(ev) => setConfirmDelete({ type: 'event', item: ev })} />;
  else if (screen === 'progress') content = <ProgressPage {...shell} />;
  else if (screen === 'settings') content = <SettingsPage user={user} {...shell} onSaved={setUser} />;
  else content = <TodayPage user={user} tasks={tasks} todayPlan={todayPlan} completeTask={completeTask} loading={loading} error={error} {...shell} />;

  return (
    <>
      {confirmDialog}
      {content}
    </>
  );
}
