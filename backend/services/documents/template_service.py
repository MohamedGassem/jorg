# backend/services/template_service.py
from dataclasses import dataclass
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


def validate_template(word_file_path: str, detected_placeholders: list[str]) -> TemplateValidation:
    """Validate by rendering against mock data; unknown placeholders are warnings.

    The mock render is the source of truth: if it succeeds the template is
    valid (ChainableUndefined renders unknown tags as empty strings). Only a
    Jinja syntax error or an unreadable file marks the template invalid.
    """
    try:
        render_mock_preview_from_path(word_file_path)
    except ValueError as exc:
        return TemplateValidation(
            is_valid=False, unknown_placeholders=[], validation_error=str(exc)
        )
    known = mock_context_keys()
    unknown = [ph for ph in detected_placeholders if _placeholder_root(ph) not in known]
    return TemplateValidation(is_valid=True, unknown_placeholders=unknown, validation_error=None)


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
        detected_placeholders=detected_placeholders,
        is_valid=validation.is_valid,
        unknown_placeholders=validation.unknown_placeholders,
        validation_error=validation.validation_error,
    )
    db.add(template)
    await db.commit()
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
    await db.commit()
