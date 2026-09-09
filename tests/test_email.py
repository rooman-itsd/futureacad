"""Lead notification email — message contents, delivery, failure handling."""
import pytest

from app import utils

LEAD = {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": "+971500000000",
    "company": "Analytical Engines",
    "interest": "AI Suite",
    "message": "Let's talk.",
}

CFG = {
    "host": "smtp.example.com",
    "port": 587,
    "user": "mailer@example.com",
    "password": "secret",
    "from_addr": "no-reply@futureacad.ae",
    "to": "leads@futureacad.ae",
}


class FakeSMTP:
    """Records what the mailer did, standing in for smtplib.SMTP."""
    instances = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.started_tls = False
        self.login_args = None
        self.sent = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, user, password):
        self.login_args = (user, password)

    def send_message(self, msg):
        self.sent.append(msg)


@pytest.fixture(autouse=True)
def _reset_fake():
    FakeSMTP.instances = []


def test_build_message_contains_every_lead_field():
    msg = utils._build_message(CFG, LEAD)
    assert msg["From"] == CFG["from_addr"]
    assert msg["To"] == CFG["to"]
    assert LEAD["name"] in msg["Subject"]
    assert LEAD["interest"] in msg["Subject"]

    body = msg.get_content()
    for value in (LEAD["name"], LEAD["email"], LEAD["phone"],
                  LEAD["company"], LEAD["interest"], LEAD["message"]):
        assert value in body


def test_build_message_renders_dashes_for_blank_optional_fields():
    body = utils._build_message(CFG, {**LEAD, "phone": "", "company": ""}).get_content()
    assert "Phone:    -" in body
    assert "Company:  -" in body


def test_deliver_uses_starttls_and_login(monkeypatch):
    monkeypatch.setattr("smtplib.SMTP", FakeSMTP)
    assert utils._deliver(CFG, LEAD) is True

    smtp = FakeSMTP.instances[0]
    assert (smtp.host, smtp.port) == (CFG["host"], CFG["port"])
    assert smtp.timeout == 10
    assert smtp.started_tls is True
    assert smtp.login_args == (CFG["user"], CFG["password"])
    assert len(smtp.sent) == 1


def test_deliver_skips_login_when_no_user(monkeypatch):
    monkeypatch.setattr("smtplib.SMTP", FakeSMTP)
    assert utils._deliver({**CFG, "user": None}, LEAD) is True
    assert FakeSMTP.instances[0].login_args is None


def test_deliver_swallows_smtp_errors(monkeypatch, caplog):
    def boom(*args, **kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr("smtplib.SMTP", boom)
    with caplog.at_level("WARNING"):
        assert utils._deliver(CFG, LEAD) is False
    assert "Lead email failed" in caplog.text


def test_send_lead_email_is_noop_without_smtp_host(app):
    with app.test_request_context():
        app.config["SMTP_HOST"] = None
        assert utils.send_lead_email(LEAD) is False


def test_send_lead_email_is_noop_without_recipient(app):
    with app.test_request_context():
        app.config["SMTP_HOST"] = "smtp.example.com"
        app.config["LEAD_NOTIFY"] = None
        assert utils.send_lead_email(LEAD) is False


def test_send_lead_email_delivers_inline_when_mail_sync(app, monkeypatch):
    monkeypatch.setattr("smtplib.SMTP", FakeSMTP)
    with app.test_request_context():
        app.config["SMTP_HOST"] = "smtp.example.com"
        app.config["LEAD_NOTIFY"] = "leads@example.com"
        app.config["MAIL_SYNC"] = True
        assert utils.send_lead_email(LEAD) is True
    assert len(FakeSMTP.instances) == 1


def test_send_lead_email_runs_on_background_thread_by_default(app, monkeypatch):
    """The request must not wait on SMTP; delivery is handed to a daemon thread."""
    started = {}

    class FakeThread:
        def __init__(self, target, args, daemon):
            started["target"] = target
            started["args"] = args
            started["daemon"] = daemon

        def start(self):
            started["started"] = True

    monkeypatch.setattr("threading.Thread", FakeThread)
    with app.test_request_context():
        app.config["SMTP_HOST"] = "smtp.example.com"
        app.config["LEAD_NOTIFY"] = "leads@example.com"
        app.config["MAIL_SYNC"] = False
        assert utils.send_lead_email(LEAD) is True

    assert started["started"] is True
    assert started["daemon"] is True
    assert started["target"] is utils._deliver
    assert started["args"][1] == LEAD


def test_config_snapshot_is_passed_to_thread_not_app_context(app, monkeypatch):
    """The worker thread has no app context, so config must be snapshotted."""
    captured = {}
    monkeypatch.setattr(utils, "_deliver", lambda cfg, lead: captured.update(cfg=cfg))

    with app.test_request_context():
        app.config["SMTP_HOST"] = "smtp.example.com"
        app.config["SMTP_FROM"] = "from@example.com"
        app.config["LEAD_NOTIFY"] = "to@example.com"
        app.config["MAIL_SYNC"] = True
        utils.send_lead_email(LEAD)

    assert captured["cfg"]["host"] == "smtp.example.com"
    assert captured["cfg"]["from_addr"] == "from@example.com"
    assert captured["cfg"]["to"] == "to@example.com"
