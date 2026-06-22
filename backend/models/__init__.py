# backend/models/__init__.py
from models.alpha import AlphaInviteCode
from models.base import Base
from models.candidate_profile import (
    AvailabilityStatus,
    CandidateProfile,
    Certification,
    ContractType,
    CVExtractionProposal,
    CVExtractionStatus,
    Education,
    Experience,
    Language,
    LanguageLevel,
    LanguageReference,
    MissionDuration,
    Project,
    WorkMode,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.oauth_state import OAuthState
from models.opportunity import (
    Opportunity,
    OpportunitySkillRequirement,
    OpportunityStatus,
    ShortlistEntry,
)
from models.recruiter import Organization, RecruiterProfile
from models.refresh_token import RefreshToken as RefreshToken
from models.skill import (
    Achievement,
    CandidateSkill,
    EvidenceSource,
    ExperienceSkillUsage,
    ReviewStatus,
    SkillKind,
    SkillReference,
    UsageIntensity,
)
from models.template import Template
from models.user import OAuthProvider, User, UserRole

__all__ = [
    "AccessGrant",
    "AccessGrantStatus",
    "Achievement",
    "AlphaInviteCode",
    "AvailabilityStatus",
    "Base",
    "CVExtractionProposal",
    "CVExtractionStatus",
    "CandidateProfile",
    "CandidateSkill",
    "Certification",
    "ContractType",
    "Education",
    "EvidenceSource",
    "Experience",
    "ExperienceSkillUsage",
    "GeneratedDocument",
    "Invitation",
    "InvitationStatus",
    "Language",
    "LanguageLevel",
    "LanguageReference",
    "MissionDuration",
    "OAuthProvider",
    "OAuthState",
    "Opportunity",
    "OpportunitySkillRequirement",
    "OpportunityStatus",
    "Organization",
    "Project",
    "RecruiterProfile",
    "RefreshToken",
    "ReviewStatus",
    "ShortlistEntry",
    "SkillKind",
    "SkillReference",
    "Template",
    "UsageIntensity",
    "User",
    "UserRole",
    "WorkMode",
]
