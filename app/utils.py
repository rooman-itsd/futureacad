"""Small helpers: CSRF tokens and best-effort email notification."""
import hmac
import logging
import secrets
import smtplib
import threading
from email.message import EmailMessage

from flask import current_app, session

log = logging.getLogger(__name__)


def ensure_csrf():
    """Return the session CSRF token, creating one if needed."""
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def valid_csrf(token):
    expected = session.get("csrf")
    return bool(expected) and bool(token) and hmac.compare_digest(expected, token)


def _build_message(cfg, lead):
    msg = EmailMessage()
    msg["Subject"] = f"New FutureAcad lead — {lead['name']} ({lead['interest']})"
    msg["From"] = cfg["from_addr"]
    msg["To"] = cfg["to"]
    msg.set_content(
        "New strategy-session enquiry:\n\n"
        f"Name:     {lead['name']}\n"
        f"Email:    {lead['email']}\n"
        f"Phone:    {lead.get('phone') or '-'}\n"
        f"Company:  {lead['company'] or '-'}\n"
        f"Interest: {lead['interest']}\n\n"
        f"Message:\n{lead['message']}\n"
    )
    return msg


def _deliver(cfg, lead):
    """Actually talk to the SMTP server. Never raises."""
    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as s:
            s.starttls()
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.send_message(_build_message(cfg, lead))
        return True
    except Exception as e:
        log.warning("Lead email failed: %s", e)
        return False


def send_lead_email(lead):
    """Notify the team about a new lead. No-op unless SMTP is configured.

    Delivery runs on a background thread so a slow or dead mail server never
    delays the visitor's response. Set MAIL_SYNC=True (tests) to deliver inline.
    Never raises — email failure must not break the submission.
    """
    app_cfg = current_app.config
    if not app_cfg.get("SMTP_HOST") or not app_cfg.get("LEAD_NOTIFY"):
        return False

    # Snapshot config: the worker thread has no application context.
    cfg = {
        "host": app_cfg["SMTP_HOST"],
        "port": app_cfg["SMTP_PORT"],
        "user": app_cfg.get("SMTP_USER"),
        "password": app_cfg.get("SMTP_PASSWORD"),
        "from_addr": app_cfg["SMTP_FROM"],
        "to": app_cfg["LEAD_NOTIFY"],
    }

    if app_cfg.get("MAIL_SYNC"):
        return _deliver(cfg, lead)

    threading.Thread(target=_deliver, args=(cfg, lead), daemon=True).start()
    return True
