"""POST /api/contact — CSRF, honeypot, validation and persistence."""
import pytest

from app.routes import MAX

VALID = {
    "name": "Deploy Test",
    "email": "lead@example.com",
    "phone": "+971500000000",
    "company": "Acme",
    "interest": "AI Suite",
    "message": "Please get in touch.",
}


def post(client, token, payload):
    return client.post("/api/contact", json=payload, headers={"X-CSRFToken": token})


def test_valid_submission_is_accepted_and_stored(client, csrf, read_leads):
    resp = post(client, csrf, VALID)
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}

    rows = read_leads()
    assert len(rows) == 1
    assert rows[0]["name"] == VALID["name"]
    assert rows[0]["email"] == VALID["email"]
    assert rows[0]["phone"] == VALID["phone"]


def test_missing_csrf_token_is_rejected(client):
    resp = client.post("/api/contact", json=VALID)
    assert resp.status_code == 400
    assert resp.get_json()["ok"] is False


def test_wrong_csrf_token_is_rejected(client, csrf):
    resp = post(client, csrf + "tampered", VALID)
    assert resp.status_code == 400


@pytest.mark.parametrize("missing", ["name", "email", "message"])
def test_required_fields_are_enforced(client, csrf, missing):
    payload = dict(VALID)
    payload[missing] = "   "
    resp = post(client, csrf, payload)
    assert resp.status_code == 400
    assert "required" in resp.get_json()["error"].lower()


@pytest.mark.parametrize("bad_email", [
    "notanemail", "no@tld", "@example.com", "spaces in@example.com", "two@@example.com",
])
def test_invalid_emails_are_rejected(client, csrf, bad_email):
    resp = post(client, csrf, {**VALID, "email": bad_email})
    assert resp.status_code == 400
    assert "valid email" in resp.get_json()["error"].lower()


@pytest.mark.parametrize("field", sorted(MAX))
def test_overlong_fields_are_rejected(client, csrf, field):
    payload = {**VALID, field: "a" * (MAX[field] + 1)}
    if field == "email":  # keep it a valid address, just too long
        payload["email"] = "a" * (MAX["email"]) + "@example.com"
    resp = post(client, csrf, payload)
    assert resp.status_code == 400
    assert "too long" in resp.get_json()["error"].lower()


def test_field_at_exact_limit_is_accepted(client, csrf):
    resp = post(client, csrf, {**VALID, "message": "m" * MAX["message"]})
    assert resp.status_code == 200


def test_honeypot_is_silently_accepted_but_not_stored(client, csrf, read_leads):
    resp = post(client, csrf, {**VALID, "company_website": "spam.example.com"})
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}
    assert read_leads() == []


def test_blank_interest_is_stored_as_submitted(client, csrf, read_leads):
    """The "Unspecified" fallback applies to the notification email, not the row."""
    resp = post(client, csrf, {**VALID, "interest": ""})
    assert resp.status_code == 200
    assert read_leads()[0]["interest"] == ""


def test_client_ip_is_taken_from_x_forwarded_for(client, csrf, read_leads):
    resp = client.post("/api/contact", json=VALID, headers={
        "X-CSRFToken": csrf, "X-Forwarded-For": "203.0.113.9",
    })
    assert resp.status_code == 200
    assert read_leads()[0]["ip"] == "203.0.113.9"


def test_email_notification_is_attempted_when_smtp_configured(client, csrf, app, monkeypatch):
    sent = {}

    def fake_deliver(cfg, lead):
        sent["cfg"] = cfg
        sent["lead"] = lead
        return True

    monkeypatch.setattr("app.utils._deliver", fake_deliver)
    app.config["SMTP_HOST"] = "smtp.example.com"
    app.config["LEAD_NOTIFY"] = "leads@example.com"

    assert post(client, csrf, VALID).status_code == 200
    assert sent["lead"]["name"] == VALID["name"]
    assert sent["cfg"]["to"] == "leads@example.com"


def test_smtp_failure_does_not_break_submission(client, csrf, app, monkeypatch):
    def exploding_smtp(*args, **kwargs):
        raise OSError("mail server down")

    monkeypatch.setattr("smtplib.SMTP", exploding_smtp)
    app.config["SMTP_HOST"] = "smtp.example.com"
    app.config["LEAD_NOTIFY"] = "leads@example.com"

    resp = post(client, csrf, VALID)
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}
