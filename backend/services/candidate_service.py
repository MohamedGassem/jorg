# backend/services/candidate_service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
    Skill,
)
from schemas.candidate import (
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationUpdate,
    EducationCreate,
    EducationUpdate,
    ExperienceCreate,
    ExperienceUpdate,
    LanguageCreate,
    LanguageUpdate,
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
