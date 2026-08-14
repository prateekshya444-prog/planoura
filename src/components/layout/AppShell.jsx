import React from 'react';
import { Calendar, CheckSquare, Clock, LayoutDashboard, Settings, TrendingUp } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'progress', label: 'Progress', icon: TrendingUp }
];

const PLAN_SCREENS = ['plan-input', 'plan-view', 'replan'];

export function DesktopSidebar({ screen, goTo, onLogout }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-teal/10 bg-ivory/80 lg:flex lg:flex-col">
      <div className="px-6 py-8">
        <button type="button" onClick={() => goTo('today')} className="font-serif text-lg tracking-[0.14em] text-teal">
          Planora
        </button>
      </div>
      <nav className="flex-1 px-3" aria-label="Main">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = screen === id || (id === 'today' && PLAN_SCREENS.includes(screen));
          return (
            <button
              key={id}
              type="button"
              onClick={() => goTo(id === 'today' ? 'today' : id)}
              className={`nav-item ${active ? 'nav-item-active' : ''}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => goTo('plan-input')}
          className={`nav-item mt-1 ${PLAN_SCREENS.includes(screen) ? 'nav-item-active' : ''}`}
        >
          <Clock className="h-4 w-4" aria-hidden />
          <span>Plan my day</span>
        </button>
      </nav>
      <div className="border-t border-teal/10 p-3">
        <button type="button" onClick={() => goTo('settings')} className={`nav-item ${screen === 'settings' ? 'nav-item-active' : ''}`}>
          <Settings className="h-4 w-4" aria-hidden />
          <span>Settings</span>
        </button>
        <button type="button" onClick={onLogout} className="nav-item mt-1 text-taupe hover:text-ink">
          Log out
        </button>
      </div>
    </aside>
  );
}

export function MobileDock({ screen, goTo }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-teal/10 bg-ivory/95 backdrop-blur-sm lg:hidden" aria-label="Main">
      <div className="mx-auto grid max-w-lg grid-cols-4 px-1 py-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = screen === id || (id === 'today' && PLAN_SCREENS.includes(screen));
          return (
            <button
              key={id}
              type="button"
              onClick={() => goTo(id)}
              className={`dock-item ${active ? 'dock-item-active' : ''}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children, title, subtitle, screen, goTo, onLogout = () => {}, showBack = false }) {
  return (
    <div className="flex min-h-screen bg-ivory text-ink">
      <DesktopSidebar screen={screen} goTo={goTo} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-teal/10 bg-ivory/90 backdrop-blur-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-3.5">
            <button type="button" onClick={() => goTo('today')} className="font-serif text-base tracking-[0.12em] text-teal">Planora</button>
            <button type="button" onClick={() => goTo('settings')} className="min-h-11 px-2 text-sm text-mist">Settings</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-8 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          {showBack && (
            <button type="button" onClick={() => goTo('today')} className="text-sm text-mist transition hover:text-teal">
              ← Back
            </button>
          )}
          {title && (
            <header className={showBack ? 'mt-4' : ''}>
              {subtitle && <p className="text-eyebrow text-teal-muted">{subtitle}</p>}
              <h1 className="mt-2 font-serif text-[1.85rem] font-medium leading-tight md:text-[2.1rem]">{title}</h1>
            </header>
          )}
          <div className={title ? 'mt-8' : ''}>{children}</div>
        </main>
        <MobileDock screen={screen} goTo={goTo} />
      </div>
    </div>
  );
}
