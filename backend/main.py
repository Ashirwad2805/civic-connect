"""CivicConnect - Smart Public Service Management System (FastAPI backend).

Run:  uvicorn main:app --reload      (from the backend/ folder)
Open: http://127.0.0.1:8000          (frontend is served by the same server)
API docs: http://127.0.0.1:8000/docs
"""
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from db import (CATEGORIES, CATEGORY_NAMES, DEPT_CAPACITY, EVENT_NOTE, STATUSES, get_conn, hash_password,
                init_db, iso, now_iso, verify_password)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
HIGH_WORDS = ("leak", "interruption", "school", "accident", "overflow", "spark", "fire", "flood", "hospital", "burst")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="CivicConnect API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ----------------------------------------------------------------------------
# Dependencies
# ----------------------------------------------------------------------------
def get_db():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def current_user(authorization: Optional[str] = Header(None), conn=Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in")
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?", (authorization[7:],)
    ).fetchone()
    if not row:
        raise HTTPException(401, "Session expired, please log in again")
    return dict(row)


def require(*roles):
    def checker(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "You do not have access to this section")
        return user
    return checker


def public_user(u: dict) -> dict:
    return {"id": u["id"], "name": u["name"], "identifier": u["identifier"], "role": u["role"],
            "department": u["department"]}


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def complaint_dict(row, with_photo=False) -> dict:
    d = dict(row)
    d["has_photo"] = bool(d.get("photo"))
    if not with_photo:
        d.pop("photo", None)
    return d


def get_complaint(conn, code: str):
    row = conn.execute(
        "SELECT c.*, u.name AS citizen_name FROM complaints c JOIN users u ON u.id=c.user_id WHERE c.code=?", (code,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Complaint not found")
    return row


def with_events(conn, row, with_photo=True) -> dict:
    d = complaint_dict(row, with_photo)
    d["events"] = [dict(e) for e in conn.execute(
        "SELECT status,note,created_at FROM events WHERE complaint_id=? ORDER BY id", (row["id"],))]
    fb = conn.execute("SELECT rating,comment FROM feedback WHERE complaint_id=?", (row["id"],)).fetchone()
    d["feedback"] = dict(fb) if fb else None
    return d


def notify(conn, title, body, user_id=None, audience="user"):
    conn.execute("INSERT INTO notifications(user_id,audience,title,body,is_read,created_at) VALUES (?,?,?,?,0,?)",
                 (user_id, audience, title, body, now_iso()))


def change_status(conn, c, new_status: str, note: str = "", department=None, priority=None):
    """Apply a status/department/priority change, log the timeline event and notify people."""
    sets, vals = ["updated_at=?"], [now_iso()]
    if department:
        sets.append("department=?"); vals.append(department)
    if priority:
        sets.append("priority=?"); vals.append(priority)
    if new_status and new_status != c["status"]:
        sets.append("status=?"); vals.append(new_status)
        if new_status == "resolved":
            sets.append("resolved_at=?"); vals.append(now_iso())
        if note and new_status == "resolved":
            sets.append("resolution_note=?"); vals.append(note)
        conn.execute("INSERT INTO events(complaint_id,status,note,created_at) VALUES (?,?,?,?)",
                     (c["id"], new_status, note or EVENT_NOTE[new_status], now_iso()))
        messages = {
            "verified": ("Request verified", "Your complaint was verified by the ward office."),
            "assigned": ("Crew assigned", f"A service crew has been assigned to {c['code']}."),
            "in_progress": ("Work started", f"Work has started on {c['code']}."),
            "resolved": ("Request resolved", f"{c['code']} has been resolved. Tell us how we did!"),
        }
        if new_status in messages:
            notify(conn, *messages[new_status], user_id=c["user_id"])
        if new_status == "assigned":
            dept = department or c["department"] or c["category"]
            for s in conn.execute("SELECT id FROM users WHERE role='staff' AND department=?", (dept,)):
                notify(conn, "New assignment", f"{c['code']} is assigned to your department.", user_id=s["id"])
        if new_status == "resolved":
            notify(conn, "Request resolved", f"{c['code']} marked resolved.", audience="admin")
    conn.execute(f"UPDATE complaints SET {', '.join(sets)} WHERE id=?", (*vals, c["id"]))


# ----------------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    mobile: str
    password: str = Field(min_length=6, max_length=64)


class LoginIn(BaseModel):
    identifier: str
    password: str
    role: Optional[str] = None


class ComplaintIn(BaseModel):
    category: str
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=1500)
    location: str = Field(default="", max_length=200)
    lat: Optional[float] = None
    lng: Optional[float] = None
    photo: Optional[str] = Field(default=None, max_length=2_500_000)  # data URL


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=800)


