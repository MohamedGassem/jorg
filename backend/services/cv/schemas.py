from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict
from uuid import UUID

from pydantic import BaseModel, Field

from models.candidate_profile import CVExtractionStatus
from models.skill import SkillKind


class DocumentLine(BaseModel):
    text: str
    page: int = 1
    x0: float | None = None
    y0: float | None = None
    x1: float | None = None
    y1: float | None = None
    font_size: float | None = None
    is_bold: bool | None = None
    line_index: int


class ExtractedField(BaseModel):
    value: str | None = None
    confidence: float = Field(ge=0, le=1, default=0)
    evidence_text: str | None = None
    source_section: str | None = None
    needs_review: bool = True


class IdentityProposal(BaseModel):
    first_name: ExtractedField = Field(default_factory=ExtractedField)
    last_name: ExtractedField = Field(default_factory=ExtractedField)
    email: ExtractedField = Field(default_factory=ExtractedField)
    phone: ExtractedField = Field(default_factory=ExtractedField)
    linkedin_url: ExtractedField = Field(default_factory=ExtractedField)
    title: ExtractedField = Field(default_factory=ExtractedField)
    location: ExtractedField = Field(default_factory=ExtractedField)


class ExperienceProposal(BaseModel):
    role: ExtractedField = Field(default_factory=ExtractedField)
    client_name: ExtractedField = Field(default_factory=ExtractedField)
    location: ExtractedField = Field(default_factory=ExtractedField)
    contract_type: ExtractedField = Field(default_factory=ExtractedField)
    start_date: ExtractedField = Field(default_factory=ExtractedField)
    end_date: ExtractedField = Field(default_factory=ExtractedField)
    # Authoritative "ongoing role" flag derived from the CV ("actuel"/"présent").
    # The front must not re-infer this from an empty end_date, which also matches
    # a finished role whose end date simply failed to parse.
    is_current: bool = False
    description: ExtractedField = Field(default_factory=ExtractedField)
    achievements: list[ExtractedField] = []


class EducationProposal(BaseModel):
    school: ExtractedField = Field(default_factory=ExtractedField)
    degree: ExtractedField = Field(default_factory=ExtractedField)
    field_of_study: ExtractedField = Field(default_factory=ExtractedField)
    start_date: ExtractedField = Field(default_factory=ExtractedField)
    end_date: ExtractedField = Field(default_factory=ExtractedField)


class CertificationProposal(BaseModel):
    name: ExtractedField = Field(default_factory=ExtractedField)
    issuer: ExtractedField = Field(default_factory=ExtractedField)
    issue_date: ExtractedField = Field(default_factory=ExtractedField)
    expiry_date: ExtractedField = Field(default_factory=ExtractedField)


class LanguageProposal(BaseModel):
    name: ExtractedField = Field(default_factory=ExtractedField)
    level: ExtractedField = Field(default_factory=ExtractedField)


class SkillProposal(BaseModel):
    original_label: str
    normalized_label: str | None = None
    match_type: str = "unmatched"
    skill_ref_id: UUID | None = None
    name: str | None = None
    kind: SkillKind | None = None
    confidence: float = Field(ge=0, le=1, default=0.7)
    evidence_text: str | None = None
    source_section: str | None = None
    needs_review: bool = True


class ExtractionMetadata(BaseModel):
    filename: str
    file_hash: str
    extraction_method: str
    quality_score: int
    quality_details: dict[str, int | float | bool]
    parser_warnings: list[str] = []
    status: CVExtractionStatus = CVExtractionStatus.PENDING_REVIEW


class CVStructuredProposal(BaseModel):
    identity: IdentityProposal = Field(default_factory=IdentityProposal)
    experiences: list[ExperienceProposal] = []
    education: list[EducationProposal] = []
    certifications: list[CertificationProposal] = []
    languages: list[LanguageProposal] = []
    skills: list[SkillProposal] = []
    warnings: list[str] = []
    extraction_metadata: ExtractionMetadata | None = None


class QualityScore(BaseModel):
    score: int
    details: dict[str, int | float | bool]
    warnings: list[str] = []


class TextExtractionResult(BaseModel):
    text: str
    method: str
    warnings: list[str] = []
    lines: list[DocumentLine] = []
    quality: QualityScore | None = None


@dataclass(frozen=True)
class SectionBlock:
    name: str
    title: DocumentLine | None
    lines: list[DocumentLine]
    confidence: float


@dataclass(frozen=True)
class DateRange:
    start: str | None
    end: str | None
    is_current: bool
    evidence: str
    confidence: float


def _field(
    value: str | None,
    evidence: str | None,
    section: str,
    confidence: float,
    needs_review: bool,
) -> ExtractedField:
    if value is None:
        return ExtractedField()
    return ExtractedField(
        value=value,
        confidence=confidence,
        evidence_text=evidence,
        source_section=section,
        needs_review=needs_review,
    )


class CVContact(TypedDict):
    email: str | None
    phone: str | None
    linkedin_url: str | None
