"""Public site routes + contact API."""
import re

from flask import Blueprint, jsonify, render_template, request

from . import db
from .data import PROJECTS
from .utils import send_lead_email, valid_csrf

main = Blueprint("main", __name__)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX = {"name": 120, "email": 200, "phone": 40, "company": 160, "interest": 80, "message": 4000}


@main.route("/")
def home():
    return render_template("index.html", active="home", projects=PROJECTS)


@main.route("/about")
def about():
    return render_template("about.html", active="about")


@main.route("/services")
def services():
    return render_template("services.html", active="services")


@main.route("/work")
def work():
    return render_template("work.html", active="work", projects=PROJECTS)


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
