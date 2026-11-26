"""Public site routes + contact API."""
import html
import json
import re
from pathlib import Path

from flask import Blueprint, jsonify, redirect, render_template, request

from . import db, saiom_content
from .data import PROJECTS, get_journey_icons, get_partners
from .utils import send_lead_email, valid_csrf

main = Blueprint("main", __name__)

# The live address, for canonical links, Open Graph and the sitemap.
SITE_URL = "https://futureacad.ae"


@main.app_context_processor
def _site():
    return {"site_url": SITE_URL}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX = {"name": 120, "email": 200, "phone": 40, "company": 160, "interest": 80, "message": 4000}


@main.route("/")
def home():
    return render_template(
        "index.html",
        active="home",
        projects=PROJECTS,
        journey_icons=get_journey_icons(),
    )


@main.route("/about")
def about():
    # the story marquee shows the live platform screenshots
    return render_template("about.html", active="about")


@main.route("/services")
def services():
    return render_template("services.html", active="services")


@main.route("/work")
def work():
    faq = _page_faq("work")
    page = {"sections": [{"blocks": [{"t": "faq", "items": faq["items"]}]}]} if faq else {}
    return render_template("work.html", active="work", projects=PROJECTS, partners=get_partners(),
                           faq=faq, faq_schema=_faq_schema(page))


@main.route("/contact")
def contact():
    return render_template("contact.html", active="contact")


@main.route("/api/contact", methods=["POST"])
def api_contact():
    # CSRF (token issued on the contact page render, sent via header)
    if not valid_csrf(request.headers.get("X-CSRFToken")):
        return jsonify(ok=False, error="Your session expired — please refresh and try again."), 400

    data = request.get_json(silent=True) or {}

    # Honeypot
    if (data.get("company_website") or "").strip():
        return jsonify(ok=True), 200  # silently accept & drop bots

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip()
    company = (data.get("company") or "").strip()
    interest = (data.get("interest") or "").strip()
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify(ok=False, error="Name, email, and message are required."), 400
    if not EMAIL_RE.match(email):
        return jsonify(ok=False, error="Please enter a valid email address."), 400

    fields = {"name": name, "email": email, "phone": phone,
              "company": company, "interest": interest, "message": message}
    for field, limit in MAX.items():
        if len(fields[field]) > limit:
            return jsonify(ok=False, error="One of the fields is too long."), 400

    lead = {"name": name, "email": email, "phone": phone, "company": company,
            "interest": interest or "Unspecified", "message": message}
    db.add_lead(
        name, email, company, interest, message, phone=phone,
        ip=request.headers.get("X-Forwarded-For", request.remote_addr),
        user_agent=request.headers.get("User-Agent", "")[:300],
    )
    send_lead_email(lead)  # best-effort; never blocks the response on failure
    return jsonify(ok=True), 200


@main.route("/healthz")
def healthz():
    return jsonify(status="ok"), 200


# Platform redirects — forwards local routes to their respective live platform websites
PLATFORM_REDIRECTS = {
    "omnis": "/build/omnis",
    "hireai": "https://hiresolution.ai/",
    "ai-tutor": "/build/product/ai-tutor",
    "bluelinked": "/build/bluelinked",
    "crm": "/transform/ai-bos",
    "erp": "/build/product/edu-erp",
    "student-portal": "/transform/ai-workforce-readiness",
}

@main.route("/omnis")
@main.route("/hireai")
@main.route("/ai-tutor")
@main.route("/bluelinked")
@main.route("/crm")
@main.route("/erp")
@main.route("/student-portal")
def handle_platform_redirect():
    slug = request.path.strip("/")
    target = PLATFORM_REDIRECTS.get(slug)
    if target:
        return redirect(target, code=302)
    return jsonify(error="Not found"), 404



# Build / Transform / Staffing / GCC / Careers pages. Their content is
# imported from the Rooman site by scripts/import_rooman.py into
# app/content/imported.json and rendered in the FutureAcad theme.
IMPORTED_FILE = Path(__file__).parent / "content" / "imported.json"
# Guides (futureacad.ae/guides) live in their own file so a re-run of the importer
# does not overwrite them.
GUIDES_FILE = IMPORTED_FILE.parent / "guides.json"