class AdminUpdate(BaseModel):
    department: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    note: Optional[str] = None


class StaffUpdate(BaseModel):
    status: str
    note: Optional[str] = None


# ----------------------------------------------------------------------------
# Auth
# ----------------------------------------------------------------------------
@app.post("/api/auth/register")
def register(data: RegisterIn, conn=Depends(get_db)):
    if not re.fullmatch(r"\d{10}", data.mobile):
        raise HTTPException(400, "Enter a valid 10-digit mobile number")
    if conn.execute("SELECT 1 FROM users WHERE identifier=?", (data.mobile,)).fetchone():
        raise HTTPException(400, "This mobile number is already registered")
    cur = conn.execute(
        "INSERT INTO users(name,identifier,role,password_hash,created_at) VALUES (?,?,?,?,?)",
        (data.name.strip(), data.mobile, "citizen", hash_password(data.password), now_iso()))
    user = dict(conn.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone())
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions(token,user_id,created_at) VALUES (?,?,?)", (token, user["id"], now_iso()))
    return {"token": token, "user": public_user(user)}


@app.post("/api/auth/login")
def login(data: LoginIn, conn=Depends(get_db)):
    row = conn.execute("SELECT * FROM users WHERE identifier=?", (data.identifier.strip().lower(),)).fetchone()
    if not row:
        row = conn.execute("SELECT * FROM users WHERE identifier=?", (data.identifier.strip(),)).fetchone()
    if not row or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(400, "Invalid credentials")
    user = dict(row)
    if data.role and data.role != user["role"]:
        raise HTTPException(400, f"This is not a {data.role} account")
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions(token,user_id,created_at) VALUES (?,?,?)", (token, user["id"], now_iso()))
    return {"token": token, "user": public_user(user)}


@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None), conn=Depends(get_db)):
    if authorization and authorization.startswith("Bearer "):
        conn.execute("DELETE FROM sessions WHERE token=?", (authorization[7:],))
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return public_user(user)


@app.get("/api/services")
def services():
    return CATEGORIES


