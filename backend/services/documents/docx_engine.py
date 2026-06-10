# backend/services/docx_engine.py
"""Pure document generation engine - no DB, no I/O, no side effects.

The rendering context stays backward-compatible with older recruiter templates:
removed fields such as ``exp.technologies`` and ``sk.level_rating`` render as
empty strings, while richer builtin templates can use structured lists for
education, certifications, languages, achievements and per-experience skills.
"""

from __future__ import annotations

import io
import zipfile
from collections.abc import Iterable, Sequence
from datetime import date
from enum import StrEnum
from typing import Any, Protocol

from docx.opc.exceptions import PackageNotFoundError
from docxtpl import DocxTemplate
from jinja2 import ChainableUndefined, Environment, TemplateSyntaxError

from models.skill import SkillKind

# Re-used across every render call - Environment construction is not free.
_JINJA_ENV = Environment(undefined=ChainableUndefined)


class ExperienceProtocol(Protocol):
    client_name: str | None
    role: str | None
    start_date: Any
    end_date: Any | None
    is_current: bool
    description: str | None
    context: str | None
    achievements_summary: str | None
    achievements: Any
    skill_usages: Any


class CandidateProfileProtocol(Protocol):
    first_name: str | None
    last_name: str | None
    title: str | None
    summary: str | None
    phone: str | None
    email_contact: str | None
    linkedin_url: str | None
    location: str | None
    years_of_experience: int | None
    daily_rate: int | None
    annual_salary: int | None
    availability_status: StrEnum | None
    availability_date: date | None
    work_mode: StrEnum | None
    location_preference: str | None
    mission_duration: StrEnum | None
    contract_type: StrEnum | None
    preferred_domains: list[str] | None


class SkillReferenceProtocol(Protocol):
    name: str | None
    kind: StrEnum | None


class SkillProtocol(Protocol):
    skill_ref: SkillReferenceProtocol
    self_assessed_level: str | None
    featured: bool


class EducationProtocol(Protocol):
    school: str | None
    degree: str | None
    field_of_study: str | None
    start_date: Any | None
    end_date: Any | None
    description: str | None


class CertificationProtocol(Protocol):
    name: str | None
    issuer: str | None
    issue_date: Any | None
    expiry_date: Any | None
    credential_url: str | None


class LanguageProtocol(Protocol):
    name: str | None
    level: StrEnum | str | None


SKILL_KIND_LABELS = {
    "technical": "Technique",
    "functional": "Métier / fonctionnel",
    "sectoral": "Sectoriel",
    "methodology": "Méthodologie",
    "tool": "Outil / logiciel",
    "soft": "Soft skill",
}

AVAILABILITY_LABELS = {
    "available_now": "Disponible immédiatement",
    "available_from": "Disponible à partir du",
    "not_available": "Non disponible",
}

WORK_MODE_LABELS = {
    "remote": "Remote",
    "onsite": "Sur site",
    "hybrid": "Hybride",
}

MISSION_DURATION_LABELS = {
    "short": "Courte mission",
    "medium": "3 à 6 mois",
    "long": "6 mois et plus",
    "permanent": "Permanent",
}

CONTRACT_TYPE_LABELS = {
    "freelance": "Freelance",
    "cdi": "CDI",
    "both": "Freelance ou CDI",
}

LANGUAGE_LEVEL_LABELS = {
    "A1": "Débutant",
    "A2": "Élémentaire",
    "B1": "Intermédiaire",
    "B2": "Indépendant",
    "C1": "Avancé",
    "C2": "Maîtrise",
    "native": "Langue maternelle",
}


def fmt_date(d: date | None) -> str:
    return d.strftime("%m/%Y") if isinstance(d, date) else ""


def derive_years_of_experience(experiences: Sequence[ExperienceProtocol]) -> int | None:
    """Span in full years from the earliest start_date to the latest end (today if current)."""
    starts = [exp.start_date for exp in experiences if isinstance(exp.start_date, date)]
    if not starts:
        return None
    today = date.today()
    ends = [
        today if exp.is_current else exp.end_date
        for exp in experiences
        if exp.is_current or isinstance(exp.end_date, date)
    ]
    latest = max(ends, default=today)
    years = (latest - min(starts)).days // 365
    return max(years, 0)


