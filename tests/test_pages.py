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


@pytest.mark.parametrize("slug", ["omnis", "hireai", "ai-tutor", "bluelinked", "crm", "erp"])
def test_platform_shortcut_redirects_to_live_site(client, slug):
    from app.routes import PLATFORM_REDIRECTS

    resp = client.get(f"/{slug}")
    assert resp.status_code == 302
    assert resp.headers["Location"] == PLATFORM_REDIRECTS[slug]


@pytest.mark.parametrize("path", PUBLIC_PAGES)
def test_every_referenced_static_file_exists(client, app, path):
    """A renamed or deleted video/image should fail here, not as a silent 404."""
    import re
    from pathlib import Path

    body = client.get(path).get_data(as_text=True)
    refs = set(re.findall(r'/static/([^"\'?#\s)]+)', body))
    assert refs
    missing = [r for r in refs if not (Path(app.static_folder) / r).is_file()]
    assert not missing, f"{path} references missing static files: {missing}"


def test_partner_without_logo_falls_back_to_wordmark(monkeypatch, tmp_path):
    from app import data

    monkeypatch.setattr(data, "_PARTNER_DIR", tmp_path)
    (tmp_path / "cisco.svg").write_text("<svg/>")
    partners = {p["slug"]: p for p in data.get_partners()}
    assert partners["cisco"]["img"] == "img/partners/cisco.svg"
    assert partners["google"]["img"] is None
    assert partners["google"]["colors"]
