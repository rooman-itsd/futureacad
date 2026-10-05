"""Import the Build / Transform / Staffing / GCC / Careers / Partner pages from the
Rooman site into FutureAcad as structured content.

The source pages are server rendered, so each one is fetched, walked in
document order and reduced to a small vocabulary of typed blocks
(headings, paragraphs, card grids, key/value tables, tables, FAQs,
buttons, chips, images, forms). app/templates/imported.html renders that
vocabulary with the landing page's own components, so the words stay the
same and the look is FutureAcad's.

    python scripts/import_rooman.py                  # fetch live
    python scripts/import_rooman.py --cache D        # read/write raw HTML in D
    python scripts/import_rooman.py --only build/x   # (re)import just these paths
    python scripts/import_rooman.py --content-only   # refresh wording, keep layout

Merges into app/content/imported.json, so pages already there that are not
re-imported (including ones Rooman no longer serves) are kept as they are,
and writes app/static/img/imported/*. Every link in the file that points at
an imported page, on Rooman's own domain or its old CloudFront origin, is
rewritten to the local route.
Needs beautifulsoup4 (dev only; the app itself does not import it).
"""
import argparse
import difflib
import json
import re
import sys
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

ORIGIN = "https://rooman.com"
# The CloudFront origin the first import ran against; it now 301s to ORIGIN.
OLD_ORIGINS = ("https://d127pf9pvpdiip.cloudfront.net",)
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "app" / "content" / "imported.json"
IMG_DIR = ROOT / "app" / "static" / "img" / "imported"

# Every path imported. Links between them are rewritten to stay on site.
PAGES = [
    "build/products", "build/hireai", "build/product/crm-voice-agent",
    "build/product/ai-tutor", "build/product/edu-erp", "build/startup-varsity",
    "build/custom-ai-builds", "build/submit-a-problem", "build/ai-project-builds",
    "transform", "transform/ai-readiness-audit", "transform/with-our-products",
    "transform/ai-workforce-readiness", "transform/managed-ai",
    "transform/enterprise", "transform/international", "transform/case-studies",
    "staffing-gcc", "staffing-gcc/staffing", "staffing-gcc/domestic",
    "staffing-gcc/international", "gcc-services",
    "build/apply-founder", "build/apply-intern",
    "partner", "partner/universities", "partner/franchise", "partner/corporates",
    "partner/hiring",
    "build", "build/custom-ai-builds/pricing", "build/custom-ai-builds/examples",
    "build/startup-varsity/founders-track", "build/startup-varsity/partners",
    "build/how-to-choose",
    "transform/managed-ai-functions", "transform/outcome-based-ai",
    "transform/case-study/karnataka-police-vpnobb", "transform/case-study/kea-cet-counselling",
    "transform/case-study/ajsk-service-centres", "transform/case-study/shimoga-smart-city",
    "transform/case-study/sbi-it-maintenance", "transform/case-study/jk-state-taxes",
    "careers", "privacy", "terms",
]
# Also holds every page already in imported.json (see main).
LOCAL = set(PAGES)

# Product pages show the product itself: the same live-site screenshots as
# the Products grid (app/static/img/platforms), in place of Rooman's stock
# photos, on the page's hero and on every card that links to it.
# CRM Voice Agent has no capture of its own; it runs inside the CRM.
PRODUCT_SHOTS = {
    "build/hireai": "img/platforms/hireai.jpg",
    "build/product/crm-voice-agent": "img/platforms/crm.jpg",
    "build/product/ai-tutor": "img/platforms/ai-tutor.jpg",
    "build/product/edu-erp": "img/platforms/erp.jpg",
    "build/startup-varsity": "img/platforms/startup-varsity.jpg",
}

SKIP = {"script", "style", "svg", "noscript", "nav", "template", "iframe"}
BLOCK_TAGS = {"p", "div", "section", "aside", "article", "header", "footer", "ul",
              "ol", "li", "dl", "table", "h1", "h2", "h3", "h4", "h5", "form",
              "details", "blockquote", "figure", "img", "fieldset"}
INLINE_KEEP = {"a", "b", "strong", "em", "i", "br"}