def _enum_value(value: Any) -> str:
    if value is None:
        return ""
    raw = getattr(value, "value", value)
    return str(raw) if raw is not None else ""


def _label(value: Any, labels: dict[str, str]) -> str:
    raw = _enum_value(value)
    return labels.get(raw, raw.replace("_", " ").capitalize() if raw else "")


def _safe_sequence(value: Any) -> list[Any]:
    if value is None or isinstance(value, (str, bytes)):
        return []
    if isinstance(value, Iterable):
        return list(value)
    return []


def profile_flat(profile: CandidateProfileProtocol) -> dict[str, str]:
    return {
        "first_name": profile.first_name or "",
        "last_name": profile.last_name or "",
        "title": profile.title or "",
        "summary": profile.summary or "",
        "phone": profile.phone or "",
        "email_contact": profile.email_contact or "",
        "linkedin_url": profile.linkedin_url or "",
        "location": profile.location or "",
        "years_of_experience": str(profile.years_of_experience or ""),
        "daily_rate": str(profile.daily_rate or ""),
        "annual_salary": str(profile.annual_salary or ""),
        "availability_status": _enum_value(profile.availability_status),
        "availability_label": _label(profile.availability_status, AVAILABILITY_LABELS),
        "availability_date": fmt_date(profile.availability_date),
        "work_mode": _enum_value(profile.work_mode),
        "work_mode_label": _label(profile.work_mode, WORK_MODE_LABELS),
        "location_preference": profile.location_preference or "",
        "mission_duration": _enum_value(profile.mission_duration),
        "mission_duration_label": _label(profile.mission_duration, MISSION_DURATION_LABELS),
        "contract_type": _enum_value(profile.contract_type),
        "contract_type_label": _label(profile.contract_type, CONTRACT_TYPE_LABELS),
        "preferred_domains": ", ".join(profile.preferred_domains or []),
    }


def skill_flat(sk: SkillProtocol) -> dict[str, str]:
    return {
        "name": sk.skill_ref.name or "",
        "kind": _enum_value(sk.skill_ref.kind),
        "kind_label": _label(sk.skill_ref.kind, SKILL_KIND_LABELS),
        "level": sk.self_assessed_level or "",  # backward-compatible alias
        "self_assessed_level": sk.self_assessed_level or "",
        "featured": "true" if sk.featured else "false",
        "featured_label": "Clé" if sk.featured else "",
        "category": _enum_value(sk.skill_ref.kind),  # backward-compatible alias
        "level_rating": "",  # removed in evidence model
        "years_of_experience": "",  # removed in evidence model
    }


def usage_flat(usage: Any) -> dict[str, str]:
    skill_ref = usage.skill_ref
    return {
        "name": skill_ref.name or "",
        "kind": _enum_value(skill_ref.kind),
        "kind_label": _label(skill_ref.kind, SKILL_KIND_LABELS),
        "usage_role": _enum_value(getattr(usage, "usage_role", None)),
        "intensity": _enum_value(getattr(usage, "intensity", None)),
    }


def achievement_flat(achievement: Any) -> dict[str, Any]:
    skill_tags = [
        {
            "name": tag.skill_ref.name or "",
            "kind": _enum_value(tag.skill_ref.kind),
            "kind_label": _label(tag.skill_ref.kind, SKILL_KIND_LABELS),
        }
        for tag in _safe_sequence(getattr(achievement, "skill_tags", []))
    ]
    return {
        "description": achievement.description or "",
        "impact": achievement.impact or "",
        "skills": skill_tags,
    }


def education_flat(edu: EducationProtocol) -> dict[str, str]:
    start = fmt_date(edu.start_date)
    end = fmt_date(edu.end_date)
    return {
        "school": edu.school or "",
        "degree": edu.degree or "",
        "field_of_study": edu.field_of_study or "",
        "start_date": start,
        "end_date": end,
        "period": " - ".join(part for part in (start, end) if part),
        "description": edu.description or "",
    }


