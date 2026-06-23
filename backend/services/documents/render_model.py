# backend/services/documents/render_model.py
"""Typed output contract consumed by the DOCX engine.

`DossierRenderModel` is the stable seam between data loading (generation_service)
and rendering (docx_engine). The engine builds the Jinja context exclusively from
this model, never from raw ORM objects. `header` is decoupled from the
`CandidateProfile` ORM (invariant #1), so no template ever reads the profile
directly; the context is a pure function of the render model (invariant #2).

Pure data only: this module imports nothing from docx_engine at runtime, which
keeps the dependency one-directional (docx_engine -> render_model).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from services.documents.docx_engine import (
        CertificationProtocol,
        EducationProtocol,
        ExperienceProtocol,
        LanguageProtocol,
        SkillProtocol,
    )


@dataclass(frozen=True)
class HeaderBlock:
    """Identity, contact and availability strings, already formatted and masked.

    Mirrors the historical ``profile_flat`` keys so it spreads into the context
    unchanged. Built from the profile ORM in ``build_render_model`` and nowhere
    else, which is what keeps the engine free of any ``CandidateProfile`` access.
    """

    first_name: str
    last_name: str
    title: str
    summary: str
    phone: str
    email_contact: str
    linkedin_url: str
    location: str
    years_of_experience: str
    daily_rate: str
    annual_salary: str
    availability_status: str
    availability_label: str
    availability_date: str
    work_mode: str
    work_mode_label: str
    location_preference: str
    mission_duration: str
    mission_duration_label: str
    contract_type: str
    contract_type_label: str
    preferred_domains: str


@dataclass(frozen=True)
class AnonymizationPolicy:
    """Sharing scope applied to the dossier when building the model.

    ``share_contact``/``share_finances`` gate the header fields; the three axes
    below carry the enriched consent envelope (AccessGrant) into the rendered
    document: anonymise the candidate identity, mask the mission client names and
    coarsen the dates shown to the end client.
    """

    share_contact: bool = True
    share_finances: bool = True
    anonymize_identity: bool = False
    mask_client_names: bool = False
    temporal_precision: str = "exact"


@dataclass(frozen=True)
class AssetsBlock:
    """Supporting credentials rendered alongside the main blocks."""

    certifications: tuple[CertificationProtocol, ...] = ()


def _skill_kind(skill: Any) -> str:
    kind = getattr(getattr(skill, "skill_ref", None), "kind", None)
    raw = getattr(kind, "value", kind)
    return str(raw) if raw is not None else ""


@dataclass(frozen=True)
class DossierRenderModel:
    """Stable, typed contract the DOCX engine renders from."""

    header: HeaderBlock
    anonymization: AnonymizationPolicy
    experience_blocks: tuple[ExperienceProtocol, ...]
    skills: tuple[SkillProtocol, ...]
    education_blocks: tuple[EducationProtocol, ...]
    language_blocks: tuple[LanguageProtocol, ...]
    assets: AssetsBlock

    @property
    def competency_blocks(self) -> tuple[SkillProtocol, ...]:
        """Skills that describe competencies (every kind except sectoral)."""
        return tuple(sk for sk in self.skills if _skill_kind(sk) != "sectoral")

    @property
    def sector_blocks(self) -> tuple[SkillProtocol, ...]:
        """Sectoral skills, surfaced as their own block."""
        return tuple(sk for sk in self.skills if _skill_kind(sk) == "sectoral")
