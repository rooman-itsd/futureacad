"""SAIOM-approved Markdown pages are shown as guide pages."""
from app import saiom_content


def test_every_saiom_page_is_clean_and_complete():
    pages = saiom_content.load_pages()
    assert pages
    for path, page in pages.items():
        assert path.startswith("guides/")
        text = repr(page)
        assert "Rooman" not in text and "080 6945" not in text
        assert page["hero"]["h1"]["main"] and page["sections"]


def test_saiom_page_renders_with_faq_schema_and_sitemap(client):
    page = client.get("/guides/ai-development-company-dubai")
    assert page.status_code == 200
    assert b"FAQPage" in page.data
    assert b"/guides/ai-development-company-dubai" in client.get("/sitemap.xml").data
    assert b"/guides/ai-development-company-dubai" in client.get("/guides").data


def test_markdown_conversion(tmp_path):
    (tmp_path / "x.md").write_text(
        '---\ntitle: "T"\ndescription: "D"\nslug: "x"\ndate: "2026-01-01"\n'
        'faq: [{"question": "Q?", "answer": "A [l](/a)"}]\n---\n\n## Hero *word*\n\nIntro **bold**.\n\n'
        '[Go](/go)\n\n## Body\n\n- a\n- b\n\n### Sub\n\ntext\n\n## Frequently asked questions\n\n### Q?\n\nA\n',
        encoding="utf-8")
    page = saiom_content.load_pages(tmp_path)["guides/x"]
    assert page["hero"]["h1"]["main"] == "Hero word"
    assert [b["t"] for b in page["hero"]["blocks"]] == ["lede", "buttons"]
    assert [b["t"] for b in page["sections"][0]["blocks"]] == ["list", "h3", "p"]
    assert page["sections"][-1]["blocks"][0]["items"][0]["a"] == ['A <a href="/a">l</a>']