# ----------------------------------------------------------------------------
# Citizen
# ----------------------------------------------------------------------------
@app.post("/api/complaints")
def create_complaint(data: ComplaintIn, user=Depends(require("citizen")), conn=Depends(get_db)):
    if data.category not in CATEGORY_NAMES:
        raise HTTPException(400, "Unknown service category")
    if data.photo and not data.photo.startswith("data:image/"):
        raise HTTPException(400, "Photo must be an image")
    nxt = (conn.execute("SELECT MAX(CAST(substr(code,10) AS INTEGER)) FROM complaints").fetchone()[0] or 1000) + 1
    code = f"CIV-2026-{nxt:04d}"
    text = f"{data.title} {data.description}".lower()
    priority = "low" if data.category == "Documents & Certificates" else (
        "high" if any(w in text for w in HIGH_WORDS) else "medium")
    now = datetime.now().replace(microsecond=0)
    cur = conn.execute(
        """INSERT INTO complaints(code,user_id,category,title,description,location,lat,lng,photo,priority,status,
           expected_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (code, user["id"], data.category, data.title.strip(), data.description.strip(), data.location.strip(),
         data.lat, data.lng, data.photo, priority, "submitted", iso(now + timedelta(hours=24)), iso(now), iso(now)))
    conn.execute("INSERT INTO events(complaint_id,status,note,created_at) VALUES (?,?,?,?)",
                 (cur.lastrowid, "submitted", EVENT_NOTE["submitted"], iso(now)))
    notify(conn, "Request submitted", f"{code} has been registered. We'll verify it shortly.", user_id=user["id"])
    notify(conn, "New complaint" if priority != "high" else "High-priority request",
           f"{code} - {data.title.strip()} ({data.category})", audience="admin")
    return with_events(conn, get_complaint(conn, code))


@app.get("/api/complaints/mine")
def my_complaints(user=Depends(require("citizen")), conn=Depends(get_db)):
    rows = conn.execute(
        "SELECT c.*, u.name AS citizen_name FROM complaints c JOIN users u ON u.id=c.user_id "
        "WHERE c.user_id=? ORDER BY c.created_at DESC", (user["id"],)).fetchall()
    return [complaint_dict(r) for r in rows]


@app.get("/api/complaints/{code}")
def complaint_detail(code: str, user=Depends(current_user), conn=Depends(get_db)):
    row = get_complaint(conn, code)
    if user["role"] == "citizen" and row["user_id"] != user["id"]:
        raise HTTPException(403, "This is not your complaint")
    if user["role"] == "staff" and (row["department"] or row["category"]) != user["department"]:
        raise HTTPException(403, "This complaint belongs to another department")
    return with_events(conn, row)


@app.post("/api/complaints/{code}/feedback")
def give_feedback(code: str, data: FeedbackIn, user=Depends(require("citizen")), conn=Depends(get_db)):
    row = get_complaint(conn, code)
    if row["user_id"] != user["id"]:
        raise HTTPException(403, "This is not your complaint")
    if row["status"] != "resolved":
        raise HTTPException(400, "Feedback can be given after the request is resolved")
    if conn.execute("SELECT 1 FROM feedback WHERE complaint_id=?", (row["id"],)).fetchone():
        raise HTTPException(400, "Feedback already submitted")
    conn.execute("INSERT INTO feedback(complaint_id,user_id,rating,comment,created_at) VALUES (?,?,?,?,?)",
                 (row["id"], user["id"], data.rating, data.comment.strip(), now_iso()))
    notify(conn, "Citizen feedback received", f"{data.rating}-star feedback for {code}.", audience="admin")
    return {"ok": True}


@app.get("/api/notifications")
def notifications(user=Depends(current_user), conn=Depends(get_db)):
    if user["role"] == "admin":
        rows = conn.execute("SELECT * FROM notifications WHERE audience='admin' ORDER BY id DESC LIMIT 50")
    else:
        rows = conn.execute("SELECT * FROM notifications WHERE audience='user' AND user_id=? ORDER BY id DESC LIMIT 50",
                            (user["id"],))
    items = [dict(r) for r in rows]
    return {"items": items, "unread": sum(1 for i in items if not i["is_read"])}


@app.post("/api/notifications/read-all")
def read_all(user=Depends(current_user), conn=Depends(get_db)):
    if user["role"] == "admin":
        conn.execute("UPDATE notifications SET is_read=1 WHERE audience='admin'")
    else:
        conn.execute("UPDATE notifications SET is_read=1 WHERE audience='user' AND user_id=?", (user["id"],))
    return {"ok": True}


# ----------------------------------------------------------------------------
# Admin
# ----------------------------------------------------------------------------
def dept_stats(conn):
    out = []
    for name in CATEGORY_NAMES:
        active = conn.execute("SELECT COUNT(*) FROM complaints WHERE category=? AND status!='resolved'", (name,)).fetchone()[0]
        total = conn.execute("SELECT COUNT(*) FROM complaints WHERE category=?", (name,)).fetchone()[0]
        cap = DEPT_CAPACITY[name]
        out.append({"name": name, "active": active, "total": total, "capacity": cap,
                    "load_pct": min(100, round(active * 100 / cap))})
    return out


@app.get("/api/admin/overview")
def admin_overview(_=Depends(require("admin")), conn=Depends(get_db)):
    count = lambda where="1=1": conn.execute(f"SELECT COUNT(*) FROM complaints WHERE {where}").fetchone()[0]
    by_cat = [{"name": n, "count": count(f"category='{n}'")} for n in CATEGORY_NAMES]
    by_cat.sort(key=lambda x: -x["count"])
    priority = [complaint_dict(r) for r in conn.execute(
        "SELECT c.*, u.name AS citizen_name FROM complaints c JOIN users u ON u.id=c.user_id "
        "WHERE c.status!='resolved' ORDER BY CASE c.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, "
        "c.created_at LIMIT 5")]
    return {
        "total": count(), "pending": count("status='submitted'"),
        "in_progress": count("status IN ('verified','assigned','in_progress')"), "resolved": count("status='resolved'"),
        "by_category": by_cat, "priority": priority, "departments": dept_stats(conn),
    }


@app.get("/api/admin/complaints")
def admin_complaints(status: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = None,
                     limit: int = Query(60, le=200), _=Depends(require("admin")), conn=Depends(get_db)):
    sql, args = "SELECT c.*, u.name AS citizen_name FROM complaints c JOIN users u ON u.id=c.user_id WHERE 1=1", []
    if status == "active":
        sql += " AND c.status!='resolved'"
    elif status:
        sql += " AND c.status=?"; args.append(status)
    if category:
        sql += " AND c.category=?"; args.append(category)
    if q:
        sql += " AND (c.code LIKE ? OR c.title LIKE ? OR c.location LIKE ?)"; args += [f"%{q}%"] * 3
    sql += " ORDER BY c.created_at DESC LIMIT ?"; args.append(limit)
    return [complaint_dict(r) for r in conn.execute(sql, args)]


@app.patch("/api/admin/complaints/{code}")
def admin_update(code: str, data: AdminUpdate, _=Depends(require("admin")), conn=Depends(get_db)):
    c = get_complaint(conn, code)
    if data.status and data.status not in STATUSES:
        raise HTTPException(400, "Invalid status")
    if data.department and data.department not in CATEGORY_NAMES:
        raise HTTPException(400, "Invalid department")
    if data.priority and data.priority not in ("high", "medium", "low"):
        raise HTTPException(400, "Invalid priority")
    new_status = data.status
    if data.department and not new_status and c["status"] in ("submitted", "verified"):
        new_status = "assigned"
    change_status(conn, c, new_status, data.note or "", data.department, data.priority)
    return with_events(conn, get_complaint(conn, code), with_photo=False)


@app.get("/api/admin/analytics")
def admin_analytics(_=Depends(require("admin")), conn=Depends(get_db)):
    total = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
    rows = conn.execute("SELECT created_at,resolved_at FROM complaints WHERE resolved_at IS NOT NULL").fetchall()
    hrs = [(datetime.fromisoformat(r["resolved_at"]) - datetime.fromisoformat(r["created_at"])).total_seconds() / 3600
           for r in rows]
    cats = [{"name": n, "count": conn.execute("SELECT COUNT(*) FROM complaints WHERE category=?", (n,)).fetchone()[0]}
            for n in CATEGORY_NAMES]
    cats.sort(key=lambda x: -x["count"])
    return {"total": total, "avg_resolution_hours": round(sum(hrs) / len(hrs)) if hrs else 0, "by_category": cats}


@app.get("/api/admin/performance")
def admin_performance(_=Depends(require("admin")), conn=Depends(get_db)):
    since = iso(datetime.now() - timedelta(days=30))
    received = conn.execute("SELECT COUNT(*) FROM complaints WHERE created_at>=?", (since,)).fetchone()[0]
    rows = conn.execute("SELECT category,created_at,resolved_at FROM complaints WHERE resolved_at IS NOT NULL").fetchall()

    def hours(r):
        return (datetime.fromisoformat(r["resolved_at"]) - datetime.fromisoformat(r["created_at"])).total_seconds() / 3600

    within = [r for r in rows if hours(r) <= 24]
    depts = []
    for n in CATEGORY_NAMES:
        mine = [r for r in rows if r["category"] == n]
        ok = [r for r in mine if hours(r) <= 24]
        depts.append({"name": n, "pct": round(len(ok) * 100 / len(mine)) if mine else 0})
    depts.sort(key=lambda d: -d["pct"])
    return {
        "received": received, "resolved": len(rows),
        "within_target_pct": round(len(within) * 100 / len(rows)) if rows else 0,
        "avg_hours": round(sum(hours(r) for r in rows) / len(rows)) if rows else 0,
        "pending": conn.execute("SELECT COUNT(*) FROM complaints WHERE status='submitted'").fetchone()[0],
        "departments": depts,
    }


@app.get("/api/admin/feedback")
def admin_feedback(_=Depends(require("admin")), conn=Depends(get_db)):
    rows = conn.execute("SELECT rating,comment,created_at FROM feedback ORDER BY created_at DESC").fetchall()
    n = len(rows)
    avg = round(sum(r["rating"] for r in rows) / n, 1) if n else 0
    positive = round(sum(1 for r in rows if r["rating"] >= 4) * 100 / n) if n else 0
    perf = admin_performance(None, conn)
    return {
        "count": n, "average": avg, "positive_pct": positive, "recent": [dict(r) for r in rows[:4]],
        "improvements": [
            {"area": "Response time", "state": "Needs improvement" if perf["within_target_pct"] < 85 else "Good"},
            {"area": "Communication updates", "state": "Monitor"},
        ],
    }


@app.get("/api/admin/workload")
def admin_workload(_=Depends(require("admin")), conn=Depends(get_db)):
    depts = dept_stats(conn)
    total_active = sum(d["active"] for d in depts)
    total_cap = sum(d["capacity"] for d in depts)
    top = max(depts, key=lambda d: d["load_pct"])
    return {"total_active": total_active, "overall_pct": round(total_active * 100 / total_cap),
            "departments": depts, "alert": f"{top['name']} is nearing capacity." if top["load_pct"] >= 70 else None}


@app.get("/api/admin/alerts")
def admin_alerts(_=Depends(require("admin")), conn=Depends(get_db)):
    out = []
    cutoff = iso(datetime.now() - timedelta(hours=24))
    for n in CATEGORY_NAMES:
        high = conn.execute("SELECT COUNT(*) FROM complaints WHERE category=? AND priority='high' AND status!='resolved'", (n,)).fetchone()[0]
        late = conn.execute("SELECT COUNT(*) FROM complaints WHERE category=? AND status IN ('submitted','verified') AND created_at<?", (n, cutoff)).fetchone()[0]
        if high:
            out.append({"name": n, "text": f"{high} active priority cases", "level": "HIGH", "n": high})
        elif late:
            out.append({"name": n, "text": f"{late} delayed assignments", "level": "WATCH", "n": late})
    out.sort(key=lambda x: -x["n"])
    return out[:4]


# ----------------------------------------------------------------------------
# Staff + shared map
# ----------------------------------------------------------------------------
@app.get("/api/staff/dashboard")
def staff_dashboard(user=Depends(require("staff")), conn=Depends(get_db)):
    dept = user["department"]
    rows = conn.execute(
        "SELECT c.*, u.name AS citizen_name FROM complaints c JOIN users u ON u.id=c.user_id "
        "WHERE COALESCE(c.department,c.category)=? AND c.status IN ('assigned','in_progress','verified','submitted') "
        "AND c.status!='submitted' ORDER BY CASE c.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, "
        "c.created_at DESC", (dept,)).fetchall()
    resolved = conn.execute("SELECT COUNT(*) FROM complaints WHERE department=? AND status='resolved'", (dept,)).fetchone()[0]
    return {
        "department": dept,
        "assigned": sum(1 for r in rows if r["status"] in ("assigned", "verified")),
        "in_progress": sum(1 for r in rows if r["status"] == "in_progress"),
        "resolved": resolved,
        "requests": [complaint_dict(r) for r in rows[:20]],
    }


@app.patch("/api/staff/complaints/{code}")
def staff_update(code: str, data: StaffUpdate, user=Depends(require("staff")), conn=Depends(get_db)):
    c = get_complaint(conn, code)
    if (c["department"] or c["category"]) != user["department"]:
        raise HTTPException(403, "This complaint belongs to another department")
    if data.status not in ("assigned", "in_progress", "resolved"):
        raise HTTPException(400, "Staff can set: assigned, in_progress or resolved")
    change_status(conn, c, data.status, data.note or "")
    return with_events(conn, get_complaint(conn, code), with_photo=False)


@app.get("/api/map")
def map_points(user=Depends(require("admin", "staff")), conn=Depends(get_db)):
    sql = "SELECT code,title,category,priority,status,lat,lng,location FROM complaints WHERE lat IS NOT NULL"
    args = []
    if user["role"] == "staff":
        sql += " AND COALESCE(department,category)=?"; args.append(user["department"])
    sql += " ORDER BY created_at DESC LIMIT 120"
    return [dict(r) for r in conn.execute(sql, args)]


# ----------------------------------------------------------------------------
# Frontend (static) - must be mounted last
# ----------------------------------------------------------------------------
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
