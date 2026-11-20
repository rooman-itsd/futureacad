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
    ("transform/ai-bos", "transform"),
    ("staffing-gcc/domestic", "staffing"), ("gcc-services", "gcc"),
    ("build/apply-intern", "careers"),
])
def test_imported_page_highlights_its_nav_dropdown(client, path, section):
    ids = {"build": "navBuild", "transform": "navTransform", "staffing": "navStaffing",
           "gcc": "navGcc", "careers": "navCareers"}
    body = client.get(f"/{path}").get_data(as_text=True)
    drop = body.split(f'id="{ids[section]}"', 1)[1]
    assert 'nav__drop-btn is-active' in drop.split("</button>", 1)[0]


# Pages kept out of the menu: section indexes, sub-pages and case studies are
# reached from the pages that link to them; Omnis and BlueLinked are
# deliberately unlisted; the legal pages and Careers sit in the footer.
OFF_MENU = {
    "transform", "build/omnis", "build/bluelinked",
    "build", "build/custom-ai-builds/pricing", "build/custom-ai-builds/examples",
    "build/startup-varsity/founders-track", "build/startup-varsity/partners",
    "build/how-to-choose", "transform/managed-ai-functions", "transform/outcome-based-ai",
    "careers", "privacy", "terms",
}
OFF_MENU |= {p for p in PATHS if p.startswith("transform/case-study/")}
UNLINKED = {"build/omnis", "build/bluelinked"}


def test_nav_links_to_the_local_pages(client):
    body = client.get("/").get_data(as_text=True)
    for path in PATHS:
        if path not in OFF_MENU:
            assert f'href="/{path}"' in body, path


@pytest.mark.parametrize("url", ["/", "/about", "/services", "/work", "/build/products"])
def test_footer_links_careers_and_the_legal_pages(client, url):
    page, footer = client.get(url).get_data(as_text=True).split('<footer class="fa-footer">', 1)
    for path in ("careers", "privacy", "terms"):
        assert f'href="/{path}"' in footer, (url, path)
        # Footer only: the menu tabs stay as they are.
        assert f'href="/{path}"' not in page, (url, path)


def test_off_menu_pages_are_linked_from_another_imported_page(client):
    bodies = {p: client.get(f"/{p}").get_data(as_text=True) for p in PATHS}
    for path in OFF_MENU - UNLINKED:
        assert any(f'href="/{path}"' in b for p, b in bodies.items() if p != path), path


def test_imported_links_stay_off_the_old_cloudfront_origin(client):
    for path in PATHS:
        assert "cloudfront.net" not in client.get(f"/{path}").get_data(as_text=True), path


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


def test_readiness_score_renders_every_question_and_the_report_fields(client):
    quiz = routes._assessment("readiness-score")
    body = client.get("/transform/ai-readiness-score").get_data(as_text=True)
    assert "BackNext" not in body
    assert body.count("data-rs-step>") == len(quiz["questions"]) + 1  # plus team size
    for q in quiz["questions"]:
        assert str(escape(q["q"])) in body
    # The result's report form posts like the other forms, with the score attached.
    form = body.split('id="rs-lead"', 1)[1]
    assert "data-imported-form" in form
    for name in ("rs-score", "rs-plan", "rs-areas", "rs-answers"):
        assert f'type="hidden" name="{name}"' in form


def test_saiom_keywords_set_the_title_and_description(client):
    """SEO titles from app/content/seo.json win over the imported ones."""
    html = client.get("/build/product/ai-tutor").get_data(as_text=True)
    assert "<title>AI Tutor: Study AI &amp; Homework Helper — FutureAcad</title>" in html
    assert "AI homework helper" in html
    assert 'property="og:title" content="AI Tutor: Study AI &amp; Homework Helper — FutureAcad"' in html


def test_seo_overrides_only_name_real_pages():
    import json
    from pathlib import Path
    content = Path(__file__).parent.parent / "app" / "content"
    pages = json.loads((content / "imported.json").read_text(encoding="utf-8"))
    seo = json.loads((content / "seo.json").read_text(encoding="utf-8"))
    for path, meta in seo.items():
        if path.startswith("_"):
            continue
        assert path in pages, path
        assert len(meta.get("title", "")) <= 47, path
        assert len(meta.get("description", "")) <= 160, path


def test_sitemap_lists_every_public_page(client):
    r = client.get("/sitemap.xml")
    assert r.status_code == 200 and r.mimetype == "application/xml"
    xml = r.get_data(as_text=True)
    for path in ("/", "/contact", "/build/product/ai-tutor", "/transform/ai-bos"):
        assert f"<loc>https://futureacad.ae{path}</loc>" in xml


def test_pages_carry_canonical_and_organization_schema(client):
    html = client.get("/build/hireai").get_data(as_text=True)
    assert '<link rel="canonical" href="https://futureacad.ae/build/hireai" />' in html
    assert '"@type": "Organization"' in html


def test_faq_blocks_become_faqpage_schema(client):
    html = client.get("/build/custom-ai-builds").get_data(as_text=True)
    assert '"@type": "FAQPage"' in html and "Is it really free?" in html
