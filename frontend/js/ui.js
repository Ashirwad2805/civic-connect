import { Auth } from './api.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const enc = encodeURIComponent;

export const STATUS_LABEL = { submitted: 'Submitted', verified: 'Verified', assigned: 'Assigned', in_progress: 'In Progress', resolved: 'Resolved' };
export const STEPS = [
  ['submitted', 'Request submitted'],
  ['verified', 'Verified by ward office'],
  ['assigned', 'Crew assigned'],
  ['in_progress', 'Work in progress'],
  ['resolved', 'Resolved'],
];

export const pill = s => `<span class="pill pill-${s}">${STATUS_LABEL[s] || s}</span>`;
export const prio = p => `<span class="pill pill-${p}">${p[0].toUpperCase() + p.slice(1)}</span>`;
export const stars = n => `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function expectedText(iso) {
  if (!iso) return '';
  const d = new Date(iso), n = new Date();
  return d.toDateString() === n.toDateString() ? `Expected today, ${fmtTime(iso)}` : `Expected ${fmtDate(iso)}, ${fmtTime(iso)}`;
}
export function timeAgo(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

export const query = () => new URLSearchParams(location.hash.split('?')[1] || '');
export const go = hash => { location.hash = hash; };

export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function render(html) {
  document.getElementById('app').innerHTML = html;
  window.scrollTo(0, 0);
}
export const loading = () => render('<div class="wrap" style="padding-top:30px"><div class="skeleton"></div></div>');

const NAVS = {
  citizen: [
    ['Home', '#/home', /^#\/home/], ['Services', '#/services', /^#\/(services|report)/],
    ['Requests', '#/requests', /^#\/(requests|request\/|resolved\/|feedback)/],
    ['Alerts', '#/alerts', /^#\/alerts/], ['Profile', '#/profile', /^#\/profile/],
  ],
  admin: [
    ['Dashboard', '#/admin', /^#\/admin$/], ['Requests', '#/admin/requests', /^#\/admin\/(requests|request\/|updated\/)/],
    ['Analytics', '#/admin/analytics', /^#\/admin\/(analytics|performance|feedback|workload)/],
    ['Map', '#/map', /^#\/map/], ['Alerts', '#/admin/notifications', /^#\/admin\/notifications/],
  ],
  staff: [
    ['Dashboard', '#/staff', /^#\/staff($|\/request|\/resolved)/], ['Map', '#/map', /^#\/map/],
    ['Alerts', '#/staff/alerts', /^#\/staff\/alerts/],
  ],
};
const HOME = { citizen: '#/home', admin: '#/admin', staff: '#/staff' };

/** Page shell: navy header (title + subtitle), nav (bottom bar on phones, top bar on desktop), content. */
export function screen({ title, sub = '', back = null, body }) {
  const u = Auth.user();
  const hash = location.hash || '';
  const nav = u ? NAVS[u.role].map(([l, h, re]) => `<a href="${h}" class="${re.test(hash) ? 'on' : ''}">${l}</a>`).join('') : '';
  return `<div class="app">
    <header class="hdr">
      <div class="wrap topbar">
        <a class="brand" href="${u ? HOME[u.role] : '#/welcome'}">CivicConnect</a>
        <nav class="nav">${nav}</nav>
        ${u ? '<button class="logout" data-logout>Logout</button>' : ''}
      </div>
      <div class="wrap titlebar"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    </header>
    <main class="wrap main">${back ? `<a class="back" href="${back[0]}">← ${esc(back[1])}</a>` : ''}${body}</main>
  </div>`;
}

/** Submit handler: collects form data, disables the button, shows errors in .err */
export function bindForm(sel, fn) {
  const f = document.querySelector(sel);
  if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit], button.btn');
    const err = f.querySelector('.err');
    if (err) err.textContent = '';
    if (btn) btn.disabled = true;
    try { await fn(Object.fromEntries(new FormData(f)), f); }
    catch (x) { if (err) err.textContent = x.message; else toast(x.message); }
    finally { if (btn) btn.disabled = false; }
  });
}

export const bars = (items, max, cls = '') =>
  items.map(i => `<div class="bar-row"><span>${esc(i.name)}</span><div class="bar ${cls}"><i style="width:${max ? Math.round(i.count * 100 / max) : 0}%"></i></div><b>${i.count}</b></div>`).join('');

export const errorView = (msg, back = '#/welcome') =>
  render(screen({ title: 'Something went wrong', body: `<div class="card"><p>${esc(msg)}</p></div><a class="btn" href="${back}">Go back</a>` }));
