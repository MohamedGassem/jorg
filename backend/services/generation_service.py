# backend/services/generation_service.py
"""Orchestrates document generation: DB → engine → storage → record."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

import httpx
import structlog
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.config import get_settings
from core.exceptions import BusinessRuleError, NotFoundError
from core.storage import get_storage
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
)
from models.generated_document import GeneratedDocument
from models.recruiter import Organization
from models.skill import Achievement, AchievementSkillTag, CandidateSkill, ExperienceSkillUsage
from models.template import Template
from schemas.generation import GeneratedDocumentCandidateView, GeneratedDocumentRecruiterView
from services import access_policy, builtin_template_service, template_service
from services.docx_engine import generate_document

logger = structlog.get_logger()


async def _convert_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF via Gotenberg. Raises BusinessRuleError on failure."""
    settings = get_settings()
    if not settings.gotenberg_url:
        raise BusinessRuleError("PDF conversion not available: GOTENBERG_URL is not configured")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.gotenberg_url}/forms/libreoffice/convert",
                files={
                    "files": (
                        "document.docx",
                        docx_bytes,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )
    except httpx.RequestError as exc:
        raise BusinessRuleError(f"PDF conversion unreachable: {exc}") from exc
    if response.status_code != 200:
        raise BusinessRuleError(f"PDF conversion failed (HTTP {response.status_code})")
    return response.content


async def _load_profile(db: AsyncSession, candidate_id: UUID) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise NotFoundError("Candidate profile not found")
    return profile


async def _load_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    result = await db.execute(
        select(Experience)
        .where(Experience.profile_id == profile_id)
        .options(
            selectinload(Experience.skill_usages).selectinload(ExperienceSkillUsage.skill_ref),
            selectinload(Experience.achievements)
            .selectinload(Achievement.skill_tags)
            .selectinload(AchievementSkillTag.skill_ref),
        )
        .order_by(Experience.start_date.desc())
    )
    return list(result.scalars().all())


async def _load_skills(db: AsyncSession, profile_id: UUID) -> list[CandidateSkill]:
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.candidate_id == profile_id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    return list(result.scalars().all())


async def _load_education(db: AsyncSession, profile_id: UUID) -> list[Education]:
    result = await db.execute(
        select(Education)
        .where(Education.profile_id == profile_id)
        .order_by(Education.end_date.desc())
    )
    return list(result.scalars().all())


async def _load_certifications(db: AsyncSession, profile_id: UUID) -> list[Certification]:
    result = await db.execute(
        select(Certification)
        .where(Certification.profile_id == profile_id)
        .order_by(Certification.issue_date.desc())
    )
    return list(result.scalars().all())


async def _load_languages(db: AsyncSession, profile_id: UUID) -> list[Language]:
    result = await db.execute(select(Language).where(Language.profile_id == profile_id))
    return list(result.scalars().all())


async def generate_for_candidate(
    db: AsyncSession,
    organization_id: UUID,
    template_id: UUID | None,
    system_template_key: str | None,
    candidate_id: UUID,
    generated_by_user_id: UUID,
    fmt: Literal["docx", "pdf"],
) -> GeneratedDocument:
    """Full pipeline: verify grant → load data → generate → save → record."""
    # 1. Verify active access grant
    grant = await access_policy.require_live_access(db, organization_id, candidate_id)

    # 2. Load template
    resolved_template_id: UUID | None = None
    if system_template_key:
        builtin = builtin_template_service.get_builtin_template(system_template_key)
        if builtin is None:
            raise NotFoundError("Template not found")
        template_path = builtin.word_file_path
        template_name = builtin.name
        filename_template_token = builtin.key
    elif template_id:
        tmpl = await template_service.get_template(db, template_id, organization_id)
        if tmpl is None:
            raise NotFoundError("Template not found")
        if not tmpl.is_valid:
            raise BusinessRuleError("Template is not fully mapped")
        template_path = tmpl.word_file_path
        template_name = tmpl.name
        resolved_template_id = template_id
        filename_template_token = str(template_id)
    else:
        raise BusinessRuleError("Template is required")

    # 3. Load candidate profile
    profile = await _load_profile(db, candidate_id)
    experiences = await _load_experiences(db, profile.id)
    skills = await _load_skills(db, profile.id)
    education = await _load_education(db, profile.id)
    certifications = await _load_certifications(db, profile.id)
    languages = await _load_languages(db, profile.id)

    # 4. Generate document bytes
    try:
        docx_bytes = generate_document(
            template_path,
            profile,  # type: ignore[arg-type]
            experiences,  # type: ignore[arg-type]
            skills,  # type: ignore[arg-type]
            education,  # type: ignore[arg-type]
            certifications,  # type: ignore[arg-type]
            languages,  # type: ignore[arg-type]
        )
    except ValueError as exc:
        raise BusinessRuleError(str(exc)) from exc

    # 5. Save to storage (convert to PDF in memory if requested)
    storage = get_storage()
    base_filename = f"doc_{candidate_id}_{filename_template_token}"
    if fmt == "pdf":
        try:
            pdf_bytes = await _convert_to_pdf(docx_bytes)
            storage_key = await storage.save(pdf_bytes, f"{base_filename}.pdf")
            actual_format: str = "pdf"
        except BusinessRuleError:
            # Gotenberg unavailable — fall back to docx and record actual format
            logger.warning(
                "pdf_conversion_unavailable",
                candidate_id=str(candidate_id),
                fallback="docx",
            )
            storage_key = await storage.save(docx_bytes, f"{base_filename}.docx")
            actual_format = "docx"
    else:
        storage_key = await storage.save(docx_bytes, f"{base_filename}.docx")
        actual_format = "docx"

    # 6. Record generated document
    doc = GeneratedDocument(
        access_grant_id=grant.id,
        template_id=resolved_template_id,
        generated_by_user_id=generated_by_user_id,
        file_path=storage_key,
        file_format=actual_format,
        template_name=template_name,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info(
        "document.generated",
        template_id=str(resolved_template_id) if resolved_template_id else None,
        system_template_key=system_template_key,
        candidate_id=str(candidate_id),
        format=fmt,
        access_grant_id=str(doc.access_grant_id),
    )
    return doc


async def generate_for_self(
    db: AsyncSession,
    candidate_id: UUID,
    system_template_key: str,
    fmt: Literal["docx", "pdf"],
) -> GeneratedDocument:
    """Generate a document directly for the candidate, without recruiter access grant."""
    builtin = builtin_template_service.get_builtin_template(system_template_key)
    if builtin is None:
        raise NotFoundError("Template not found")

    profile = await _load_profile(db, candidate_id)
    experiences = await _load_experiences(db, profile.id)
    skills = await _load_skills(db, profile.id)
    education = await _load_education(db, profile.id)
    certifications = await _load_certifications(db, profile.id)
    languages = await _load_languages(db, profile.id)

    try:
        docx_bytes = generate_document(
            builtin.word_file_path,
            profile,  # type: ignore[arg-type]
            experiences,  # type: ignore[arg-type]
            skills,  # type: ignore[arg-type]
            education,  # type: ignore[arg-type]
            certifications,  # type: ignore[arg-type]
            languages,  # type: ignore[arg-type]
        )
    except ValueError as exc:
        raise BusinessRuleError(str(exc)) from exc

    storage = get_storage()
    base_filename = f"doc_{candidate_id}_{builtin.key}"
    if fmt == "pdf":
        try:
            pdf_bytes = await _convert_to_pdf(docx_bytes)
            storage_key = await storage.save(pdf_bytes, f"{base_filename}.pdf")
            actual_format: str = "pdf"
        except BusinessRuleError:
            logger.warning(
                "pdf_conversion_unavailable",
                candidate_id=str(candidate_id),
                fallback="docx",
            )
            storage_key = await storage.save(docx_bytes, f"{base_filename}.docx")
            actual_format = "docx"
    else:
        storage_key = await storage.save(docx_bytes, f"{base_filename}.docx")
        actual_format = "docx"

    doc = GeneratedDocument(
        access_grant_id=None,
        template_id=None,
        generated_by_user_id=candidate_id,
        file_path=storage_key,
        file_format=actual_format,
        template_name=builtin.name,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info(
        "document.generated.self",
        system_template_key=system_template_key,
        candidate_id=str(candidate_id),
        format=fmt,
    )
    return doc


async def list_candidate_documents_view(
    db: AsyncSession, candidate_id: UUID
) -> list[GeneratedDocumentCandidateView]:
    from models.invitation import AccessGrant
    from models.recruiter import RecruiterProfile

    rows = await db.execute(
        select(
            GeneratedDocument.id,
            GeneratedDocument.generated_at,
            GeneratedDocument.file_format,
            Organization.name.label("organization_name"),
            AccessGrant.organization_id.label("organization_id"),
            func.coalesce(Template.name, GeneratedDocument.template_name).label("template_name"),
            RecruiterProfile.first_name.label("recruiter_first_name"),
            RecruiterProfile.last_name.label("recruiter_last_name"),
        )
        .outerjoin(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .outerjoin(Organization, AccessGrant.organization_id == Organization.id)
        .outerjoin(Template, GeneratedDocument.template_id == Template.id)
        .outerjoin(
            RecruiterProfile,
            RecruiterProfile.user_id == GeneratedDocument.generated_by_user_id,
        )
        .where(
            or_(
                AccessGrant.candidate_id == candidate_id,
                and_(
                    GeneratedDocument.access_grant_id.is_(None),
                    GeneratedDocument.generated_by_user_id == candidate_id,
                ),
            )
        )
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return [
        GeneratedDocumentCandidateView(
            id=row.id,
            generated_at=row.generated_at,
            file_format=row.file_format,
            organization_name=row.organization_name or "Jorg",
            organization_id=row.organization_id,
            template_name=row.template_name,
            recruiter_first_name=row.recruiter_first_name,
            recruiter_last_name=row.recruiter_last_name,
        )
        for row in rows.all()
    ]


async def list_candidate_documents(db: AsyncSession, candidate_id: UUID) -> list[GeneratedDocument]:
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .outerjoin(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(
            or_(
                AccessGrant.candidate_id == candidate_id,
                and_(
                    GeneratedDocument.access_grant_id.is_(None),
                    GeneratedDocument.generated_by_user_id == candidate_id,
                ),
            )
        )
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())


async def list_org_documents_view(
    db: AsyncSession, organization_id: UUID
) -> list[GeneratedDocumentRecruiterView]:
    from models.candidate_profile import CandidateProfile
    from models.invitation import AccessGrant
    from models.opportunity import Opportunity, ShortlistEntry

    opportunity_subq = (
        select(Opportunity.title)
        .join(ShortlistEntry, ShortlistEntry.opportunity_id == Opportunity.id)
        .where(ShortlistEntry.candidate_id == AccessGrant.candidate_id)
        .order_by(Opportunity.id)
        .limit(1)
        .correlate(AccessGrant)
        .scalar_subquery()
    )

    rows = await db.execute(
        select(
            GeneratedDocument.id,
            GeneratedDocument.generated_at,
            GeneratedDocument.file_format,
            func.coalesce(Template.name, GeneratedDocument.template_name).label("template_name"),
            CandidateProfile.first_name.label("candidate_first_name"),
            CandidateProfile.last_name.label("candidate_last_name"),
            opportunity_subq.label("opportunity_title"),
        )
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .outerjoin(CandidateProfile, CandidateProfile.user_id == AccessGrant.candidate_id)
        .outerjoin(Template, GeneratedDocument.template_id == Template.id)
        .where(AccessGrant.organization_id == organization_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return [
        GeneratedDocumentRecruiterView(
            id=row.id,
            generated_at=row.generated_at,
            file_format=row.file_format,
            template_name=row.template_name,
            candidate_first_name=row.candidate_first_name,
            candidate_last_name=row.candidate_last_name,
            opportunity_title=row.opportunity_title,
        )
        for row in rows.all()
    ]


async def list_org_documents(db: AsyncSession, organization_id: UUID) -> list[GeneratedDocument]:
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.organization_id == organization_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())
