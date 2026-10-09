# CivicConnect - Smart Public Service Management System

Figma design (30 screens) ko working website + backend mein convert kiya gaya hai.

- **Frontend:** vanilla HTML / CSS / JS (koi build step nahi). Mobile pe app jaisa, desktop pe full website layout.
- **Backend:** FastAPI + SQLite. Frontend bhi isi server se serve hota hai, to ek hi command se sab chalta hai.
- **Roles:** Citizen, Admin, Department Staff (teeno ke alag screens aur permissions).

## VS Code mein chalane ke steps

1. Zip extract karo, folder ko VS Code mein open karo (`File > Open Folder`).
2. Terminal kholo (`Ctrl + ~`) aur backend folder mein jao:
   ```bash
   cd backend
   python -m venv .venv
   # Windows:   .venv\Scripts\activate
   # Mac/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Server start karo:
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```
   (ya VS Code mein `F5` dabao - "CivicConnect (FastAPI)" launch config bani hui hai)
4. Browser mein kholo: **http://127.0.0.1:8000**
   API docs (Swagger): http://127.0.0.1:8000/docs

Pehli baar chalane pe `backend/civicconnect.db` apne aap ban jaata hai aur demo data (128 requests, feedback, notifications) bhar jaata hai. Reset karna ho to server band karke ye file delete kar do.

## Demo logins

| Role | Login | Password |
|---|---|---|
| Citizen | `9800000012` | `citizen123` |
| Admin | `admin@civicconnect.gov` | `admin123` |
| Staff (Water) | `water@civicconnect.gov` | `staff123` |
| Staff (others) | `roads@` / `waste@` / `lights@` / `docs@civicconnect.gov` | `staff123` |

Admin / Staff login: welcome page pe neeche "Admin / Staff sign in" link, ya seedha `#/admin/login`.

## Figma screens -> routes

| Figma screen | Route |
|---|---|
| 05 Welcome Login | `#/welcome` (+ `#/register`) |
| 30 CIVICCONNECT Overview | `#/overview` |
| 01 Citizen Home | `#/home` |
| 06 Services | `#/services` |
| 02 Report Issue / 09 Complaint Form | `#/report` |
| 07 Request Confirmation / 10 Complaint Submitted | `#/submitted/<id>` |
| 26 Citizen Request History | `#/requests` |
| 27 Request Detail / 03 Request Tracking | `#/request/<id>` |
| 11 Complaint Resolved | `#/resolved/<id>` |
| 21 Citizen Feedback / 22 Feedback Submitted | `#/feedback/<id>`, `#/feedback-done/<id>` |
| 08 Notifications | `#/alerts` |
| 28 Profile & Settings | `#/profile` |
| 29 Admin Login & Role Selection | `#/admin/login` |
| 04 Admin Dashboard | `#/admin` |
| 12 Request Management / 13 Request Detail / 14 Update Complete | `#/admin/requests`, `#/admin/request/<id>`, `#/admin/updated/<id>` |
| 18 Service Usage / 20 Performance / 23 Feedback Insights / 25 Workload / 24 Admin Notifications | `#/admin/analytics`, `#/admin/performance`, `#/admin/feedback`, `#/admin/workload`, `#/admin/notifications` |
| 19 Operations Map | `#/map` (Leaflet + OpenStreetMap) |
| 15 Staff Dashboard / 16 Request Detail / 17 Resolution Confirmation | `#/staff`, `#/staff/request/<id>`, `#/staff/resolved/<id>` |

## Folder structure

```
civicconnect/
├── backend/
│   ├── main.py            # FastAPI app: auth, complaints, admin, staff, map APIs
│   ├── db.py              # SQLite schema + demo seed data
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/styles.css     # Figma design tokens (navy #122447, blue #1f61c7 ...)
│   └── js/
│       ├── app.js         # hash router + role guards
│       ├── api.js         # fetch wrapper + login state
│       ├── ui.js          # page shell, nav, helpers
│       ├── citizen.js     # citizen screens
│       └── admin.js       # admin, staff and map screens
└── .vscode/               # F5 launch config + tasks
```

## Main API endpoints

- `POST /api/auth/register | /api/auth/login | /api/auth/logout`, `GET /api/me`
- Citizen: `POST /api/complaints`, `GET /api/complaints/mine`, `GET /api/complaints/{id}`, `POST /api/complaints/{id}/feedback`, `GET /api/notifications`
- Admin: `GET /api/admin/overview | complaints | analytics | performance | feedback | workload | alerts`, `PATCH /api/admin/complaints/{id}`
- Staff: `GET /api/staff/dashboard`, `PATCH /api/staff/complaints/{id}`
- Shared: `GET /api/map`

## Notes

- Map ke liye internet chahiye (Leaflet + OpenStreetMap tiles; Google Fonts bhi CDN se aate hain).
- Passwords PBKDF2 se hash hote hain, login ke baad random session token milta hai.
- Production mein `allow_origins=["*"]` ko apne domain tak limit karo aur HTTPS lagao.
