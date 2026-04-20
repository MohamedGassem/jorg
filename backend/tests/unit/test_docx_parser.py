# backend/tests/unit/test_docx_parser.py
import tempfile

from docx import Document  # type: ignore[import-untyped,unused-ignore]

from services.docx_parser import extract_placeholders


def _make_docx(paragraphs: list[str]) -> str:
    """Create a temporary .docx file with the given paragraphs, return path."""
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        doc.save(tmp.name)
        return tmp.name


def test_extract_simple_placeholders() -> None:
    path = _make_docx(["Nom: {{NOM}}", "Prénom: {{PRENOM}}", "Titre: {{TITRE}}"])
    result = extract_placeholders(path)
    assert "{{NOM}}" in result
    assert "{{PRENOM}}" in result
    assert "{{TITRE}}" in result
    assert len(result) == 3


def test_extract_deduplicates_repeated_placeholders() -> None:
    path = _make_docx(["{{NOM}} et {{NOM}} encore {{NOM}}"])
    result = extract_placeholders(path)
    assert result.count("{{NOM}}") == 1


def test_extract_block_markers_are_excluded() -> None:
    """Block markers like {{#EXPERIENCES}} / {{/EXPERIENCES}} are mustache
    control syntax, not data placeholders — they must not be returned."""
    path = _make_docx(["{{#EXPERIENCES}}", "{{EXP_CLIENT}}", "{{/EXPERIENCES}}"])
    result = extract_placeholders(path)
    assert "{{#EXPERIENCES}}" not in result
    assert "{{/EXPERIENCES}}" not in result
    assert "{{EXP_CLIENT}}" in result
    assert result == ["{{EXP_CLIENT}}"]


def test_extract_block_markers_excluded_for_any_block_name() -> None:
    """The filter must apply to any {{#NAME}} / {{/NAME}} pair, not just EXPERIENCES."""
    path = _make_docx(["{{#SKILLS}}", "{{SKILL_NAME}}", "{{/SKILLS}}"])
    result = extract_placeholders(path)
    assert result == ["{{SKILL_NAME}}"]


def test_extract_empty_document_returns_empty_list() -> None:
    path = _make_docx(["No placeholders here."])
    result = extract_placeholders(path)
    assert result == []


def test_extract_preserves_first_occurrence_order() -> None:
    path = _make_docx(["{{A}} {{B}} {{C}} {{A}}"])
    result = extract_placeholders(path)
    assert result == ["{{A}}", "{{B}}", "{{C}}"]
