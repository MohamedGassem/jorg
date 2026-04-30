# backend/services/candidate_service.py
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Row, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import BusinessRuleError
from models.candidate_profile import (
    AvailabilityStatus as _AvailabilityStatus,
)
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
    Skill,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization
from models.template import Template
from schemas.candidate import (
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationUpdate,
    EducationCreate,
    EducationUpdate,
    ExperienceCreate,
    ExperienceUpdate,
    InteractionEvent,
    InteractionEventMetadata,
    LanguageCreate,
    LanguageUpdate,
    OrganizationInteractionCard,
    SkillCreate,
    SkillUpdate,
)
from services.base_crud import CRUDService

# ---- Per-model CRUD instances -----------------------------------------------

experience_crud: CRUDService[Experience] = CRUDService(Experience, "profile_id")
skill_crud: CRUDService[Skill] = CRUDService(Skill, "profile_id")
education_crud: CRUDService[Education] = CRUDService(Education, "profile_id")
certification_crud: CRUDService[Certification] = CRUDService(Certification, "profile_id")
language_crud: CRUDService[Language] = CRUDService(Language, "profile_id")

# ---- CandidateProfile -------------------------------------------------------


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> CandidateProfile:
    result = await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = CandidateProfile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    profile: CandidateProfile,
    data: CandidateProfileUpdate,
) -> CandidateProfile:
    updates = data.model_dump(exclude_unset=True)
    new_status = updates.get("availability_status", profile.availability_status)
    new_date = updates.get("availability_date", profile.availability_date)
    if new_status == _AvailabilityStatus.AVAILABLE_FROM and new_date is None:
        raise BusinessRuleError(
            "availability_date is required when availability_status is 'available_from'"
        )
    for field, value in updates.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ---- Convenience shims (keep existing route call-sites unchanged) ------------


async def list_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    return await experience_crud.list(db, profile_id)


async def create_experience(
    db: AsyncSession, profile_id: UUID, data: ExperienceCreate
) -> Experience:
    return await experience_crud.create(db, profile_id, data)


async def get_experience(
    db: AsyncSession, experience_id: UUID, profile_id: UUID
) -> Experience | None:
    return await experience_crud.get(db, experience_id, profile_id)


async def update_experience(
    db: AsyncSession, exp: Experience, data: ExperienceUpdate
) -> Experience:
    return await experience_crud.update(db, exp, data)


async def delete_experience(db: AsyncSession, exp: Experience) -> None:
    return await experience_crud.delete(db, exp)


async def list_skills(db: AsyncSession, profile_id: UUID) -> list[Skill]:
    return await skill_crud.list(db, profile_id)


async def create_skill(db: AsyncSession, profile_id: UUID, data: SkillCreate) -> Skill:
    return await skill_crud.create(db, profile_id, data)


async def get_skill(db: AsyncSession, skill_id: UUID, profile_id: UUID) -> Skill | None:
    return await skill_crud.get(db, skill_id, profile_id)


async def update_skill(db: AsyncSession, skill: Skill, data: SkillUpdate) -> Skill:
    return await skill_crud.update(db, skill, data)


async def delete_skill(db: AsyncSession, skill: Skill) -> None:
    return await skill_crud.delete(db, skill)


async def list_education(db: AsyncSession, profile_id: UUID) -> list[Education]:
    return await education_crud.list(db, profile_id)


async def create_education(db: AsyncSession, profile_id: UUID, data: EducationCreate) -> Education:
    return await education_crud.create(db, profile_id, data)


async def get_education_item(
    db: AsyncSession, education_id: UUID, profile_id: UUID
) -> Education | None:
    return await education_crud.get(db, education_id, profile_id)


async def update_education(db: AsyncSession, edu: Education, data: EducationUpdate) -> Education:
    return await education_crud.update(db, edu, data)


async def delete_education(db: AsyncSession, edu: Education) -> None:
    return await education_crud.delete(db, edu)


async def list_certifications(db: AsyncSession, profile_id: UUID) -> list[Certification]:
    return await certification_crud.list(db, profile_id)


async def create_certification(
    db: AsyncSession, profile_id: UUID, data: CertificationCreate
) -> Certification:
    return await certification_crud.create(db, profile_id, data)


async def get_certification(
    db: AsyncSession, certification_id: UUID, profile_id: UUID
) -> Certification | None:
    return await certification_crud.get(db, certification_id, profile_id)


async def update_certification(
    db: AsyncSession, cert: Certification, data: CertificationUpdate
) -> Certification:
    return await certification_crud.update(db, cert, data)


