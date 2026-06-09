"""Backward-compatible imports for DOCX rendering services."""

from services.documents.docx_engine import (
    CandidateProfileProtocol as CandidateProfileProtocol,
)
from services.documents.docx_engine import (
    CertificationProtocol as CertificationProtocol,
)
from services.documents.docx_engine import (
    EducationProtocol as EducationProtocol,
)
from services.documents.docx_engine import (
    ExperienceProtocol as ExperienceProtocol,
)
from services.documents.docx_engine import (
    LanguageProtocol as LanguageProtocol,
)
from services.documents.docx_engine import (
    SkillProtocol as SkillProtocol,
)
from services.documents.docx_engine import (
    SkillReferenceProtocol as SkillReferenceProtocol,
)
from services.documents.docx_engine import (
    _group_skills_by_kind as _group_skills_by_kind,
)
from services.documents.docx_engine import (
    achievement_flat as achievement_flat,
)
from services.documents.docx_engine import (
    certification_flat as certification_flat,
)
from services.documents.docx_engine import (
    education_flat as education_flat,
)
from services.documents.docx_engine import (
    exp_flat as exp_flat,
)
from services.documents.docx_engine import (
    fmt_date as fmt_date,
)
from services.documents.docx_engine import (
    generate_document as generate_document,
)
from services.documents.docx_engine import (
    language_flat as language_flat,
)
from services.documents.docx_engine import (
    profile_flat as profile_flat,
)
from services.documents.docx_engine import (
    skill_flat as skill_flat,
)
from services.documents.docx_engine import (
    usage_flat as usage_flat,
)
