"""Password-protected admin: view leads, export CSV."""
import csv
import hmac
import io
from functools import wraps

from flask import (
    Blueprint,
    Response,
    current_app,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from . import db
from .utils import valid_csrf

admin = Blueprint("admin", __name__)


def _utf8(value):
    """Encode to bytes for constant-time comparison (accepts non-ASCII input)."""
    return str(value).encode("utf-8")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin"):
            return redirect(url_for("admin.login"))
        return view(*args, **kwargs)
    return wrapped


@admin.route("/", methods=["GET"])
@login_required
def dashboard():
    return render_template("admin/dashboard.html",
                           leads=db.all_leads(), stats=db.lead_stats(),
                           user=session.get("admin"))


@admin.route("/login", methods=["GET", "POST"])
def login():
    if session.get("admin"):
        return redirect(url_for("admin.dashboard"))

    if request.method == "POST":
        if not valid_csrf(request.form.get("csrf_token")):
            flash("Session expired. Please try again.")
            return redirect(url_for("admin.login"))

        username = request.form.get("username", "")
        password = request.form.get("password", "")
        # compare_digest rejects str with non-ASCII chars, so compare bytes.
        ok_user = hmac.compare_digest(_utf8(username), _utf8(current_app.config["ADMIN_USERNAME"]))
        ok_pass = hmac.compare_digest(_utf8(password), _utf8(current_app.config["ADMIN_PASSWORD"]))
        if ok_user and ok_pass:
            session["admin"] = username
            session.permanent = True
            return redirect(url_for("admin.dashboard"))
        flash("Invalid username or password.")
        return redirect(url_for("admin.login"))

    return render_template("admin/login.html")


@admin.route("/logout")
def logout():
    session.pop("admin", None)
    return redirect(url_for("admin.login"))


@admin.route("/export")
@login_required
def export():
    rows = db.all_leads()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "name", "email", "phone", "company", "interest", "message", "ip"])
    for r in rows:
        writer.writerow([r["id"], r["created_at"], r["name"], r["email"], r["phone"],
                         r["company"], r["interest"], r["message"], r["ip"]])
    return Response(
        buf.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=futureacad-leads.csv"},
    )
