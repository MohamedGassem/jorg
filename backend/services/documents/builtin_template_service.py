from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, cast

from models.candidate_profile import (
    AvailabilityStatus,
    ContractType,
    LanguageLevel,
    MissionDuration,
    WorkMode,
)
from models.skill import SkillKind, UsageIntensity, UsageRole
from services.documents.docx_engine import (
    CertificationProtocol,
    EducationProtocol,
    LanguageProtocol,
    SkillProtocol,
    generate_document,
)

STATIC_DIR = Path(__file__).resolve().parents[2] / "static" / "builtin_templates"


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
        name="Synthèse",
        description="Format court et lisible, adapté à un premier envoi.",
        filename="compact_esn.docx",
    ),
    BuiltinTemplate(
        key="dossier_technique",
        name="Technique",
        description="Missions, compétences et environnement technique en détail.",
        filename="dossier_technique.docx",
    ),
    BuiltinTemplate(
        key="profil_premium",
        name="Présentation",
        description="Mise en page aérée orientée présentation client.",
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
    availability_date: date | None = None
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
    skill_usages: list[Any] = field(default_factory=list)
    achievements: list[Any] = field(default_factory=list)


@dataclass
class _MockSkillRef:
    name: str | None
    kind: Any


@dataclass
class _MockSkill:
    skill_ref: _MockSkillRef
    self_assessed_level: str | None
    featured: bool


@dataclass
class _MockExperienceSkillUsage:
    skill_ref: _MockSkillRef
    usage_role: Any = field(default_factory=lambda: _MockEnum(UsageRole.implementer.value))
    intensity: Any = field(default_factory=lambda: _MockEnum(UsageIntensity.secondary.value))


@dataclass
class _MockAchievementSkillTag:
    skill_ref: _MockSkillRef


@dataclass
class _MockAchievement:
    description: str
    impact: str | None = None
    skill_tags: list[_MockAchievementSkillTag] = field(default_factory=list)
    featured: bool = False


@dataclass
class _MockEducation:
    school: str
    degree: str | None
    field_of_study: str | None
    start_date: date | None
    end_date: date | None
    description: str | None = None


@dataclass
class _MockCertification:
    name: str
    issuer: str
    issue_date: date
    expiry_date: date | None = None
    credential_url: str | None = None


@dataclass
class _MockLanguage:
    name: str
    level: Any


def render_mock_preview(template: BuiltinTemplate) -> bytes:
    profile = _MockProfile(preferred_domains=["tech", "finance"])
    python_ref = _MockSkillRef("Python", _MockEnum(SkillKind.technical.value))
    postgres_ref = _MockSkillRef("PostgreSQL", _MockEnum(SkillKind.tool.value))
    next_ref = _MockSkillRef("Next.js", _MockEnum(SkillKind.tool.value))
    architecture_ref = _MockSkillRef(
        "Architecture logicielle", _MockEnum(SkillKind.methodology.value)
    )
    workshops_ref = _MockSkillRef("Ateliers metier", _MockEnum(SkillKind.functional.value))
    airflow_ref = _MockSkillRef("Airflow", _MockEnum(SkillKind.tool.value))
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
            skill_usages=[
                _MockExperienceSkillUsage(python_ref),
                _MockExperienceSkillUsage(postgres_ref),
                _MockExperienceSkillUsage(next_ref),
            ],
            achievements=[
                _MockAchievement(
                    "Mise en place du moteur de generation Word pour les dossiers candidats.",
                    "Generation en quelques minutes",
                    [_MockAchievementSkillTag(python_ref)],
                    featured=True,
                ),
                _MockAchievement(
                    "Structuration du parcours recruteur et candidat en alpha.",
                    "Meilleure lisibilite produit",
                    [_MockAchievementSkillTag(workshops_ref)],
                ),
            ],
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
            skill_usages=[
                _MockExperienceSkillUsage(python_ref),
                _MockExperienceSkillUsage(airflow_ref),
            ],
            achievements=[
                _MockAchievement(
                    "Industrialisation de pipelines data critiques.",
                    "35% d'incidents en moins",
                    [_MockAchievementSkillTag(airflow_ref)],
                )
            ],
        ),
    ]
    skills = [
        _MockSkill(python_ref, "avance", True),
        _MockSkill(postgres_ref, "avance", True),
        _MockSkill(next_ref, "intermediaire", True),
        _MockSkill(architecture_ref, "avance", True),
        _MockSkill(workshops_ref, "", False),
    ]
    education = [
        _MockEducation(
            "INSA Lyon",
            "Diplome d'ingenieur",
            "Informatique",
            date(2010, 9, 1),
            date(2015, 6, 1),
        )
    ]
    certifications = [
        _MockCertification(
            "AWS Solutions Architect Associate",
            "Amazon Web Services",
            date(2022, 5, 1),
        )
    ]
    languages = [
        _MockLanguage("Francais", _MockEnum(LanguageLevel.NATIVE.value)),
        _MockLanguage("Anglais", _MockEnum(LanguageLevel.C1.value)),
    ]
    return generate_document(
        template.word_file_path,
        profile,
        experiences,
        cast("list[SkillProtocol]", skills),
        cast("list[EducationProtocol]", education),
        cast("list[CertificationProtocol]", certifications),
        cast("list[LanguageProtocol]", languages),
    )
