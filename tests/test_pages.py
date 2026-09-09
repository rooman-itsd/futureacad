"""Public pages, health check, error pages and security headers."""
import pytest

PUBLIC_PAGES = ["/", "/about", "/services", "/work", "/contact"]


@pytest.mark.parametrize("path", PUBLIC_PAGES)
def test_public_page_renders(client, path):
    resp = client.get(path)
    assert resp.status_code == 200
    assert b"<html" in resp.data.lower()


def test_healthz_returns_ok(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_home_lists_ecosystem_projects(client, app):
    from app.data import PROJECTS

    body = client.get("/").get_data(as_text=True)
    assert PROJECTS, "expected at least one project in app.data.PROJECTS"
    assert PROJECTS[0]["name"] in body


def test_unknown_path_renders_custom_404(client):
    resp = client.get("/definitely-not-a-page")
    assert resp.status_code == 404
    assert b"404" in resp.data


@pytest.mark.parametrize("header,expected", [
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "SAMEORIGIN"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
])
def test_security_headers_present(client, header, expected):
    assert client.get("/").headers[header] == expected


def test_static_asset_is_served(client):
    resp = client.get("/static/css/styles.css")
    assert resp.status_code == 200
    assert resp.data


def test_500_handler_renders_error_page(app, config_class):
    """A view that raises should produce the friendly 500 page, not a stack trace."""
    @app.route("/__boom")
    def boom():
        raise RuntimeError("intentional")

    app.config["PROPAGATE_EXCEPTIONS"] = False
    client = app.test_client()
    resp = client.get("/__boom")
    assert resp.status_code == 500
    assert b"500" in resp.data
