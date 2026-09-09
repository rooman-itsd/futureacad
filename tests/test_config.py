"""Config guards: production secrets and proxy handling."""
import pytest
from werkzeug.middleware.proxy_fix import ProxyFix

from app import create_app
from config import DEV_ADMIN_PASSWORD, DEV_SECRET_KEY, Config


def _prod_config(tmp_path, **overrides):
    attrs = {
        "TESTING": False,
        "SECRET_KEY": "a-real-secret",
        "ADMIN_PASSWORD": "a-real-password",
        "DATABASE": str(tmp_path / "prod.db"),
    }
    attrs.update(overrides)
    return type("ProdConfig", (Config,), attrs)


@pytest.fixture(autouse=True)
def _not_debug(monkeypatch):
    monkeypatch.delenv("FLASK_DEBUG", raising=False)


def test_boots_when_secrets_are_set(tmp_path):
    assert create_app(_prod_config(tmp_path)) is not None


def test_refuses_to_boot_with_default_secret_key(tmp_path):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app(_prod_config(tmp_path, SECRET_KEY=DEV_SECRET_KEY))


def test_refuses_to_boot_with_default_admin_password(tmp_path):
    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        create_app(_prod_config(tmp_path, ADMIN_PASSWORD=DEV_ADMIN_PASSWORD))


def test_error_names_every_offending_setting(tmp_path):
    with pytest.raises(RuntimeError) as exc:
        create_app(_prod_config(
            tmp_path, SECRET_KEY=DEV_SECRET_KEY, ADMIN_PASSWORD=DEV_ADMIN_PASSWORD))
    assert "SECRET_KEY" in str(exc.value)
    assert "ADMIN_PASSWORD" in str(exc.value)


def test_dev_defaults_are_allowed_in_debug_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("FLASK_DEBUG", "1")
    app = create_app(_prod_config(
        tmp_path, SECRET_KEY=DEV_SECRET_KEY, ADMIN_PASSWORD=DEV_ADMIN_PASSWORD))
    assert app is not None


def test_proxyfix_is_applied_by_default(tmp_path):
    app = create_app(_prod_config(tmp_path))
    assert isinstance(app.wsgi_app, ProxyFix)


def test_proxyfix_can_be_disabled(tmp_path):
    app = create_app(_prod_config(tmp_path, PROXY_HOPS=0))
    assert not isinstance(app.wsgi_app, ProxyFix)


def test_forwarded_proto_is_honoured(tmp_path):
    """With ProxyFix active, nginx's X-Forwarded-Proto drives url_for(_external)."""
    app = create_app(_prod_config(tmp_path))

    @app.route("/__scheme")
    def scheme():
        from flask import request
        return request.scheme

    resp = app.test_client().get("/__scheme", headers={"X-Forwarded-Proto": "https"})
    assert resp.get_data(as_text=True) == "https"
