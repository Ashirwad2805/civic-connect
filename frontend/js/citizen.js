import { api, Auth } from './api.js';
import { screen, render, loading, esc, enc, pill, prio, stars, fmtTime, fmtDate, expectedText, timeAgo, STEPS, STATUS_LABEL, query, go, toast, bindForm } from './ui.js';

const HOME_SERVICES = [
  { label: 'Water & Sanitation', cat: 'Water & Sanitation', sub: 'Report water issues' },
  { label: 'Roads & Traffic', cat: 'Roads & Traffic', sub: 'Report potholes' },
  { label: 'Waste Collection', cat: 'Waste Management', sub: 'Missed pickup' },
  { label: 'Documents', cat: 'Documents & Certificates', sub: 'Apply / track' },
];

/* ---------- 05 Welcome / Login, register, 30 overview ---------- */
export function loginView() {
  render(`<div class="welcome"><div class="wrap narrow">
    <p class="eyebrow">CIVICCONNECT</p><h1>Smart Civic Services</h1>
    <p class="lead">Access public services, report civic issues and track requests - all in one place.</p>
    <form class="card stack" id="f"><h2>Welcome back</h2>
      <label>Mobile number<input name="identifier" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" required></label>
      <label>Password<input name="password" type="password" placeholder="Password" required></label>
      <p class="err"></p>
      <button class="btn">Login</button>
      <a class="link" href="#/register">New citizen? Create an account</a>
      <p class="hint">Demo citizen: 9800000012 / citizen123</p>
    </form>
    <p class="links"><a href="#/overview">Project Overview</a> &nbsp;·&nbsp; <a href="#/admin/login">Admin / Staff sign in</a></p>
  </div></div>`);
  bindForm('#f', async d => {
    const r = await api('/auth/login', { method: 'POST', body: { ...d, role: 'citizen' } });
    Auth.set(r.token, r.user); go('#/home');
  });
}

export function registerView() {
  render(`<div class="welcome"><div class="wrap narrow">
    <p class="eyebrow">CIVICCONNECT</p><h1>Create your account</h1>
    <p class="lead">Register once to report issues and track every request.</p>
    <form class="card stack" id="f"><h2>New citizen</h2>
      <label>Full name<input name="name" required minlength="2"></label>
      <label>Mobile number<input name="mobile" inputmode="numeric" maxlength="10" required></label>
      <label>Password<input name="password" type="password" minlength="6" required></label>
      <p class="err"></p>
      <button class="btn">Create account</button>
      <a class="link" href="#/welcome">Already registered? Login</a>
    </form></div></div>`);
  bindForm('#f', async d => {
    const r = await api('/auth/register', { method: 'POST', body: d });
    Auth.set(r.token, r.user); go('#/home');
  });
}

export function overviewView() {
  const flow = (who, steps) => `<div class="card"><h3>${who}</h3><p class="muted" style="margin-top:6px">${steps}</p></div>`;
  render(`<div class="app"><header class="hdr"><div class="wrap titlebar" style="padding-top:28px">
      <h1>CIVICCONNECT</h1><p>Smart Civic Service Platform</p></div></header>
    <main class="wrap main">
      <a class="back" href="#/welcome">← Back</a>
      <h2 class="sec">Complete Service Flow</h2>
      <div class="grid g3d" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
        ${flow('Citizen', 'Report → Track → Resolve → Feedback')}
        ${flow('Admin', 'Monitor → Assign → Resolve → Analyze')}
        ${flow('Staff', 'Receive → Update → Resolve')}
      </div>
      <h2 class="sec">Key Benefits</h2>
      <div class="card"><p>Real-time tracking • Faster coordination</p><p style="margin-top:6px">Service analytics • Citizen feedback</p></div>
      <div class="grid g2"><a class="btn" href="#/home">Open Citizen Home</a><a class="btn secondary" href="#/admin">Open Admin Dashboard</a></div>
    </main></div>`);
}

