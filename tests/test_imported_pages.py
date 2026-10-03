"""Build / Transform / Staffing / GCC / Careers pages rendered from
app/content/imported.json."""
import pytest
from markupsafe import escape

from app import routes
from app.routes import IMPORTED

PATHS = sorted(IMPORTED)


@pytest.mark.parametrize("path", PATHS)
def test_imported_page_renders_its_content(client, path):
    page = IMPORTED[path]
    body = client.get(f"/{path}").get_data(as_text=True)
    assert str(escape(page["hero"]["h1"]["main"])) in body
    for section in page["sections"]:
        if section.get("title"):
            assert str(escape(section["title"])) in body


@pytest.mark.parametrize("path,section", [
    ("build/products", "build"), ("transform/managed-ai", "transform"),
    ("staffing-gcc/domestic", "staffing"), ("gcc-services", "gcc"),
    ("build/apply-intern", "careers"),
])
def test_imported_page_highlights_its_nav_dropdown(client, path, section):
    ids = {"build": "navBuild", "transform": "navTransform", "staffing": "navStaffing",
           "gcc": "navGcc", "careers": "navCareers"}
    body = client.get(f"/{path}").get_data(as_text=True)
    drop = body.split(f'id="{ids[section]}"', 1)[1]
    assert 'nav__drop-btn is-active' in drop.split("</button>", 1)[0]


def test_nav_links_to_the_local_pages(client):
    body = client.get("/").get_data(as_text=True)
    # The section index is reached from its pages; Omnis and BlueLinked are
    # deliberately left out of the menu.
    unlinked = {"transform", "build/omnis", "build/bluelinked"}
    for path in PATHS:
        if path not in unlinked:
            assert f'href="/{path}"' in body, path


def test_forms_post_through_the_contact_api(client):
    body = client.get("/build/apply-intern").get_data(as_text=True)
    assert "data-imported-form" in body
    assert 'data-csrf="' in body
    assert "js/imported.js" in body


def test_content_is_reread_when_the_file_changes(client, monkeypatch):
    changed = dict(IMPORTED)
    changed["gcc-services"] = {**IMPORTED["gcc-services"],
                               "hero": {**IMPORTED["gcc-services"]["hero"],
                                        "h1": {"main": "Freshly imported", "accent": ""}}}
    # Registered first so monkeypatch restores the real content afterwards.
    monkeypatch.setattr(routes, "IMPORTED", IMPORTED)
    monkeypatch.setattr(routes, "_imported_mtime", -1)
    monkeypatch.setattr(routes.json, "loads", lambda _text: changed)
    assert "Freshly imported" in client.get("/gcc-services").get_data(as_text=True)
