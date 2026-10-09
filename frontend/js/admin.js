import { api, Auth } from './api.js';
import { screen, render, loading, esc, enc, pill, prio, stars, bars, fmtTime, fmtDate, timeAgo, STATUS_LABEL, STEPS, query, go, toast, bindForm } from './ui.js';

const DEPTS = ['Water & Sanitation', 'Roads & Traffic', 'Waste Management', 'Street Lights', 'Documents & Certificates'];
const reqRow = (c, base = '#/admin/request/') => `<a class="item" href="${base}${c.code}">
  <div><b>${c.code}</b><span class="sub">${esc(c.title)} • ${esc(c.location || c.category)}</span></div>
  <div style="text-align:right">${prio(c.priority)} ${pill(c.status)}</div></a>`;

/* ---------- 29 Admin / staff login ---------- */
export function adminLoginView() {
  render(`<div class="welcome"><div class="wrap narrow">
    <p class="eyebrow">CIVICCONNECT</p><h1>Admin Access</h1>
    <p class="lead">Sign in to manage civic operations.</p>
    <form class="card stack" id="f"><h2>Admin Login</h2>
      <div class="seg" id="seg"><button type="button" data-r="admin" class="on">Admin</button><button type="button" data-r="staff">Department Staff</button></div>
      <label>Email / Employee ID<input name="identifier" type="text" placeholder="admin@civicconnect.gov" required></label>
      <label>Password<input name="password" type="password" placeholder="••••••••" required></label>
      <p class="err"></p>
      <button class="btn" id="go">Login as Admin</button>
      <p class="hint" id="demo">Demo admin: admin@civicconnect.gov / admin123</p>
    </form><p class="links"><a href="#/welcome">← Back to Welcome</a></p></div></div>`);
  let role = 'admin';
  document.getElementById('seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    role = b.dataset.r;
    document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b));
    document.getElementById('go').textContent = role === 'admin' ? 'Login as Admin' : 'Login as Staff';
    document.getElementById('demo').textContent = role === 'admin'
      ? 'Demo admin: admin@civicconnect.gov / admin123'
      : 'Demo staff: water@civicconnect.gov (or roads / waste / lights / docs) / staff123';
  });
  bindForm('#f', async d => {
    const r = await api('/auth/login', { method: 'POST', body: { ...d, role } });
    Auth.set(r.token, r.user); go(role === 'admin' ? '#/admin' : '#/staff');
  });
}

/* ---------- 04 Admin dashboard ---------- */
export async function adminDashboardView() {
  loading();
  const o = await api('/admin/overview');
  const max = Math.max(...o.by_category.map(c => c.count), 1);
  render(screen({
    title: 'Operations Dashboard', sub: 'Monitor public service performance',
    body: `<div class="kpi">
        <div class="card"><small>Open</small><b>${o.pending}</b></div>
        <div class="card"><small>In Progress</small><b>${o.in_progress}</b></div>
        <div class="card"><small>Resolved</small><b>${o.resolved}</b></div></div>
      <div class="cols">
        <div class="stack"><h2 class="sec">Service demand</h2>
          <div class="card"><h3 style="margin-bottom:8px">Requests by category</h3>${bars(o.by_category, max)}</div></div>
        <div class="stack"><h2 class="sec">Priority requests</h2>
          ${o.priority.slice(0, 3).map(c => reqRow(c)).join('')}
          <a class="btn full" href="#/admin/requests">View All Requests</a></div>
      </div>
      <h2 class="sec">More tools</h2>
      <div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <a class="card svc" href="#/admin/analytics"><h3>Service Usage</h3><p>Analytics &amp; demand</p></a>
        <a class="card svc" href="#/map"><h3>Operations Map</h3><p>Live request locations</p></a>
        <a class="card svc" href="#/admin/performance"><h3>Performance Report</h3><p>Targets &amp; resolution time</p></a>
        <a class="card svc" href="#/admin/feedback"><h3>Citizen Feedback</h3><p>Ratings &amp; insights</p></a>
        <a class="card svc" href="#/admin/workload"><h3>Department Workload</h3><p>Active requests &amp; capacity</p></a>
        <a class="card svc" href="#/admin/notifications"><h3>Admin Notifications</h3><p>Important service alerts</p></a>
      </div>`,
  }));
}

