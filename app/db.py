"""Data layer — Postgres when a POSTGRES_URL is present (Vercel), else SQLite (local).
One table: leads. The two backends differ only in placeholders + date functions."""
import os
import sqlite3
from pathlib import Path

from flask import current_app, g


def _pg_url():
    """Vercel Postgres exposes several URLs; prefer the pooled one."""
    return (os.environ.get("POSTGRES_URL")
            or os.environ.get("DATABASE_URL")
            or os.environ.get("POSTGRES_PRISMA_URL"))


SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT,
    company    TEXT,
    interest   TEXT,
    message    TEXT NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

PG_SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT,
    company    TEXT,
    interest   TEXT,
    message    TEXT NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
"""


def _raw_connect():
    """Open a fresh connection (no request caching). Returns (conn, is_pg)."""
    url = _pg_url()
    if url:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
        return conn, True
    path = current_app.config["DATABASE"]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn, False


def get_db():
    if "db" not in g:
        g.db, g.is_pg = _raw_connect()
    return g.db


def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    with app.app_context():
        conn, is_pg = _raw_connect()
        try:
            if is_pg:
                with conn.cursor() as cur:
                    cur.execute(PG_SCHEMA)
                    # Migrate older tables that pre-date the phone column.
                    cur.execute("ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT")
            else:
                conn.executescript(SQLITE_SCHEMA)
                # SQLite lacks ADD COLUMN IF NOT EXISTS — try, ignore if present.
                try:
                    conn.execute("ALTER TABLE leads ADD COLUMN phone TEXT")
                except sqlite3.OperationalError:
                    pass
            conn.commit()
        finally:
            conn.close()
    app.teardown_appcontext(close_db)


def add_lead(name, email, company, interest, message, phone=None, ip=None, user_agent=None):
    db = get_db()
    args = (name, email, phone, company, interest, message, ip, user_agent)
    if g.is_pg:
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO leads (name,email,phone,company,interest,message,ip,user_agent) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id", args)
            rid = cur.fetchone()["id"]
    else:
        cur = db.execute(
            "INSERT INTO leads (name,email,phone,company,interest,message,ip,user_agent) "
            "VALUES (?,?,?,?,?,?,?,?)", args)
        rid = cur.lastrowid
    db.commit()
    return rid


def all_leads():
    db = get_db()
    if g.is_pg:
        sql = ("SELECT id, to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at, "
               "name,email,phone,company,interest,message,ip FROM leads ORDER BY id DESC")
        with db.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()
    return db.execute(
        "SELECT id, created_at, name, email, phone, company, interest, message, ip "
        "FROM leads ORDER BY id DESC").fetchall()


def lead_stats():
    db = get_db()
    if g.is_pg:
        q_today = "SELECT COUNT(*) AS c FROM leads WHERE created_at::date = current_date"
        q_week = "SELECT COUNT(*) AS c FROM leads WHERE created_at >= now() - interval '7 days'"
    else:
        q_today = "SELECT COUNT(*) AS c FROM leads WHERE date(created_at) = date('now')"
        q_week = "SELECT COUNT(*) AS c FROM leads WHERE created_at >= datetime('now','-7 days')"
    q_top = ("SELECT interest, COUNT(*) AS c FROM leads WHERE interest IS NOT NULL "
             "GROUP BY interest ORDER BY c DESC LIMIT 1")

    def one(sql):
        if g.is_pg:
            with db.cursor() as cur:
                cur.execute(sql)
                return cur.fetchone()
        return db.execute(sql).fetchone()

    total = one("SELECT COUNT(*) AS c FROM leads")["c"]
    today = one(q_today)["c"]
    week = one(q_week)["c"]
    top_row = one(q_top)
    return {"total": total, "today": today, "week": week,
            "top": (top_row["interest"] if top_row else None)}
