from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CVExtractionProposal, CVExtractionStatus
from services.cv.exceptions import CVPersistenceUnavailableError
from services.cv.schemas import CVStructuredProposal, QualityScore, TextExtractionResult


async def store_cv_extraction_proposal(
    candidate_id: UUID,
    filename: str,
    file_hash: str,
    extraction: TextExtractionResult,
    quality: QualityScore,
    proposal_payload: CVStructuredProposal,
    db: AsyncSession,
) -> CVExtractionProposal:
    row = CVExtractionProposal(
        candidate_id=candidate_id,
        filename=filename[:255] or "cv",
        file_hash=file_hash,
        raw_text=extraction.text,
        extraction_method=extraction.method,
        quality_score=quality.score,
        quality_details=quality.details,
        proposed_profile=proposal_payload.model_dump(mode="json"),
        warnings=proposal_payload.warnings,
        status=CVExtractionStatus.PENDING_REVIEW,
    )
    db.add(row)
    try:
        await db.flush()
    except ProgrammingError as exc:
        await db.rollback()
        if _is_missing_proposal_table(exc):
            raise CVPersistenceUnavailableError(
                "Le stockage des propositions CV n'est pas pr?t. "
                "Appliquez les migrations de base de donn?es."
            ) from exc
        raise
    await db.refresh(row)
    return row


def _is_missing_proposal_table(exc: ProgrammingError) -> bool:
    message = str(exc)
    return "cv_extraction_proposals" in message and (
        "UndefinedTableError" in message or "does not exist" in message
    )
