# backend/services/template_service.py
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.template import Template

logger = structlog.get_logger()


# Standard profile field placeholders produced by docxtpl templates.
# Any template whose detected_placeholders are a non-empty subset of this set is valid.
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


def _compute_is_valid(detected_placeholders: list[str]) -> bool:
    """A template is valid when all top-level placeholders are supported fields."""
    return bool(detected_placeholders) and all(
        ph in _KNOWN_PLACEHOLDERS for ph in detected_placeholders
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
    template = Template(
        organization_id=organization_id,
        created_by_user_id=created_by_user_id,
        name=name,
        description=description,
        word_file_path=word_file_path,
        detected_placeholders=detected_placeholders,
        is_valid=_compute_is_valid(detected_placeholders),
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
