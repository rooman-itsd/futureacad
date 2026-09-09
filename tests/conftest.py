"""Shared pytest fixtures.

Every test runs against a throwaway SQLite file and an injected config, so no
test touches the real instance/ database or requires any environment setup.
"""
import re
import sqlite3

import pytest

from app import create_app
from config import Config

CSRF_META_RE = re.compile(r'data-csrf="([^"]+)"')
CSRF_INPUT_RE = re.compile(r'name="csrf_token" value="([^"]+)"')

ADMIN_USER = "ceo@rooman.net"
ADMIN_PASS = "test-only-password"


@pytest.fixture(autouse=True)
def _no_postgres(monkeypatch):
    """Force the SQLite backend regardless of the developer's environment."""
    for var in ("POSTGRES_URL", "DATABASE_URL", "POSTGRES_PRISMA_URL"):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def config_class(tmp_path):
    class TestConfig(Config):
        TESTING = True
        SECRET_KEY = "test-secret-key"
        ADMIN_USERNAME = ADMIN_USER
        ADMIN_PASSWORD = ADMIN_PASS
        DATABASE = str(tmp_path / "test.db")
        SMTP_HOST = None          # email disabled by default
        MAIL_SYNC = True          # deliver inline when it *is* enabled
        SESSION_COOKIE_SECURE = False

    return TestConfig


@pytest.fixture
def app(config_class):
    return create_app(config_class)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def read_leads(config_class):
    """Read the leads table straight off disk, bypassing the app entirely."""
    def _read():
        conn = sqlite3.connect(config_class.DATABASE)
        conn.row_factory = sqlite3.Row
        try:
            return [dict(r) for r in conn.execute("SELECT * FROM leads ORDER BY id")]
        finally:
            conn.close()
    return _read


@pytest.fixture
def csrf(client):
    """Render the contact page to seed a session, and return its CSRF token."""
    html = client.get("/contact").get_data(as_text=True)
    match = CSRF_META_RE.search(html)
    assert match, "contact page did not render a data-csrf token"
    return match.group(1)


def login(client, username=ADMIN_USER, password=ADMIN_PASS):
    """Perform an admin login and return the response."""
    html = client.get("/admin/login").get_data(as_text=True)
    token = CSRF_INPUT_RE.search(html).group(1)
    return client.post("/admin/login", data={
        "csrf_token": token, "username": username, "password": password,
    })


@pytest.fixture
def admin_client(client):
    resp = login(client)
    assert resp.status_code == 302
    return client
