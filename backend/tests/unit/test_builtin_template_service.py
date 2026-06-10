import io

from docx import Document

import services.documents.builtin_template_service as builtin_template_service


def test_builtin_templates_render_mock_previews_without_unresolved_tags() -> None:
    templates = builtin_template_service.list_builtin_templates()

    assert {template.key for template in templates} == {
        "compact_esn",
        "dossier_technique",
        "profil_premium",
    }

    for template in templates:
        rendered = builtin_template_service.render_mock_preview(template)
        doc = Document(io.BytesIO(rendered))
        text = "\n".join(p.text for p in doc.paragraphs)
        for table in doc.tables:
            for row in table.rows:
                text += "\n" + " | ".join(cell.text for cell in row.cells)

        assert "{{" not in text
        assert "{%" not in text
        assert "joris" in text.lower()

        # Formation, certifications and languages render as three separate sections
        lower = text.lower()
        for heading in ("formation", "certifications", "langues"):
            assert any(p.text.strip().lower() == heading for p in doc.paragraphs), (
                f"{template.key}: missing '{heading}' section heading"
            )
        assert "formation, certifications" not in lower

        # Years of experience from the mock profile is rendered
        assert "9 ans d’expérience" in text  # noqa: RUF001 (templates use U+2019)
