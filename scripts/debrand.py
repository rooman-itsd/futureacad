"""Present imported pages as FutureAcad's own.

The pages are imported from rooman.com. Copied branding (the Rooman name,
its email, phone numbers and links to its login apps) on a different domain,
next to forms that ask for personal details, is what Google Safe Browsing
flags as a deceptive / phishing site. This rewrites all of it:

- Rooman emails become info@futureacad.ae.
- Rooman phone and WhatsApp numbers are replaced by the FutureAcad email.
- Links to rooman.com and its apps point to the matching futureacad.ae page.
- "Rooman" becomes "FutureAcad"; in statements about past delivery,
  certifications or the alumni pool it becomes "our group", so no false
  claim is made about a company founded in 2025.
"""
import re

EMAIL = "info@futureacad.ae"
EMAIL_LINK = f'<a href="mailto:{EMAIL}"><strong>{EMAIL}</strong></a>'

# Old address → FutureAcad page (most specific first).
URL_MAP = [
    (r"https?://hireai\.rooman\.com/?", "https://hiresolution.ai/"),
    (r"https?://crm\.rooman\.net/?", "/transform/ai-bos"),
    (r"https?://erp\.rooman\.net/?", "/build/product/edu-erp"),
    (r"https?://lms\.rooman\.com/?", "/build/product/ai-tutor"),
    (r"https?://learn\.rooman\.com/?", "/transform/ai-workforce-readiness"),
    (r"https?://(?:www\.)?rooman\.com/ai-tutor/?", "/build/product/ai-tutor"),
    (r"https?://(?:www\.)?rooman\.com/omnis/?", "/build/omnis"),
    (r"https?://(?:www\.)?rooman\.com/bluelinked/?", "/build/bluelinked"),
    (r"https?://(?:www\.)?rooman\.com/learn[^\"'\s<]*", "/transform/ai-workforce-readiness"),
    (r"https?://(?:www\.)?rooman\.com/?", "/"),
]

# Sentences about the group's past work, certifications or alumni say
# "our group" rather than claiming them for FutureAcad itself.
HISTORY = re.compile(
    r"\b(?:19\d\d|20(?:0\d|1\d|2[0-4]))\b|since|\byears?\b|ISO|CMMI|certif|Wipro|"
    r"Karnataka Police|\bKEA\b|\bSBI\b|case stud|alumni|historical|peak|NSDC|Skill Hub|"
    r"Atalji|Shimoga|J&K|Janaspandana|AI Forward|trained|delivered",
    re.I,
)
SENTENCE = re.compile(r"(?<=[.!?])\s+")


def _brand_sentence(s):
    if "Rooman" not in s and "ROOMAN" not in s:
        return s
    if HISTORY.search(s):
        s = re.sub(r"\b(Six|Seven|Five)\s+Rooman\b", r"\1 of our", s)
        s = re.sub(r"\bRooman-trained\b", "our trained", s)
        s = re.sub(r"\b(?:the\s+)?(?:[\d.,]+[KMk]?\+\s+)?Rooman(?:’s|'s)?\s+(?=(?:own\s+)?(?:alumni|talent|candidates|trainers|certifications|"
                   r"case studies|hiring|AI|centres|franchise|corporate|curriculum|engineers|courses|network|delivery))",
                   lambda m: "our " + (re.search(r"[\d.,]+[KMk]?\+\s+", m.group(0)).group(0) if re.search(r"[\d.,]+[KMk]?\+", m.group(0)) else ""),
                   s)
        s = re.sub(r"\b(?:Six|Seven|Five)\s+Rooman\b", lambda m: m.group(0).split()[0] + " of our", s)
        s = re.sub(r"\bRooman(?:’s|'s)", "our group’s", s)
        s = re.sub(r"\bRooman\b", "our group", s)
        s = re.sub(r"(^|\.\s+|<strong>|\")our\b", lambda m: m.group(1) + "Our", s)
        s = re.sub(r"^(\W*)our group", lambda m: m.group(1) + "Our group", s)
        s = re.sub(r"([.!?:]\s+|<strong>)our group", lambda m: m.group(1) + "Our group", s)
        return s
    s = re.sub(r"\bRooman(?:’s|'s)", "FutureAcad’s", s)
    s = re.sub(r"\bROOMAN\b", "FUTUREACAD", s)
    return re.sub(r"\bRooman\b", "FutureAcad", s)


def debrand_text(s):
    """Rewrite one string (plain text or an HTML fragment)."""
    if not isinstance(s, str) or ("ooman" not in s and "tel:" not in s and "wa.me" not in s
                                  and "6945 1000" not in s and "97390" not in s):
        return s
    # "Call <tel> or <WhatsApp us>" → "Email info@futureacad.ae"
    s = re.sub(r"\b([Cc])all\s+<a href=\"tel:[^\"]*\"[^>]*>.*?</a>\s*or\s*<a href=\"https://wa\.me/[^\"]*\"[^>]*>.*?</a>",
               lambda m: ("Email " if m.group(1) == "C" else "email ") + EMAIL_LINK, s)
    s = re.sub(r"<a href=\"(?:tel:|https://wa\.me/)[^\"]*\"[^>]*>.*?</a>", EMAIL_LINK, s)
    s = re.sub(r"\+?91[\s-]?97390[\s-]?86029|080[\s-]?6945[\s-]?1000|\+918069451000", EMAIL, s)
    s = re.sub(r"[\w.+-]+@rooman\.com", EMAIL, s)
    s = re.sub(r"\b[Cc]all (?=info@futureacad\.ae)", "email ", s)
    for pat, new in URL_MAP:
        s = re.sub(pat, new, s)
    s = re.sub(r"\brooman\.com\b", "futureacad.ae", s)
    s = s.replace("%20Rooman%20", "%20FutureAcad%20").replace("%20Rooman", "%20FutureAcad")
    # Internal links no longer open a new tab.
    s = re.sub(r'(<a href="/[^"]*")\s+target="_blank"\s+rel="noopener"', r"\1", s)
    # Rooman's legal entity and Bengaluru address are not FutureAcad's.
    s = re.sub(r"Rooman Technologies Pvt\.? Ltd\.?(?=\s*\()", "FutureAcad", s)
    s = re.sub(r"Rooman Technologies Pvt\.? Ltd\.?\s*·\s*#30, 12th Main, 1st Stage, Rajajinagar, Bengaluru\s*[–-]\s*560 010",
               "FutureAcad · Meydan Free Zone, Dubai, United Arab Emirates", s)
    s = re.sub(r"Rooman Technologies Pvt\.? Ltd\.?", "FutureAcad", s)
    s = re.sub(r"(CEO|Founder|Director),\s*Rooman Technologies", r"\1", s)
    s = re.sub(r"Rooman Technologies", "FutureAcad", s)
    if "Rooman" in s or "ROOMAN" in s:
        s = "".join(_brand_sentence(part) for part in re.split(r"((?<=[.!?])\s+)", s))
    return s


def _is_contact_item(item):
    return isinstance(item, str) and re.match(r"\s*(?:Call|WhatsApp)\s*:", item) is not None


def debrand(obj):
    """Walk the imported pages, rewriting every string and dropping phone list items."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in ("src",) and isinstance(v, str):
                out[k] = v  # image file paths stay as they are
            else:
                out[k] = debrand(v)
        return out
    if isinstance(obj, list):
        return [debrand(x) for x in obj if not _is_contact_item(x)]
    return debrand_text(obj)
