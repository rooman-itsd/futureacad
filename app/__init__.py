"""FutureAcad — Flask application factory."""
import os
from datetime import datetime

from flask import Flask, render_template
from werkzeug.middleware.proxy_fix import ProxyFix

from config import DEV_ADMIN_PASSWORD, DEV_SECRET_KEY, Config

from . import db
from .utils import ensure_csrf


def _assert_production_secrets(app):
    """Refuse to boot in production while dev placeholder secrets are in use.

    Skipped for tests and for local dev (FLASK_DEBUG=1), so `python run.py`
    still works with zero configuration.
    """
    if app.testing or os.environ.get("FLASK_DEBUG") == "1":
        return
    unset = []
    if app.config["SECRET_KEY"] == DEV_SECRET_KEY:
        unset.append("SECRET_KEY")
    if app.config["ADMIN_PASSWORD"] == DEV_ADMIN_PASSWORD:
        unset.append("ADMIN_PASSWORD")
    if unset:
        raise RuntimeError(
            f"Refusing to start: {', '.join(unset)} still set to the dev default. "
            "Set them in the environment (see .env.example)."
        )


def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_class)

    _assert_production_secrets(app)

    # Behind nginx: trust X-Forwarded-* so remote_addr and the URL scheme are real.
    hops = app.config.get("PROXY_HOPS", 1)
    if hops:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops, x_host=hops)

    db.init_db(app)

    # Register blueprints
    from .admin import admin
    from .routes import main
    app.register_blueprint(main)
    app.register_blueprint(admin, url_prefix="/admin")

    # Inject shared template values
    @app.context_processor
    def inject_globals():
        return {"year": datetime.now().year, "csrf_token": ensure_csrf()}

    # Lightweight security headers
    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return resp

    # Friendly error pages
    @app.errorhandler(404)
    def not_found(e):
        return render_template("error.html", code="404",
                               heading="Lost in the network.",
                               message="The page you're looking for isn't here — but the future still is."), 404

    @app.errorhandler(500)
    def server_error(e):
        return render_template("error.html", code="500",
                               heading="Something glitched.",
                               message="An unexpected error occurred. Please try again in a moment."), 500

    return app
