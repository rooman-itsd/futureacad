"""Pages approved in SAIOM (app/content/saiom/pages/*.md) as guide pages.

SAIOM opens a pull request that only adds a Markdown file; this turns each file
into the same page structure as app/content/guides.json, so the site needs no
code change per page. Supported Markdown: ## and ### headings, paragraphs,
bullet and numbered lists, a line that is only a link, **bold**, *italic* and
[links](/path)."""
import html
import json
import re
from pathlib import Path

PAGES_DIR = Path(__file__).parent / "content" / "saiom" / "pages"
FAQ_HEADING = "frequently asked questions"


def _inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", text)


def _front_matter(raw):
    _, head, body = raw.split("---\n", 2)
    meta = {}
    for line in head.splitlines():
        key, _, value = line.partition(": ")
        if key and value:
            meta[key.strip()] = json.loads(value)
    return meta, body


def _blocks(lines):
    """Markdown lines as page blocks."""
    out, para, items, ordered = [], [], [], False

    def flush():
        nonlocal para, items
        if para:
            text = " ".join(para)
            link = re.fullmatch(r"\[([^\]]+)\]\(([^)\s]+)\)", text)
            out.append({"t": "link", "text": link.group(1), "href": link.group(2)} if link
                       else {"t": "p", "html": _inline(text)})
        if items:
            out.append({"t": "list", "items": [_inline(i) for i in items], "ordered": ordered})
        para, items = [], []

    for line in lines:
        line = line.rstrip()
        item = re.match(r"^(?:[-*]|\d+\.) (.*)", line)
        if item:
            if para:
                flush()
            ordered = bool(re.match(r"^\d", line))
            items.append(item.group(1))
        elif line.startswith("### "):
            flush()
            out.append({"t": "h3", "text": re.sub(r"\*", "", line[4:])})
        elif not line:
            flush()
        else:
            if items:
                flush()
            para.append(line)
    flush()
    return out


def _page(meta, body):
    sections, current = [], None
    for line in body.splitlines():
        if line.startswith("## "):
            current = {"title": line[3:], "lines": []}
            sections.append(current)
        elif current is not None:
            current["lines"].append(line)
    hero_src, rest = sections[0], sections[1:]
    hero_blocks = _blocks(hero_src["lines"])
    hero = []
    for b in hero_blocks:
        if b["t"] == "p" and not any(h["t"] == "lede" for h in hero):
            hero.append({"t": "lede", "html": b["html"]})
        elif b["t"] == "link":
            hero.append({"t": "buttons", "items": [{"text": b["text"], "href": b["href"], "primary": True}]})
        else:
            hero.append(b)
    page_sections = []
    for i, sec in enumerate(rest):
        if sec["title"].strip().lower() == FAQ_HEADING:
            continue
        page_sections.append({"id": f"s{i + 1}", "dark": False, "title": re.sub(r"\*", "", sec["title"]),
                              "blocks": _blocks(sec["lines"])})
    faq = [{"q": _inline(f["question"]), "a": [_inline(f["answer"])]} for f in meta.get("faq", [])]
    if faq:
        page_sections.append({"id": "faq", "dark": False, "title": "Frequently asked questions",
                              "blocks": [{"t": "faq", "items": faq}]})
    return {"title": meta["title"], "description": meta["description"],
            "published": meta["date"], "updated": meta.get("updated", meta["date"]),
            "hero": {"id": "", "dark": False, "eyebrow": "Guides", "blocks": hero,
                     "h1": {"main": re.sub(r"\*", "", hero_src["title"]), "accent": ""}},
            "sections": page_sections}


def load_pages(pages_dir=PAGES_DIR):
    """{"guides/<slug>": page} for every Markdown file in the folder."""
    pages = {}
    for md in sorted(pages_dir.glob("*.md")) if pages_dir.is_dir() else []:
        meta, body = _front_matter(md.read_text(encoding="utf-8"))
        path = f"guides/{meta['slug']}"
        pages[path] = {"path": path, **_page(meta, body)}
    return pages


def stamp(pages_dir=PAGES_DIR):
    """Changes whenever a page file is added, edited or removed."""
    return tuple((p.name, p.stat().st_mtime) for p in sorted(pages_dir.glob("*.md"))) \
        if pages_dir.is_dir() else ()


def add_to_index(pages, saiom_pages):
    """Add the SAIOM pages to `pages`, and a card for each on the Guides index."""
    pages.update(saiom_pages)
    cards = next((b["items"] for sec in pages.get("guides", {}).get("sections", [])
                  for b in sec.get("blocks", []) if b.get("t") == "cards"), None)
    if cards is None:
        return
    for path, page in saiom_pages.items():
        cards.append({"href": f"/{path}", "atoms": [
            {"k": "title", "text": page["hero"]["h1"]["main"]},
            {"k": "text", "html": html.escape(page["description"], quote=False)},
            {"k": "badge", "text": "Guide"}]})