async def delete_certification(db: AsyncSession, cert: Certification) -> None:
    return await certification_crud.delete(db, cert)


async def list_languages(db: AsyncSession, profile_id: UUID) -> list[Language]:
    return await language_crud.list(db, profile_id)


async def create_language(db: AsyncSession, profile_id: UUID, data: LanguageCreate) -> Language:
    return await language_crud.create(db, profile_id, data)


async def get_language(db: AsyncSession, language_id: UUID, profile_id: UUID) -> Language | None:
    return await language_crud.get(db, language_id, profile_id)


async def update_language(db: AsyncSession, lang: Language, data: LanguageUpdate) -> Language:
    return await language_crud.update(db, lang, data)


async def delete_language(db: AsyncSession, lang: Language) -> None:
    return await language_crud.delete(db, lang)


# ---- Interaction timeline ---------------------------------------------------

_INVITATION_EVENT_TYPE = {
    InvitationStatus.PENDING: "invitation_sent",
    InvitationStatus.ACCEPTED: "invitation_accepted",
    InvitationStatus.REJECTED: "invitation_rejected",
    InvitationStatus.EXPIRED: "invitation_expired",
}


async def list_organization_interactions(
    db: AsyncSession, user_id: UUID, user_email: str
) -> list[OrganizationInteractionCard]:
    inv_result = await db.execute(
        select(Invitation, Organization)
        .join(Organization, Organization.id == Invitation.organization_id)
        .where(
            or_(
                Invitation.candidate_id == user_id,
                Invitation.candidate_email == user_email,
            )
        )
    )
    invitations = inv_result.all()

    grant_result = await db.execute(
        select(AccessGrant, Organization)
        .join(Organization, Organization.id == AccessGrant.organization_id)
        .where(AccessGrant.candidate_id == user_id)
    )
    grants = grant_result.all()

    grant_ids = [g.AccessGrant.id for g in grants]
    doc_rows: list[Row[tuple[GeneratedDocument, Template]]] = []
    if grant_ids:
        doc_result = await db.execute(
            select(GeneratedDocument, Template)
            .join(Template, Template.id == GeneratedDocument.template_id)
            .where(GeneratedDocument.access_grant_id.in_(grant_ids))
        )
        doc_rows = list(doc_result.all())

    orgs: dict[str, dict[str, Any]] = {}

    for inv, org in invitations:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        orgs[oid]["events"].append(
            InteractionEvent(
                type=_INVITATION_EVENT_TYPE[inv.status],
                occurred_at=inv.created_at,
            )
        )

    for grant, org in grants:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        orgs[oid]["grants"].append(grant)
        orgs[oid]["events"].append(
            InteractionEvent(type="access_granted", occurred_at=grant.granted_at)
        )
        if grant.status == AccessGrantStatus.REVOKED and grant.revoked_at:
            orgs[oid]["events"].append(
                InteractionEvent(type="access_revoked", occurred_at=grant.revoked_at)
            )

    grant_org_map = {str(g.AccessGrant.id): str(org.id) for g, org in grants}
    for doc, tmpl in doc_rows:
        doc_oid = grant_org_map.get(str(doc.access_grant_id))
        if doc_oid and doc_oid in orgs:
            oid = doc_oid
            orgs[oid]["events"].append(
                InteractionEvent(
                    type="document_generated",
                    occurred_at=doc.generated_at,
                    metadata=InteractionEventMetadata(
                        template_name=tmpl.name,
                        file_format=doc.file_format,
                    ),
                )
            )

    result: list[OrganizationInteractionCard] = []
    for oid, data in orgs.items():
        org = data["org"]
        org_grants: list[AccessGrant] = data["grants"]
        events: list[InteractionEvent] = sorted(data["events"], key=lambda e: e.occurred_at)

        active_grant = next((g for g in org_grants if g.status == AccessGrantStatus.ACTIVE), None)
        revoked_grant = next((g for g in org_grants if g.status == AccessGrantStatus.REVOKED), None)

        if active_grant:
            status_val = "active"
        elif revoked_grant:
            status_val = "revoked"
        else:
            org_invs = [inv for inv, o in invitations if str(o.id) == oid]
            has_pending = any(i.status == InvitationStatus.PENDING for i in org_invs)
            status_val = "invited" if has_pending else "expired"

        result.append(
            OrganizationInteractionCard(
                organization_id=org.id,
                organization_name=org.name,
                logo_url=getattr(org, "logo_url", None),
                current_status=status_val,
                events=events,
            )
        )

    result.sort(
        key=lambda c: c.events[-1].occurred_at if c.events else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return result
