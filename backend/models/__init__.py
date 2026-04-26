# backend/models/__init__.py
from models.base import Base
from models.candidate_profile import (
    AvailabilityStatus,
    CandidateProfile,
    Certification,
    ContractType,
    Education,
    Experience,
    Language,
    LanguageLevel,
    MissionDuration,
    Skill,
    SkillCategory,
    WorkMode,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.opportunity import Opportunity, OpportunityStatus, ShortlistEntry
from models.recruiter import Organization, RecruiterProfile
from models.template import Template
from models.user import OAuthProvider, User, UserRole

__all__ = [
    "AccessGrant",
    "AccessGrantStatus",
    "AvailabilityStatus",
    "Base",
    "CandidateProfile",
    "Certification",
    "ContractType",
    "Education",
    "Experience",
    "GeneratedDocument",
    "Invitation",
    "InvitationStatus",
    "Language",
    "LanguageLevel",
    "MissionDuration",
    "OAuthProvider",
    "Opportunity",
    "OpportunityStatus",
    "Organization",
    "RecruiterProfile",
    "ShortlistEntry",
    "Skill",
    "SkillCategory",
    "Template",
    "User",
    "UserRole",
    "WorkMode",
]
