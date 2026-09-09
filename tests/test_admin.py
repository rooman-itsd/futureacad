"""Admin auth, dashboard, CSV export."""
import pytest

from tests.conftest import ADMIN_PASS, ADMIN_USER, login


def test_dashboard_requires_login(client):
    resp = client.get("/admin/")
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["Location"]


def test_export_requires_login(client):
    resp = client.get("/admin/export")
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["Location"]


def test_admin_root_redirects_to_slash(client):
    assert client.get("/admin").status_code == 308


def test_login_page_renders_csrf_field(client):
    body = client.get("/admin/login").get_data(as_text=True)
    assert 'name="csrf_token"' in body


def test_successful_login_redirects_to_dashboard(client):
    resp = login(client)
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/admin/")


@pytest.mark.parametrize("user,password", [
    (ADMIN_USER, "wrong-password"),
    ("wrong@user.com", ADMIN_PASS),
    ("", ""),
])
def test_bad_credentials_are_rejected(client, user, password):
    resp = login(client, user, password)
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/admin/login")
    # still locked out
    assert client.get("/admin/").status_code == 302


def test_login_without_csrf_is_rejected(client):
    resp = client.post("/admin/login", data={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/admin/login")


@pytest.mark.parametrize("value", ["admiñ", "pässwörd", "管理者", "café"])
def test_non_ascii_credentials_do_not_500(client, value):
    """Regression: hmac.compare_digest raises TypeError on non-ASCII str input.

    Before the fix this returned a 500 from /admin/login.
    """
    html = client.get("/admin/login").get_data(as_text=True)
    from tests.conftest import CSRF_INPUT_RE
    token = CSRF_INPUT_RE.search(html).group(1)

    resp = client.post("/admin/login", data={
        "csrf_token": token, "username": value, "password": value,
    })
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/admin/login")


def test_dashboard_shows_submitted_lead(admin_client, client, csrf):
    admin_client.post("/api/contact", json={
        "name": "Dashboard Lead", "email": "dash@example.com", "message": "hello",
    }, headers={"X-CSRFToken": csrf})

    body = admin_client.get("/admin/").get_data(as_text=True)
    assert "Dashboard Lead" in body
    assert "dash@example.com" in body


def test_dashboard_renders_with_no_leads(admin_client):
    assert admin_client.get("/admin/").status_code == 200


def test_csv_export_headers_and_rows(admin_client, csrf):
    admin_client.post("/api/contact", json={
        "name": "CSV Lead", "email": "csv@example.com", "phone": "+971500000001",
        "company": "Acme", "interest": "Deep Tech", "message": "export me",
    }, headers={"X-CSRFToken": csrf})

    resp = admin_client.get("/admin/export")
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    assert "futureacad-leads.csv" in resp.headers["Content-Disposition"]

    body = resp.get_data(as_text=True)
    lines = body.strip().splitlines()
    assert lines[0] == "id,created_at,name,email,phone,company,interest,message,ip"
    assert "CSV Lead" in lines[1]
    assert "csv@example.com" in lines[1]


def test_logout_clears_session(admin_client):
    assert admin_client.get("/admin/").status_code == 200
    resp = admin_client.get("/admin/logout")
    assert resp.status_code == 302
    assert admin_client.get("/admin/").status_code == 302


def test_login_page_redirects_when_already_authenticated(admin_client):
    resp = admin_client.get("/admin/login")
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/admin/")
