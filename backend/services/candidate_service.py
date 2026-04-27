# backend/services/candidate_service.py
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
        raise ValueError("availability_date_required")
    for field, value in updates.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ---- Experience -------------------------------------------------------------


async def list_experiences(db: AsyncSession, profile_id: UUID) -> list[Experience]:
    result = await db.execute(select(Experience).where(Experience.profile_id == profile_id))
    return list(result.scalars().all())


async def create_experience(
    db: AsyncSession, profile_id: UUID, data: ExperienceCreate
) -> Experience:
    exp = Experience(profile_id=profile_id, **data.model_dump())
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


async def get_experience(
    db: AsyncSession, experience_id: UUID, profile_id: UUID
) -> Experience | None:
    result = await db.execute(
        select(Experience).where(
            Experience.id == experience_id,
            Experience.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_experience(
    db: AsyncSession, exp: Experience, data: ExperienceUpdate
) -> Experience:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(exp, field, value)
    await db.commit()
    await db.refresh(exp)
    return exp


async def delete_experience(db: AsyncSession, exp: Experience) -> None:
    await db.delete(exp)
    await db.commit()


# ---- Skill ------------------------------------------------------------------


async def list_skills(db: AsyncSession, profile_id: UUID) -> list[Skill]:
    result = await db.execute(select(Skill).where(Skill.profile_id == profile_id))
    return list(result.scalars().all())


async def create_skill(db: AsyncSession, profile_id: UUID, data: SkillCreate) -> Skill:
    skill = Skill(profile_id=profile_id, **data.model_dump())
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


async def get_skill(db: AsyncSession, skill_id: UUID, profile_id: UUID) -> Skill | None:
    result = await db.execute(
        select(Skill).where(Skill.id == skill_id, Skill.profile_id == profile_id)
    )
    return result.scalar_one_or_none()


async def update_skill(db: AsyncSession, skill: Skill, data: SkillUpdate) -> Skill:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    await db.commit()
    await db.refresh(skill)
    return skill


async def delete_skill(db: AsyncSession, skill: Skill) -> None:
    await db.delete(skill)
    await db.commit()


# ---- Education --------------------------------------------------------------


async def list_education(db: AsyncSession, profile_id: UUID) -> list[Education]:
    result = await db.execute(select(Education).where(Education.profile_id == profile_id))
    return list(result.scalars().all())


async def create_education(db: AsyncSession, profile_id: UUID, data: EducationCreate) -> Education:
    edu = Education(profile_id=profile_id, **data.model_dump())
    db.add(edu)
    await db.commit()
    await db.refresh(edu)
    return edu


async def get_education_item(
    db: AsyncSession, education_id: UUID, profile_id: UUID
) -> Education | None:
    result = await db.execute(
        select(Education).where(
            Education.id == education_id,
            Education.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_education(db: AsyncSession, edu: Education, data: EducationUpdate) -> Education:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(edu, field, value)
    await db.commit()
    await db.refresh(edu)
    return edu


async def delete_education(db: AsyncSession, edu: Education) -> None:
    await db.delete(edu)
    await db.commit()


# ---- Certification ----------------------------------------------------------


async def list_certifications(db: AsyncSession, profile_id: UUID) -> list[Certification]:
    result = await db.execute(select(Certification).where(Certification.profile_id == profile_id))
    return list(result.scalars().all())


async def create_certification(
    db: AsyncSession, profile_id: UUID, data: CertificationCreate
) -> Certification:
    cert = Certification(profile_id=profile_id, **data.model_dump())
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return cert


async def get_certification(
    db: AsyncSession, certification_id: UUID, profile_id: UUID
) -> Certification | None:
    result = await db.execute(
        select(Certification).where(
            Certification.id == certification_id,
            Certification.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_certification(
    db: AsyncSession, cert: Certification, data: CertificationUpdate
) -> Certification:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cert, field, value)
    await db.commit()
    await db.refresh(cert)
    return cert


async def delete_certification(db: AsyncSession, cert: Certification) -> None:
    await db.delete(cert)
    await db.commit()


# ---- Language ---------------------------------------------------------------


async def list_languages(db: AsyncSession, profile_id: UUID) -> list[Language]:
    result = await db.execute(select(Language).where(Language.profile_id == profile_id))
    return list(result.scalars().all())


async def create_language(db: AsyncSession, profile_id: UUID, data: LanguageCreate) -> Language:
    lang = Language(profile_id=profile_id, **data.model_dump())
    db.add(lang)
    await db.commit()
    await db.refresh(lang)
    return lang


async def get_language(db: AsyncSession, language_id: UUID, profile_id: UUID) -> Language | None:
    result = await db.execute(
        select(Language).where(
            Language.id == language_id,
            Language.profile_id == profile_id,
        )
    )
    return result.scalar_one_or_none()


async def update_language(db: AsyncSession, lang: Language, data: LanguageUpdate) -> Language:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lang, field, value)
    await db.commit()
    await db.refresh(lang)
    return lang


async def delete_language(db: AsyncSession, lang: Language) -> None:
    await db.delete(lang)
    await db.commit()


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
    doc_rows = []
    if grant_ids:
        doc_result = await db.execute(
            select(GeneratedDocument, Template)
            .join(Template, Template.id == GeneratedDocument.template_id)
            .where(GeneratedDocument.access_grant_id.in_(grant_ids))
        )
        doc_rows = doc_result.all()

    orgs: dict[str, dict] = {}

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
        oid = grant_org_map.get(str(doc.access_grant_id))
        if oid and oid in orgs:
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
