# backend/services/rgpd_service.py
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization, RecruiterProfile
from models.skill import Achievement, AchievementSkillTag, CandidateSkill, ExperienceSkillUsage
from models.user import User
from schemas.candidate import (
    CandidateProfileRead,
    CertificationRead,
    EducationRead,
    ExperienceRead,
    LanguageRead,
)
from schemas.rgpd import (
    AccessGrantExport,
    CandidateExport,
    GeneratedDocumentExport,
    OrganizationExport,
    RecruiterExport,
)
from schemas.skill import CandidateSkillRead


async def export_candidate_data(db: AsyncSession, user: User) -> CandidateExport:
    """Assemble l'intégralité des données personnelles d'un candidat.

    N'écrit rien en DB. Lecture seule.
    """
    profile_q = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user.id)
    )
    profile = profile_q.scalar_one_or_none()

    if profile is not None:
        exp_q = await db.execute(
            select(Experience)
            .where(Experience.profile_id == profile.id)
            .options(
                selectinload(Experience.achievements)
                .selectinload(Achievement.skill_tags)
                .selectinload(AchievementSkillTag.skill_ref),
                selectinload(Experience.skill_usages).selectinload(ExperienceSkillUsage.skill_ref),
            )
        )
        skill_q = await db.execute(
            select(CandidateSkill)
            .where(CandidateSkill.candidate_id == profile.id)
            .options(selectinload(CandidateSkill.skill_ref))
        )
        edu_q = await db.execute(select(Education).where(Education.profile_id == profile.id))
        cert_q = await db.execute(
            select(Certification).where(Certification.profile_id == profile.id)
        )
        lang_q = await db.execute(select(Language).where(Language.profile_id == profile.id))
        experiences = list(exp_q.scalars().all())
        skills = list(skill_q.scalars().all())
        education = list(edu_q.scalars().all())
        certifications = list(cert_q.scalars().all())
        languages = list(lang_q.scalars().all())
    else:
        experiences = []
        skills = []
        education = []
        certifications = []
        languages = []

    grant_q = await db.execute(select(AccessGrant).where(AccessGrant.candidate_id == user.id))
    grants = list(grant_q.scalars().all())

    doc_q = await db.execute(
        select(GeneratedDocument)
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .where(AccessGrant.candidate_id == user.id)
    )
    documents = list(doc_q.scalars().all())

    return CandidateExport(
        exported_at=datetime.now(UTC),
        user_id=user.id,
        email=user.email,
        role=user.role.value,
        created_at=user.created_at,
        consented_at=user.consented_at,
        consent_version=user.consent_version,
        profile=CandidateProfileRead.model_validate(profile) if profile else None,
        experiences=[ExperienceRead.model_validate(e) for e in experiences],
        skills=[CandidateSkillRead.model_validate(s) for s in skills],
        education=[EducationRead.model_validate(e) for e in education],
        certifications=[CertificationRead.model_validate(c) for c in certifications],
        languages=[LanguageRead.model_validate(lang) for lang in languages],
        access_grants=[AccessGrantExport.model_validate(g) for g in grants],
        generated_documents=[GeneratedDocumentExport.model_validate(d) for d in documents],
    )


async def delete_candidate_account(db: AsyncSession, user: User) -> None:
    """Supprime un candidat en respectant les règles RGPD :

    1. Révoque toutes les `AccessGrant` actives et les anonymise
       (`candidate_id = NULL`) pour préserver l'historique recruteur.
    2. Marque les `Invitation` pending le ciblant (par email ou par id)
       comme `expired`.
    3. Supprime l'utilisateur — la cascade SQL s'occupe du profil,
       experiences, skills, education, certifications, languages.
    4. Les `GeneratedDocument` restent rattachés aux grants (désormais
       anonymisés) : le recruteur conserve son audit sans pouvoir relier
       le document à une identité candidat.

    Tout se passe dans une transaction interne qui est commitée à la fin.
    """
    now = datetime.now(UTC)

    # 1. Anonymiser + révoquer les grants.
    await db.execute(
        update(AccessGrant)
        .where(AccessGrant.candidate_id == user.id)
        .values(
            status=AccessGrantStatus.REVOKED,
            revoked_at=now,
            candidate_id=None,
        )
    )

    # 2. Invitations pending → expired (par candidate_id ET par email,
    #    car certaines invitations peuvent ne pas avoir été liées au user).
    await db.execute(
        update(Invitation)
        .where(
            Invitation.status == InvitationStatus.PENDING,
            (Invitation.candidate_id == user.id) | (Invitation.candidate_email == user.email),
        )
        .values(status=InvitationStatus.EXPIRED)
    )

    # 3. Supprimer l'utilisateur — CASCADE SQL s'occupe du reste.
    await db.delete(user)
    await db.flush()


async def export_recruiter_data(db: AsyncSession, user: User) -> RecruiterExport:
    """Assemble les données personnelles d'un recruteur.

    N'écrit rien en DB. Lecture seule.
    """
    profile_q = await db.execute(
        select(RecruiterProfile).where(RecruiterProfile.user_id == user.id)
    )
    profile = profile_q.scalar_one_or_none()

    organization = None
    if profile is not None and profile.organization_id is not None:
        org_q = await db.execute(
            select(Organization).where(Organization.id == profile.organization_id)
        )
        organization = org_q.scalar_one_or_none()

    doc_q = await db.execute(
        select(GeneratedDocument).where(GeneratedDocument.generated_by_user_id == user.id)
    )
    documents = list(doc_q.scalars().all())

    return RecruiterExport(
        exported_at=datetime.now(UTC),
        user_id=user.id,
        email=user.email,
        role=user.role.value,
        created_at=user.created_at,
        consented_at=user.consented_at,
        consent_version=user.consent_version,
        first_name=profile.first_name if profile else None,
        last_name=profile.last_name if profile else None,
        job_title=profile.job_title if profile else None,
        organization=OrganizationExport.model_validate(organization) if organization else None,
        generated_documents=[GeneratedDocumentExport.model_validate(d) for d in documents],
    )


async def delete_recruiter_account(db: AsyncSession, user: User) -> None:
    """Supprime un recruteur.

    Les contraintes FK gèrent les effets de bord :
    - `RecruiterProfile.user_id` → CASCADE : le profil recruteur est supprimé.
    - `GeneratedDocument.generated_by_user_id` → SET NULL : les dossiers générés
      restent pour l'audit, l'attribution est anonymisée.
    - L'organisation et ses autres membres survivent (aucune FK supprimée côté orga).
    """
    await db.delete(user)
    await db.flush()
