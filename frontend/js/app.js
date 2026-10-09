// Hash router: maps #/paths to views and enforces role-based access.
import { api, Auth } from './api.js';
import { go, errorView, loading } from './ui.js';
import * as C from './citizen.js';
import * as A from './admin.js';

const R = 'citizen', AD = 'admin', S = 'staff';
// [pattern, view, allowed roles (null = public)]
const routes = [
  ['/welcome', C.loginView, null], ['/register', C.registerView, null], ['/overview', C.overviewView, null],
  ['/admin/login', A.adminLoginView, null],
  ['/home', C.homeView, [R]], ['/services', C.servicesView, [R]], ['/report', C.reportView, [R]],
  ['/submitted/:code', C.submittedView, [R]], ['/requests', C.requestsView, [R]], ['/request/:code', C.requestView, [R]],
  ['/resolved/:code', C.resolvedView, [R]], ['/feedback/:code', C.feedbackView, [R]], ['/feedback-done/:code', C.feedbackDoneView, [R]],
  ['/alerts', C.alertsView, [R]], ['/profile', C.profileView, [R]],
  ['/admin', A.adminDashboardView, [AD]], ['/admin/requests', A.adminRequestsView, [AD]],
  ['/admin/request/:code', A.adminRequestView, [AD]], ['/admin/updated/:code', A.adminUpdatedView, [AD]],
  ['/admin/analytics', A.analyticsView, [AD]], ['/admin/performance', A.performanceView, [AD]],
  ['/admin/feedback', A.adminFeedbackView, [AD]], ['/admin/notifications', A.adminNotificationsView, [AD]],
  ['/admin/workload', A.workloadView, [AD]], ['/map', A.mapView, [AD, S]],
  ['/staff', A.staffDashboardView, [S]], ['/staff/request/:code', A.staffRequestView, [S]],
  ['/staff/resolved/:code', A.staffResolvedView, [S]], ['/staff/alerts', A.adminNotificationsView, [S]],
].map(([p, view, roles]) => ({ re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), view, roles }));

const HOME = { citizen: '#/home', admin: '#/admin', staff: '#/staff' };

async function route() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const user = Auth.user();
  if (path === '/') return go(user && Auth.token() ? HOME[user.role] : '#/welcome');
  const r = routes.find(x => x.re.test(path));
  if (!r) return go(user ? HOME[user.role] : '#/welcome');
  if (r.roles) {
    if (!user || !Auth.token()) return go('#/welcome');
    if (!r.roles.includes(user.role)) return go(HOME[user.role]);
  }
  try { await r.view(path.match(r.re).groups || {}); }
  catch (e) { errorView(e.message, user ? HOME[user.role] : '#/welcome'); }
}

document.addEventListener('click', async e => {
  if (!e.target.closest('[data-logout]')) return;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  Auth.clear(); go('#/welcome');
});
window.addEventListener('hashchange', route);
route();
