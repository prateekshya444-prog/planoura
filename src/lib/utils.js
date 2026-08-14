export const friendlyError = (message) => {
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

export const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const formatLongDate = (value = new Date()) =>
  new Date(value).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export const dueMeta = (due) => {
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

export const formatDateTime = (value) => {
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

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const isCompletedToday = (task) => {
  if (!task || task.status !== 'completed') return false;
  if (!task.completed_at) return true;
  return String(task.completed_at).slice(0, 10) === todayKey();
};

export const formatDuration = (minutes) => {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};