/* ---------- 01 Home ---------- */
export async function homeView() {
  loading();
  const mine = await api('/complaints/mine');
  const active = mine.find(c => c.status !== 'resolved');
  const u = Auth.user();
  render(screen({
    title: 'CivicConnect', sub: 'Public services, made simple',
    body: `
    <h2 class="lead-title">How can we help you today${u ? ', ' + esc(u.name.split(' ')[0]) : ''}?</h2>
    <form id="search" class="search"><input name="q" placeholder="Search a public service…" autocomplete="off"></form>
    <h2 class="sec">Popular Services</h2>
    <div class="grid g4">${HOME_SERVICES.map(s => `<a class="card svc" href="#/report?cat=${enc(s.cat)}"><h3>${s.label}</h3><p>${s.sub}</p></a>`).join('')}</div>
    <div class="cols">
      <div class="card stack">
        <h2 class="sec">Track your request</h2>
        ${active ? `<a href="#/request/${active.code}"><b>Request #${active.code}</b></a>
          <p class="muted">${esc(active.title)}</p>
          <div class="row">${pill(active.status)}<span class="muted small">${expectedText(active.expected_at)}</span></div>`
          : '<p class="muted">You have no active requests.</p>'}
      </div>
      <div class="stack"><a class="btn" href="#/report">Report a New Issue</a>
        <a class="btn secondary" href="#/requests">My Requests (${mine.length})</a>
        <a class="link" href="#/profile">Profile / Settings</a></div>
    </div>`,
  }));
  document.getElementById('search').addEventListener('submit', e => {
    e.preventDefault(); go('#/services?q=' + enc(new FormData(e.target).get('q')));
  });
}

/* ---------- 06 Services ---------- */
export async function servicesView() {
  const cats = await api('/services');
  const q0 = query().get('q') || '';
  render(screen({
    title: 'Public Services', sub: 'Choose what you need help with',
    body: `<div class="search"><input id="q" placeholder="Search services..." value="${esc(q0)}"></div>
      <div class="grid g2d" id="list"></div>`,
  }));
  const draw = () => {
    const q = document.getElementById('q').value.toLowerCase();
    const items = cats.filter(c => (c.name + c.desc).toLowerCase().includes(q));
    document.getElementById('list').innerHTML = items.map(c =>
      `<a class="card svc" href="#/report?cat=${enc(c.name)}"><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p></a>`).join('')
      || '<p class="muted">No services match your search.</p>';
  };
  document.getElementById('q').addEventListener('input', draw);
  draw();
}

