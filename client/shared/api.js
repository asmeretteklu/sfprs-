// ============================================================
// SFPRS — API Fetch Wrapper (api.js)
// ============================================================

const API_BASE = window.SFPRS_API_BASE || 'http://localhost';

const SERVICES = {
  auth:    `${API_BASE}:3001`,
  student: `${API_BASE}:3002`,
  finance: `${API_BASE}:3003`,
  notify:  `${API_BASE}:3004`,
  report:  `${API_BASE}:3005`,
};

// ── Core fetch wrapper ────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sfprsRequest(url, options = {}, retries = 3, backoff = 500) {
  if (!navigator.onLine) {
    toast('You are currently offline. Please check your connection.', 'error');
    throw new Error('Offline');
  }

  const defaults = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  // Don't set Content-Type for FormData (browser sets boundary)
  if (options.body instanceof FormData) {
    delete defaults.headers['Content-Type'];
  }

  let res;
  try {
    res = await fetch(url, { ...defaults, ...options });
  } catch (err) {
    if (retries > 0) {
      console.warn(`[API] Retrying ${url} in ${backoff}ms... (${retries} retries left)`);
      await sleep(backoff);
      return sfprsRequest(url, options, retries - 1, backoff * 2);
    }
    toast('Network error — please check your connection.', 'error');
    throw new Error('Network error — please check your connection.');
  }

  // Try to refresh token once on 401
  if (res.status === 401 && !options._retry) {
    const refreshed = await AUTH.refresh();
    if (refreshed) {
      return sfprsRequest(url, { ...options, _retry: true }, retries, backoff);
    } else {
      AUTH.clearUser();
      window.location.href = '/client/login.html';
      return;
    }
  }

  if (res.status === 403) {
    throw new Error('You do not have permission to perform this action.');
  }

  let data;
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else if (ct.includes('text/csv')) {
    data = await res.text();
  } else {
    data = await res.blob();
  }

  if (!res.ok) {
    const msg = (data && data.message) || (data && data.error) || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ── Offline Listener ──────────────────────────────────────────
window.addEventListener('online', () => toast('Back online. Reconnected to network.', 'success'));
window.addEventListener('offline', () => toast('You are offline. Features may be limited.', 'warning'));

// ── Convenience methods ───────────────────────────────────────
const API = {
  get:    (url, opts = {}) => sfprsRequest(url, { method: 'GET', ...opts }),
  post:   (url, body, opts = {}) => sfprsRequest(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), ...opts }),
  patch:  (url, body, opts = {}) => sfprsRequest(url, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  put:    (url, body, opts = {}) => sfprsRequest(url, { method: 'PUT', body: JSON.stringify(body), ...opts }),
  delete: (url, opts = {}) => sfprsRequest(url, { method: 'DELETE', ...opts }),

  // ── Service-specific helpers ──────────────────────────────
  auth:    (path, opts) => API.get(`${SERVICES.auth}${path}`, opts),
  authPost:(path, body, opts) => API.post(`${SERVICES.auth}${path}`, body, opts),

  student:     (path, opts) => API.get(`${SERVICES.student}/api/students${path}`, opts),
  studentPost: (path, body, opts) => API.post(`${SERVICES.student}/api/students${path}`, body, opts),
  studentPatch:(path, body, opts) => API.patch(`${SERVICES.student}/api/students${path}`, body, opts),

  finance:     (path, opts) => API.get(`${SERVICES.finance}/api/finance${path}`, opts),
  financePost: (path, body, opts) => API.post(`${SERVICES.finance}/api/finance${path}`, body, opts),

  report: (path, opts) => API.get(`${SERVICES.report}/api/reports${path}`, opts),
};

// ── Toast notification ────────────────────────────────────────
function toast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  
  let icon = '✓';
  if (type === 'error') icon = '⚠';
  if (type === 'warning') icon = '⚠';
  if (type === 'info') icon = 'ℹ';

  el.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-message">${message}</div>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(100%)';
    el.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Download helper ───────────────────────────────────────────
async function downloadFile(url, filename) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast('Download failed: ' + err.message, 'error');
  }
}

// ── Format helpers ────────────────────────────────────────────
function fmtCurrency(amount, currency = 'ETB') {
  return `${currency} ${parseFloat(amount || 0).toLocaleString('en-ET', { minimumFractionDigits: 2 })}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-ET', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
  const map = {
    active:      'badge-active',
    approved:    'badge-approved',
    completed:   'badge-completed',
    pending:     'badge-pending',
    submitted:   'badge-pending',
    under_review:'badge-review',
    rejected:    'badge-rejected',
    overdue:     'badge-overdue',
    suspended:   'badge-suspended',
    withdrawn:   'badge-suspended',
  };
  const cls = map[status] || 'badge-pending';
  return `<span class="badge ${cls}">${status?.replace(/_/g,' ') || '—'}</span>`;
}

window.API         = API;
window.SERVICES    = SERVICES;
window.toast       = toast;
window.downloadFile = downloadFile;
window.fmtCurrency = fmtCurrency;
window.fmtDate     = fmtDate;
window.fmtDateTime = fmtDateTime;
window.statusBadge = statusBadge;
