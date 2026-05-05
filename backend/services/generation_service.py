# backend/services/generation_service.py
"""Orchestrates document generation: DB → engine → storage → record."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Literal
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core import storage
from core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from models.candidate_profile import CandidateProfile, Experience
from models.generated_document import GeneratedDocument
from models.recruiter import Organization
from models.template import Template
from schemas.generation import GeneratedDocumentCandidateView
from services import invitation_service, template_service
from services.docx_engine import generate_document

logger = structlog.get_logger()


def convert_to_pdf(docx_path: str) -> str | None:
    """Convert a docx file to PDF using LibreOffice headless.

    Returns the PDF path on success, or None if LibreOffice is unavailable
    or conversion fails. Failure is non-fatal: caller delivers docx instead.
    """
    try:
        output_dir = str(Path(docx_path).parent)
        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                output_dir,
                docx_path,
            ],
            capture_output=True,
            timeout=60,
        )
        if result.returncode == 0:
            pdf_path = str(Path(docx_path).with_suffix(".pdf"))
            if Path(pdf_path).exists():
                return pdf_path
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


async def _load_profile(db: AsyncSession, candidate_id: UUID) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise NotFoundError("Candidate profile not found")
    return profile


async def _load_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    result = await db.execute(select(Experience).where(Experience.profile_id == profile_id))
    return list(result.scalars().all())


async def generate_for_candidate(
    db: AsyncSession,
    organization_id: UUID,
    template_id: UUID,
    candidate_id: UUID,
    generated_by_user_id: UUID,
    fmt: Literal["docx", "pdf"],
) -> GeneratedDocument:
    """Full pipeline: verify grant → load data → generate → save → record."""
    # 1. Verify active access grant
    grant = await invitation_service.get_active_grant(db, candidate_id, organization_id)
    if grant is None:
        raise ForbiddenError("No active access grant for this candidate")

    # 2. Load template
    tmpl = await template_service.get_template(db, template_id, organization_id)
    if tmpl is None:
        raise NotFoundError("Template not found")
    if not tmpl.is_valid:
        raise BusinessRuleError("Template is not fully mapped")

    # 3. Load candidate profile
    profile = await _load_profile(db, candidate_id)
    experiences = await _load_experiences(db, profile.id)

    # 4. Generate document bytes
    docx_bytes = generate_document(tmpl.word_file_path, profile, experiences, tmpl.mappings)  # type: ignore[arg-type]

    # 5. Convert to PDF if requested
    filename = f"doc_{candidate_id}_{template_id}.docx"
    file_path = storage.save_upload(docx_bytes, filename)

    # 6. Save to storage
    actual_path = file_path
    actual_format: str = "docx"
    if fmt == "pdf":
        pdf_path = convert_to_pdf(file_path)
        if pdf_path:
            actual_path = pdf_path
            actual_format = "pdf"

    # 7. Record generated document
    doc = GeneratedDocument(
        access_grant_id=grant.id,
        template_id=template_id,
        generated_by_user_id=generated_by_user_id,
        file_path=actual_path,
        file_format=actual_format,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    logger.info(
        "document.generated",
        template_id=str(template_id),
        candidate_id=str(candidate_id),
        format=fmt,
        access_grant_id=str(doc.access_grant_id),
    )
    return doc


async def list_candidate_documents_view(
    db: AsyncSession, candidate_id: UUID
) -> list[GeneratedDocumentCandidateView]:
    from models.invitation import AccessGrant

    rows = await db.execute(
        select(
            GeneratedDocument.id,
            GeneratedDocument.generated_at,
            GeneratedDocument.file_format,
            Organization.name.label("organization_name"),
            Template.name.label("template_name"),
        )
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .join(Organization, AccessGrant.organization_id == Organization.id)
        .join(Template, GeneratedDocument.template_id == Template.id)
        .where(AccessGrant.candidate_id == candidate_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return [
        GeneratedDocumentCandidateView(
            id=row.id,
            generated_at=row.generated_at,
            file_format=row.file_format,
            organization_name=row.organization_name,
            template_name=row.template_name,
        )
        for row in rows.all()
    ]


async def list_candidate_documents(db: AsyncSession, candidate_id: UUID) -> list[GeneratedDocument]:
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.candidate_id == candidate_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())


async def list_org_documents(db: AsyncSession, organization_id: UUID) -> list[GeneratedDocument]:
    from models.invitation import AccessGrant

    result = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.organization_id == organization_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return list(result.scalars().all())
