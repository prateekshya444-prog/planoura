const API_URL = (import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).trim()) || '';

class APIClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('token');
  }

  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (this.token) options.headers.Authorization = `Bearer ${this.token}`;
    if (body) options.body = JSON.stringify(body);

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
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }

  signup(email, password, name) {
    return this.request('POST', '/api/auth/signup', { email, password, name }).then((r) => {
      this.setToken(r.token);
      return r;
    });
  }

  login(email, password) {
    return this.request('POST', '/api/auth/login', { email, password }).then((r) => {
      this.setToken(r.token);
      return r;
    });
  }

  logout() {
    this.setToken(null);
    return Promise.resolve();
  }

  verifyToken() {
    return this.request('POST', '/api/auth/verify-token');
  }

  completeOnboarding(data) {
    return this.request('POST', '/api/onboarding/complete', data);
  }

  createTask(taskData) {
    return this.request('POST', '/api/tasks', taskData);
  }

  getTasks(status = null, date = null) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (date) params.append('date', date);
    const qs = params.toString();
    return this.request('GET', qs ? `/api/tasks?${qs}` : '/api/tasks');
  }

  updateTask(id, updates) {
    return this.request('PUT', `/api/tasks/${id}`, updates);
  }

  deleteTask(id) {
    return this.request('DELETE', `/api/tasks/${id}`);
  }

  completeTask(id) {
    return this.request('PATCH', `/api/tasks/${id}/complete`);
  }

  getCalendarEvents(startDate = null, endDate = null) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const qs = params.toString();
    return this.request('GET', qs ? `/api/calendar?${qs}` : '/api/calendar');
  }

  addCalendarEvent(eventData) {
    return this.request('POST', '/api/calendar/events', eventData);
  }

  deleteCalendarEvent(id) {
    return this.request('DELETE', `/api/calendar/events/${id}`);
  }

  generateTodayPlan(availableFrom, availableUntil, energyToday) {
    return this.request('POST', '/api/plan/generate-today', {
      available_from: availableFrom,
      available_until: availableUntil,
      energy_today: energyToday
    });
  }

  replantToday(availableFrom, availableUntil, energyToday) {
    return this.request('POST', '/api/plan/replan', {
      available_from: availableFrom,
      available_until: availableUntil,
      energy_today: energyToday
    });
  }

  getTodayPlan() {
    return this.request('GET', '/api/plan/today');
  }

  getProgress(range = 'week') {
    return this.request('GET', `/api/analytics/progress?range=${range}`);
  }
}

export const api = new APIClient(API_URL);
