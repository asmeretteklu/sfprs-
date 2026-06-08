// ============================================================
// SFPRS — Token & Role Management (auth.js)
// Microlink IT College
// ============================================================

const API_BASE = window.SFPRS_API_BASE || 'http://localhost';

const AUTH = {
  // ── Token storage (sessionStorage as fallback to cookies) ──
  setUser(user) {
    sessionStorage.setItem('sfprs_user', JSON.stringify(user));
  },
  getUser() {
    try {
      return JSON.parse(sessionStorage.getItem('sfprs_user') || 'null');
    } catch { return null; }
  },
  clearUser() {
    sessionStorage.removeItem('sfprs_user');
  },

  // ── Login ─────────────────────────────────────────────────
  async login(email, password) {
    const res = await fetch(`${API_BASE}:3001/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    AUTH.setUser(data.user);
    return data;
  },

  // ── Logout ────────────────────────────────────────────────
  async logout() {
    try {
      await fetch(`${API_BASE}:3001/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    AUTH.clearUser();
    window.location.href = '/client/login.html';
  },

  // ── Refresh token ─────────────────────────────────────────
  async refresh() {
    const res = await fetch(`${API_BASE}:3001/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      AUTH.clearUser();
      return null;
    }
    return res.json();
  },

  // ── Get current user from /auth/me ────────────────────────
  async me() {
    const res = await fetch(`${API_BASE}:3001/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    AUTH.setUser(data);
    return data;
  },

  // ── Role guard: redirect if role not allowed ──────────────
  requireRole(...allowedRoles) {
    const user = AUTH.getUser();
    if (!user) {
      window.location.href = '/client/login.html';
      return false;
    }
    if (!allowedRoles.includes(user.role)) {
      window.location.href = AUTH.roleHomepage(user.role);
      return false;
    }
    return true;
  },

  roleHomepage(role) {
    const map = {
      super_admin:     '/client/admin/console.html',
      finance_officer: '/client/finance/dashboard.html',
      registrar:       '/client/registrar/approvals.html',
      student:         '/client/student/index.html',
    };
    return map[role] || '/client/login.html';
  },

  // ── Inject user info into sidebar ─────────────────────────
  injectSidebarUser() {
    const user = AUTH.getUser();
    if (!user) return;
    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
    document.querySelectorAll('.user-avatar').forEach(el => el.textContent = initials || '?');
    document.querySelectorAll('.user-name').forEach(el => el.textContent = `${user.firstName} ${user.lastName}`);
    document.querySelectorAll('.user-role').forEach(el => {
      const labels = {
        super_admin:     'Super Admin',
        finance_officer: 'Finance Officer',
        registrar:       'Registrar',
        student:         'Student',
      };
      el.textContent = labels[user.role] || user.role;
    });
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => AUTH.logout());

    // Initialize session timeout logic
    AUTH.initSessionTimeout();
  },

  // ── Helper: Time-based Greeting ───────────────────────────
  getGreeting() {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  },

  // ── Session Timeout (Idle tracking) ───────────────────────
  initSessionTimeout() {
    let timeoutTimer;
    const IDLE_LIMIT = 30 * 60 * 1000; // 30 minutes

    const resetTimer = () => {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => {
        if (AUTH.getUser()) {
          AUTH.logout();
          alert('Your session has expired due to inactivity.');
        }
      }, IDLE_LIMIT);
    };

    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evt => 
      document.addEventListener(evt, resetTimer, { passive: true })
    );
    resetTimer();
  }
};

window.AUTH = AUTH;

// ── Language toggle ───────────────────────────────────────────
const LANG = {
  current: localStorage.getItem('sfprs_lang') || 'en',

  set(lang) {
    LANG.current = lang;
    localStorage.setItem('sfprs_lang', lang);
    document.body.classList.toggle('lang-am', lang === 'am');
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
  },

  init() {
    LANG.set(LANG.current);
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => LANG.set(btn.dataset.lang));
    });
  },
};

window.LANG = LANG;
document.addEventListener('DOMContentLoaded', LANG.init);
