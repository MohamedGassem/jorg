# backend/services/template_service.py
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.template import Template
from services.documents.builtin_template_service import (
    mock_context_keys,
    render_mock_preview_from_path,
)

logger = structlog.get_logger()


@dataclass(frozen=True)
class TemplateValidation:
    is_valid: bool
    unknown_placeholders: list[str]
    validation_error: str | None


def _placeholder_root(placeholder: str) -> str:
    """'{{ skill_groups.0.name | upper }}' -> 'skill_groups'."""
    inner = placeholder.strip().removeprefix("{{").removesuffix("}}").strip()
    return inner.split("|")[0].strip().split(".")[0].strip()


def unknown_placeholders(detected_placeholders: list[str]) -> list[str]:
    """Placeholders whose root is not a known rendering-context key (warnings only)."""
    known = mock_context_keys()
    return [ph for ph in detected_placeholders if _placeholder_root(ph) not in known]


def mock_render_error(word_file_path: str) -> str | None:
    """Render against mock data; return the error message, or None on success.

    Any render failure (Jinja syntax error, unreadable file, or a runtime error
    such as a type mismatch in a filter) is reported rather than raised, so an
    upload of a broken template is marked invalid instead of returning a 500.
    """
    try:
        render_mock_preview_from_path(word_file_path)
    except Exception as exc:
        return str(exc) or exc.__class__.__name__
    return None


def validate_template(word_file_path: str, detected_placeholders: list[str]) -> TemplateValidation:
    """Validate by rendering against mock data; unknown placeholders are warnings.

    The mock render is the source of truth: if it succeeds the template is
    valid (ChainableUndefined renders unknown tags as empty strings). A render
    failure of any kind marks the template invalid.
    """
    error = mock_render_error(word_file_path)
    if error is not None:
        return TemplateValidation(is_valid=False, unknown_placeholders=[], validation_error=error)
    return TemplateValidation(
        is_valid=True,
        unknown_placeholders=unknown_placeholders(detected_placeholders),
        validation_error=None,
    )


async def create_template(
    db: AsyncSession,
    organization_id: UUID,
    created_by_user_id: UUID,
    name: str,
    description: str | None,
    word_file_path: str,
    detected_placeholders: list[str],
) -> Template:
    validation = validate_template(word_file_path, detected_placeholders)
    template = Template(
        organization_id=organization_id,
        created_by_user_id=created_by_user_id,
        name=name,
        description=description,
        word_file_path=word_file_path,
        source_file_path=word_file_path,
        detected_placeholders=detected_placeholders,
        is_valid=validation.is_valid,
        unknown_placeholders=validation.unknown_placeholders,
        validation_error=validation.validation_error,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    logger.info(
        "template.uploaded",
        organization_id=str(template.organization_id),
        template_id=str(template.id),
        placeholder_count=len(template.detected_placeholders),
    )
    return template


async def list_templates(db: AsyncSession, organization_id: UUID) -> list[Template]:
    result = await db.execute(select(Template).where(Template.organization_id == organization_id))
    return list(result.scalars().all())


async def get_template(
    db: AsyncSession, template_id: UUID, organization_id: UUID
) -> Template | None:
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_template(db: AsyncSession, template: Template) -> None:
    await db.delete(template)
    await db.flush()


async def apply_templatize_outcome(
    db: AsyncSession,
    template: Template,
    new_file_path: str,
    detected_placeholders: list[str],
    report: dict[str, Any],
    render_error: str | None,
) -> Template:
    """Persist the templatized draft: new file, draft status.

    The pipeline already rendered the candidate bytes, so its ``render_error``
    is reused instead of rendering a second time. Unknown placeholders are
    recomputed from the new file's detected placeholders (no render needed).
    """
    template.word_file_path = new_file_path
    template.detected_placeholders = detected_placeholders
    template.is_valid = render_error is None
    template.unknown_placeholders = (
        unknown_placeholders(detected_placeholders) if render_error is None else []
    )
    template.validation_error = render_error
    template.status = "draft"
    template.templatize_report = report
    await db.flush()
    await db.refresh(template)
    return template


async def activate_template(db: AsyncSession, template: Template) -> Template:
    template.status = "active"
    await db.flush()
    await db.refresh(template)
    return template
