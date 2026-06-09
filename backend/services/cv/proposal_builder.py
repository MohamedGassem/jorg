from __future__ import annotations

import re

from services.cv.constants import _EMAIL_RE, _PHONE_RE
from services.cv.contact_parser import extract_contact
from services.cv.education_parser import EducationBlockParser
from services.cv.exceptions import CVLLMExtractionError
from services.cv.experience_parser import ExperienceBlockParser
from services.cv.language_parser import LanguageParser
from services.cv.llm_extraction import CVLLMClient, NoopCVLLMClient, parse_llm_json_strict
from services.cv.schemas import (
    CertificationProposal,
    CVStructuredProposal,
    DocumentLine,
    ExtractionMetadata,
    IdentityProposal,
    QualityScore,
    SectionBlock,
    TextExtractionResult,
    _field,
)
from services.cv.section_detector import SectionDetector
from services.cv.skill_matching import SkillIndex, match_structured_skills
from services.cv.skill_parser import SkillParser
from services.cv.text_extraction import _text_to_document_lines
from services.references.language_reference_service import LanguageIndex


def build_structured_proposal(
    text: str,
    filename: str,
    file_hash: str,
    extraction: TextExtractionResult,
    quality: QualityScore,
    index: SkillIndex,
    llm_client: CVLLMClient | None = None,
    language_index: LanguageIndex | None = None,
) -> CVStructuredProposal:
    warnings = [*extraction.warnings, *quality.warnings]
    proposal: CVStructuredProposal | None = None
    raw_llm = (llm_client or NoopCVLLMClient()).extract_profile_json(text)
    if raw_llm:
        try:
            proposal = parse_llm_json_strict(raw_llm)
        except CVLLMExtractionError:
            warnings.append("Extraction LLM ignorée: JSON invalide.")

    if proposal is None:
        proposal = _deterministic_structured_proposal(text, extraction.lines, language_index)
        warnings.append("Extraction structurée heuristique utilisée; validez chaque champ.")

    proposal.skills = match_structured_skills(text, proposal.skills, index)
    proposal.warnings = [*proposal.warnings, *warnings]
    proposal.extraction_metadata = ExtractionMetadata(
        filename=filename,
        file_hash=file_hash,
        extraction_method=extraction.method,
        quality_score=quality.score,
        quality_details=quality.details,
        parser_warnings=warnings,
    )
    return proposal


def _deterministic_structured_proposal(
    text: str,
    document_lines: list[DocumentLine] | None = None,
    language_index: LanguageIndex | None = None,
) -> CVStructuredProposal:
    contact = extract_contact(text)
    lines = document_lines or _text_to_document_lines(text)
    sections = SectionDetector().detect(lines)
    identity_lines = sections.get("identity", SectionBlock("identity", None, [], 0)).lines
    identity_text = "\n".join(line.text for line in identity_lines)
    identity = IdentityProposal(
        email=_field(contact["email"], contact["email"], "identity", 0.95, False),
        phone=_field(contact["phone"], contact["phone"], "identity", 0.8, True),
        linkedin_url=_field(
            contact["linkedin_url"],
            contact["linkedin_url"],
            "identity",
            0.9,
            False,
        ),
    )
    if identity_lines:
        first_line = identity_lines[0].text
        words = first_line.split()
        if 2 <= len(words) <= 4 and not _EMAIL_RE.search(first_line):
            identity.first_name = _field(words[0], first_line, "identity", 0.7, True)
            identity.last_name = _field(" ".join(words[1:]), first_line, "identity", 0.7, True)
    if len(identity_lines) > 1 and not _EMAIL_RE.search(identity_lines[1].text):
        identity.title = _field(
            identity_lines[1].text,
            identity_lines[1].text,
            "identity",
            0.62,
            True,
        )
    location = _extract_location(identity_text)
    if location:
        identity.location = _field(location, location, "identity", 0.72, True)

    experience_lines = sections.get("experience", SectionBlock("experience", None, [], 0)).lines
    education_lines = sections.get("education", SectionBlock("education", None, [], 0)).lines
    skills_lines = sections.get("skills", SectionBlock("skills", None, [], 0)).lines
    language_lines = [
        *sections.get("languages", SectionBlock("languages", None, [], 0)).lines,
        *identity_lines,
    ]
    certification_lines = sections.get(
        "certifications", SectionBlock("certifications", None, [], 0)
    ).lines

    experiences = ExperienceBlockParser().parse(experience_lines)
    education = EducationBlockParser().parse(education_lines)
    certifications = [
        CertificationProposal(name=_field(line.text, line.text, "certifications", 0.55, True))
        for line in certification_lines[:5]
        if len(line.text) > 5
    ]
    languages = LanguageParser(language_index).parse(language_lines)
    skills = SkillParser().parse(skills_lines)
    return CVStructuredProposal(
        identity=identity,
        experiences=experiences,
        education=education,
        certifications=certifications,
        languages=languages,
        skills=skills,
    )


def _extract_location(text: str) -> str | None:
    for line in text.splitlines():
        if (
            re.search(r"\b(?:Lyon|Paris|Marseille|Toulouse|France)\b", line, re.IGNORECASE)
            and not _EMAIL_RE.search(line)
            and not _PHONE_RE.search(line)
        ):
            return line.strip(" +")
    return None
