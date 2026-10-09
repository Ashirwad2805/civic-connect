"""SQLite schema, helpers and demo seed data for CivicConnect."""
import hashlib
import random
import secrets
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "civicconnect.db"

CATEGORIES = [
    {"name": "Water & Sanitation", "desc": "Leaks, supply, connections", "short": "Report water issues"},
    {"name": "Roads & Traffic", "desc": "Potholes, signals, parking", "short": "Report potholes"},
    {"name": "Waste Management", "desc": "Pickup, missed collection", "short": "Missed pickup"},
    {"name": "Street Lights", "desc": "Faulty or damaged lights", "short": "Faulty lights"},
    {"name": "Documents & Certificates", "desc": "Apply, renew, track", "short": "Apply / track"},
]
CATEGORY_NAMES = [c["name"] for c in CATEGORIES]
STATUSES = ["submitted", "verified", "assigned", "in_progress", "resolved"]
EVENT_NOTE = {
    "submitted": "Complaint received",
    "verified": "Verified by ward office",
    "assigned": "Crew assigned",
    "in_progress": "Work in progress",
    "resolved": "Issue fixed and closed",
}
# How many active requests each department can handle at once (used for capacity %)
DEPT_CAPACITY = {
    "Water & Sanitation": 18,
    "Roads & Traffic": 14,
    "Waste Management": 14,
    "Street Lights": 10,
    "Documents & Certificates": 10,
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('citizen','admin','staff')),
  password_hash TEXT NOT NULL,
  department TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS complaints(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  lat REAL, lng REAL,
  photo TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'submitted',
  department TEXT,
  resolution_note TEXT,
  expected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id),
  status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  audience TEXT NOT NULL DEFAULT 'user',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER UNIQUE NOT NULL REFERENCES complaints(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_events_complaint ON events(complaint_id);
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def now_iso() -> str:
    return iso(datetime.now())


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt = stored.split("$", 1)[0]
    return secrets.compare_digest(hash_password(password, salt), stored)


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    seed(conn)
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# Demo data
# ----------------------------------------------------------------------------
AREAS = [
    ("Andheri West, Mumbai", 19.1364, 72.8296),
    ("Bandra, Mumbai", 19.0596, 72.8295),
    ("Dadar, Mumbai", 19.0178, 72.8478),
    ("Kurla, Mumbai", 19.0726, 72.8845),
    ("Borivali, Mumbai", 19.2307, 72.8567),
    ("Colaba, Mumbai", 18.9067, 72.8147),
    ("Powai, Mumbai", 19.1176, 72.9060),
    ("Ghatkopar, Mumbai", 19.0860, 72.9081),
]
TITLES = {
    "Water & Sanitation": ["Water supply interruption", "Pipeline leakage", "Low water pressure", "Sewage overflow"],
    "Roads & Traffic": ["Large pothole on road", "Broken traffic signal", "Illegal parking blocking road", "Damaged footpath"],
    "Waste Management": ["Missed garbage pickup", "Overflowing dustbin", "Waste dumped on roadside"],
    "Street Lights": ["Street light not working", "Damaged light pole", "Flickering street light"],
    "Documents & Certificates": ["Birth certificate application", "Address proof renewal", "Property tax receipt request"],
}
COMMENTS = {
    5: ["Quick and professional service.", "Very satisfied with the response.", "Problem fixed on the same day."],
    4: ["Good work, small delay in updates.", "Handled well overall.", "Crew was polite and helpful."],
    3: ["Resolved but took longer than expected."],
    2: ["Had to follow up multiple times."],
}
RESOLVE_RATE = {  # share of resolved cases closed within the 24h target
    "Water & Sanitation": 0.91,
    "Roads & Traffic": 0.84,
    "Waste Management": 0.78,
    "Street Lights": 0.70,
    "Documents & Certificates": 0.80,
}


def seed(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
        return
    now = datetime.now().replace(microsecond=0)
    rnd = random.Random(2026)

    def add_user(name, ident, role, pw, dept=None):
        cur = conn.execute(
            "INSERT INTO users(name,identifier,role,password_hash,department,created_at) VALUES (?,?,?,?,?,?)",
            (name, ident, role, hash_password(pw), dept, iso(now)),
        )
        return cur.lastrowid

    demo = add_user("Ashirwad Yadav", "9800000012", "citizen", "citizen123")
    pool = [add_user(f"Citizen {i}", f"900000000{i}", "citizen", "citizen123") for i in range(1, 6)]
    add_user("Operations Admin", "admin@civicconnect.gov", "admin", "admin123")
    staff = {}
    for key, cat in zip(["water", "roads", "waste", "lights", "docs"], CATEGORY_NAMES):
        staff[cat] = add_user(f"{cat} Staff", f"{key}@civicconnect.gov", "staff", "staff123", cat)

    def add_complaint(code, user, cat, title, desc, area, priority, status, created, resolve_hours=None, expected=None):
        idx = STATUSES.index(status)
        steps = STATUSES[: idx + 1]
        dept = cat if idx >= 2 else None
        span = timedelta(hours=resolve_hours) if status == "resolved" else min(now - created, timedelta(hours=8))
        resolved_at = iso(created + span) if status == "resolved" else None
        lat = area[1] + rnd.uniform(-0.004, 0.004)
        lng = area[2] + rnd.uniform(-0.004, 0.004)
        cur = conn.execute(
            """INSERT INTO complaints(code,user_id,category,title,description,location,lat,lng,priority,status,
               department,resolution_note,expected_at,created_at,updated_at,resolved_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (code, user, cat, title, desc, area[0], lat, lng, priority, status, dept,
             "Issue fixed by the assigned department." if status == "resolved" else None,
             iso(expected or created + timedelta(hours=24)), iso(created), iso(created + span), resolved_at),
        )
        cid = cur.lastrowid
        for i, s in enumerate(steps):
            t = created + (span * i) / max(len(steps) - 1, 1)
            conn.execute("INSERT INTO events(complaint_id,status,note,created_at) VALUES (?,?,?,?)",
                         (cid, s, EVENT_NOTE[s], iso(t)))
        return cid

    # --- the complaints shown in the Figma screens (owned by the demo citizen) ---
    base = now.replace(hour=10, minute=12, second=0)
    if base > now:
        base -= timedelta(days=1)
    add_complaint("CIV-2026-1048", demo, "Water & Sanitation", "Water supply interruption",
                  "No water supply since morning in our lane.", AREAS[0], "high", "in_progress", base,
                  expected=now + timedelta(hours=3))
    add_complaint("CIV-2026-1039", pool[0], "Roads & Traffic", "Road pothole near school",
                  "Deep pothole near the school gate, risky for children.", ("School Road, Mumbai", 19.0760, 72.8777),
                  "medium", "assigned", now - timedelta(hours=20))
    add_complaint("CIV-2026-1012", demo, "Street Lights", "Street light repair", "Light pole not working.",
                  AREAS[1], "medium", "resolved", datetime(2026, 9, 17, 18, 0), resolve_hours=20)
    add_complaint("CIV-2026-0987", demo, "Waste Management", "Garbage collection request", "Garbage not picked up.",
                  AREAS[2], "medium", "resolved", datetime(2026, 9, 10, 9, 0), resolve_hours=26)
    add_complaint("CIV-2026-0941", demo, "Roads & Traffic", "Road pothole complaint", "Pothole on main road.",
                  AREAS[3], "low", "resolved", datetime(2026, 9, 2, 11, 0), resolve_hours=22)

    # --- bulk demo data so dashboards look alive (totals: 128 / 76 resolved / 34 active / 18 pending) ---
    cats = (["Water & Sanitation"] * 41 + ["Roads & Traffic"] * 29 + ["Waste Management"] * 23
            + ["Street Lights"] * 17 + ["Documents & Certificates"] * 13)
    rnd.shuffle(cats)
    statuses = (["resolved"] * 73 + ["submitted"] * 18
                + [rnd.choice(["verified", "assigned", "in_progress", "in_progress"]) for _ in range(32)])
    rnd.shuffle(statuses)
    resolved_ids = []
    for i, (cat, st) in enumerate(zip(cats, statuses)):
        if st == "resolved":
            created = now - timedelta(days=rnd.uniform(2, 29))
            within = rnd.random() < RESOLVE_RATE[cat]
            hours = rnd.uniform(8, 23) if within else rnd.uniform(26, 40)
        elif st == "submitted":
            created, hours = now - timedelta(hours=rnd.uniform(1, 36)), None
        else:
            created, hours = now - timedelta(hours=rnd.uniform(3, 60)), None
        created = created.replace(microsecond=0)
        prio = "low" if cat == "Documents & Certificates" else rnd.choices(["high", "medium", "low"], [25, 55, 20])[0]
        cid = add_complaint(f"CIV-2026-{300 + i:04d}", rnd.choice(pool), cat, rnd.choice(TITLES[cat]),
                            "Reported via CivicConnect.", rnd.choice(AREAS), prio, st, created, hours)
        if st == "resolved":
            resolved_ids.append((cid, created + timedelta(hours=hours)))

    # --- citizen feedback (avg ~4.4, ~92% positive) ---
    for n, (cid, done) in enumerate(resolved_ids[:45]):
        if n == 0:
            rating, comment, when = 5, "Water supply issue resolved quickly.", now - timedelta(minutes=30)
        elif n == 1:
            rating, comment, when = 4, "Road complaint was handled well.", now - timedelta(hours=2)
        else:
            rating = rnd.choices([5, 4, 3, 2], [55, 37, 5, 3])[0]
            comment, when = rnd.choice(COMMENTS[rating]), done + timedelta(hours=1)
        owner = conn.execute("SELECT user_id FROM complaints WHERE id=?", (cid,)).fetchone()[0]
        conn.execute("INSERT INTO feedback(complaint_id,user_id,rating,comment,created_at) VALUES (?,?,?,?,?)",
                     (cid, owner, rating, comment, iso(when)))

    # --- notifications ---
    def notify(user_id, audience, title, body, ago):
        conn.execute("INSERT INTO notifications(user_id,audience,title,body,is_read,created_at) VALUES (?,?,?,?,0,?)",
                     (user_id, audience, title, body, iso(now - ago)))

    notify(demo, "user", "Crew assigned", "A service crew has been assigned to CIV-2026-1048.", timedelta(minutes=2))
    notify(demo, "user", "Request verified", "Your complaint was verified by the ward office.", timedelta(hours=1))
    notify(demo, "user", "Waste pickup completed", "Your missed waste collection request is resolved.", timedelta(days=1))
    notify(demo, "user", "Water supply update", "Maintenance work is scheduled for tomorrow.", timedelta(days=2))
    notify(None, "admin", "High-priority request", "CIV-2026-1048 needs staff attention.", timedelta(minutes=2))
    notify(None, "admin", "Service demand increased", "Water & Sanitation requests are up 18%.", timedelta(minutes=18))
    notify(None, "admin", "Citizen feedback received", "New feedback submitted for resolved requests.", timedelta(hours=1))
    notify(staff["Water & Sanitation"], "user", "New assignment", "CIV-2026-1048 is assigned to your department.", timedelta(hours=4))
    notify(staff["Roads & Traffic"], "user", "New assignment", "CIV-2026-1039 is assigned to your department.", timedelta(hours=3))


if __name__ == "__main__":
    init_db()
    print("Database ready at", DB_PATH)