def classes(el):
    return el.get("class", []) if isinstance(el, Tag) else []


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def href_for(href):
    if not href:
        return ""
    for origin in (ORIGIN, *OLD_ORIGINS):
        if href == origin or href.startswith(origin + "/"):
            href = href[len(origin):] or "/"
            break
    if href.startswith(("tel:", "mailto:", "http://", "https://")):
        return href
    if href.startswith("/"):
        path, _, frag = href[1:].partition("#")
        path = path.rstrip("/")
        if path in LOCAL:
            return "/" + path + ("#" + frag if frag else "")
        if path in ("", "contact"):  # home and contact are FutureAcad's own
            return "/" + path
        return ORIGIN + href
    if href.startswith("#"):
        return href
    return ORIGIN + "/" + href


class Importer:
    def __init__(self, cache=None, download=True):
        self.cache = Path(cache) if cache else None
        self.download = download
        self.images = {}

    # ---- fetching ----------------------------------------------------
    def fetch(self, path):
        if self.cache:
            f = self.cache / (path.replace("/", "_") + ".html")
            if f.exists():
                return f.read_text(encoding="utf-8")
        url = f"{ORIGIN}/{path}"
        if not (url.startswith("http://") or url.startswith("https://")):
            raise ValueError(f"Unsupported URL scheme: {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "futureacad-import"})  # noqa: S310
        html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")  # noqa: S310
        if self.cache:
            self.cache.mkdir(parents=True, exist_ok=True)
            (self.cache / (path.replace("/", "_") + ".html")).write_text(html, encoding="utf-8")
        return html

    def image(self, src):
        if not src or src.startswith("data:"):
            return None
        if src in self.images:
            return self.images[src]
        raw = src.split("?")[0].rstrip("/").split("/")[-1]
        # Drop the bundler's content hash: card-transform-320-DaTaQP2D.webp.
        # Hashes can hold "-" (bfsi-DmEgVO-d.jpg); earlier imports kept those
        # whole, so reuse a file already saved under that name.
        name = re.sub(r"-[A-Za-z0-9_-]{8}(\.\w+)$", r"\1", raw)
        legacy = re.sub(r"-[A-Za-z0-9_]{8}(\.\w+)$", r"\1", raw)
        if not (IMG_DIR / name).exists() and (IMG_DIR / legacy).exists():
            name = legacy
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        target = IMG_DIR / name
        if not target.exists() and self.download:
            url = src if src.startswith("http") else ORIGIN + src
            if not (url.startswith("http://") or url.startswith("https://")):
                raise ValueError(f"Unsupported URL scheme: {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "futureacad-import"})  # noqa: S310
            target.write_bytes(urllib.request.urlopen(req, timeout=60).read())  # noqa: S310
        rel = f"img/imported/{name}"
        self.images[src] = rel
        return rel

    # ---- inline html -------------------------------------------------
    def inline(self, el):
        """Inner HTML reduced to text plus a, b/strong, em and br."""
        out = []
        for c in el.children:
            if isinstance(c, Comment):
                continue  # React's "<!-- -->" text separators
            if isinstance(c, NavigableString):
                out.append(escape(str(c)))
            elif isinstance(c, Tag):
                if c.name in SKIP or "sr-only" in classes(c):
                    continue
                inner = self.inline(c)
                if c.name == "a":
                    h = href_for(c.get("href"))
                    ext = ' target="_blank" rel="noopener"' if h.startswith("http") else ""
                    out.append(f'<a href="{escape(h)}"{ext}>{inner}</a>' if h else inner)
                elif c.name in ("b", "strong"):
                    out.append(f"<strong>{inner}</strong>")
                elif c.name in ("em", "i"):
                    out.append(f"<em>{inner}</em>")
                elif c.name == "br":
                    out.append("<br>")
                else:
                    out.append(inner)
        return re.sub(r"\s+", " ", "".join(out)).strip()

    @staticmethod
    def has_block(el):
        return any(isinstance(d, Tag) and d.name in BLOCK_TAGS for d in el.descendants)

    # ---- forms -------------------------------------------------------
    def form(self, f):
        fields = []
        for el in f.find_all(["label", "fieldset"]):
            if el.name == "label" and el.find_parent("fieldset"):
                continue
            if el.name == "fieldset":
                legend = el.find("legend")
                opts = [clean(lbl.get_text(" ")) for lbl in el.find_all("label")]
                inp = el.find("input")
                fields.append({"type": "radio", "label": clean(legend.get_text(" ")) if legend else "",
                               "name": inp.get("name") if inp else "choice", "options": opts})
                continue
            # Prefer the text control: a phone label also holds its dial-code select.
            ctl = el.find(["input", "textarea"]) or el.find("select")
            if ctl is None and el.get("for"):
                ctl = f.find(id=el["for"])
            if ctl is None:
                continue
            label = clean("".join(s for s in el.find_all(string=True)
                                  if not s.find_parent(["select", "option", "textarea"])))
            field = {"label": label, "name": ctl.get("name") or label.lower().replace(" ", "_"),
                     "required": ctl.has_attr("required") or ctl.get("aria-required") == "true"
                                 or label.endswith("*")}
            if ctl.name == "select":
                if ctl.get("name") == "dialCode":
                    continue  # folded into the phone field
                opts = [clean(o.get_text()) for o in ctl.find_all("option")]
                field.update(type="select", options=opts)
            elif ctl.name == "textarea":
                field.update(type="textarea")
            else:
                if ctl.get("type") in ("hidden", "checkbox", "radio"):
                    continue
                field.update(type=ctl.get("type") or "text")
            # A phone field whose dial code sat in a sibling select.
            if ctl.get("name") == "phone" and el.find("select", attrs={"name": "dialCode"}):
                field["dial"] = clean(el.find("select", attrs={"name": "dialCode"}).get_text())
            fields.append(field)
        btn = f.find("button")
        # The consent line under the button; Rooman has dropped the class.
        note = f.find(class_="form-note") or next(
            (p for p in reversed(f.find_all("p")) if clean(p.get_text()) and not p.get("aria-live")), None)
        return {"t": "form", "fields": fields,
                "submit": clean(btn.get_text(" ")) if btn else "Send",
                "note": clean(note.get_text(" ")) if note else ""}

    # ---- cards -------------------------------------------------------
    def card(self, el):
        atoms = []
        link = href_for(el.get("href")) if el.name == "a" else ""
        if not link:
            a = el.find("a", class_="ccard")
            if a and len(el.find_all("a")) == 1:
                link = href_for(a.get("href"))
        self.card_walk(el, atoms, bool(link))
        # Cards built from two plain paragraphs: the short first one is the title.
        if not any(x["k"] == "title" for x in atoms):
            first = next((x for x in atoms if x["k"] == "text"), None)
            rest = [x for x in atoms if x["k"] == "text" and x is not first]
            if first and rest and len(first["html"]) <= 70 and "<" not in first["html"]:
                first["k"], first["text"] = "title", first.pop("html")
        return {"href": link, "atoms": atoms}

    def card_walk(self, el, atoms, linked):
        for c in el.children:
            if isinstance(c, Comment):
                continue
            if isinstance(c, NavigableString):
                t = clean(str(c))
                if t:
                    atoms.append({"k": "text", "html": escape(t)})
                continue
            if not isinstance(c, Tag) or c.name in SKIP or "sr-only" in classes(c):
                continue
            cl = classes(c)
            if c.name == "img":
                src = self.image(c.get("src"))
                if src:
                    atoms.append({"k": "img", "src": src, "alt": c.get("alt", "")})
            elif c.name in ("h2", "h3", "h4", "h5"):
                atoms.append({"k": "title", "text": clean(c.get_text(" "))})
            elif c.name == "p":
                if not clean(c.get_text()):
                    continue
                kind = "kicker" if "kicker" in cl else "text"
                atoms.append({"k": kind, "html": self.inline(c)})
            elif c.name in ("ul", "ol"):
                atoms.append({"k": "list", "items": [self.inline(li) for li in c.find_all("li", recursive=False)]})
            elif c.name == "dl":
                atoms.append({"k": "kv", "rows": dl_rows(c)})
            elif c.name == "span" and not self.has_block(c):
                t = clean(c.get_text(" "))
                if t:
                    kind = "tag" if ("num" in cl or "tag" in cl or not atoms) else "badge"
                    if kind == "badge" and len(t) > 26:
                        # A tagline, not a label: too long to sit in a pill.
                        atoms.append({"k": "text", "html": escape(t)})
                    else:
                        atoms.append({"k": kind, "text": t})
            elif c.name == "a" and not self.has_block(c):
                t = clean(c.get_text(" "))
                if t and not linked:
                    atoms.append({"k": "link", "href": href_for(c.get("href")), "text": t})
                elif t:
                    atoms.append({"k": "badge", "text": t})
            elif c.name == "blockquote":
                atoms.append({"k": "text", "html": "<em>" + self.inline(c) + "</em>"})
            elif c.name in ("b", "strong", "em") and not self.has_block(c):
                atoms.append({"k": "text", "html": self.inline(c)})
            elif not self.has_block(c) and c.name not in ("button", "input", "select", "label"):
                t = self.inline(c)
                if t:
                    atoms.append({"k": "text", "html": t})
            else:
                self.card_walk(c, atoms, linked)

    # ---- sections ----------------------------------------------------
    def walk(self, el, sec, out):
        for c in el.children:
            if isinstance(c, Comment):
                continue
            if isinstance(c, NavigableString):
                t = clean(str(c))
                if t:
                    out.append({"t": "p", "html": escape(t)})
                continue
            if not isinstance(c, Tag) or c.name in SKIP or "sr-only" in classes(c):
                continue
            self.node(c, sec, out)

    def node(self, c, sec, out):
        cl = classes(c)
        name = c.name
        if name == "form":
            out.append(self.form(c))
        elif name == "details":
            summ = c.find("summary")
            q = clean(summ.get_text(" ")) if summ else ""
            body = [self.inline(p) for p in c.find_all("p")]
            # Tags listed under a paragraph answer (a region's countries).
            tags = [clean(li.get_text(" ")) for li in c.find_all("li") if not li.find_parent("p")]
            if body and tags:
                body.append(" · ".join(tags))
            if not body:
                # Answers made of links or list items rather than paragraphs.
                leaves = c.find_all("li") or list(c.find_all("a"))
                body = [self.inline(x) for x in leaves]
            item = {"q": q, "a": [b for b in body if b]}
            if out and out[-1]["t"] == "faq":
                out[-1]["items"].append(item)
            else:
                out.append({"t": "faq", "items": [item]})
        elif name == "dl":
            out.append({"t": "kv", "rows": dl_rows(c)})
        elif name == "table":
            cap = c.find("caption")
            head = [clean(th.get_text(" ")) for th in (c.find("thead") or c).find_all("th")]
            rows = []
            for tr in (c.find("tbody") or c).find_all("tr"):
                cells = [self.inline(td) for td in tr.find_all(["td", "th"])]
                if cells and cells != head:
                    rows.append(cells)
            out.append({"t": "table", "caption": clean(cap.get_text(" ")) if cap else "",
                        "head": head, "rows": rows})
        elif name in ("ul", "ol"):
            lis = c.find_all("li", recursive=False)
            rich = any(li.find(["h2", "h3", "h4", "img", "p", "dl"]) or li.find("a", class_="ccard")
                       or len(li.find_all("span", recursive=False)) > 1 for li in lis)
            if rich:
                items = [self.card(li.find("a", class_="ccard") if li.find("a", class_="ccard")
                                   and not li.find(["h3", "p"], recursive=False) else li) for li in lis]
                out.append({"t": "cards", "ordered": name == "ol", "items": items})
            else:
                items = [self.inline(li) for li in lis if clean(li.get_text())]
                if items:
                    out.append({"t": "list", "items": items})
        elif name == "h1":
            accent = " ".join(clean(s.get_text(" ")) for s in c.find_all("span"))
            main = clean("".join(s for s in c.find_all(string=True) if not s.find_parent("span")))
            if not main:
                main, accent = accent, ""
            sec["h1"] = {"main": main, "accent": accent}
        elif name == "h2":
            t = clean(c.get_text(" "))
            if t and not sec.get("title") and not any(b["t"] != "eyebrow" for b in out):
                sec["title"] = t
                sec["id"] = sec.get("id") or c.get("id", "")
            elif t:
                out.append({"t": "h3", "text": t})
        elif name in ("h3", "h4", "h5"):
            t = clean(c.get_text(" "))
            if t:
                out.append({"t": "h3", "text": t})
        elif name == "p":
            html = self.inline(c)
            if not html:
                return
            if "kicker" in cl or "eyebrow" in cl:
                if not sec.get("title") and not sec.get("h1"):
                    sec["eyebrow"] = clean(c.get_text(" "))
                else:
                    out.append({"t": "kicker", "text": clean(c.get_text(" "))})
            elif "lead" in cl or "keyfacts" in cl:
                out.append({"t": "lede", "html": html})
            elif "muted" in cl or "form-note" in cl:
                out.append({"t": "note", "html": html})
            else:
                out.append({"t": "p", "html": html})
        elif name == "a":
            t = clean(c.get_text(" "))
            if "ccard" in cl or self.has_block(c):
                card = self.card(c)
                if out and out[-1]["t"] == "cards":
                    out[-1]["items"].append(card)
                else:
                    out.append({"t": "cards", "ordered": False, "items": [card]})
            elif t:
                btn = {"text": t, "href": href_for(c.get("href")),
                       "primary": "btn-ghost-light" not in cl and "link-u" not in cl and not any(
                           b.get("primary") for b in (out[-1].get("items", []) if out and out[-1]["t"] == "buttons" else []))}
                if "btn" in cl or "link-u" in cl or any(x.startswith("rounded") for x in cl):
                    if out and out[-1]["t"] == "buttons":
                        out[-1]["items"].append(btn)
                    else:
                        out.append({"t": "buttons", "items": [btn]})
                else:
                    out.append({"t": "link", "text": t, "href": btn["href"]})
        elif name == "span":
            t = clean(c.get_text(" "))
            if not t:
                return
            if "eyebrow" in cl:
                sec["eyebrow"] = t
            elif "chip" in cl or (c.parent and "chips" in classes(c.parent)):
                if out and out[-1]["t"] == "chips":
                    out[-1]["items"].append(t)
                else:
                    out.append({"t": "chips", "items": [t]})
            elif self.has_block(c):
                self.walk(c, sec, out)
            else:
                out.append({"t": "p", "html": self.inline(c)})
        elif name == "img":
            src = self.image(c.get("src"))
            if src:
                out.append({"t": "img", "src": src, "alt": c.get("alt", "")})
        elif name == "blockquote":
            out.append({"t": "quote", "html": self.inline(c)})
        elif name in ("button", "input", "select", "textarea", "label", "fieldset"):
            return
        elif name == "aside" and sec.get("h1") is not None and "aside" not in sec:
            sec["aside"] = []
            self.walk(c, {"h1": True, "title": "x"}, sec["aside"])
        elif self.is_row(c):
            self.walk(c, sec, out)
        elif not self.has_block(c):
            html = self.inline(c)
            if html:
                out.append({"t": "p", "html": html})
        elif self.is_grid(c):
            out.append({"t": "cards", "ordered": False,
                        "items": [self.card(k) for k in c.find_all(True, recursive=False)
                                  if k.name not in SKIP]})
        else:
            self.walk(c, sec, out)

    @staticmethod
    def is_row(el):
        """A div of buttons or chips: only links/spans, no loose text."""
        kids = [k for k in el.children if isinstance(k, Tag) and k.name not in SKIP]
        loose = any(isinstance(k, NavigableString) and k.strip() for k in el.children)
        return len(kids) >= 2 and not loose and all(k.name in ("a", "span") for k in kids)

    def is_grid(self, el):
        """Three or more sibling blocks built the same way read as cards."""
        kids = [k for k in el.find_all(True, recursive=False) if k.name not in SKIP]
        if len(kids) < 3 or any(k.name not in ("div", "article", "a") for k in kids):
            return False
        def sig(k):
            return tuple(x.name for x in k.find_all(True, recursive=False) if x.name not in SKIP)

        first = sig(kids[0])
        return len(first) >= 2 and all(sig(k) == first for k in kids)

    def page(self, path):
        soup = BeautifulSoup(self.fetch(path), "html.parser")
        main = soup.find("main")
        title = clean(soup.title.get_text()) if soup.title else path
        desc = soup.find("meta", attrs={"name": "description"})
        sections = []
        for top in [s for s in main.find_all("section") if not s.find_parent("section")]:
            # Legal pages nest one section per clause inside the hero's
            # section: lift them out so each reads as a section of its own.
            nested = [n.extract() for n in top.find_all("section")]
            for s in [top, *nested]:
                sec = {"id": s.get("id", ""), "dark": "bg-ink" in classes(s), "blocks": []}
                self.walk(s, sec, sec["blocks"])
                if sec["blocks"] or sec.get("title") or sec.get("h1"):
                    sections.append(sec)
        hero = next((s for s in sections if s.get("h1")), None)
        if hero:
            sections.remove(hero)
            # "Partner · For Universities": a category line set as a plain
            # paragraph above the title is the page's eyebrow.
            first = hero["blocks"][0] if hero["blocks"] else None
            if (not hero.get("eyebrow") and first and first["t"] == "p"
                    and "·" in first["html"] and len(first["html"]) <= 60):
                hero["eyebrow"] = hero["blocks"].pop(0)["html"]
        # A trailing "Page reviewed on ..." line is housekeeping, not content.
        for s in sections:
            s["blocks"] = [b for b in s["blocks"]
                           if not (b["t"] in ("note", "p") and b["html"].startswith("Page reviewed on"))]
        return {"path": path, "title": re.sub(r"\s*[|–—-]\s*Rooman\s*$", "", title),
                "description": desc.get("content", "") if desc else "",
                "hero": hero, "sections": sections}


def use_product_shots(pages):
    for path, page in pages.items():
        hero = page["hero"] or {}
        if path in PRODUCT_SHOTS:
            for b in hero.get("aside", []):
                if b["t"] == "img":
                    b["src"] = PRODUCT_SHOTS[path]
        for sec in [hero] + page["sections"]:
            for b in sec.get("blocks", []) + sec.get("aside", []):
                if b["t"] != "cards":
                    continue
                for card in b["items"]:
                    shot = PRODUCT_SHOTS.get(card["href"].lstrip("/").split("#")[0])
                    for a in card["atoms"]:
                        if shot and a["k"] == "img":
                            a["src"] = shot


def dl_rows(dl):
    rows, key = [], None
    cells = dl.find_all(["dt", "dd"])
    # Stat lists put the figure (dd) before its label (dt); pair them that way.
    if cells and cells[0].name == "dd":
        return [[clean(cells[i + 1].get_text(" ")), clean(cells[i].get_text(" "))]
                for i in range(0, len(cells) - 1, 2)]
    for c in cells:
        if c.name == "dt":
            key = clean(c.get_text(" "))
        else:
            rows.append([key or "", clean(c.get_text(" "))])
            key = None
    return rows


# An <a> written by Importer.inline, so its href can be rewritten in place.
INLINE_A = re.compile(r'<a href="([^"]*)"(?: target="_blank" rel="noopener")?>')


def relink(node):
    """Re-resolve every href (card links, buttons, inline <a>) against LOCAL."""
    if isinstance(node, list):
        return [relink(x) for x in node]
    if isinstance(node, str):
        return relink_html(node)
    if isinstance(node, dict):
        return {k: href_for(v) if k == "href" else relink(v) for k, v in node.items()}
    return node


def relink_html(html):
    def sub(m):
        h = href_for(m.group(1).replace("&amp;", "&"))
        ext = ' target="_blank" rel="noopener"' if h.startswith("http") else ""
        return f'<a href="{escape(h)}"{ext}>'
    return INLINE_A.sub(sub, html)


# Strings that are wording, as opposed to links, image paths or block types.
TEXT_KEYS = {"html", "text", "main", "accent", "title", "eyebrow", "description",
             "q", "caption", "label", "submit", "note", "items", "a", "rows", "head", "options"}
HREF_RE = re.compile(r'href="([^"]*)"')


def text_slots(node, key=None, out=None):
    """Every wording string in a page, as (container, key) slots, in order."""
    out = [] if out is None else out
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, str) and k in TEXT_KEYS:
                out.append((node, k))
            elif isinstance(v, dict | list):
                text_slots(v, k, out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            if isinstance(v, str) and key in TEXT_KEYS:
                out.append((node, i))
            elif isinstance(v, dict | list):
                text_slots(v, key, out)
    return out


def update_text(old, new):
    """Copy Rooman's current wording into the page we already have.

    The page keeps its blocks, images and links: a string is replaced only
    where the fresh import has a one-for-one counterpart that reads like an
    edit of it and links to the same places. Returns the edits skipped.
    """
    a, b = text_slots(old), text_slots(new)
    av, bv = [c[k] for c, k in a], [c[k] for c, k in b]
    present = set(av)
    skipped = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, av, bv, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        pairs = list(zip(range(i1, i2), range(j1, j2), strict=True)) if op == "replace" and i2 - i1 == j2 - j1 else []
        for i, j in pairs:
            was, now = av[i], bv[j]
            # "Title." -> "Title. Accent." where the accent is already its own
            # string (a headline Rooman now sets in one line): keep the split.
            folded = now.startswith(was) and now[len(was):].strip() in present
            if (now and not folded and difflib.SequenceMatcher(None, was, now).ratio() >= 0.5
                    and HREF_RE.findall(was) == HREF_RE.findall(now)):
                c, k = a[i]
                c[k] = now
            else:
                skipped.append((was, now))
        if not pairs:
            skipped.append((" | ".join(av[i1:i2]), " | ".join(bv[j1:j2])))
    return skipped


def page_forms(page):
    secs = ([page["hero"]] if page["hero"] else []) + page["sections"]
    return [b for s in secs for b in s.get("blocks", []) + s.get("aside", []) if b["t"] == "form"]


def update_forms(old, new):
    """Give each form Rooman's current fields: a question added or dropped
    there is part of the content, not the layout. True if any changed."""
    olds, news = page_forms(old), page_forms(new)
    if len(olds) != len(news):
        return False
    changed = False
    for o, n in zip(olds, news, strict=True):
        if o["fields"] != n["fields"]:
            o["fields"], changed = n["fields"], True
    return changed


def escape(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", help="directory to read/write raw HTML")
    ap.add_argument("--only", nargs="+", metavar="PATH", help="import just these paths")
    ap.add_argument("--out", type=Path, default=OUT_JSON, help="JSON file to merge into")
    ap.add_argument("--content-only", action="store_true",
                    help="for pages already imported, update wording only (see update_text)")
    args = ap.parse_args()
    # Updating wording only never adds images, so there is nothing to download.
    imp = Importer(args.cache, download=not args.content_only)
    pages = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else {}
    LOCAL.update(pages)
    pages = relink(pages)
    for p in args.only or PAGES:
        fresh = relink(imp.page(p))
        if args.content_only and p in pages:
            skipped = update_text(pages[p], fresh)
            forms = " and form fields" if update_forms(pages[p], fresh) else ""
            print(f"{p:36} wording{forms} updated, {len(skipped)} edits left for review", file=sys.stderr)
            for was, now in skipped:
                print(f"    was: {was[:110]}", file=sys.stderr)
                print(f"    now: {now[:110]}", file=sys.stderr)
            continue
        pages[p] = fresh
        n = sum(len(s["blocks"]) for s in pages[p]["sections"])
        print(f"{p:36} {len(pages[p]['sections']):2} sections {n:3} blocks", file=sys.stderr)
    use_product_shots(pages)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(f"wrote {args.out} ({len(pages)} pages) and {len(imp.images)} images", file=sys.stderr)


if __name__ == "__main__":
    main()
