# backend/services/documents/templatize_service.py
"""Assisted templating pipeline: structure -> LLM plan -> apply -> mock render."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from services.documents.builtin_template_service import (
    mock_context_keys,
    render_mock_preview_from_path,
)
from services.documents.docx_structure import extract_structure
from services.documents.templatize_ops import ReplaceTextOp, apply_operations
from services.llm.templatize import request_plan

logger = structlog.get_logger()


@dataclass
class TemplatizeOutcome:
    docx_bytes: bytes
    report: dict[str, Any]
    render_error: str | None


def _try_render(docx_bytes: bytes) -> str | None:
    """Render the candidate bytes against mock data; return the error message if any."""
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(docx_bytes)
        tmp_path = tmp.name
    try:
        render_mock_preview_from_path(tmp_path)
        return None
    except ValueError as exc:
        return str(exc)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


async def run_templatize_pipeline(
    client: Any, model: str, word_file_path: str
) -> TemplatizeOutcome:
    structure = extract_structure(word_file_path)
    known_keys = sorted(mock_context_keys())

    render_errors: str | None = None
    docx_bytes = b""
    report: dict[str, Any] = {}
    for _attempt in range(2):  # tentative initiale + 1 retry avec les erreurs
        plan = await request_plan(
            client,
            model=model,
            structure=structure,
            known_keys=known_keys,
            render_errors=render_errors,
        )
        result = apply_operations(word_file_path, plan)
        docx_bytes = result.docx_bytes
        report = {
            "mappings": [
                {"find": op.find, "placeholder": op.placeholder}
                for op in plan.operations
                if isinstance(op, ReplaceTextOp)
            ],
            "warnings": result.residual_flags,
            "rejected": result.rejected,
            "render_error": None,
        }
        render_errors = _try_render(docx_bytes)
        if render_errors is None:
            return TemplatizeOutcome(docx_bytes=docx_bytes, report=report, render_error=None)
        logger.warning("templatize.render_failed", error=render_errors)

    report["render_error"] = render_errors
    return TemplatizeOutcome(docx_bytes=docx_bytes, report=report, render_error=render_errors)
