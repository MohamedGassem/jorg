# backend/services/template_service.py
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ConflictError
from models.template import Template

logger = structlog.get_logger()


# Standard profile field placeholders produced by docxtpl templates.
# Any template whose detected_placeholders are a subset of this set is
# auto-mapped and immediately valid — no wizard step required.
# Keep in sync with _KNOWN_PLACEHOLDERS in the Alembic migration
# f1a2b3c4d5e6_recompute_template_validity_for_docxtpl.py.
_KNOWN_PLACEHOLDERS: frozenset[str] = frozenset(
    f"{{{{{k}}}}}"
    for k in (
        "first_name",
        "last_name",
        "title",
        "summary",
        "phone",
        "email_contact",
        "linkedin_url",
        "location",
        "years_of_experience",
        "daily_rate",
        "annual_salary",
        "availability_status",
        "work_mode",
        "location_preference",
        "mission_duration",
        "contract_type",
        "preferred_domains",
    )
)


def _auto_mappings(detected_placeholders: list[str]) -> dict[str, str]:
    """Return identity mappings for every known standard-field placeholder.

    Unknown placeholders (e.g. old Mustache ``{{NOM}}``) are omitted and must
    be mapped manually through the wizard.
    """
    return {ph: ph[2:-2] for ph in detected_placeholders if ph in _KNOWN_PLACEHOLDERS}


def _compute_is_valid(detected_placeholders: list[str], mappings: dict[str, Any]) -> bool:
    """A template is valid when every detected placeholder has a mapping."""
    return bool(detected_placeholders) and all(ph in mappings for ph in detected_placeholders)


async def create_template(
    db: AsyncSession,
    organization_id: UUID,
    created_by_user_id: UUID,
    name: str,
    description: str | None,
    word_file_path: str,
    detected_placeholders: list[str],
) -> Template:
    auto = _auto_mappings(detected_placeholders)
    template = Template(
        organization_id=organization_id,
        created_by_user_id=created_by_user_id,
        name=name,
        description=description,
        word_file_path=word_file_path,
        detected_placeholders=detected_placeholders,
        mappings=auto,
        is_valid=_compute_is_valid(detected_placeholders, auto),
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


async def update_mappings(
    db: AsyncSession,
    template: Template,
    mappings: dict[str, str],
    version: int,
) -> Template:
    if template.version != version:
        raise ConflictError("template has been modified — refresh and retry")
    template.mappings = mappings
    template.is_valid = _compute_is_valid(template.detected_placeholders, mappings)
    template.version = version + 1
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(db: AsyncSession, template: Template) -> None:
    await db.delete(template)
    await db.commit()
