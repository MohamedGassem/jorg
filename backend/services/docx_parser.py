# backend/services/docx_parser.py
"""Extract {{...}} placeholders from a Word .docx file."""

from __future__ import annotations

import re
from typing import Any

from docx import Document  # type: ignore[import-untyped,unused-ignore]

_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")


def _iter_paragraphs(doc: Any) -> list[str]:
    """Collect all text blocks from paragraphs and table cells."""
    texts: list[str] = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                texts.append(cell.text)
    return texts


def extract_placeholders(file_path: str) -> list[str]:
    """Return deduplicated list of {{...}} placeholders found in the document.

    Preserves first-occurrence order. Includes block markers such as
    {{#EXPERIENCES}} and {{/EXPERIENCES}}.
    """
    doc = Document(file_path)
    seen: dict[str, None] = {}
    for text in _iter_paragraphs(doc):
        for match in _PLACEHOLDER_RE.finditer(text):
            seen.setdefault(match.group(), None)
    return list(seen.keys())