def certification_flat(cert: CertificationProtocol) -> dict[str, str]:
    issue = fmt_date(cert.issue_date)
    expiry = fmt_date(cert.expiry_date)
    return {
        "name": cert.name or "",
        "issuer": cert.issuer or "",
        "issue_date": issue,
        "expiry_date": expiry,
        "period": " - ".join(part for part in (issue, expiry) if part),
        "credential_url": cert.credential_url or "",
    }


def language_flat(language: LanguageProtocol) -> dict[str, str]:
    level = _enum_value(language.level)
    return {
        "name": language.name or "",
        "level": level,
        "level_label": LANGUAGE_LEVEL_LABELS.get(level, level),
    }


def _group_skill_dicts_by_kind(skills: Sequence[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    result: dict[str, list[dict[str, str]]] = {}
    for kind in SkillKind:
        result[f"skills_{kind.value}"] = [s for s in skills if s.get("kind") == kind.value]
    return result


def _group_skills_by_kind(
    skills: Sequence[SkillProtocol],
) -> dict[str, list[dict[str, str]]]:
    def _sort_key(s: SkillProtocol) -> int:
        return 0 if s.featured else 1

    result: dict[str, list[dict[str, str]]] = {}
    for kind in SkillKind:
        filtered = [s for s in skills if _enum_value(s.skill_ref.kind) == kind.value]
        result[f"skills_{kind.value}"] = [skill_flat(s) for s in sorted(filtered, key=_sort_key)]

    result["skills_featured"] = [skill_flat(s) for s in skills if s.featured]
    return result


def exp_flat(exp: ExperienceProtocol) -> dict[str, Any]:
    end = fmt_date(exp.end_date) if not exp.is_current else "présent"
    summary = exp.achievements_summary or ""
    skill_usages = [usage_flat(usage) for usage in _safe_sequence(getattr(exp, "skill_usages", []))]
    achievement_items = [
        achievement_flat(achievement)
        for achievement in _safe_sequence(getattr(exp, "achievements", []))
    ]
    return {
        "client_name": exp.client_name or "",
        "role": exp.role or "",
        "start_date": fmt_date(exp.start_date),
        "end_date": end,
        "description": exp.description or "",
        "context": exp.context or "",
        "achievements_summary": summary,
        "achievements": summary,  # backward-compatible alias for existing templates
        "achievement_items": achievement_items,
        "technologies": "",  # removed in evidence model
        "skills": skill_usages,
        "skill_usages": skill_usages,
        **_group_skill_dicts_by_kind(skill_usages),
    }


def generate_document(
    template_path: str,
    profile: CandidateProfileProtocol,
    experiences: Sequence[ExperienceProtocol],
    skills: Sequence[SkillProtocol],
    education: Sequence[EducationProtocol] | None = None,
    certifications: Sequence[CertificationProtocol] | None = None,
    languages: Sequence[LanguageProtocol] | None = None,
) -> bytes:
    """Render a docxtpl (Jinja2) Word template and return the result as bytes."""
    tpl = DocxTemplate(template_path)
    education_items = [education_flat(edu) for edu in education or []]
    certification_items = [certification_flat(cert) for cert in certifications or []]
    language_items = [language_flat(language) for language in languages or []]
    context: dict[str, Any] = {
        **profile_flat(profile),
        "experiences": [exp_flat(exp) for exp in experiences],
        "years_of_experience": str(
            profile.years_of_experience or derive_years_of_experience(experiences) or ""
        ),
        "skills": [skill_flat(sk) for sk in skills],
        "education": education_items,
        "educations": education_items,
        "certifications": certification_items,
        "languages": language_items,
        **_group_skills_by_kind(skills),
    }
    try:
        tpl.render(context, jinja_env=_JINJA_ENV)
    except (FileNotFoundError, zipfile.BadZipFile, PackageNotFoundError) as exc:
        raise ValueError(f"Template file unreadable: {template_path}") from exc
    except TemplateSyntaxError as exc:
        raise ValueError(f"Template contains invalid Jinja2 syntax: {exc.message}") from exc
    buf = io.BytesIO()
    tpl.save(buf)
    return buf.getvalue()
