/* AssetDesk SPA
 * Plain JS with a small reactive core: a central `state` object, `setState`
 * to mutate it, and a `render` pass that redraws the current route.
 * Sections: core/api → ui helpers → router → login → shell → admin views →
 * employee views → boot.
 */
'use strict';

/* ============================== core state ============================== */

const state = {
  token: localStorage.getItem('token') || null,
  user: null,          // { id, email, full_name, role }
  theme: 'indigo',
  route: '',           // current hash route
  cache: {},           // per-view fetched data
  sort: { key: 'id', dir: 'desc' },  // asset table sort
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

/* ================================= api ================================= */

async function api(path, { method = 'GET', body = null, form = null } = {}) {
  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  let payload;
  if (form) {
    payload = form;                       // FormData: browser sets content-type
  } else if (body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  if (res.status === 401 && state.token) {
    // Token expired or revoked — return to login cleanly.
    logout('Your session has ended. Please sign in again.');
    throw new Error('Session ended');
  }
  if (!res.ok) {
    let detail = 'Something went wrong.';
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') detail = data.detail;
      else if (Array.isArray(data.detail) && data.detail[0]?.msg) detail = data.detail[0].msg;
    } catch (_) { /* non-JSON error body */ }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function logout(message) {
  localStorage.removeItem('token');
  state.token = null;
  state.user = null;
  state.cache = {};
  location.hash = '#/login';
  render();
  if (message) toast(message, 'info');
}

/* ============================== ui helpers ============================= */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtMoney(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function toast(message, kind = 'success') {
  const colors = {
    success: 'bg-slate-900 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-accent text-white',
  };
  const el = document.createElement('div');
  el.className = `${colors[kind]} fade-in rounded-xl px-4 py-3 text-sm font-medium shadow-lg text-center`;
  el.textContent = message;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(html) {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div class="absolute inset-0 bg-slate-900/50" onclick="closeModal()"></div>
      <div class="fade-in relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl
                  max-h-[92dvh] overflow-y-auto safe-bottom">
        ${html}
      </div>
    </div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function tagChip(tag) {
  return `<span class="inline-block font-mono text-[11px] font-semibold tracking-wide bg-slate-900 text-slate-100
                       rounded px-1.5 py-0.5">${esc(tag)}</span>`;
}

// Short, stable, human-scannable id for records without their own tag (users, requests).
function idChip(id) {
  return tagChip('#' + String(id).slice(-6).toUpperCase());
}

// Toggles a lightweight client-side search box above a table/card list; filters
// rows by substring match across their visible text. `containerId` wraps
// everything that should be filtered (rows must carry a `data-filter-row` attr).
function filterIcon(containerId) {
  return `<button type="button" class="${btnGhost} !px-3" title="Search / filter"
            onclick="toggleTableFilter('${containerId}')">${iconSearch()}</button>`;
}

function toggleTableFilter(containerId) {
  const box = document.getElementById(`${containerId}-filter-box`);
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) box.querySelector('input')?.focus();
}

function applyTableFilter(containerId, query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll(`[data-filter-container="${containerId}"] [data-filter-row]`)
    .forEach((row) => {
      row.classList.toggle('hidden', q !== '' && !row.textContent.toLowerCase().includes(q));
    });
}

function filterBox(containerId) {
  return `
  <div id="${containerId}-filter-box" class="hidden mb-3">
    <input type="text" placeholder="Filter this table…" class="${inputCls}"
           oninput="applyTableFilter('${containerId}', this.value)" />
  </div>`;
}

function warrantyBadge(status) {
  if (status === 'active')
    return `<span class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 text-xs font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Active</span>`;
  if (status === 'expired')
    return `<span class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Expired</span>`;
  return `<span class="rounded-full bg-slate-100 text-slate-500 px-2.5 py-0.5 text-xs font-semibold">No warranty</span>`;
}

function statusBadge(status) {
  const map = {
    available: 'bg-sky-100 text-sky-800',
    assigned: 'bg-accent-soft text-accent-deep',
    in_repair: 'bg-amber-100 text-amber-800',
    retired: 'bg-slate-200 text-slate-600',
  };
  return `<span class="rounded-full ${map[status] || 'bg-slate-100 text-slate-600'} px-2.5 py-0.5 text-xs font-semibold capitalize">
            ${esc(status.replace('_', ' '))}</span>`;
}

function urgencyBadge(urgency) {
  const map = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-red-100 text-red-700',
  };
  return `<span class="rounded-full ${map[urgency]} px-2.5 py-0.5 text-xs font-semibold capitalize">${esc(urgency)}</span>`;
}

const inputCls = `w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-[15px]
  focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white`;
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';
const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-semibold
  px-4 py-2.5 text-sm hover:bg-accent-deep active:scale-[.98] transition min-h-[44px]
  focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2`;
const btnGhost = `inline-flex items-center justify-center rounded-xl border border-slate-300 text-slate-700
  font-semibold px-4 py-2.5 text-sm hover:bg-slate-50 active:scale-[.98] transition min-h-[44px]
  focus:outline-none focus:ring-2 focus:ring-accent`;

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

/* ================================ router =============================== */

const routes = {
  '#/login': viewLogin,
  '#/admin': viewAdminDashboard,
  '#/admin/assets': viewAssets,
  '#/admin/employees': viewEmployees,
  '#/admin/requests': viewEmployeeRequests,
  '#/admin/maintenance': viewUnderMaintenance,
  '#/admin/warranty': viewWarrantyDetails,
  '#/me': viewMyDashboard,
  '#/me/repair': viewRepairForm,
  '#/me/requests': viewMyRequests,
  '#/me/maintenance': viewMyMaintenance,
};

function currentRoute() {
  const hash = location.hash || '';
  if (routes[hash]) return hash;
  if (!state.token) return '#/login';
  return state.user?.role === 'admin' ? '#/admin' : '#/me';
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

window.addEventListener('hashchange', () => render());

async function render() {
  const app = document.getElementById('app');
  const route = currentRoute();
  state.route = route;

  if (!state.token) {
    app.innerHTML = viewLogin();
    return;
  }
  if (!state.user) {
    app.innerHTML = loadingScreen();
    try {
      const [user, settings] = await Promise.all([
        api('/api/auth/me'),
        api('/api/settings/theme'),
      ]);
      state.user = user;
      applyTheme(settings.theme);
    } catch (err) {
      return; // 401 already routed to login
    }
  }
  // Role guard: employees can't open admin routes and vice-versa.
  if (route.startsWith('#/admin') && state.user.role !== 'admin') return navigate('#/me');
  if (route.startsWith('#/me') && state.user.role === 'admin') return navigate('#/admin');

  const viewFn = routes[route] || (state.user.role === 'admin' ? viewAdminDashboard : viewMyDashboard);
  app.innerHTML = shell(loadingBlock());
  try {
    const content = await viewFn();
    app.innerHTML = shell(content);
    afterRender();
  } catch (err) {
    if (err.message === 'Session ended') return;
    app.innerHTML = shell(errorBlock(err.message));
  }
}

function afterRender() {
  // Bind sortable asset table headers after each draw.
  document.querySelectorAll('[data-sort-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      const dir = state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc';
      setState({ sort: { key, dir } });
    });
  });
}

function loadingScreen() {
  return `<div class="min-h-screen grid place-items-center">
    <div class="w-8 h-8 rounded-full border-[3px] border-slate-300 border-t-accent animate-spin"></div>
  </div>`;
}

function loadingBlock() {
  return `<div class="grid place-items-center py-24">
    <div class="w-8 h-8 rounded-full border-[3px] border-slate-300 border-t-accent animate-spin"></div>
  </div>`;
}

function errorBlock(message) {
  return `<div class="max-w-md mx-auto mt-16 bg-white rounded-2xl border border-red-200 p-6 text-center">
    <p class="font-semibold text-red-700 mb-1">Couldn't load this page</p>
    <p class="text-sm text-slate-600 mb-4">${esc(message)}</p>
    <button class="${btnGhost}" onclick="render()">Try again</button>
  </div>`;
}

/* ================================ login ================================ */

function viewLogin() {
  return `
  <div class="min-h-[100dvh] flex items-center justify-center px-4 py-8
              bg-gradient-to-b from-slate-100 via-slate-100 to-accent-soft">
    <div class="w-full max-w-sm fade-in">
      <div class="flex items-center justify-center gap-2.5 mb-8">
        <div class="w-10 h-10 rounded-xl bg-accent grid place-items-center text-white font-display font-bold text-lg">A</div>
        <div>
          <p class="font-display font-bold text-xl leading-tight"> <span class="font-semibold text-base">IT ASSIST</span></p>
          <p class="text-xs text-slate-500 -mt-0.5">Asset Management</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl shadow-xl shadow-slate-200/70 border border-slate-200 p-6 sm:p-8">
        <h1 class="font-display font-semibold text-lg mb-1">Sign in</h1>
        <p class="text-sm text-slate-500 mb-6">Use your company account to continue.</p>
        <div class="space-y-4">
          <div>
            <label class="${labelCls}" for="login-email">Email</label>
            <input id="login-email" type="email" autocomplete="email" inputmode="email"
                   class="${inputCls}" placeholder="you@company.com" />
          </div>
          <div>
            <label class="${labelCls}" for="login-password">Password</label>
            <input id="login-password" type="password" autocomplete="current-password"
                   class="${inputCls}" placeholder="••••••••"
                   onkeydown="if(event.key==='Enter')submitLogin()" />
          </div>
          <button class="${btnPrimary} w-full" onclick="submitLogin()">Sign in</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return toast('Enter your email and password.', 'error');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('token', data.access_token);
    state.token = data.access_token;
    state.user = null;
    navigate('#/');
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ================================ shell ================================ */

const NAV = {
  admin: [
    { hash: '#/admin', label: 'Dashboard', icon: iconGrid },
    { hash: '#/admin/assets', label: 'Asset Inventory', icon: iconBox },
    { hash: '#/admin/employees', label: 'Employees', icon: iconUsers },
    { hash: '#/admin/requests', label: 'Employee Request', icon: iconWrench },
  ],
  employee: [
    { hash: '#/me', label: 'My assets', icon: iconGrid },
    { hash: '#/me/repair', label: 'New request', icon: iconWrench },
    { hash: '#/me/requests', label: 'Progress', icon: iconClock },
    { hash: '#/me/maintenance', label: 'History', icon: iconShield },
  ],
};

function iconGrid()   { return svg('M4 5.5A1.5 1.5 0 015.5 4h3A1.5 1.5 0 0110 5.5v3A1.5 1.5 0 018.5 10h-3A1.5 1.5 0 014 8.5v-3zm10 0A1.5 1.5 0 0115.5 4h3A1.5 1.5 0 0120 5.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 0114 8.5v-3zm-10 10A1.5 1.5 0 015.5 14h3a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 018.5 20h-3A1.5 1.5 0 014 18.5v-3zm10 0a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3a1.5 1.5 0 01-1.5-1.5v-3z'); }
function iconBox()    { return svg('M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6.2 8.5 12 11.7l5.8-3.2L12 5.3zM6 10.2v5.1l5 2.8v-5.1l-5-2.8zm12 0l-5 2.8v5.1l5-2.8v-5.1z'); }
function iconSwap()   { return svg('M7 7h10.2l-2.6-2.6L16 3l5 5-5 5-1.4-1.4L17.2 9H7V7zm10 10H6.8l2.6 2.6L8 21l-5-5 5-5 1.4 1.4L6.8 15H17v2z'); }
function iconWrench() { return svg('M21.4 6.4a5.5 5.5 0 01-7.3 6.9L7 20.4a2 2 0 11-2.8-2.8l7.1-7.1a5.5 5.5 0 016.9-7.3L15 6.4l2.6 2.6 3.8-2.6z'); }
function iconShield() { return svg('M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3zm0 2.2L6 6.4V11c0 3.9 2.5 7.5 6 8.9 3.5-1.4 6-5 6-8.9V6.4l-6-2.2z'); }
function iconGear()   { return svg('M12 8a4 4 0 100 8 4 4 0 000-8zm8.9 4a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L16 3h-4l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L12 21h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z'); }
function iconClock()  { return svg('M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 3h2v5.6l4 2.3-1 1.7-5-2.9V7z'); }
function iconUsers()  { return svg('M9 11a4 4 0 100-8 4 4 0 000 8zm7-1a3 3 0 10-1.2-5.75A5 5 0 0117 8a5 5 0 01-1 3zM2 20c0-3.9 3.1-7 7-7s7 3.1 7 7v1H2v-1zm15.5-5.5c2.6.4 4.5 2.5 4.5 5.5v1h-4v-1c0-2-.7-3.8-1.9-5.2.5-.2 1-.3 1.4-.3z'); }
function iconSearch()  { return svg('M10 4a6 6 0 104.47 10.03l4.75 4.75 1.41-1.41-4.75-4.75A6 6 0 0010 4zm-4 6a4 4 0 118 0 4 4 0 01-8 0z'); }

function svg(d) {
  return `<svg viewBox="0 0 24 24" class="w-[22px] h-[22px]" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
}

function shell(content) {
  const items = NAV[state.user.role];
  const active = (hash) =>
    state.route === hash ||
    (hash !== '#/admin' && hash !== '#/me' && state.route.startsWith(hash));

  const sideLinks = items.map((item) => `
    <a href="${item.hash}" class="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition
        ${active(item.hash)
          ? 'bg-accent text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100'}">
      ${item.icon()} ${item.label}
    </a>`).join('');

  const bottomLinks = items.map((item) => `
    <a href="${item.hash}" class="flex flex-col items-center gap-0.5 flex-1 py-2 text-[11px] font-medium
        ${active(item.hash) ? 'text-accent' : 'text-slate-500'}">
      ${item.icon()} <span>${item.label.split(' ')[0]}</span>
    </a>`).join('');

  return `
  <div class="min-h-[100dvh] md:flex">
    <!-- Desktop sidebar -->
    <aside class="hidden md:flex md:flex-col w-60 shrink-0 border-r border-slate-200 bg-white
                  sticky top-0 h-[100dvh] p-4">
      <div class="flex items-center gap-2.5 px-2 mb-8">
        <div class="w-9 h-9 rounded-xl bg-accent grid place-items-center text-white font-display font-bold">A</div>
        <div class="leading-tight">
          <p class="text-[11px] font-semibold text-slate-500 -mt-0.5">IT ASSIST</p>
        </div>
      </div>
      <nav class="space-y-1 flex-1">${sideLinks}</nav>
      <div class="border-t border-slate-200 pt-4 px-2">
        <p class="text-sm font-semibold truncate">${esc(state.user.full_name)}</p>
        <p class="text-xs text-slate-500 capitalize mb-3">${esc(state.user.role)}</p>
        <button class="text-sm font-medium text-slate-500 hover:text-red-600" onclick="logout()">Sign out</button>
      </div>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Mobile top bar -->
      <header class="md:hidden sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200
                     flex items-center justify-between px-4 h-14">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-accent grid place-items-center text-white font-display font-bold text-sm">A</div>
          <span class="font-display font-bold">IT ASSIST</span>
        </div>
        <button class="text-sm font-medium text-slate-500 min-h-[44px] px-2" onclick="logout()">Sign out</button>
      </header>

      <main class="flex-1 px-4 md:px-8 py-5 md:py-8 pb-24 md:pb-8 max-w-6xl w-full mx-auto fade-in">
        ${content}
      </main>
    </div>

    <!-- Mobile bottom tab bar -->
    <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex safe-bottom">
      ${bottomLinks}
    </nav>
  </div>`;
}

function pageHead(title, subtitle, actionsHtml = '') {
  return `
  <div class="flex flex-wrap items-end justify-between gap-3 mb-6">
    <div>
      <h1 class="font-display font-bold text-2xl md:text-3xl">${title}</h1>
      ${subtitle ? `<p class="text-sm text-slate-500 mt-1">${subtitle}</p>` : ''}
    </div>
    ${actionsHtml ? `<div class="flex gap-2">${actionsHtml}</div>` : ''}
  </div>`;
}

/* ============================ admin: overview =========================== */

async function viewAdminDashboard() {
  const assets = await api('/api/assets');
  state.cache.assets = assets;

  const metric = (label, value, tone, href) => {
    const inner = `
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${label}</p>
      <p class="font-display font-bold text-3xl mt-1 ${tone}">${value}</p>`;
    return href
      ? `<a href="${href}" class="block bg-white rounded-2xl border border-slate-200 p-4 md:p-5 hover:border-accent transition">${inner}</a>`
      : `<div class="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">${inner}</div>`;
  };

  const assigned = assets.filter((a) => a.status === 'assigned').length;
  const available = assets.filter((a) => a.status === 'available').length;
  const underMaintenance = assets.filter((a) => a.status === 'in_repair').length;

  const themeDot = (name, colorCls) => `
    <button onclick="setTheme('${name}')" title="${name} theme"
      class="w-5 h-5 rounded-full ${colorCls} ${state.theme === name ? 'ring-2 ring-offset-2 ring-accent' : ''}"></button>`;

  const categoryCounts = {};
  assets.forEach((a) => {
    const label = a.category_name || 'Uncategorized';
    categoryCounts[label] = (categoryCounts[label] || 0) + 1;
  });
  const categoryRows = Object.entries(categoryCounts).map(([name, count]) => `
    <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span class="flex items-center gap-2 text-sm text-slate-700">${iconBox()} ${esc(name)}</span>
      <span class="font-semibold text-sm">${count}</span>
    </div>`).join('');

  return `
  ${pageHead('Dashboard', 'Overview of IT assets', `
    <button class="${btnGhost} !py-2 text-xs" onclick="openAuditLogModal()">Activity log</button>
    <span class="flex items-center gap-1.5 px-1">${themeDot('slate', 'bg-slate-700')}${themeDot('indigo', 'bg-indigo-600')}${themeDot('emerald', 'bg-emerald-600')}</span>
  `)}

  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    ${metric('Total Assets', assets.length, 'text-slate-900')}
    ${metric('Assigned', String(assigned).padStart(2, '0'), 'text-accent')}
    ${metric('Available', String(available).padStart(2, '0'), 'text-sky-600')}
    ${metric('Under Maintainance', String(underMaintenance).padStart(2, '0'), 'text-amber-600', '#/admin/maintenance')}
  </div>

  <a href="#/admin/warranty" class="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 mb-8
                                     hover:border-accent transition max-w-sm">
    <span class="w-10 h-10 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0">${iconShield()}</span>
    <span class="text-sm font-semibold leading-snug">Warranty / Guarantee / License Detail</span>
  </a>

  <div class="grid lg:grid-cols-2 gap-6">
    <section class="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 class="font-display font-semibold mb-3">Assets By Category</h2>
      ${categoryRows || '<p class="text-sm text-slate-500">No assets yet.</p>'}
    </section>
    <section class="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 class="font-display font-semibold mb-3">Notifications</h2>
      <p class="text-sm text-slate-500">No notifications yet.</p>
    </section>
  </div>`;
}

/* ============================= admin: assets ============================ */

async function viewAssets() {
  const [assets, categories, fields, users, assignments] = await Promise.all([
    api('/api/assets'),
    api('/api/admin/categories'),
    api('/api/admin/custom-fields'),
    api('/api/admin/users'),
    api('/api/assets/assignments/history'),
  ]);
  state.cache.assets = assets;
  state.cache.categories = categories;
  state.cache.fields = fields;
  state.cache.users = users;
  state.cache.assignments = assignments;

  const { key, dir } = state.sort;
  const sorted = [...assets].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'string') { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = (colKey) => key === colKey ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (colKey, label, extra = '') => `
    <th data-sort-key="${colKey}" class="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold
        uppercase tracking-wide text-slate-500 hover:text-accent whitespace-nowrap ${extra}">
      ${label}${arrow(colKey)}</th>`;

  const rows = sorted.map((a) => `
    <tr data-filter-row class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onclick="openAssetModal('${a.id}')">
      <td class="px-4 py-3 whitespace-nowrap">${tagChip(a.asset_tag)}</td>
      <td class="px-4 py-3 font-medium min-w-[10rem]">${esc(a.name)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(a.category_name)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(a.assigned_to_name || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">${statusBadge(a.status)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(a.location || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">${warrantyBadge(a.warranty_status)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${fmtDate(a.warranty_expiry)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${fmtMoney(a.price)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-center">${a.maintenance_count}</td>
    </tr>`).join('');

  const cards = sorted.map((a) => `
    <button data-filter-row class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 active:scale-[.99] transition"
            onclick="openAssetModal('${a.id}')">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0">
          <p class="font-semibold truncate">${esc(a.name)}</p>
          <p class="text-xs text-slate-500">${esc(a.category_name)} · ${esc(a.location || 'No location')}</p>
        </div>
        ${tagChip(a.asset_tag)}
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        ${statusBadge(a.status)} ${warrantyBadge(a.warranty_status)}
        <span class="ml-auto font-medium">${fmtMoney(a.price)}</span>
      </div>
    </button>`).join('');

  return `
  ${pageHead('Asset Inventory', 'Overview of IT assets', `
    <button class="${btnGhost} !py-2 text-xs" onclick="openManageCategoriesModal()">Manage categories</button>
    <button class="${btnGhost} !py-2 text-xs" onclick="openManageFieldsModal()">Manage fields</button>
    ${filterIcon('asset-inventory')}
    <button class="${btnPrimary}" onclick="openAssetModal(null)">+ Add New Assets</button>`)}

  <div data-filter-container="asset-inventory">
    ${filterBox('asset-inventory')}

    <!-- Mobile: card view -->
    <div class="md:hidden space-y-3">${cards || emptyState('No assets yet', 'Add your first asset to get started.')}</div>

    <!-- Desktop: sortable table (also swipe-scrollable if it overflows) -->
    <div class="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="table-scroll">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              ${th('asset_tag', 'Asset ID')}${th('name', 'Name')}${th('category_name', 'Category')}
              ${th('assigned_to_name', 'Assigned To')}${th('status', 'Status')}${th('location', 'Location')}
              ${th('warranty_status', 'Warranty')}${th('warranty_expiry', 'Warranty Exp Date')}
              ${th('price', 'Price')}${th('maintenance_count', 'No of Maintainance')}
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="10" class="px-4 py-10 text-center text-slate-500">No assets yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function emptyState(title, hint) {
  return `<div class="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
    <p class="font-semibold">${title}</p><p class="text-sm text-slate-500 mt-1">${hint}</p></div>`;
}

function customFieldInput(field, value) {
  const val = value ?? '';
  const id = `cf-${field.id}`;
  if (field.field_type === 'dropdown') {
    return `<select id="${id}" class="${inputCls}">
      <option value="">—</option>
      ${field.options.map((o) => `<option ${o.value === val ? 'selected' : ''}>${esc(o.value)}</option>`).join('')}
    </select>`;
  }
  const type = field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text';
  return `<input id="${id}" type="${type}" value="${esc(val)}" class="${inputCls}" />`;
}

function assetAssignmentSection(asset) {
  if (!asset) return '';
  const active = state.cache.assignments.find((h) => h.asset_id === asset.id && !h.returned_at);
  const history = state.cache.assignments.filter((h) => h.asset_id === asset.id);
  const historyList = history.map((h) => `
    <div class="py-2 border-b border-slate-100 last:border-0 text-xs text-slate-600">
      <span class="font-medium text-slate-800">${esc(h.employee_name)}</span> ·
      ${fmtDateTime(h.assigned_at)}${h.returned_at ? ` → returned ${fmtDateTime(h.returned_at)} (${esc(h.return_condition)})` : ' · currently out'}
    </div>`).join('');

  return `
  <div class="border-t border-slate-200 pt-4">
    <div class="flex items-center justify-between mb-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Assignment</p>
      ${asset.status === 'available'
        ? `<button class="${btnGhost} !py-1.5 text-xs" onclick="openAssignModal('${asset.id}')">Assign to employee</button>`
        : asset.status === 'assigned' && active
        ? `<button class="${btnGhost} !py-1.5 text-xs" onclick="openReturnModal('${active.id}')">Record return</button>`
        : ''}
    </div>
    ${historyList || '<p class="text-xs text-slate-500">No assignment history yet.</p>'}
  </div>`;
}

function openAssetModal(assetId) {
  const asset = assetId ? state.cache.assets.find((a) => a.id === assetId) : null;
  const categories = state.cache.categories.filter((c) => c.is_active || (asset && c.id === asset.category_id));
  const fields = state.cache.fields;
  const cv = {};
  (asset?.custom_values || []).forEach((v) => { cv[v.custom_field_id] = v.value; });

  openModal(`
  <div class="p-5 sm:p-6">
    <div class="flex items-center justify-between mb-5">
      <h2 class="font-display font-semibold text-lg">${asset ? 'Edit asset' : 'Add asset'}</h2>
      <button class="text-slate-400 hover:text-slate-700 text-xl leading-none min-h-[44px] min-w-[44px]" onclick="closeModal()">×</button>
    </div>
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="${labelCls}">Asset ID / tag</label>
          <input id="a-tag" class="${inputCls} font-mono" value="${esc(asset?.asset_tag || '')}"
                 ${asset ? 'disabled' : ''} placeholder="AST-0007" /></div>
        <div><label class="${labelCls}">Category</label>
          <select id="a-category" class="${inputCls}">
            ${categories.map((c) => `<option value="${c.id}" ${asset?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
      </div>
      <div><label class="${labelCls}">Name</label>
        <input id="a-name" class="${inputCls}" value="${esc(asset?.name || '')}" placeholder='MacBook Pro 14"' /></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="${labelCls}">Purchase date</label>
          <input id="a-purchase" type="date" class="${inputCls}" value="${esc(asset?.purchase_date || '')}" /></div>
        <div><label class="${labelCls}">Price (USD)</label>
          <input id="a-price" type="number" min="0" step="0.01" class="${inputCls}" value="${esc(asset?.price ?? '')}" /></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="${labelCls}">Vendor</label>
          <input id="a-vendor" class="${inputCls}" value="${esc(asset?.vendor || '')}" /></div>
        <div><label class="${labelCls}">Warranty expiry</label>
          <input id="a-warranty" type="date" class="${inputCls}" value="${esc(asset?.warranty_expiry || '')}" /></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="${labelCls}">Location</label>
          <input id="a-location" class="${inputCls}" value="${esc(asset?.location || '')}" placeholder="HQ · 3rd floor" /></div>
        ${asset ? `<div><label class="${labelCls}">No of Maintainance</label>
          <input class="${inputCls} bg-slate-50 text-slate-500" value="${asset.maintenance_count}" disabled /></div>` : ''}
      </div>
      <div><label class="${labelCls}">Terms & Conditions</label>
        <textarea id="a-terms" rows="3" class="${inputCls}" placeholder="Warranty terms, license conditions…">${esc(asset?.terms_conditions || '')}</textarea></div>
      ${fields.length ? `
      <div class="border-t border-slate-200 pt-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Custom fields</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${fields.map((f) => `<div><label class="${labelCls}">${esc(f.name)}</label>${customFieldInput(f, cv[f.id])}</div>`).join('')}
        </div>
      </div>` : ''}
      ${assetAssignmentSection(asset)}
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2">
        ${asset && asset.status !== 'retired' && asset.status !== 'assigned'
          ? `<button class="${btnGhost} text-red-600 border-red-200 hover:bg-red-50 sm:mr-auto"
               onclick="retireAsset('${asset.id}')">Retire asset</button>` : ''}
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="saveAsset(${asset ? `'${asset.id}'` : 'null'})">
          ${asset ? 'Save changes' : 'Add asset'}</button>
      </div>
    </div>
  </div>`);
}

async function saveAsset(assetId) {
  const val = (id) => document.getElementById(id).value.trim();
  const custom_values = state.cache.fields.map((f) => ({
    custom_field_id: f.id,
    value: document.getElementById(`cf-${f.id}`).value.trim() || null,
  }));
  const body = {
    name: val('a-name'),
    category_id: val('a-category'),
    purchase_date: val('a-purchase') || null,
    price: val('a-price') === '' ? null : Number(val('a-price')),
    vendor: val('a-vendor') || null,
    warranty_expiry: val('a-warranty') || null,
    location: val('a-location') || null,
    terms_conditions: val('a-terms') || null,
    custom_values,
  };
  if (!body.name) return toast('Give the asset a name.', 'error');
  try {
    if (assetId) {
      await api(`/api/assets/${assetId}`, { method: 'PUT', body });
      toast('Asset updated.');
    } else {
      body.asset_tag = val('a-tag');
      if (!body.asset_tag) return toast('Give the asset an ID tag.', 'error');
      await api('/api/assets', { method: 'POST', body });
      toast('Asset added.');
    }
    closeModal();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

async function retireAsset(assetId) {
  try {
    await api(`/api/assets/${assetId}`, { method: 'DELETE' });
    toast('Asset retired.');
    closeModal();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ========================== admin: assignments ========================== */
/* Assignment/return actions are launched from within the asset edit modal
 * (see assetAssignmentSection) rather than from a dedicated page. */

function openAssignModal(presetAssetId = null) {
  const available = presetAssetId
    ? state.cache.assets.filter((a) => a.id === presetAssetId)
    : state.cache.assets.filter((a) => a.status === 'available');
  const employees = state.cache.users.filter((u) => u.is_active);
  if (!available.length) return toast('No available assets to assign.', 'info');
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-5">Assign an asset</h2>
    <div class="space-y-4">
      <div><label class="${labelCls}">Asset</label>
        <select id="as-asset" class="${inputCls}" ${presetAssetId ? 'disabled' : ''}>
          ${available.map((a) => `<option value="${a.id}">${esc(a.asset_tag)} — ${esc(a.name)}</option>`).join('')}
        </select></div>
      <div><label class="${labelCls}">Employee</label>
        <select id="as-emp" class="${inputCls}">
          ${employees.map((u) => `<option value="${u.id}">${esc(u.full_name)} (${esc(u.email)})</option>`).join('')}
        </select></div>
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="submitAssign()">Assign</button>
      </div>
    </div>
  </div>`);
}

async function submitAssign() {
  try {
    await api('/api/assets/assign', { method: 'POST', body: {
      asset_id: document.getElementById('as-asset').value,
      employee_id: document.getElementById('as-emp').value,
    }});
    toast('Asset assigned.');
    closeModal();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

function openReturnModal(assignmentId) {
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-1">Record a return</h2>
    <p class="text-sm text-slate-500 mb-5">Note the date, condition, and why it's coming back.</p>
    <div class="space-y-4">
      <div><label class="${labelCls}">Return date & time</label>
        <input id="ret-date" type="datetime-local" class="${inputCls}" /></div>
      <div><label class="${labelCls}">Condition on return</label>
        <select id="ret-cond" class="${inputCls}">
          <option value="excellent">Excellent — like new</option>
          <option value="good" selected>Good — normal wear</option>
          <option value="fair">Fair — visible wear</option>
          <option value="damaged">Damaged</option>
        </select></div>
      <div><label class="${labelCls}">Reason for return</label>
        <textarea id="ret-reason" rows="3" class="${inputCls}" placeholder="Employee offboarding, upgrade, end of project…"></textarea></div>
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="submitReturn('${assignmentId}')">Save return</button>
      </div>
    </div>
  </div>`);
}

async function submitReturn(assignmentId) {
  const reason = document.getElementById('ret-reason').value.trim();
  if (!reason) return toast('Add a short reason for the return.', 'error');
  const dateVal = document.getElementById('ret-date').value;
  try {
    await api(`/api/assets/assignments/${assignmentId}/return`, { method: 'POST', body: {
      return_condition: document.getElementById('ret-cond').value,
      return_reason: reason,
      returned_at: dateVal ? new Date(dateVal).toISOString() : null,
    }});
    toast('Return recorded.');
    closeModal();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ============================ admin: requests ============================ */

function requestNextAction(r) {
  if (r.status === 'submitted')
    return `<button class="${btnGhost} !py-2 text-xs" onclick="advanceRepair('${r.id}', 'acknowledged')">Acknowledge</button>`;
  if (r.status === 'acknowledged')
    return `<button class="${btnGhost} !py-2 text-xs" onclick="advanceRepair('${r.id}', 'in_repair')">Start repair</button>`;
  return '';
}

function openRequestDetailsModal(id) {
  const r = state.cache.repairs.find((x) => x.id === id);
  if (!r) return;
  openModal(`
  <div class="p-5 sm:p-6">
    <div class="flex items-center justify-between mb-1">
      <h2 class="font-display font-semibold text-lg">${esc(r.asset_name)} ${tagChip(r.asset_tag)}</h2>
      <button class="text-slate-400 hover:text-slate-700 text-xl leading-none min-h-[44px] min-w-[44px]" onclick="closeModal()">×</button>
    </div>
    <p class="text-xs text-slate-500 mb-4">${esc(r.employee_name)}${r.employee_department ? ' · ' + esc(r.employee_department) : ''} · ${fmtDateTime(r.created_at)}</p>
    <div class="flex gap-2 mb-4">${urgencyBadge(r.urgency)}
      <span class="rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-xs font-semibold capitalize">${esc(r.status.replace('_',' '))}</span></div>
    <p class="text-sm text-slate-700 mb-4">${esc(r.description)}</p>
    ${r.photo_path ? `<a href="${esc(r.photo_path)}" target="_blank" rel="noopener">
      <img src="${esc(r.photo_path)}" alt="Damage photo" class="rounded-xl border border-slate-200 max-h-48 mb-4" /></a>` : ''}
    ${progressBar(r.status_step)}
    ${r.status !== 'resolved' ? `
    <div class="flex flex-wrap gap-2 mt-5">
      ${requestNextAction(r)}
      <button class="${btnPrimary} !py-2 text-xs" onclick="openResolveModal('${r.id}')">Resolve & log</button>
    </div>` : ''}
  </div>`);
}

async function viewEmployeeRequests() {
  const repairs = await api('/api/repairs');
  state.cache.repairs = repairs;

  const row = (r) => `
    <tr data-filter-row class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onclick="openRequestDetailsModal('${r.id}')">
      <td class="px-4 py-3 whitespace-nowrap">${idChip(r.id)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(r.req_type)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(r.category_name || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">${idChip(r.employee_id)}</td>
      <td class="px-4 py-3 font-medium whitespace-nowrap">${esc(r.employee_name)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(r.employee_department || '—')}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${fmtDate(r.created_at)}</td>
      <td class="px-4 py-3 whitespace-nowrap capitalize">${esc(r.status.replace('_', ' '))}</td>
    </tr>`;

  const card = (r) => `
    <button data-filter-row class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4"
            onclick="openRequestDetailsModal('${r.id}')">
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="font-semibold">${esc(r.asset_name)} ${tagChip(r.asset_tag)}</p>
        <span class="text-xs font-semibold capitalize text-slate-500">${esc(r.status.replace('_',' '))}</span>
      </div>
      <p class="text-xs text-slate-500">${esc(r.employee_name)}${r.employee_department ? ' · ' + esc(r.employee_department) : ''} · ${fmtDate(r.created_at)}</p>
    </button>`;

  return `
  ${pageHead('Employee Requests', 'Every request raised by an employee.', filterIcon('emp-requests'))}
  <div data-filter-container="emp-requests">
    ${filterBox('emp-requests')}
    <div class="md:hidden space-y-3">${repairs.map(card).join('') || emptyState('No requests yet', 'Employee requests will appear here.')}</div>
    <div class="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="table-scroll">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Req ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Req Type</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Emp ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Emp Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Dept</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>${repairs.map(row).join('') || `<tr><td colspan="8" class="px-4 py-10 text-center text-slate-500">No requests yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

async function viewUnderMaintenance() {
  const repairs = await api('/api/repairs');
  state.cache.repairs = repairs;
  const open = repairs.filter((r) => r.status !== 'resolved');

  const row = (r) => `
    <tr data-filter-row class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onclick="openRequestDetailsModal('${r.id}')">
      <td class="px-4 py-3 whitespace-nowrap">${idChip(r.id)}</td>
      <td class="px-4 py-3 whitespace-nowrap">${tagChip(r.asset_tag)}</td>
      <td class="px-4 py-3 font-medium whitespace-nowrap">${esc(r.asset_name)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(r.category_name || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">${idChip(r.employee_id)}</td>
      <td class="px-4 py-3 min-w-[12rem]">${progressBar(r.status_step)}</td>
    </tr>`;

  const card = (r) => `
    <button data-filter-row class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4"
            onclick="openRequestDetailsModal('${r.id}')">
      <div class="flex items-start justify-between gap-2 mb-2">
        <p class="font-semibold">${esc(r.asset_name)} ${tagChip(r.asset_tag)}</p>
        ${idChip(r.id)}
      </div>
      ${progressBar(r.status_step)}
    </button>`;

  return `
  ${pageHead('Under Maintainance', 'Assets currently being repaired or serviced.', filterIcon('under-maintenance'))}
  <div data-filter-container="under-maintenance">
    ${filterBox('under-maintenance')}
    <div class="md:hidden space-y-3">${open.map(card).join('') || emptyState('Nothing under maintenance', 'Assets in repair will show up here.')}</div>
    <div class="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="table-scroll">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Req ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Asset ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Asset Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Emp ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Progress Status</th>
            </tr>
          </thead>
          <tbody>${open.map(row).join('') || `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500">Nothing under maintenance.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

async function advanceRepair(id, status) {
  try {
    await api(`/api/repairs/${id}/status`, { method: 'PATCH', body: { status } });
    toast('Status updated.');
    closeModal();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

function openResolveModal(id) {
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-1">Resolve repair</h2>
    <p class="text-sm text-slate-500 mb-5">This closes the request and writes the maintenance log.</p>
    <div class="space-y-4">
      <div><label class="${labelCls}">Action taken</label>
        <textarea id="res-action" rows="3" class="${inputCls}" placeholder="Replaced battery and thermal paste…"></textarea></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="${labelCls}">Cost (USD, optional)</label>
          <input id="res-cost" type="number" min="0" step="0.01" class="${inputCls}" /></div>
        <div><label class="${labelCls}">Next service due (optional)</label>
          <input id="res-next" type="date" class="${inputCls}" /></div>
      </div>
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="submitResolve('${id}')">Resolve request</button>
      </div>
    </div>
  </div>`);
}

async function submitResolve(id) {
  const action = document.getElementById('res-action').value.trim();
  if (!action) return toast('Describe the action taken.', 'error');
  const cost = document.getElementById('res-cost').value;
  try {
    await api(`/api/repairs/${id}/resolve`, { method: 'POST', body: {
      action_taken: action,
      cost: cost === '' ? null : Number(cost),
      next_service_due: document.getElementById('res-next').value || null,
    }});
    toast('Repair resolved and logged.');
    closeModal();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* =========================== admin: audit log =========================== */
/* No dedicated route — reachable via the "Activity log" link on the Dashboard. */

function openAuditLogModal() {
  api('/api/admin/audit-logs').then((logs) => {
    const items = logs.map((log) => `
      <li class="relative pl-8 pb-6 last:pb-0">
        <span class="absolute left-0 top-1 w-3.5 h-3.5 rounded-full bg-accent ring-4 ring-accent-soft"></span>
        <span class="absolute left-[6px] top-5 bottom-0 w-px bg-slate-200"></span>
        <p class="text-sm"><span class="font-semibold">${esc(log.actor_name || 'System')}</span>
          <span class="font-mono text-[11px] text-slate-400 ml-1">${esc(log.action)}</span></p>
        <p class="text-sm text-slate-600 mt-0.5">${esc(log.detail)}</p>
        <p class="text-xs text-slate-400 mt-1">${fmtDateTime(log.created_at)}</p>
      </li>`).join('');
    openModal(`
    <div class="p-5 sm:p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display font-semibold text-lg">Activity log</h2>
        <button class="text-slate-400 hover:text-slate-700 text-xl leading-none min-h-[44px] min-w-[44px]" onclick="closeModal()">×</button>
      </div>
      <ul class="max-h-[60vh] overflow-y-auto pr-1">${items || '<p class="text-sm text-slate-500">No activity recorded yet.</p>'}</ul>
    </div>`);
  }).catch((err) => toast(err.message, 'error'));
}

/* ==================== admin: categories & custom fields ================== */
/* Folded into the Asset Inventory page header ("Manage categories" / "Manage
 * fields") since there's no longer a dedicated Settings page. */

function openManageCategoriesModal() {
  api('/api/admin/categories').then((categories) => {
    state.cache.categories = categories;
    const categoryRow = (c) => `
      <div class="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
        <p class="text-sm font-medium ${c.is_active ? '' : 'text-slate-400 line-through'}">${esc(c.name)}</p>
        <button role="switch" aria-checked="${c.is_active}" onclick="toggleCategory('${c.id}')"
          class="relative w-11 h-6 rounded-full transition ${c.is_active ? 'bg-accent' : 'bg-slate-300'}">
          <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition
                       ${c.is_active ? 'left-[22px]' : 'left-0.5'}"></span>
        </button>
      </div>`;
    openModal(`
    <div class="p-5 sm:p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display font-semibold text-lg">Categories</h2>
        <button class="text-sm font-semibold text-accent hover:underline min-h-[44px]" onclick="addCategoryPrompt()">+ Add</button>
      </div>
      ${categories.map(categoryRow).join('') || '<p class="text-sm text-slate-500">No categories yet.</p>'}
      <div class="flex justify-end pt-4"><button class="${btnGhost}" onclick="closeModal()">Close</button></div>
    </div>`);
  }).catch((err) => toast(err.message, 'error'));
}

function openManageFieldsModal() {
  api('/api/admin/custom-fields').then((fields) => {
    state.cache.fields = fields;
    const fieldRow = (f) => `
      <div class="py-3 border-b border-slate-100 last:border-0">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold">${esc(f.name)}
              <span class="ml-1 font-mono text-[11px] text-slate-400">${esc(f.field_type)}</span></p>
            ${f.field_type === 'dropdown' ? `
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${f.options.map((o) => `
                <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                  ${esc(o.value)}
                  <button class="text-slate-400 hover:text-red-600" aria-label="Remove option"
                          onclick="removeOption('${f.id}', '${o.id}')">×</button></span>`).join('')}
              <button class="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500
                             hover:border-accent hover:text-accent" onclick="addOptionPrompt('${f.id}')">+ option</button>
            </div>` : ''}
          </div>
          <button class="text-sm font-medium text-red-600 hover:underline shrink-0 min-h-[44px] px-2"
                  onclick="deleteField('${f.id}')">Remove</button>
        </div>
      </div>`;
    openModal(`
    <div class="p-5 sm:p-6">
      <div class="flex items-center justify-between mb-1">
        <h2 class="font-display font-semibold text-lg">Custom asset fields</h2>
        <button class="text-sm font-semibold text-accent hover:underline min-h-[44px]" onclick="openFieldModal()">+ Add field</button>
      </div>
      <p class="text-sm text-slate-500 mb-3">These appear on every asset form — no code needed.</p>
      ${fields.map(fieldRow).join('') || '<p class="text-sm text-slate-500">No custom fields yet.</p>'}
      <div class="flex justify-end pt-2"><button class="${btnGhost}" onclick="closeModal()">Close</button></div>
    </div>`);
  }).catch((err) => toast(err.message, 'error'));
}

async function setTheme(theme) {
  try {
    await api('/api/admin/settings/theme', { method: 'PUT', body: { theme } });
    applyTheme(theme);
    toast(`Theme set to ${theme}.`);
    render();
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleCategory(id) {
  try { await api(`/api/admin/categories/${id}/toggle`, { method: 'PATCH' }); openManageCategoriesModal(); }
  catch (err) { toast(err.message, 'error'); }
}

function addCategoryPrompt() {
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-4">Add category</h2>
    <label class="${labelCls}">Category name</label>
    <input id="cat-name" class="${inputCls}" placeholder="Tablet" onkeydown="if(event.key==='Enter')submitCategory()" />
    <div class="flex flex-col-reverse sm:flex-row gap-2 pt-4 sm:justify-end">
      <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
      <button class="${btnPrimary}" onclick="submitCategory()">Add category</button>
    </div>
  </div>`);
}

async function submitCategory() {
  const name = document.getElementById('cat-name').value.trim();
  if (!name) return toast('Enter a category name.', 'error');
  try {
    await api('/api/admin/categories', { method: 'POST', body: { name } });
    toast('Category added.');
    openManageCategoriesModal();
  } catch (err) { toast(err.message, 'error'); }
}

function openFieldModal() {
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-4">Add custom field</h2>
    <div class="space-y-4">
      <div><label class="${labelCls}">Field name</label>
        <input id="cf-name" class="${inputCls}" placeholder="Serial number" /></div>
      <div><label class="${labelCls}">Field type</label>
        <select id="cf-type" class="${inputCls}"
          onchange="document.getElementById('cf-opts-wrap').classList.toggle('hidden', this.value !== 'dropdown')">
          <option value="text">Text</option><option value="number">Number</option>
          <option value="date">Date</option><option value="dropdown">Dropdown</option>
        </select></div>
      <div id="cf-opts-wrap" class="hidden">
        <label class="${labelCls}">Dropdown options (comma-separated)</label>
        <input id="cf-opts" class="${inputCls}" placeholder="Office A, Office B, Remote" />
      </div>
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="submitField()">Add field</button>
      </div>
    </div>
  </div>`);
}

async function submitField() {
  const name = document.getElementById('cf-name').value.trim();
  const field_type = document.getElementById('cf-type').value;
  const options = document.getElementById('cf-opts').value
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!name) return toast('Give the field a name.', 'error');
  try {
    await api('/api/admin/custom-fields', { method: 'POST', body: { name, field_type, options } });
    toast('Custom field added.');
    openManageFieldsModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteField(id) {
  if (!confirm('Remove this field and its stored values from every asset?')) return;
  try {
    await api(`/api/admin/custom-fields/${id}`, { method: 'DELETE' });
    toast('Field removed.');
    openManageFieldsModal();
  } catch (err) { toast(err.message, 'error'); }
}

function addOptionPrompt(fieldId) {
  const value = prompt('New dropdown option:');
  if (!value || !value.trim()) return;
  api(`/api/admin/custom-fields/${fieldId}/options`, { method: 'POST', body: { value: value.trim() } })
    .then(() => { toast('Option added.'); openManageFieldsModal(); })
    .catch((err) => toast(err.message, 'error'));
}

async function removeOption(fieldId, optionId) {
  try {
    await api(`/api/admin/custom-fields/${fieldId}/options/${optionId}`, { method: 'DELETE' });
    openManageFieldsModal();
  } catch (err) { toast(err.message, 'error'); }
}

function openUserModal() {
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-4">Add employee</h2>
    <div class="space-y-4">
      <div><label class="${labelCls}">Full name</label><input id="u-name" class="${inputCls}" /></div>
      <div><label class="${labelCls}">Email</label><input id="u-email" type="email" class="${inputCls}" /></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label class="${labelCls}">Password (min 8 chars)</label>
          <input id="u-pass" type="password" class="${inputCls}" /></div>
        <div><label class="${labelCls}">Role</label>
          <select id="u-role" class="${inputCls}">
            <option value="employee">Employee</option><option value="admin">Admin</option>
          </select></div>
      </div>
      <div><label class="${labelCls}">Department</label>
        <input id="u-dept" class="${inputCls}" placeholder="IT Operations" /></div>
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="submitUser()">Create account</button>
      </div>
    </div>
  </div>`);
}

async function submitUser() {
  const body = {
    full_name: document.getElementById('u-name').value.trim(),
    email: document.getElementById('u-email').value.trim(),
    password: document.getElementById('u-pass').value,
    role: document.getElementById('u-role').value,
    department: document.getElementById('u-dept').value.trim() || null,
  };
  if (!body.full_name || !body.email) return toast('Name and email are required.', 'error');
  if (body.password.length < 8) return toast('Password needs at least 8 characters.', 'error');
  try {
    await api('/api/admin/users', { method: 'POST', body });
    toast('Account created.');
    closeModal(); render();
  } catch (err) { toast(err.message, 'error'); }
}

function openEditUserModal(userId) {
  const u = state.cache.users.find((x) => x.id === userId);
  if (!u) return;
  openModal(`
  <div class="p-5 sm:p-6">
    <h2 class="font-display font-semibold text-lg mb-4">Edit employee</h2>
    <div class="space-y-4">
      <div><label class="${labelCls}">Full name</label>
        <input id="eu-name" class="${inputCls}" value="${esc(u.full_name)}" /></div>
      <div><label class="${labelCls}">Department</label>
        <input id="eu-dept" class="${inputCls}" value="${esc(u.department || '')}" placeholder="IT Operations" /></div>
      <div class="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
        <button class="${btnGhost}" onclick="closeModal()">Cancel</button>
        <button class="${btnPrimary}" onclick="submitEditUser('${u.id}')">Save changes</button>
      </div>
    </div>
  </div>`);
}

async function submitEditUser(userId) {
  const full_name = document.getElementById('eu-name').value.trim();
  if (!full_name) return toast('Name is required.', 'error');
  try {
    await api(`/api/admin/users/${userId}`, { method: 'PUT', body: {
      full_name,
      department: document.getElementById('eu-dept').value.trim() || null,
    }});
    toast('Employee updated.');
    closeModal(); render();
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleUser(id) {
  try { await api(`/api/admin/users/${id}/toggle`, { method: 'PATCH' }); render(); }
  catch (err) { toast(err.message, 'error'); }
}

/* ============================ admin: employees =========================== */

async function viewEmployees() {
  const users = await api('/api/admin/users');
  state.cache.users = users;

  const row = (u) => `
    <tr data-filter-row class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-3 font-medium whitespace-nowrap ${u.is_active ? '' : 'text-slate-400'}">${esc(u.full_name)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(u.email)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(u.department || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="rounded-full ${u.role === 'admin' ? 'bg-accent-soft text-accent-deep' : 'bg-slate-100 text-slate-600'}
              px-2 py-0.5 text-[11px] font-semibold capitalize">${esc(u.role)}</span></td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="rounded-full ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}
              px-2.5 py-0.5 text-xs font-semibold">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td class="px-4 py-3 whitespace-nowrap text-right space-x-3">
        <button class="text-sm font-medium text-accent hover:underline" onclick="openEditUserModal('${u.id}')">Edit</button>
        ${u.id !== state.user.id
          ? `<button class="text-sm font-medium ${u.is_active ? 'text-red-600' : 'text-accent'} hover:underline"
               onclick="toggleUser('${u.id}')">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>`
          : '<span class="text-xs text-slate-400">You</span>'}
      </td>
    </tr>`;

  const card = (u) => `
    <div data-filter-row class="bg-white rounded-2xl border border-slate-200 p-4">
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="font-semibold ${u.is_active ? '' : 'text-slate-400'}">${esc(u.full_name)}</p>
        <span class="rounded-full ${u.role === 'admin' ? 'bg-accent-soft text-accent-deep' : 'bg-slate-100 text-slate-600'}
              px-2 py-0.5 text-[11px] font-semibold capitalize">${esc(u.role)}</span>
      </div>
      <p class="text-xs text-slate-500 mb-3">${esc(u.email)}${u.department ? ' · ' + esc(u.department) : ''}</p>
      <div class="flex items-center gap-3">
        <button class="text-sm font-medium text-accent hover:underline" onclick="openEditUserModal('${u.id}')">Edit</button>
        ${u.id !== state.user.id
          ? `<button class="text-sm font-medium ${u.is_active ? 'text-red-600' : 'text-accent'} hover:underline"
               onclick="toggleUser('${u.id}')">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>`
          : ''}
      </div>
    </div>`;

  return `
  ${pageHead('Employees', 'Everyone with access to this system.', `
    ${filterIcon('employees')}
    <button class="${btnPrimary}" onclick="openUserModal()">+ Add Employee</button>`)}
  <div data-filter-container="employees">
    ${filterBox('employees')}
    <div class="md:hidden space-y-3">${users.map(card).join('')}</div>
    <div class="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="table-scroll">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Department</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>${users.map(row).join('')}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ================ admin: warranty / guarantee / license details =========== */

async function viewWarrantyDetails() {
  const assets = await api('/api/assets');
  state.cache.assets = assets;

  const row = (a) => `
    <tr data-filter-row class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onclick="openAssetModal('${a.id}')">
      <td class="px-4 py-3 whitespace-nowrap">${tagChip(a.asset_tag)}</td>
      <td class="px-4 py-3 font-medium whitespace-nowrap">${esc(a.name)}</td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(a.category_name)}</td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="rounded-full ${a.warranty_status !== 'none' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}
              px-2.5 py-0.5 text-xs font-semibold">${a.warranty_status !== 'none' ? 'Y' : 'N'}</span></td>
      <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${fmtDate(a.warranty_expiry)}</td>
      <td class="px-4 py-3 text-slate-600 max-w-xs truncate">${esc(a.terms_conditions || '—')}</td>
    </tr>`;

  const card = (a) => `
    <button data-filter-row class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4"
            onclick="openAssetModal('${a.id}')">
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="font-semibold">${esc(a.name)}</p>
        ${tagChip(a.asset_tag)}
      </div>
      <p class="text-xs text-slate-500 mb-2">${esc(a.category_name)} · Expiry ${fmtDate(a.warranty_expiry)}</p>
      ${warrantyBadge(a.warranty_status)}
    </button>`;

  return `
  ${pageHead('Warranty / Guarantee / License Details', 'Coverage and terms for every asset.', `
    ${filterIcon('warranty')}
    <button class="${btnPrimary}" onclick="openAssetModal(null)">+ Add New Assets</button>`)}
  <div data-filter-container="warranty">
    ${filterBox('warranty')}
    <div class="md:hidden space-y-3">${assets.map(card).join('') || emptyState('No assets yet', 'Add your first asset to get started.')}</div>
    <div class="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="table-scroll">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Asset ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Asset Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty (Y/N)</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">EXP Date</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Terms & Conditions</th>
            </tr>
          </thead>
          <tbody>${assets.map(row).join('') || `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500">No assets yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ========================== employee: dashboard ========================= */

async function viewMyDashboard() {
  const assets = await api('/api/employee/my-assets');
  state.cache.myAssets = assets;

  const cards = assets.map((a) => `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col">
      <div class="flex items-start justify-between gap-2 mb-3">
        <p class="font-semibold leading-snug">${esc(a.name)}</p>
        ${tagChip(a.asset_tag)}
      </div>
      <p class="text-xs text-slate-500 mb-3">${esc(a.category_name)}${a.vendor ? ' · ' + esc(a.vendor) : ''}</p>
      <div class="flex flex-wrap gap-2 mt-auto">
        ${statusBadge(a.status)} ${warrantyBadge(a.warranty_status)}
      </div>
      ${a.status === 'in_repair'
        ? '<p class="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-3">In repair — track it under Progress.</p>'
        : `<button class="${btnGhost} mt-3 !py-2 text-xs" onclick="location.hash='#/me/repair'">Report an issue</button>`}
    </div>`).join('');

  return `
  ${pageHead(`Hi, ${esc(state.user.full_name.split(' ')[0])}`, 'Everything currently signed out to you.')}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    ${cards || emptyState('No assets assigned', 'When an admin assigns you equipment, it shows up here.')}
  </div>`;
}

/* ========================= employee: repair form ======================== */

async function viewRepairForm() {
  const all = state.cache.myAssets || await api('/api/employee/my-assets');
  state.cache.myAssets = all;
  const assets = all.filter((a) => a.status !== 'in_repair');

  if (!assets.length) {
    return `${pageHead('New repair request', '')}
      ${emptyState('Nothing to report on', 'You have no assigned assets available for a new request — anything in repair is already being tracked.')}`;
  }

  return `
  ${pageHead('New repair request', 'Tell us what happened; attach a photo straight from your camera.')}
  <div class="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 max-w-xl">
    <div class="space-y-5">
      <div><label class="${labelCls}">Which asset?</label>
        <select id="rr-asset" class="${inputCls}">
          ${assets.map((a) => `<option value="${a.id}">${esc(a.asset_tag)} — ${esc(a.name)}</option>`).join('')}
        </select></div>
      <div><label class="${labelCls}">What's wrong?</label>
        <textarea id="rr-desc" rows="4" class="${inputCls}"
          placeholder="Screen flickers when the lid is opened past 90°…"></textarea></div>
      <div>
        <label class="${labelCls}">Urgency</label>
        <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Urgency">
          ${['low', 'medium', 'high'].map((u, i) => `
          <label class="cursor-pointer">
            <input type="radio" name="rr-urgency" value="${u}" class="peer sr-only" ${i === 1 ? 'checked' : ''} />
            <span class="block text-center rounded-xl border-2 border-slate-200 py-2.5 text-sm font-semibold capitalize
                         peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-deep
                         min-h-[44px] leading-relaxed">${u}</span>
          </label>`).join('')}
        </div>
      </div>
      <div>
        <label class="${labelCls}">Photo of the damage (optional)</label>
        <input id="rr-photo" type="file" accept="image/*" capture="environment" class="sr-only"
               onchange="previewRepairPhoto(this)" />
        <label for="rr-photo" class="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed
               border-slate-300 py-6 text-sm text-slate-500 cursor-pointer hover:border-accent hover:text-accent transition">
          ${iconWrench()} Take or choose a photo
        </label>
        <div id="rr-preview" class="mt-3 hidden">
          <img id="rr-preview-img" alt="Selected damage photo" class="rounded-xl border border-slate-200 max-h-48" />
          <button class="text-xs text-red-600 hover:underline mt-1.5" onclick="clearRepairPhoto()">Remove photo</button>
        </div>
      </div>
      <button class="${btnPrimary} w-full" onclick="submitRepair()">Submit request</button>
    </div>
  </div>`;
}

function previewRepairPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  document.getElementById('rr-preview').classList.remove('hidden');
  document.getElementById('rr-preview-img').src = URL.createObjectURL(file);
}

function clearRepairPhoto() {
  const input = document.getElementById('rr-photo');
  input.value = '';
  document.getElementById('rr-preview').classList.add('hidden');
}

async function submitRepair() {
  const description = document.getElementById('rr-desc').value.trim();
  if (!description) return toast("Describe what's wrong.", 'error');
  const form = new FormData();
  form.append('asset_id', document.getElementById('rr-asset').value);
  form.append('description', description);
  form.append('urgency', document.querySelector('input[name="rr-urgency"]:checked').value);
  const photo = document.getElementById('rr-photo').files[0];
  if (photo) form.append('photo', photo);
  try {
    await api('/api/employee/repair-requests', { method: 'POST', form });
    toast('Request submitted — track it under Progress.');
    state.cache.myAssets = null;
    navigate('#/me/requests');
  } catch (err) { toast(err.message, 'error'); }
}

/* ===================== employee: progress + history ===================== */

const REPAIR_STEPS = ['Submitted', 'Acknowledged', 'In repair', 'Resolved'];

function progressBar(step) {
  const pct = (step / (REPAIR_STEPS.length - 1)) * 100;
  return `
  <div>
    <div class="relative h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div class="absolute inset-y-0 left-0 bg-accent rounded-full transition-all" style="width:${pct}%"></div>
    </div>
    <div class="grid grid-cols-4 mt-2">
      ${REPAIR_STEPS.map((label, i) => `
        <div class="flex flex-col items-${i === 0 ? 'start' : i === 3 ? 'end' : 'center'} gap-1">
          <span class="w-2.5 h-2.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-slate-300'} -mt-[13px]
                       ring-2 ring-white"></span>
          <span class="text-[10px] sm:text-[11px] font-medium ${i <= step ? 'text-accent-deep' : 'text-slate-400'}
                       text-center leading-tight">${label}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

async function viewMyRequests() {
  const requests = await api('/api/employee/repair-requests');
  const cards = requests.map((r) => `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-2 mb-1">
        <p class="font-semibold">${esc(r.asset_name)} ${tagChip(r.asset_tag)}</p>
        ${urgencyBadge(r.urgency)}
      </div>
      <p class="text-xs text-slate-500 mb-3">Raised ${fmtDateTime(r.created_at)}
        · updated ${fmtDateTime(r.updated_at)}</p>
      <p class="text-sm text-slate-700 mb-4">${esc(r.description)}</p>
      ${r.photo_path ? `<img src="${esc(r.photo_path)}" alt="Damage photo"
          class="rounded-xl border border-slate-200 max-h-36 mb-4" />` : ''}
      ${progressBar(r.status_step)}
    </div>`).join('');
  return `
  ${pageHead('Repair progress', 'Every request you\'ve raised, live.')}
  <div class="grid md:grid-cols-2 gap-4">
    ${cards || emptyState('No requests yet', 'Raise one from “New request” when something breaks.')}
  </div>`;
}

async function viewMyMaintenance() {
  const logs = await api('/api/employee/maintenance-logs');
  const rows = logs.map((m) => `
    <li class="relative pl-8 pb-6 last:pb-0">
      <span class="absolute left-0 top-1 w-3.5 h-3.5 rounded-full bg-green-500 ring-4 ring-green-100"></span>
      <span class="absolute left-[6px] top-5 bottom-0 w-px bg-slate-200"></span>
      <p class="text-sm font-semibold">${esc(m.asset_name)} ${tagChip(m.asset_tag)}</p>
      <p class="text-sm text-slate-600 mt-0.5">${esc(m.action_taken)}</p>
      <p class="text-xs text-slate-500 mt-1">
        ${fmtDateTime(m.created_at)} · by ${esc(m.resolved_by_name)}
        ${m.cost !== null && m.cost !== undefined ? ' · cost ' + fmtMoney(m.cost) : ''}
        ${m.next_service_due ? ' · next service ' + fmtDate(m.next_service_due) : ''}</p>
    </li>`).join('');
  return `
  ${pageHead('Maintenance history', 'What was done, what it cost, and when service is due next.')}
  <div class="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
    <ul>${rows || '<p class="text-sm text-slate-500">No resolved repairs yet.</p>'}</ul>
  </div>`;
}

/* ================================= boot ================================ */

render();