/* ---------- 12 Request management ---------- */
export async function adminRequestsView() {
  loading();
  const o = await api('/admin/overview');
  render(screen({
    title: 'Request Management', sub: 'Review, assign and resolve civic requests', back: ['#/admin', 'Admin Dashboard'],
    body: `<h2 class="sec">Today's overview</h2>
      <div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="card"><small class="muted">Total Requests</small><div class="big-num">${o.total}</div></div>
        <div class="card"><small class="muted">Pending Verification</small><div class="big-num">${o.pending}</div></div>
        <div class="card"><small class="muted">In Progress</small><div class="big-num">${o.in_progress}</div></div>
        <div class="card"><small class="muted">Resolved</small><div class="big-num">${o.resolved}</div></div></div>
      <h2 class="sec">Priority Requests</h2><div class="stack">${o.priority.map(c => reqRow(c)).join('')}</div>
      <h2 class="sec">Department workload</h2>
      <div class="grid g2d">${o.departments.map(d => `<div class="item"><b>${esc(d.name)}</b><span>${d.active} active</span></div>`).join('')}</div>
      <h2 class="sec">All requests</h2>
      <div class="filters">
        <input id="q" placeholder="Search by ID, title or location">
        <select id="st"><option value="">All statuses</option><option value="active">Active (not resolved)</option>${STEPS.map(([k]) => `<option value="${k}">${STATUS_LABEL[k]}</option>`).join('')}</select>
        <select id="cat"><option value="">All departments</option>${DEPTS.map(d => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div class="stack" id="all"></div>`,
  }));
  const load = async () => {
    const p = new URLSearchParams();
    const q = document.getElementById('q').value.trim(), st = document.getElementById('st').value, cat = document.getElementById('cat').value;
    if (q) p.set('q', q); if (st) p.set('status', st); if (cat) p.set('category', cat);
    const rows = await api('/admin/complaints?' + p);
    document.getElementById('all').innerHTML = rows.map(c => reqRow(c)).join('') || '<p class="muted">No matching requests.</p>';
  };
  let t; document.getElementById('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  document.getElementById('st').addEventListener('change', load);
  document.getElementById('cat').addEventListener('change', load);
  load();
}

/* ---------- 13 Request detail (admin) ---------- */
export async function adminRequestView({ code }) {
  const c = await api('/complaints/' + code);
  render(screen({
    title: 'Request Detail', sub: 'Review and update civic complaint', back: ['#/admin/requests', 'Request Management'],
    body: `<div class="cols"><div class="card stack">
        <div class="row"><h2 class="lead-title">${c.code}</h2>${pill(c.status)}</div>
        <div class="kv"><span>Category</span><span>${esc(c.category)}</span></div>
        <div class="kv"><span>Issue</span><span>${esc(c.title)}</span></div>
        <div class="kv"><span>Location</span><span>${esc(c.location || '—')}</span></div>
        <div class="kv"><span>Priority</span>${prio(c.priority)}</div>
        <div class="kv"><span>Citizen</span><span>${esc(c.citizen_name)}</span></div>
        <div class="kv"><span>Submitted</span><span>${fmtDate(c.created_at)}, ${fmtTime(c.created_at)}</span></div>
        ${c.description ? `<p class="muted">${esc(c.description)}</p>` : ''}
        ${c.has_photo ? `<img src="${c.photo}" alt="Issue photo" style="max-width:100%;border-radius:10px">` : ''}</div>
      <form id="f" class="card stack">
        <label>Assign department<select name="department">${DEPTS.map(d => `<option ${(c.department || c.category) === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label>Update status<select name="status">${STEPS.map(([k]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}</select></label>
        <label>Priority<select name="priority">${['high', 'medium', 'low'].map(p => `<option value="${p}" ${c.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
        <label>Note (optional)<input name="note" placeholder="Visible in the citizen timeline"></label>
        <p class="err"></p>
        <button class="btn full">Save Assignment</button>
        <button type="button" class="btn success full" id="resolve" ${c.status === 'resolved' ? 'disabled' : ''}>Mark as Resolved</button>
      </form></div>`,
  }));
  bindForm('#f', async d => { await api('/admin/complaints/' + code, { method: 'PATCH', body: d }); go(`#/admin/updated/${code}?m=saved`); });
  document.getElementById('resolve').addEventListener('click', async e => {
    e.target.disabled = true;
    try { await api('/admin/complaints/' + code, { method: 'PATCH', body: { status: 'resolved', note: document.querySelector('[name=note]').value } }); go(`#/admin/updated/${code}?m=resolved`); }
    catch (x) { toast(x.message); e.target.disabled = false; }
  });
}

/* ---------- 14 Update complete ---------- */
export async function adminUpdatedView({ code }) {
  const c = await api('/complaints/' + code);
  const resolved = query().get('m') === 'resolved';
  render(screen({
    title: 'Update Complete', sub: 'Request status has been updated',
    body: `<div class="banner">✓ ${resolved ? 'Request marked as resolved' : 'Assignment saved — status: ' + STATUS_LABEL[c.status]}</div>
      <div class="card"><b>${c.code}</b><p class="muted" style="margin-top:6px">${resolved ? 'Citizen tracking has been updated. The request is now closed.' : 'The citizen has been notified of the update.'}</p></div>
      <div class="grid g2"><a class="btn" href="#/admin">Back to Admin Dashboard</a><a class="btn secondary" href="#/admin/request/${c.code}">View Request Details</a></div>`,
  }));
}

/* ---------- 18 Service usage analytics ---------- */
export async function analyticsView() {
  loading();
  const a = await api('/admin/analytics');
  const max = a.by_category[0]?.count || 1;
  render(screen({
    title: 'Service Usage', sub: 'Public service analytics', back: ['#/admin', 'Admin Dashboard'],
    body: `<h2 class="sec">Today</h2>
      <div class="grid g2"><div class="card"><div class="big-num">${a.total}</div><span class="muted">Total Requests</span></div>
        <div class="card"><div class="big-num">${a.avg_resolution_hours}h</div><span class="muted">Avg. Resolution</span></div></div>
      <h2 class="sec">Requests by Category</h2>
      <div class="stack">${a.by_category.map(c => `<div class="item"><b>${esc(c.name)}</b><b>${c.count}</b></div>`).join('')}</div>
      <div class="card"><h3>Usage insight</h3><p style="margin-top:6px">${esc(a.by_category[0].name)} has the highest request volume this period.</p>
        <div style="margin-top:10px">${bars(a.by_category, max)}</div></div>
      <a class="btn full" href="#/admin">Back to Admin Dashboard</a>`,
  }));
}

/* ---------- 19 Operations map (admin + staff, Leaflet) ---------- */
export async function mapView() {
  loading();
  const pts = await api('/map');
  const isStaff = Auth.user().role === 'staff';
  const color = p => p.status === 'resolved' ? '#1f995c' : p.priority === 'high' ? '#c53030' : p.priority === 'medium' ? '#e0a030' : '#6b758a';
  const prioList = pts.filter(p => p.status !== 'resolved' && p.priority === 'high').slice(0, 4);
  render(screen({
    title: 'Operations Map', sub: 'Live civic request locations', back: [isStaff ? '#/staff' : '#/admin', isStaff ? 'Staff Dashboard' : 'Admin Dashboard'],
    body: `<div class="card stack"><h3>Mumbai Service Requests</h3><div id="map"></div>
        <p class="muted small">${pts.filter(p => p.status !== 'resolved').length} active requests shown</p>
        <div class="legend"><b>Legend</b><span><i style="background:#c53030"></i>High</span><span><i style="background:#e0a030"></i>Medium</span><span><i style="background:#1f995c"></i>Resolved</span></div></div>
      <h2 class="sec">Priority Requests</h2>
      <div class="stack">${prioList.map(c => `<a class="item" href="#/${isStaff ? 'staff/request' : 'admin/request'}/${c.code}"><div><b>${c.code}</b><span class="sub">${esc(c.title)} • ${c.priority}</span></div>${pill(c.status)}</a>`).join('') || '<p class="muted">No high-priority requests.</p>'}</div>`,
  }));
  if (typeof L === 'undefined') {
    document.getElementById('map').innerHTML = '<p style="padding:20px" class="muted">Map library could not load (check your internet connection).</p>'; return;
  }
  const map = L.map('map').setView([19.076, 72.8777], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
  pts.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 8, color: '#fff', weight: 2, fillColor: color(p), fillOpacity: .95 })
    .addTo(map).bindPopup(`<b>${esc(p.code)}</b><br>${esc(p.title)}<br>${esc(p.category)}<br>${STATUS_LABEL[p.status]}`));
  setTimeout(() => map.invalidateSize(), 150);
}

/* ---------- 20 Performance report ---------- */
export async function performanceView() {
  loading();
  const p = await api('/admin/performance');
  const cls = v => v >= 85 ? 'green' : v >= 70 ? 'amber' : 'red';
  render(screen({
    title: 'Performance Report', sub: 'Service delivery overview', back: ['#/admin', 'Admin Dashboard'],
    body: `<h2 class="sec">This Month</h2>
      <div class="grid g2"><div class="card"><div class="big-num">${p.received}</div><span class="muted">Requests received</span></div>
        <div class="card"><div class="big-num">${p.resolved}</div><span class="muted">Requests resolved</span></div></div>
      <h2 class="sec">Resolution Performance</h2>
      <div class="stack"><div class="item"><b>Resolved within target</b><b class="big-num" style="font-size:22px">${p.within_target_pct}%</b></div>
        <div class="item"><b>Average resolution time</b><b class="big-num" style="font-size:22px">${p.avg_hours}h</b></div>
        <div class="item"><b>Pending requests</b><b class="big-num" style="font-size:22px">${p.pending}</b></div></div>
      <h2 class="sec">Department Performance</h2>
      <div class="card">${p.departments.map(d => `<div class="bar-row"><span>${esc(d.name)}</span><div class="bar ${cls(d.pct)}"><i style="width:${d.pct}%"></i></div><b>${d.pct}%</b></div>`).join('')}</div>
      <p class="muted small">Use this report to monitor service efficiency and identify departments needing support.</p>`,
  }));
}

/* ---------- 23 Citizen feedback insights ---------- */
export async function adminFeedbackView() {
  loading();
  const f = await api('/admin/feedback');
  render(screen({
    title: 'Citizen Feedback', sub: 'Service quality insights', back: ['#/admin', 'Admin Dashboard'],
    body: `<h2 class="sec">Overall Satisfaction</h2>
      <div class="card row"><div><div class="big-num">${f.average} / 5</div><span class="muted">Average citizen rating</span></div>
        <div style="text-align:right"><div class="big-num">${f.positive_pct}%</div><span class="muted">Positive</span></div></div>
      <div class="cols"><div class="stack"><h2 class="sec">Recent Feedback</h2>
        ${f.recent.map(r => `<div class="card">${stars(r.rating)}<p style="margin-top:6px">${esc(r.comment || '—')}</p><span class="muted small">${timeAgo(r.created_at)}</span></div>`).join('')}</div>
        <div class="stack"><h2 class="sec">Improvement Areas</h2>
        ${f.improvements.map(i => `<div class="item"><b>${esc(i.area)}</b><span class="muted">${esc(i.state)}</span></div>`).join('')}
        <p class="muted small">Use citizen feedback to improve department performance and service quality.</p></div></div>`,
  }));
}

/* ---------- 24 Admin notifications (+ staff alerts) ---------- */
export async function adminNotificationsView() {
  loading();
  const isAdmin = Auth.user().role === 'admin';
  const [n, alerts] = await Promise.all([api('/notifications'), isAdmin ? api('/admin/alerts') : Promise.resolve([])]);
  render(screen({
    title: isAdmin ? 'Admin Notifications' : 'Notifications', sub: 'Important service alerts', back: [isAdmin ? '#/admin' : '#/staff', isAdmin ? 'Admin Dashboard' : 'Staff Dashboard'],
    body: `<div class="row"><b id="unread">${n.unread} unread</b><button class="link" id="read" style="background:none;border:0;cursor:pointer">Mark all as read</button></div>
      <div class="stack">${n.items.map(i => `<div class="card ${i.is_read ? '' : 'unread'}"><b>${esc(i.title)}</b><p class="muted" style="margin:4px 0 8px">${esc(i.body)}</p><span class="muted small">${timeAgo(i.created_at)}</span></div>`).join('') || '<p class="muted">No notifications.</p>'}</div>
      ${isAdmin ? `<h2 class="sec">Department Alerts</h2><div class="stack">${alerts.map(a => `<div class="item"><div><b>${esc(a.name)}</b><span class="sub">${esc(a.text)}</span></div><span class="pill ${a.level === 'HIGH' ? 'pill-high' : 'pill-medium'}">${a.level}</span></div>`).join('') || '<p class="muted">No alerts.</p>'}</div>` : ''}`,
  }));
  document.getElementById('read').addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    document.querySelectorAll('.unread').forEach(x => x.classList.remove('unread')); document.getElementById('unread').textContent = '0 unread';
  });
}

/* ---------- 25 Department workload ---------- */
export async function workloadView() {
  loading();
  const w = await api('/admin/workload');
  const cls = v => v >= 85 ? 'red' : v >= 70 ? 'amber' : 'green';
  render(screen({
    title: 'Department Workload', sub: 'Active requests and capacity', back: ['#/admin', 'Admin Dashboard'],
    body: `<h2 class="sec">Today</h2>
      <div class="grid g2"><div class="card"><div class="big-num">${w.total_active}</div><span class="muted">Total active</span></div>
        <div class="card"><div class="big-num">${w.overall_pct}%</div><span class="muted">Overall capacity</span></div></div>
      <h2 class="sec">Department Status</h2>
      <div class="stack">${w.departments.map(d => `<div class="card"><div class="row"><b>${esc(d.name)}</b><b>${d.load_pct}%</b></div>
        <div class="bar ${cls(d.load_pct)}" style="margin:8px 0"><i style="width:${d.load_pct}%"></i></div><span class="muted small">${d.active} active of ${d.capacity} capacity</span></div>`).join('')}</div>
      ${w.alert ? `<div class="card" style="border-color:var(--amber);background:var(--amber-bg)"><b>Capacity alert</b><p>${esc(w.alert)}</p></div>` : ''}`,
  }));
}

/* ======================= STAFF ======================= */
/* ---------- 15 Staff dashboard ---------- */
export async function staffDashboardView() {
  loading();
  const d = await api('/staff/dashboard');
  const first = d.requests.find(r => r.status !== 'resolved');
  render(screen({
    title: 'Staff Dashboard', sub: d.department + ' Department',
    body: `<h2 class="sec">Today's Work</h2>
      <div class="kpi"><div class="card"><small>Assigned</small><b>${d.assigned}</b></div>
        <div class="card"><small>In Progress</small><b>${d.in_progress}</b></div>
        <div class="card"><small>Resolved</small><b>${d.resolved}</b></div></div>
      <div class="cols"><div class="stack"><h2 class="sec">Assigned Requests</h2>
        ${d.requests.map(c => `<a class="item" href="#/staff/request/${c.code}"><div><b>${c.code}</b><span class="sub" style="color:var(--text);font-size:14px">${esc(c.title)}</span><span class="sub">${esc(c.location)} • ${c.priority[0].toUpperCase() + c.priority.slice(1)} Priority</span></div>${pill(c.status)}</a>`).join('') || '<p class="muted">No requests assigned right now.</p>'}</div>
      <div class="stack"><h2 class="sec">Quick Actions</h2>
        ${first ? `<a class="btn full" href="#/staff/request/${first.code}">Update Request Status</a>` : ''}
        <div class="grid g2"><a class="btn secondary full" href="#/map">View Map</a><a class="btn secondary full" href="#/staff/alerts">Notifications</a></div>
        <p class="muted small">Staff can update assignments, status and resolution.</p></div></div>`,
  }));
}

/* ---------- 16 Staff request detail ---------- */
export async function staffRequestView({ code }) {
  const c = await api('/complaints/' + code);
  const opts = [['assigned', 'Assigned'], ['in_progress', 'In Progress'], ['resolved', 'Resolved']];
  render(screen({
    title: 'Request Detail', sub: 'Staff action required', back: ['#/staff', 'Staff Dashboard'],
    body: `<div class="cols"><div class="card stack">
        <div class="row"><h2 class="lead-title">${c.code}</h2>${pill(c.status)}</div>
        <b>${esc(c.title)}</b><p class="muted">${esc(c.category)} • ${esc(c.location || 'Mumbai')}</p>
        <h3>Complaint Details</h3><p>${esc(c.description || c.title)}</p>
        <div class="kv"><span>Location</span><span>${esc(c.location || 'Mumbai')}</span></div>
        <div class="kv"><span>Priority</span>${prio(c.priority)}</div>
        ${c.has_photo ? `<img src="${c.photo}" alt="Issue photo" style="max-width:100%;border-radius:10px">` : ''}</div>
      <form id="f" class="card stack">
        <label>Update Status<select name="status">${opts.map(([k, l]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Resolution note<textarea name="note" placeholder="Describe work completed..."></textarea></label>
        <p class="err"></p>
        <button class="btn full">Save Status Update</button>
        <button type="button" class="btn success full" id="resolve" ${c.status === 'resolved' ? 'disabled' : ''}>✓ Mark as Resolved</button>
      </form></div>`,
  }));
  bindForm('#f', async d => {
    await api('/staff/complaints/' + code, { method: 'PATCH', body: d });
    if (d.status === 'resolved') go('#/staff/resolved/' + code); else { toast('Status updated'); go('#/staff'); }
  });
  document.getElementById('resolve').addEventListener('click', async e => {
    e.target.disabled = true;
    try { await api('/staff/complaints/' + code, { method: 'PATCH', body: { status: 'resolved', note: document.querySelector('[name=note]').value } }); go('#/staff/resolved/' + code); }
    catch (x) { toast(x.message); e.target.disabled = false; }
  });
}

/* ---------- 17 Staff resolution confirmation ---------- */
export async function staffResolvedView({ code }) {
  const c = await api('/complaints/' + code);
  render(screen({
    title: 'Resolution Complete', sub: 'Department staff', back: ['#/staff', 'Staff Dashboard'],
    body: `<div class="banner big"><span class="tick">✓</span>Request marked as resolved<p class="small" style="margin-top:6px">${c.code} • ${esc(c.title)}</p></div>
      <div class="card"><h3>Resolution Summary</h3>
        <div class="kv"><span>Status</span><span>Resolved</span></div>
        <div class="kv"><span>Department</span><span>${esc(c.department || c.category)}</span></div>
        <div class="kv"><span>Location</span><span>${esc(c.location || 'Mumbai')}</span></div>
        <p class="muted small" style="margin-top:8px">Citizen tracking has been updated.</p></div>
      <div class="grid g2"><a class="btn" href="#/staff">Back to Staff Dashboard</a><a class="btn secondary" href="#/staff/request/${c.code}">View Request Details</a></div>
      <p class="muted small">The citizen will receive a resolution notification.</p>`,
  }));
}
