from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from models.candidate_profile import AvailabilityStatus, ContractType, MissionDuration, WorkMode
from models.skill import SkillKind
from services.docx_engine import generate_document

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "builtin_templates"


@dataclass(frozen=True)
class BuiltinTemplate:
    key: str
    name: str
    description: str
    filename: str

    @property
    def word_file_path(self) -> str:
        return str(STATIC_DIR / self.filename)


BUILTIN_TEMPLATES: tuple[BuiltinTemplate, ...] = (
    BuiltinTemplate(
        key="compact_esn",
        name="Compact ESN",
        description="Profil court, lisible et efficace pour un premier envoi client.",
        filename="compact_esn.docx",
    ),
    BuiltinTemplate(
        key="dossier_technique",
        name="Dossier technique",
        description="Version detaillee avec missions, competences et environnement technique.",
        filename="dossier_technique.docx",
    ),
    BuiltinTemplate(
        key="profil_premium",
        name="Profil premium",
        description="Presentation plus soignee pour valoriser un profil senior ou rare.",
        filename="profil_premium.docx",
    ),
)


def list_builtin_templates() -> list[BuiltinTemplate]:
    return list(BUILTIN_TEMPLATES)


def get_builtin_template(key: str) -> BuiltinTemplate | None:
    return next((template for template in BUILTIN_TEMPLATES if template.key == key), None)


@dataclass
class _MockEnum:
    value: str


@dataclass
class _MockProfile:
    first_name: str | None = "Joris"
    last_name: str | None = "Martin"
    title: str | None = "Lead Product Engineer"
    summary: str | None = (
        "Consultant senior specialise dans la creation de plateformes SaaS, "
        "l'industrialisation produit et l'IA appliquee aux operations metier."
    )
    phone: str | None = "06 12 34 56 78"
    email_contact: str | None = "joris@jorg.example"
    linkedin_url: str | None = "https://linkedin.com/in/jorg-profile"
    location: str | None = "Paris"
    years_of_experience: int | None = 9
    daily_rate: int | None = 850
    annual_salary: int | None = None
    availability_status: Any = field(
        default_factory=lambda: _MockEnum(AvailabilityStatus.AVAILABLE_NOW.value)
    )
    work_mode: Any = field(default_factory=lambda: _MockEnum(WorkMode.HYBRID.value))
    location_preference: str | None = "Paris / remote"
    mission_duration: Any = field(default_factory=lambda: _MockEnum(MissionDuration.LONG.value))
    contract_type: Any = field(default_factory=lambda: _MockEnum(ContractType.FREELANCE.value))
    preferred_domains: list[str] | None = None


@dataclass
class _MockExperience:
    client_name: str | None
    role: str | None
    start_date: date
    end_date: date | None
    is_current: bool
    description: str | None
    context: str | None
    achievements_summary: str | None


@dataclass
class _MockSkillRef:
    name: str | None
    kind: Any


@dataclass
class _MockSkill:
    skill_ref: _MockSkillRef
    self_assessed_level: str | None
    featured: bool


def render_mock_preview(template: BuiltinTemplate) -> bytes:
    profile = _MockProfile(preferred_domains=["tech", "finance"])
    experiences = [
        _MockExperience(
            client_name="FlowUp",
            role="Lead Engineer",
            start_date=date(2023, 1, 1),
            end_date=None,
            is_current=True,
            description="Conception et livraison d'une plateforme de matching candidat-recruteur.",
            context=(
                "Produit SaaS B2B en phase alpha, avec enjeux de confidentialite "
                "et d'automatisation."
            ),
            achievements_summary=(
                "Reduction du temps de constitution d'un dossier de plusieurs heures "
                "a quelques minutes, avec generation Word standardisee."
            ),
        ),
        _MockExperience(
            client_name="Nova Consulting",
            role="Data Engineer",
            start_date=date(2020, 3, 1),
            end_date=date(2022, 12, 1),
            is_current=False,
            description="Industrialisation de pipelines data et accompagnement des equipes metier.",
            context="Programme de transformation data multi-equipes.",
            achievements_summary=(
                "Fiabilisation des traitements critiques et baisse de 35% des incidents."
            ),
        ),
    ]
    skills = [
        _MockSkill(_MockSkillRef("Python", _MockEnum(SkillKind.technical.value)), "avance", True),
        _MockSkill(_MockSkillRef("PostgreSQL", _MockEnum(SkillKind.tool.value)), "avance", True),
        _MockSkill(
            _MockSkillRef("Next.js", _MockEnum(SkillKind.tool.value)),
            "intermediaire",
            True,
        ),
        _MockSkill(
            _MockSkillRef("Architecture logicielle", _MockEnum(SkillKind.methodology.value)),
            "avance",
            True,
        ),
        _MockSkill(
            _MockSkillRef("Ateliers metier", _MockEnum(SkillKind.functional.value)),
            "",
            False,
        ),
    ]
    return generate_document(template.word_file_path, profile, experiences, skills)
