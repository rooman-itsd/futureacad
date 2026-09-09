"""Data layer — schema creation, inserts, listing and stats."""
from app import db


def test_schema_is_created_on_boot(app, read_leads):
    assert read_leads() == []


def test_add_lead_returns_id_and_persists(app, read_leads):
    with app.test_request_context():
        db.get_db()
        first = db.add_lead("Ada", "ada@example.com", "Acme", "AI", "hello", phone="+1")
        second = db.add_lead("Grace", "grace@example.com", "Navy", "ERP", "hi")
        db.close_db()

    assert first == 1
    assert second == 2
    rows = read_leads()
    assert [r["name"] for r in rows] == ["Ada", "Grace"]
    assert rows[0]["phone"] == "+1"


def test_all_leads_is_newest_first(app):
    with app.test_request_context():
        db.get_db()
        db.add_lead("First", "a@example.com", "", "", "m")
        db.add_lead("Second", "b@example.com", "", "", "m")
        rows = db.all_leads()
        db.close_db()

    assert [r["name"] for r in rows] == ["Second", "First"]


def test_lead_stats_counts_and_top_interest(app):
    with app.test_request_context():
        db.get_db()
        for _ in range(3):
            db.add_lead("X", "x@example.com", "", "AI Suite", "m")
        db.add_lead("Y", "y@example.com", "", "ERP", "m")
        stats = db.lead_stats()
        db.close_db()

    assert stats["total"] == 4
    assert stats["today"] == 4
    assert stats["week"] == 4
    assert stats["top"] == "AI Suite"


def test_lead_stats_on_empty_table(app):
    with app.test_request_context():
        db.get_db()
        stats = db.lead_stats()
        db.close_db()

    assert stats == {"total": 0, "today": 0, "week": 0, "top": None}


def test_init_db_is_idempotent(app, config_class):
    """Re-running init_db must not fail or wipe existing rows."""
    with app.test_request_context():
        db.get_db()
        db.add_lead("Keep", "keep@example.com", "", "", "m")
        db.close_db()

    db.init_db(app)

    with app.test_request_context():
        db.get_db()
        rows = db.all_leads()
        db.close_db()

    assert [r["name"] for r in rows] == ["Keep"]


def test_sqlite_backend_is_selected_without_postgres_url(app):
    with app.test_request_context():
        db.get_db()
        from flask import g
        assert g.is_pg is False
        db.close_db()
