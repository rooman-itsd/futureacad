"""Public site routes + contact API."""
import json
import re
from pathlib import Path

from flask import Blueprint, jsonify, redirect, render_template, request

from . import db
from .data import PROJECTS, get_journey_icons, get_partners
from .utils import send_lead_email, valid_csrf

main = Blueprint("main", __name__)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX = {"name": 120, "email": 200, "phone": 40, "company": 160, "interest": 80, "message": 4000}


@main.route("/")
def home():
    return render_template(
        "index.html",
        active="home",
        projects=PROJECTS,
        journey_icons=get_journey_icons(),
    )


@main.route("/about")
def about():
    # the story marquee shows the live platform screenshots
    return render_template("about.html", active="about")


@main.route("/services")
def services():
    return render_template("services.html", active="services")


@main.route("/work")
def work():
    return render_template("work.html", active="work", projects=PROJECTS, partners=get_partners())


@main.route("/contact")
def contact():
    return render_template("contact.html", active="contact")


@main.route("/api/contact", methods=["POST"])
def api_contact():
    # CSRF (token issued on the contact page render, sent via header)
    if not valid_csrf(request.headers.get("X-CSRFToken")):
        return jsonify(ok=False, error="Your session expired — please refresh and try again."), 400

    data = request.get_json(silent=True) or {}

    # Honeypot
    if (data.get("company_website") or "").strip():
        return jsonify(ok=True), 200  # silently accept & drop bots

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip()
    company = (data.get("company") or "").strip()
    interest = (data.get("interest") or "").strip()
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify(ok=False, error="Name, email, and message are required."), 400
    if not EMAIL_RE.match(email):
        return jsonify(ok=False, error="Please enter a valid email address."), 400

    fields = {"name": name, "email": email, "phone": phone,
              "company": company, "interest": interest, "message": message}
    for field, limit in MAX.items():
        if len(fields[field]) > limit:
            return jsonify(ok=False, error="One of the fields is too long."), 400

    lead = {"name": name, "email": email, "phone": phone, "company": company,
            "interest": interest or "Unspecified", "message": message}
    db.add_lead(
        name, email, company, interest, message, phone=phone,
        ip=request.headers.get("X-Forwarded-For", request.remote_addr),
        user_agent=request.headers.get("User-Agent", "")[:300],
    )
    send_lead_email(lead)  # best-effort; never blocks the response on failure
    return jsonify(ok=True), 200


@main.route("/healthz")
def healthz():
    return jsonify(status="ok"), 200


# Platform redirects — forwards local routes to their respective live platform websites
PLATFORM_REDIRECTS = {
    "omnis": "https://rooman.com/omnis/",
    "hireai": "https://hireai.rooman.com/",
    "ai-tutor": "https://rooman.com/ai-tutor/",
    "bluelinked": "https://rooman.com/bluelinked/",
    "crm": "https://crm.rooman.net/",
    "erp": "https://erp.rooman.net/",
    "student-portal": "https://learn.rooman.com/",
}

@main.route("/omnis")
@main.route("/hireai")
@main.route("/ai-tutor")
@main.route("/bluelinked")
@main.route("/crm")
@main.route("/erp")
@main.route("/student-portal")
def handle_platform_redirect():
    slug = request.path.strip("/")
    target = PLATFORM_REDIRECTS.get(slug)
    if target:
        return redirect(target, code=302)
    return jsonify(error="Not found"), 404



# Build / Transform / Staffing / GCC / Careers pages. Their content is
# imported from the Rooman site by scripts/import_rooman.py into
# app/content/imported.json and rendered in the FutureAcad theme.
IMPORTED_FILE = Path(__file__).parent / "content" / "imported.json"
IMPORTED = json.loads(IMPORTED_FILE.read_text(encoding="utf-8"))
_imported_mtime = IMPORTED_FILE.stat().st_mtime


def _imported(path):
    """The page's content, re-read if the importer has rewritten the file."""
    global IMPORTED, _imported_mtime
    mtime = IMPORTED_FILE.stat().st_mtime
    if mtime != _imported_mtime:
        IMPORTED, _imported_mtime = json.loads(IMPORTED_FILE.read_text(encoding="utf-8")), mtime
    return IMPORTED[path]


# Which nav dropdown each imported page sits under; the legal pages sit
# under none.
def _nav_section(path):
    if path.startswith("build/apply-"):
        return "careers"
    return {"build": "build", "transform": "transform",
            "staffing-gcc": "staffing", "gcc-services": "gcc",
            "partner": "work", "careers": "careers"}.get(path.split("/")[0], "")


def imported_page(path):
    return render_template("imported.html", page=_imported(path), active=_nav_section(path))


for _path in IMPORTED:
    main.add_url_rule(f"/{_path}", "imported", imported_page, defaults={"path": _path})
