"""Postgres backend — the branches used when POSTGRES_URL is present.

Skipped unless TEST_POSTGRES_URL points at a reachable Postgres. CI provides
one via a service container; locally you can run:

    docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:16
    export TEST_POSTGRES_URL=postgres://postgres:pg@127.0.0.1:55432/postgres
"""
import os

import pytest

from app import create_app, db
from config import Config

PG_URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="TEST_POSTGRES_URL not set")


@pytest.fixture
def pg_app(monkeypatch):
    """An app bound to Postgres, with the leads table dropped between tests."""
    monkeypatch.setenv("POSTGRES_URL", PG_URL)

    import psycopg2
    conn = psycopg2.connect(PG_URL)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS leads")
    conn.close()

    class PgConfig(Config):
        TESTING = True
        SECRET_KEY = "test-secret-key"
        ADMIN_USERNAME = "ceo@rooman.net"
        ADMIN_PASSWORD = "test-only-password"
        SMTP_HOST = None

    return create_app(PgConfig)


def test_postgres_backend_is_selected(pg_app):
    with pg_app.test_request_context():
        db.get_db()
        from flask import g
        assert g.is_pg is True
        db.close_db()


def test_schema_created_and_lead_roundtrips(pg_app):
    with pg_app.test_request_context():
        db.get_db()
        rid = db.add_lead("Ada", "ada@example.com", "Acme", "AI Suite", "hello", phone="+971")
        rows = db.all_leads()
        db.close_db()

    assert rid == 1
    assert len(rows) == 1
    assert rows[0]["name"] == "Ada"
    assert rows[0]["phone"] == "+971"
    # to_char() formatting, not a datetime object
    assert isinstance(rows[0]["created_at"], str)


def test_all_leads_is_newest_first(pg_app):
    with pg_app.test_request_context():
        db.get_db()
        db.add_lead("First", "a@example.com", "", "", "m")
        db.add_lead("Second", "b@example.com", "", "", "m")
        rows = db.all_leads()
        db.close_db()

    assert [r["name"] for r in rows] == ["Second", "First"]


def test_lead_stats_uses_postgres_date_functions(pg_app):
    with pg_app.test_request_context():
        db.get_db()
        for _ in range(3):
            db.add_lead("X", "x@example.com", "", "AI Suite", "m")
        db.add_lead("Y", "y@example.com", "", "ERP", "m")
        stats = db.lead_stats()
        db.close_db()

    assert stats == {"total": 4, "today": 4, "week": 4, "top": "AI Suite"}


def test_lead_stats_on_empty_table(pg_app):
    with pg_app.test_request_context():
        db.get_db()
        stats = db.lead_stats()
        db.close_db()

    assert stats == {"total": 0, "today": 0, "week": 0, "top": None}


def test_init_db_migrates_table_missing_phone_column(pg_app):
    """init_db must add `phone` to tables created before that column existed."""
    import psycopg2
    conn = psycopg2.connect(PG_URL)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS leads")
        cur.execute("""CREATE TABLE leads (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
            company TEXT, interest TEXT, message TEXT NOT NULL, ip TEXT,
            user_agent TEXT, created_at TIMESTAMP NOT NULL DEFAULT now())""")
    conn.close()

    db.init_db(pg_app)

    with pg_app.test_request_context():
        db.get_db()
        rid = db.add_lead("Migrated", "m@example.com", "", "", "m", phone="+1")
        rows = db.all_leads()
        db.close_db()

    assert rid == 1
    assert rows[0]["phone"] == "+1"
