"""Static content data — the live platform ecosystem.

Each entry carries a screenshot of the live product, captured from its
own URL, so the ecosystem grid shows the real thing rather than icons.
"""

from pathlib import Path

PROJECTS = [
    {"name": "CRM",            "host": "crm.rooman.net",        "url": "https://crm.rooman.net/",
     "desc": "Customer relationship platform",
     "img": "img/platforms/crm.jpg"},
    {"name": "ERP",            "host": "erp.rooman.net",        "url": "https://erp.rooman.net/",
     "desc": "Enterprise resource planning system",
     "img": "img/platforms/erp.jpg"},
    {"name": "Student Portal", "host": "rooman.net",            "url": "https://rooman.net/student-login/",
     "desc": "Learning & student login",
     "img": "img/platforms/student-portal.jpg"},
    {"name": "Startup Varsity","host": "startupvarsity.com",    "url": "https://www.startupvarsity.com/",
     "desc": "Learn startup skills, launch companies",
     "img": "img/platforms/startup-varsity.jpg"},
    {"name": "AI Tutor",       "host": "rooman.com/ai-tutor",   "url": "https://rooman.com/ai-tutor/",
     "desc": "Adaptive, AI-powered learning companion",
     "img": "img/platforms/ai-tutor.jpg"},
    {"name": "BlueLinked",     "host": "rooman.com/bluelinked", "url": "https://rooman.com/bluelinked/",
     "desc": "Voice-to-resume app for blue-collar workers",
     "img": "img/platforms/bluelinked.jpg"},
    {"name": "Omnis",          "host": "rooman.com/omnis",      "url": "https://rooman.com/omnis/",
     "desc": "Enterprise LLM platform",
     "img": "img/platforms/omnis.jpg"},
    {"name": "HireAI",         "host": "hireai.rooman.com",     "url": "https://hireai.rooman.com/",
     "desc": "AI-powered recruitment & interview platform",
     "img": "img/platforms/hireai.jpg"},
]


# Training and certification partners, shown as a travelling row on /work.
#
# No logo files ship with this project, and an approximation of another
# company's trademark drawn from memory would misrepresent them, so each
# entry falls back to a wordmark. Drop a real file into
# app/static/img/partners/ named after the slug below - svg, png or webp -
# and that partner switches to its logo on the next request. Nothing else
# needs changing.
_PARTNER_DIR = Path(__file__).resolve().parent / "static" / "img" / "partners"
_LOGO_EXTS = ("svg", "png", "webp")


def _partner_logo(slug: str) -> str | None:
    """Return the static path of a partner logo, or None if none is present."""
    for ext in _LOGO_EXTS:
        if (_PARTNER_DIR / f"{slug}.{ext}").is_file():
            return f"img/partners/{slug}.{ext}"
    return None


# Per-letter colours for a wordmark fallback, used only where a partner has
# no logo file. Google's are its own, so the name does not sit there in site
# teal beside five real logos.
_WORDMARK_COLORS = {
    "google": ["#4285F4", "#EA4335", "#FBBC05", "#4285F4", "#34A853", "#EA4335"],
    # A single colour repeats across every letter.
    "nasscom": ["#C8102E"],
}

_PARTNER_NAMES = [
    ("microsoft", "Microsoft"),
    ("cisco", "Cisco"),
    ("aws", "AWS"),
    ("google", "Google"),
    ("red-hat", "Red Hat"),
    ("vmware", "VMware"),
    ("nasscom", "nasscom"),
]


def get_partners() -> list[dict]:
    """Partners with their logo path resolved now, not at import.

    Resolving at import meant a logo dropped in after the server started was
    ignored until a restart, which is not what the folder's README promises.
    Six entries and at most three stat calls each is nothing next to rendering
    the page.
    """
    return [
        {
            "slug": slug,
            "name": name,
            "img": _partner_logo(slug),
            "colors": _WORDMARK_COLORS.get(slug),
        }
        for slug, name in _PARTNER_NAMES
    ]


# Journey step icons. The steps are hand-written markup, but step 01 can take
# a supplied image instead of its inline SVG: drop a transparent file into
# app/static/img/journey/ named after the slug and it is used on the next
# request. Absent, the inline icon stays, which keeps all five steps in the
# same line-drawn style.
_JOURNEY_DIR = Path(__file__).resolve().parent / "static" / "img" / "journey"


_JOURNEY_STEPS = ("discover", "design", "build", "deploy", "evolve")


def journey_icon(slug: str) -> str | None:
    """Static path of a journey step icon, or None if no file is present."""
    for ext in _LOGO_EXTS:
        if (_JOURNEY_DIR / f"{slug}.{ext}").is_file():
            return f"img/journey/{slug}.{ext}"
    return None


def get_journey_icons() -> dict:
    """Every step's icon path, resolved now. Steps with no file stay on their
    inline SVG."""
    return {slug: journey_icon(slug) for slug in _JOURNEY_STEPS}
