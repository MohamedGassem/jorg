from __future__ import annotations

import hashlib
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import CVExtractionProposal
from services.cv.contact_parser import extract_contact
from services.cv.llm_extraction import CVLLMClient
from services.cv.proposal_builder import build_structured_proposal
from services.cv.quality import score_text_quality
from services.cv.repository import store_cv_extraction_proposal
from services.cv.schemas import CVContact
from services.cv.skill_matching import SkillEntry, SkillIndex, match_skills_in_index
from services.cv.text_extraction import (
    DocumentParser,
    extract_text,
    extract_text_with_metadata,
    validate_cv_file,
)
from services.references.language_reference_service import LanguageIndex


class CVParseData(CVContact):
    skills: list[SkillEntry]


async def parse_cv(
    filename: str,
    data: bytes,
    index: SkillIndex,
) -> CVParseData:
    text = extract_text(filename, data)
    contact = extract_contact(text)
    skills = match_skills_in_index(text, index)
    return CVParseData(
        email=contact["email"],
        phone=contact["phone"],
        linkedin_url=contact["linkedin_url"],
        skills=skills,
    )


async def parse_and_store_cv_proposal(
    candidate_id: UUID,
    filename: str,
    data: bytes,
    db: AsyncSession,
    index: SkillIndex,
    llm_client: CVLLMClient | None = None,
    fallback_parser: DocumentParser | None = None,
    language_index: LanguageIndex | None = None,
) -> CVExtractionProposal:
    validate_cv_file(filename, data)
    file_hash = hashlib.sha256(data).hexdigest()
    extraction = extract_text_with_metadata(
        filename,
        data,
        fallback_parser=fallback_parser,
    )
    quality = extraction.quality or score_text_quality(extraction.text)
    if quality.score < 20:
        from services.cv.exceptions import CVTextExtractionError

        raise CVTextExtractionError("Le texte extrait est trop court ou trop peu lisible.")
    proposal_payload = build_structured_proposal(
        extraction.text,
        filename,
        file_hash,
        extraction,
        quality,
        index,
        llm_client=llm_client,
        language_index=language_index,
    )
    return await store_cv_extraction_proposal(
        candidate_id,
        filename,
        file_hash,
        extraction,
        quality,
        proposal_payload,
        db,
    )
