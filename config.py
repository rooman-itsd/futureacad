"""Configuration loaded from environment (.env). Sane defaults for local dev."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # noqa: S110 — .env is optional; a missing dotenv must not block boot
    pass

BASE_DIR = Path(__file__).resolve().parent

# Dev-only placeholders. create_app() refuses to boot with these outside debug
# mode, so a production deploy that forgets to set them fails loudly instead of
# running with a forgeable session cookie.
DEV_SECRET_KEY = "dev-only-insecure-key-change-me"  # noqa: S105 — intentional placeholder
DEV_ADMIN_PASSWORD = "futureacad"  # noqa: S105 — intentional placeholder


class Config:
    # SECRET_KEY signs the session cookie & CSRF token. MUST be set in production.
    SECRET_KEY = os.environ.get("SECRET_KEY", DEV_SECRET_KEY)

    # Local dev and Lightsail both use SQLite. Postgres is used automatically
    # when POSTGRES_URL is set (see app/db.py).
    _sqlite_default = str(BASE_DIR / "instance" / "futureacad.db")
    DATABASE = os.environ.get("DATABASE", _sqlite_default)

    # Admin dashboard credentials.
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", DEV_ADMIN_PASSWORD)

    # Optional SMTP — if SMTP_HOST is set, new leads trigger an email notification.
    SMTP_HOST = os.environ.get("SMTP_HOST")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER = os.environ.get("SMTP_USER")
    SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
    SMTP_FROM = os.environ.get("SMTP_FROM", "no-reply@futureacad.ae")
    LEAD_NOTIFY = os.environ.get("LEAD_NOTIFY", "info@futureacad.ae")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    # Set SESSION_COOKIE_SECURE=1 in production (behind HTTPS).
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "0") == "1"

    # Number of proxy hops in front of the app (nginx = 1). Drives ProxyFix so
    # request.remote_addr and url_for(_external=True) reflect the real client.
    PROXY_HOPS = int(os.environ.get("PROXY_HOPS", "1"))
