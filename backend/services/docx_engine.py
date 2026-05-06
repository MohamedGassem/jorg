# backend/services/docx_engine.py
"""Pure document generation engine — no DB, no I/O, no side effects.

## Template syntax (docxtpl / Jinja2)

Simple field replacement:
    {{first_name}}  {{last_name}}  {{title}}  … (any profile field)

Experience block — paragraphs:
    {%p for exp in experiences %}
    {{exp.role}} — {{exp.client_name}}
    {%p endfor %}

Experience block — table rows (one row cloned per experience):
    ┌─────────────────────────────────────────┐  ← row with {%tr for exp in experiences %}
    │ {{exp.client_name}} │ {{exp.role}}       │  ← content row(s), cloned per item
    └─────────────────────────────────────────┘  ← row with {%tr endfor %}

Skill block — same pattern with `sk in skills`:
    {%p for sk in skills %}  /  {%tr for sk in skills %}

Conditional paragraphs:
    {%p if annual_salary %}Salaire : {{annual_salary}} €{%p endif %}

Available context variables:
    Profile fields (top-level):
        first_name, last_name, title, summary, phone, email_contact,
        linkedin_url, location, years_of_experience, daily_rate, annual_salary,
        availability_status, work_mode, location_preference, mission_duration,
        contract_type, preferred_domains

    experiences — list of dicts, each with:
        client_name, role, start_date, end_date, description,
        context, achievements, technologies

    skills — list of dicts, each with:
        name, category, level, level_rating, years_of_experience

Note: the `mappings` parameter is retained in the function signature for API
compatibility with existing callers; it is not used by the docxtpl renderer.
"""

from __future__ import annotations

import io
import warnings
import zipfile
from collections.abc import Sequence
from datetime import date
from enum import StrEnum
from typing import Any, Protocol

from docx.opc.exceptions import PackageNotFoundError
from docxtpl import DocxTemplate
from jinja2 import ChainableUndefined, Environment, TemplateSyntaxError

# Re-used across every render call — Environment construction is not free.
_JINJA_ENV = Environment(undefined=ChainableUndefined)


class ExperienceProtocol(Protocol):
    client_name: str | None
    role: str | None
    start_date: Any  # date
    end_date: Any | None  # date | None
    is_current: bool
    description: str | None
    context: str | None
    achievements: str | None
    technologies: list[str] | None


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
    work_mode: StrEnum | None
    location_preference: str | None
    mission_duration: StrEnum | None
    contract_type: StrEnum | None
    preferred_domains: list[str] | None


class SkillProtocol(Protocol):
    name: str | None
    category: StrEnum | None
    level: str | None
    level_rating: int | None
    years_of_experience: int | None


def fmt_date(d: date | None) -> str:
    return d.strftime("%m/%Y") if d else ""


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
        "availability_status": (
            str(profile.availability_status.value) if profile.availability_status else ""
        ),
        "work_mode": str(profile.work_mode.value) if profile.work_mode else "",
        "location_preference": profile.location_preference or "",
        "mission_duration": (
            str(profile.mission_duration.value) if profile.mission_duration else ""
        ),
        "contract_type": str(profile.contract_type.value) if profile.contract_type else "",
        "preferred_domains": ", ".join(profile.preferred_domains or []),
    }


def exp_flat(exp: ExperienceProtocol) -> dict[str, str]:
    """Flatten an experience to a plain dict for use as a Jinja2 loop variable.

    Keys are bare field names (e.g. ``client_name``), accessible in templates
    as ``{{exp.client_name}}`` inside a ``{%p for exp in experiences %}`` block.
    """
    end = fmt_date(exp.end_date) if not exp.is_current else "présent"
    return {
        "client_name": exp.client_name or "",
        "role": exp.role or "",
        "start_date": fmt_date(exp.start_date),
        "end_date": end,
        "description": exp.description or "",
        "context": exp.context or "",
        "achievements": exp.achievements or "",
        "technologies": ", ".join(exp.technologies or []),
    }


def skill_flat(sk: SkillProtocol) -> dict[str, str]:
    """Flatten a skill to a plain dict for use as a Jinja2 loop variable.

    Keys are bare field names (e.g. ``name``), accessible in templates
    as ``{{sk.name}}`` inside a ``{%p for sk in skills %}`` block.
    """
    return {
        "name": sk.name or "",
        "category": str(sk.category.value) if sk.category else "",
        "level": sk.level or "",
        "level_rating": str(sk.level_rating) if sk.level_rating else "",
        "years_of_experience": (str(sk.years_of_experience) if sk.years_of_experience else ""),
    }


def generate_document(
    template_path: str,
    profile: CandidateProfileProtocol,
    experiences: Sequence[ExperienceProtocol],
    skills: Sequence[SkillProtocol],
    mappings: dict[str, Any],
) -> bytes:
    """Render a docxtpl (Jinja2) Word template and return the result as bytes.

    Undefined variables render as empty strings rather than raising an error,
    which makes partial templates safe to render.

    Raises:
        ValueError: if the template file is missing/corrupt or contains invalid
            Jinja2 syntax.
    """
    if mappings:
        warnings.warn(
            "The 'mappings' argument is not used by the docxtpl engine and will be removed "
            "in a future release. Pass an empty dict or update the caller.",
            DeprecationWarning,
            stacklevel=2,
        )
    tpl = DocxTemplate(template_path)
    context: dict[str, Any] = {
        **profile_flat(profile),
        "experiences": [exp_flat(exp) for exp in experiences],
        "skills": [skill_flat(sk) for sk in skills],
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
