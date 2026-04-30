# backend/services/docx_engine.py
"""Pure document generation engine — no DB, no I/O, no side effects."""

from __future__ import annotations

import copy
import io
import re
from datetime import date
from typing import Any

from docx import Document  # type: ignore[import-untyped,unused-ignore]

from models.candidate_profile import CandidateProfile, Experience

_PH = re.compile(r"\{\{[^}]+\}\}")


def _fmt_date(d: date | None) -> str:
    return d.strftime("%m/%Y") if d else ""


def _profile_flat(profile: CandidateProfile) -> dict[str, str]:
    return {
        "first_name": profile.first_name or "",
        "last_name": profile.last_name or "",
        "title": profile.title or "",
        "summary": profile.summary or "",
        "phone": profile.phone or "",
        "email_contact": profile.email_contact or "",
        "linkedin_url": profile.linkedin_url or "",
        "location": profile.location or "",
        "years_of_experience": str(profile.years_of_experience or ""),
        "daily_rate": str(profile.daily_rate or ""),
        "annual_salary": str(profile.annual_salary or ""),
        "availability_status": (
            str(profile.availability_status.value) if profile.availability_status else ""
        ),
        "work_mode": str(profile.work_mode.value) if profile.work_mode else "",
        "location_preference": profile.location_preference or "",
        "mission_duration": str(profile.mission_duration.value) if profile.mission_duration else "",
    }


def _exp_flat(exp: Experience) -> dict[str, str]:
    end = _fmt_date(exp.end_date) if not exp.is_current else "présent"
    return {
        "experience.client_name": exp.client_name or "",
        "experience.role": exp.role or "",
        "experience.start_date": _fmt_date(exp.start_date),
        "experience.end_date": end,
        "experience.description": exp.description or "",
        "experience.context": exp.context or "",
        "experience.achievements": exp.achievements or "",
        "experience.technologies": ", ".join(exp.technologies or []),
    }


def _is_text_settable(node: Any) -> bool:
    """Return True if node.text can be assigned (not a read-only computed property)."""
    for klass in type(node).__mro__:
        if "text" in klass.__dict__:
            attr = klass.__dict__["text"]
            if isinstance(attr, property):
                return attr.fset is not None
            # C-level getset_descriptor (lxml native) — always settable
            return True
    return False


def _replace_element(elem: Any, lookup: dict[str, str]) -> None:
    """Replace {{PLACEHOLDER}} in every XML text node using the lookup dict."""
    for node in elem.iter():
        if _is_text_settable(node):
            if node.text:
                node.text = _PH.sub(lambda m: lookup.get(m.group(), ""), node.text)
            if node.tail:
                node.tail = _PH.sub(lambda m: lookup.get(m.group(), ""), node.tail)


def _apply_block(
    doc: Any,
    start_marker: str,
    end_marker: str,
    items: list[dict[str, str]],
    base_lookup: dict[str, str],
) -> None:
    """Clone template paragraphs between markers for each item, then remove markers.

    Uses a while loop to re-scan after each replacement, in case the same
    block appears multiple times in the document.
    """
    while True:
        paras = list(doc.paragraphs)
        start_idx = next((i for i, p in enumerate(paras) if start_marker in p.text), None)
        end_idx = next((i for i, p in enumerate(paras) if end_marker in p.text), None)
        if start_idx is None or end_idx is None:
            break

        # Deep-copy the template XML elements (between markers, exclusive)
        template_elems = [copy.deepcopy(paras[j]._element) for j in range(start_idx + 1, end_idx)]

        anchor = paras[start_idx]._element
        body = doc.element.body

        # Insert clones after anchor (reversed so first item ends up first)
        for item in reversed(items):
            lookup = {**base_lookup, **item}
            for tmpl in reversed(template_elems):
                new_elem = copy.deepcopy(tmpl)
                _replace_element(new_elem, lookup)
                anchor.addnext(new_elem)

        # Remove marker paragraphs and original template paragraphs
        for j in range(start_idx, end_idx + 1):
            body.remove(paras[j]._element)


def generate_document(
    template_path: str,
    profile: CandidateProfile,
    experiences: list[Experience],
    mappings: dict[str, Any],
) -> bytes:
    """Apply mappings to a template docx and return the result as bytes.

    Algorithm:
    1. Build reverse lookup: placeholder → resolved string value.
    2. For experience block markers, clone template paragraphs per experience.
    3. Replace remaining simple placeholders in all paragraphs and table cells.
    4. Return docx bytes.
    """
    doc = Document(template_path)

    profile_data = _profile_flat(profile)

    # Build the simple placeholder → value lookup
    base_lookup: dict[str, str] = {}
    for placeholder, field in mappings.items():
        if not isinstance(field, str):
            continue
        if not field.startswith("experience."):
            base_lookup[placeholder] = profile_data.get(field, "")

    # Build per-experience lookup rows
    exp_items: list[dict[str, str]] = []
    for exp in experiences:
        exp_data = _exp_flat(exp)
        item: dict[str, str] = {}
        for placeholder, field in mappings.items():
            if isinstance(field, str) and field.startswith("experience."):
                item[placeholder] = exp_data.get(field, "")
        exp_items.append(item)

    # Handle {{#EXPERIENCES}}...{{/EXPERIENCES}} blocks
    _apply_block(doc, "{{#EXPERIENCES}}", "{{/EXPERIENCES}}", exp_items, base_lookup)

    # Replace simple placeholders in paragraphs
    for para in doc.paragraphs:
        _replace_element(para._element, base_lookup)

    # Replace simple placeholders in table cells
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    _replace_element(para._element, base_lookup)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