def _load_pages():
    pages = json.loads(IMPORTED_FILE.read_text(encoding="utf-8"))
    pages.update(json.loads(GUIDES_FILE.read_text(encoding="utf-8")))
    saiom_content.add_to_index(pages, saiom_content.load_pages())
    return pages


IMPORTED = _load_pages()
_imported_mtime = (IMPORTED_FILE.stat().st_mtime, GUIDES_FILE.stat().st_mtime, saiom_content.stamp())


def _imported(path):
    """The page's content, re-read if the importer has rewritten a content file."""
    global IMPORTED, _imported_mtime
    mtime = (IMPORTED_FILE.stat().st_mtime, GUIDES_FILE.stat().st_mtime, saiom_content.stamp())
    if mtime != _imported_mtime:
        IMPORTED, _imported_mtime = _load_pages(), mtime
    return IMPORTED[path]


# Which nav dropdown each imported page sits under; the legal pages sit
# under none.
def _nav_section(path):
    if path.startswith("build/apply-"):
        return "careers"
    return {"build": "build", "transform": "transform",
            "staffing-gcc": "staffing", "gcc-services": "gcc",
            "partner": "work", "careers": "careers"}.get(path.split("/")[0], "")


def _assessment(key):
    """A quiz's questions and scoring bands (app/content/<key>.json)."""
    return json.loads((IMPORTED_FILE.parent / f"{key}.json").read_text(encoding="utf-8"))


SEO_FILE = IMPORTED_FILE.parent / "seo.json"


def _with_seo(path, page):
    """The page with its SAIOM keyword title and description (app/content/seo.json).

    Kept apart from imported.json so a re-run of the importer does not undo them."""
    seo = json.loads(SEO_FILE.read_text(encoding="utf-8")).get(path)
    return {**page, **seo} if seo else page


PAGE_FAQ_FILE = IMPORTED_FILE.parent / "page_faq.json"


def _page_faq(path):
    """Extra "Good to know" questions for a page (app/content/page_faq.json), or None."""
    return json.loads(PAGE_FAQ_FILE.read_text(encoding="utf-8")).get(path)


PAGE_SECTIONS_FILE = IMPORTED_FILE.parent / "page_sections.json"


def _with_faq(path, page):
    """The page with its extra sections (page_sections.json) and FAQ (page_faq.json),
    placed before the closing form section."""
    added = list(json.loads(PAGE_SECTIONS_FILE.read_text(encoding="utf-8")).get(path, []))
    extra = _page_faq(path)
    if extra:
        added.append({"id": "good-to-know", "dark": False, "eyebrow": "Good to know",
                      "title": extra["title"], "blocks": [{"t": "faq", "items": extra["items"]}]})
    if not added:
        return page
    sections = list(page.get("sections", []))
    has_form = [i for i, sec in enumerate(sections)
                if any(b.get("t") == "form" for b in sec.get("blocks", []))]
    at = has_form[-1] if has_form else len(sections)
    return {**page, "sections": sections[:at] + added + sections[at:]}


def _plain(html_text):
    """Text without tags or entities, for structured data."""
    return html.unescape(re.sub(r"<[^>]+>", "", html_text)).strip()


def _faq_schema(page):
    """The page's FAQ blocks as schema.org FAQPage data, or None."""
    blocks = [b for sec in [page.get("hero") or {}, *page.get("sections", [])]
              for b in sec.get("blocks", []) if b.get("t") == "faq"]
    questions = [{"@type": "Question", "name": _plain(item["q"]),
                  "acceptedAnswer": {"@type": "Answer",
                                     "text": " ".join(_plain(a) for a in item["a"])}}
                 for b in blocks for item in b.get("items", [])]
    if not questions:
        return None
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": questions}