/* ---------- 02 / 09 Report an issue / Submit complaint ---------- */
export async function reportView() {
  const cats = await api('/services');
  const pre = query().get('cat');
  render(screen({
    title: 'Submit Complaint', sub: 'Tell us what needs attention', back: ['#/home', 'Home'],
    body: `<form id="f" class="stack card">
      <label>Service category<select name="category">${cats.map(c => `<option ${c.name === pre ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Complaint title<input name="title" placeholder="e.g. Large pothole near the main junction" required minlength="3" maxlength="120"></label>
      <label>Description<textarea name="description" placeholder="Describe the issue and location..."></textarea></label>
      <label>Location
        <input name="location" id="loc" placeholder="Area / landmark, Mumbai" required>
        <button type="button" class="btn ghost" id="gps">📍 Use current location</button>
        <span class="hint" id="gpsNote"></span>
      </label>
      <label>Add photo (optional)
        <span class="upload" id="up"><span id="upLabel">＋ Add photo</span><input type="file" accept="image/*" id="file"></span>
      </label>
      <div class="card" style="background:var(--bg)"><b>Estimated response time: 24 hours</b><p class="muted small" style="margin-top:4px">You can track progress after submission.</p></div>
      <p class="err"></p>
      <button class="btn full">Submit Complaint</button>
    </form>`,
  }));
  let lat = null, lng = null, photo = null;
  document.getElementById('gps').addEventListener('click', () => {
    const note = document.getElementById('gpsNote');
    if (!navigator.geolocation) { note.textContent = 'Location is not supported on this device.'; return; }
    note.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(p => {
      lat = p.coords.latitude; lng = p.coords.longitude;
      const l = document.getElementById('loc');
      if (!l.value) l.value = `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      note.textContent = 'GPS location attached ✓';
    }, () => { note.textContent = 'Could not get GPS - please type the location.'; });
  });
  document.getElementById('file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {   // shrink to max 900px so the upload stays small
      const s = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      photo = c.toDataURL('image/jpeg', 0.75);
      document.getElementById('upLabel').innerHTML = `<img src="${photo}" alt=""> Photo added`;
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
  bindForm('#f', async d => {
    const r = await api('/complaints', { method: 'POST', body: { ...d, lat, lng, photo } });
    go('#/submitted/' + r.code);
  });
}

/* ---------- 10 / 07 Complaint submitted ---------- */
export async function submittedView({ code }) {
  const c = await api('/complaints/' + code);
  render(screen({
    title: 'Complaint Submitted', sub: 'Your request has been registered',
    body: `<div class="banner big"><span class="tick">✓</span>Complaint ID: ${c.code}</div>
      <p class="muted">Your complaint has been submitted successfully. The department will verify and assign it.</p>
      <div class="card"><h3>Issue details</h3>
        <div class="kv"><span>Category</span><span>${esc(c.category)}</span></div>
        <div class="kv"><span>Issue</span><span>${esc(c.title)}</span></div>
        <div class="kv"><span>Location</span><span>${esc(c.location)}</span></div>
        <div class="kv"><span>Estimated response</span><span>24 hours</span></div></div>
      <div class="grid g2"><a class="btn" href="#/request/${c.code}">Track My Complaint</a><a class="btn secondary" href="#/home">Back to Home</a></div>`,
  }));
}

/* ---------- 26 My requests ---------- */
export async function requestsView() {
  loading();
  const mine = await api('/complaints/mine');
  const active = mine.filter(c => c.status !== 'resolved'), done = mine.filter(c => c.status === 'resolved');
  const row = c => `<a class="item" href="#/${c.status === 'resolved' ? 'resolved' : 'request'}/${c.code}">
      <div><b>${c.code}</b><span class="sub" style="color:var(--text);font-size:14px">${esc(c.title)}</span>
      <span class="sub">${c.status === 'resolved' ? 'Resolved • ' + fmtDate(c.resolved_at) : STATUS_LABEL[c.status] + ' • ' + esc(c.category)}</span></div>
      ${c.status === 'resolved' ? '<span class="link">View</span>' : pill(c.status)}</a>`;
  render(screen({
    title: 'My Requests', sub: 'Track your civic service history', back: ['#/home', 'Home'],
    body: `<h2 class="sec">Active Request</h2>${active.map(row).join('') || '<p class="muted">No active requests.</p>'}
      <h2 class="sec">Request History</h2>${done.map(row).join('') || '<p class="muted">Nothing resolved yet.</p>'}
      <p class="muted small">Tip: Keep your request ID for future follow-up.</p>`,
  }));
}

/* ---------- 27 request detail + 03 live tracking ---------- */
export async function requestView({ code }) {
  const c = await api('/complaints/' + code);
  if (c.status === 'resolved') return go('#/resolved/' + code);
  const cur = STEPS.findIndex(s => s[0] === c.status);
  const ev = Object.fromEntries(c.events.map(e => [e.status, e]));
  const tl = STEPS.map(([k, label], i) => {
    const cls = i < cur ? 'done' : i === cur ? 'now' : '';
    const t = i <= cur ? (i === cur && k === 'in_progress' ? 'Now' : fmtTime(ev[k]?.created_at)) : 'Pending';
    return `<div class="tl ${cls}"><span class="dot"></span><div><b>${label}</b><span>${t}</span></div></div>`;
  }).join('');
  render(screen({
    title: 'Request #' + c.code, sub: `${c.category} • ${c.location || 'Mumbai'}`, back: ['#/requests', 'My Requests'],
    body: `<div class="cols">
      <div class="stack">
        <div class="card stack"><div class="row"><h3 class="lead-title" style="font-size:18px">${esc(c.title)}</h3>${pill(c.status)}</div>
          <p class="muted">${esc(c.department ? c.department + ' Department' : 'Awaiting department assignment')}</p>
          ${c.description ? `<p>${esc(c.description)}</p>` : ''}
          <div class="kv"><span>Location</span><span>${esc(c.location || 'Mumbai')}</span></div>
          <div class="kv"><span>Priority</span>${prio(c.priority)}</div>
          <div class="kv"><span>Submitted</span><span>${fmtDate(c.created_at)}, ${fmtTime(c.created_at)}</span></div>
          <b>${expectedText(c.expected_at)}</b>
          ${c.has_photo ? `<img src="${c.photo}" alt="Issue photo" style="max-width:100%;border-radius:10px">` : ''}
        </div>
        <div class="card"><h3>Live service map</h3>
          ${c.status === 'in_progress' ? '<p style="margin-top:8px">● Crew vehicle • 0.8 km away</p><p class="muted small">Last updated 2 min ago</p>'
            : '<p class="muted" style="margin-top:8px">Live crew tracking starts once work begins.</p>'}</div>
      </div>
      <div class="stack"><div class="card"><h3 style="margin-bottom:14px">Live progress</h3><div class="timeline">${tl}</div></div>
        <p class="muted small">Need help? Contact the assigned department.</p>
        <a class="btn secondary full" href="mailto:support@civicconnect.gov?subject=${enc(c.code)}">Contact Support</a></div>
    </div>`,
  }));
}

/* ---------- 11 Complaint resolved ---------- */
export async function resolvedView({ code }) {
  const c = await api('/complaints/' + code);
  const done = c.events.map(e => `<div class="tl done"><span class="dot"></span><div><b>${esc(e.note || STATUS_LABEL[e.status])}</b><span>${fmtDate(e.created_at)}, ${fmtTime(e.created_at)}</span></div></div>`).join('');
  render(screen({
    title: 'Complaint Resolved', sub: 'Your civic request is complete', back: ['#/requests', 'My Requests'],
    body: `<div class="banner">✓ Resolved</div>
      <div class="card stack"><h3 class="lead-title" style="font-size:18px">${c.code}</h3>
        <p>${esc(c.title)}</p><p class="muted">${esc(c.resolution_note || 'Issue resolved by the assigned department.')}</p></div>
      ${c.feedback ? `<div class="card"><b>Your feedback</b><p>${stars(c.feedback.rating)}</p><p class="muted">${esc(c.feedback.comment)}</p></div>`
        : `<a class="btn full" href="#/feedback/${c.code}">Give Feedback</a>`}
      <div class="card"><h3 style="margin-bottom:14px">Timeline</h3><div class="timeline">${done}</div></div>`,
  }));
}

/* ---------- 21 Feedback + 22 submitted ---------- */
export async function feedbackView({ code }) {
  const c = await api('/complaints/' + code);
  if (c.feedback) return go('#/resolved/' + code);
  let rating = 5;
  render(screen({
    title: 'Service Feedback', sub: 'Help us improve public services', back: ['#/resolved/' + code, 'Back'],
    body: `<div class="card"><b>Request Resolved ✓</b><p class="muted">${c.code}</p><p>${esc(c.title)}</p></div>
      <form id="f" class="stack card"><h3 style="text-align:center">How was your experience?</h3>
        <p class="muted" style="text-align:center">Rate the service provided</p>
        <div class="stars-input" id="stars">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" class="on">★</button>`).join('')}</div>
        <p class="muted small" style="text-align:center">Very poor ←→ Excellent</p>
        <label>Additional feedback<textarea name="comment" placeholder="Tell us what went well or what can be improved..."></textarea></label>
        <p class="err"></p><button class="btn full">Submit Feedback</button></form>
      <p class="muted small">Your feedback helps departments improve response quality.</p>`,
  }));
  const paint = () => document.querySelectorAll('#stars button').forEach(b => b.classList.toggle('on', +b.dataset.v <= rating));
  document.getElementById('stars').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { rating = +b.dataset.v; paint(); } });
  bindForm('#f', async d => { await api(`/complaints/${code}/feedback`, { method: 'POST', body: { rating, comment: d.comment } }); go('#/feedback-done/' + code); });
}

export async function feedbackDoneView({ code }) {
  const c = await api('/complaints/' + code);
  render(screen({
    title: 'Thank You', sub: 'Your feedback matters',
    body: `<div class="banner big"><span class="tick">✓</span>Feedback submitted<p class="small" style="margin-top:6px">${c.code}</p></div>
      <div class="card"><p>Thank you for helping improve public services. Your rating and comments have been recorded.</p>
        <p class="muted" style="margin-top:8px">Service: ${esc(c.category)}</p></div>
      <a class="btn full" href="#/home">Back to Home</a>
      <p class="muted small">Your feedback will help departments monitor service quality.</p>`,
  }));
}

/* ---------- 08 Notifications (citizen + staff + admin share the layout) ---------- */
export async function alertsView() {
  const d = await api('/notifications');
  render(screen({
    title: 'Notifications', sub: 'Stay updated on your public service requests', back: ['#/home', 'Back to Home'],
    body: `<div class="stack" id="nl">${d.items.map(n => `<div class="card ${n.is_read ? '' : 'unread'}"><b>${esc(n.title)}</b><p class="muted" style="margin:4px 0 8px">${esc(n.body)}</p><span class="muted small">${timeAgo(n.created_at)}</span></div>`).join('') || '<p class="muted">No notifications yet.</p>'}</div>
      <button class="btn full" id="read">Mark All as Read</button>`,
  }));
  document.getElementById('read').addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    document.querySelectorAll('.unread').forEach(x => x.classList.remove('unread')); toast('All notifications marked as read');
  });
}

/* ---------- 28 Profile & settings ---------- */
export function profileView() {
  const u = Auth.user();
  const pref = JSON.parse(localStorage.getItem('cc_prefs') || '{"notify":true,"lang":"English"}');
  render(screen({
    title: 'Profile & Settings', sub: 'Manage your CIVICCONNECT account', back: ['#/home', 'Back to Home'],
    body: `<div class="card"><h3 class="lead-title" style="font-size:18px">${esc(u.name)}</h3>
        <p class="muted small" style="margin-top:10px">Mobile number</p><p>+91 ${esc(u.identifier)}</p></div>
      <div class="card stack"><h3>Account Preferences</h3>
        <label style="flex-direction:row;align-items:center;justify-content:space-between">Notifications<input type="checkbox" id="notify" style="width:auto" ${pref.notify ? 'checked' : ''}></label>
        <label>Language<select id="lang">${['English', 'हिन्दी', 'मराठी'].map(l => `<option ${pref.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="card stack"><h3>Help &amp; Support</h3><a href="mailto:support@civicconnect.gov">Contact Civic Support</a></div>
      <button class="btn secondary full" data-logout>Logout</button>`,
  }));
  const save = () => { localStorage.setItem('cc_prefs', JSON.stringify({ notify: document.getElementById('notify').checked, lang: document.getElementById('lang').value })); toast('Preferences saved'); };
  document.getElementById('notify').addEventListener('change', save);
  document.getElementById('lang').addEventListener('change', save);
}
