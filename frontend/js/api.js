// Thin fetch wrapper around the FastAPI backend + login state kept in localStorage.
const TOKEN_KEY = 'cc_token';
const USER_KEY = 'cc_user';

export const Auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  set(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
};

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.token()) headers.Authorization = 'Bearer ' + Auth.token();
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/')) {
    Auth.clear();
    location.hash = '#/welcome';
    throw new Error('Session expired, please log in again');
  }
  if (!res.ok) {
    const d = data.detail;
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map(x => x.msg).join(', ') : 'Something went wrong');
  }
  return data;
}