def _page_schema(path, page):
    """WebPage (or Article, for dated guides) plus a breadcrumb, as JSON-LD."""
    url = f"{SITE_URL}/{path}"
    node = {"@type": "Article" if page.get("published") else "WebPage", "@id": f"{url}#page",
            "url": url, "name": page["title"], "description": page["description"],
            "isPartOf": {"@id": f"{SITE_URL}/#site"}, "publisher": {"@id": f"{SITE_URL}/#org"},
            "inLanguage": "en"}
    if page.get("published"):
        node.update(headline=page["title"], datePublished=page["published"],
                    dateModified=page.get("updated", page["published"]),
                    author={"@id": f"{SITE_URL}/#org"})
    crumbs = [("FutureAcad", f"{SITE_URL}/")]
    if path.startswith("guides/"):
        crumbs.append(("Guides", f"{SITE_URL}/guides"))
    crumbs.append((page["title"], url))
    trail = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i, "name": n, "item": u}
        for i, (n, u) in enumerate(crumbs, 1)]}
    graph = [node, trail]
    if _is_service(path):
        graph.append({"@type": "Service", "@id": f"{url}#service", "name": page["title"].split(" | ")[0],
                      "description": page["description"], "url": url,
                      "provider": {"@id": f"{SITE_URL}/#org"},
                      "areaServed": [{"@type": "Country", "name": "United Arab Emirates"},
                                     {"@type": "Country", "name": "India"}]})
        node["mainEntity"] = {"@id": f"{url}#service"}
    return {"@context": "https://schema.org", "@graph": graph}


# Section roots whose sub-pages describe something FutureAcad sells.
_SERVICE_ROOTS = ("build/", "transform/", "staffing-gcc", "gcc-services")
_NOT_SERVICE = ("case-stud", "apply-", "submit-a-problem", "how-to-choose", "/examples", "/pricing")


def _is_service(path):
    return path.startswith(_SERVICE_ROOTS) and not any(x in path for x in _NOT_SERVICE) \
        and path not in ("build", "transform", "build/products")


def imported_page(path):
    page = _with_faq(path, _with_seo(path, _imported(path)))
    return render_template("imported.html", page=page, active=_nav_section(path),
                           assessment=_assessment, faq_schema=_faq_schema(page),
                           page_schema=_page_schema(path, page))


for _path in IMPORTED:
    main.add_url_rule(f"/{_path}", "imported", imported_page, defaults={"path": _path})


@main.route("/llms.txt")
def llms():
    """A plain-text summary of the site for AI assistants."""
    lines = [
        "# FutureAcad", "",
        "> FutureAcad (futureacad.ae) is a Dubai-based deep tech startup. It builds AI applications "
        "and AI agents, runs AI transformation and managed AI services, and provides IT staffing "
        "and GCC services for companies in the UAE and India.", "",
        "## Main pages", ""]
    keys = ["build/ai-project-builds", "build/custom-ai-builds", "build/hireai",
            "build/product/crm-voice-agent", "build/product/ai-tutor", "build/product/edu-erp",
            "build/startup-varsity", "transform/ai-readiness-audit",
            "transform/ai-workforce-readiness", "transform/managed-ai", "transform/enterprise",
            "staffing-gcc/staffing", "gcc-services", "guides/cost-to-build-an-ai-app"]
    for k in keys:
        if k in IMPORTED:
            lines.append(f"- [{IMPORTED[k]['title']}]({SITE_URL}/{k}): {IMPORTED[k]['description']}")
    lines += ["", "## Company", "", f"- [About FutureAcad]({SITE_URL}/about)",
              f"- [Contact]({SITE_URL}/contact)", f"- [Guides]({SITE_URL}/guides)", ""]
    return "\n".join(lines), 200, {"Content-Type": "text/plain; charset=utf-8"}


# Pages no other page links to (SAIOM audit); they stay reachable but are not listed.
SITEMAP_SKIP = {"build/omnis", "build/bluelinked"}


@main.route("/sitemap.xml")
def sitemap():
    """Every public page, for search engines (listed in robots.txt)."""
    paths = ["/", "/about", "/services", "/work", "/contact"] + [
        f"/{p}" for p in IMPORTED if p not in SITEMAP_SKIP]
    def lastmod(p):
        # Only pages that carry a real "updated" date get one; no guessed dates.
        day = IMPORTED.get(p.lstrip("/"), {}).get("updated")
        return f"<lastmod>{day}</lastmod>" if day else ""
    urls = "".join(f"<url><loc>{SITE_URL}{p}</loc>{lastmod(p)}</url>" for p in paths)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
           f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>')
    return xml, 200, {"Content-Type": "application/xml; charset=utf-8"}

