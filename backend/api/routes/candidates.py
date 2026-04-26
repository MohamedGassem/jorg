# backend/api/routes/candidates.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import services.candidate_service as candidate_service
import services.rgpd_service as rgpd_service
from api.deps import get_db, require_role
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
    Skill,
)
from models.user import User, UserRole
from schemas.rgpd import CandidateExport
from schemas.candidate import (
    CandidateProfileRead,
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationRead,
    CertificationUpdate,
    EducationCreate,
    EducationRead,
    EducationUpdate,
    ExperienceCreate,
    ExperienceRead,
    ExperienceUpdate,
    LanguageCreate,
    LanguageRead,
    LanguageUpdate,
    OrganizationInteractionCard,
    SkillCreate,
    SkillRead,
    SkillUpdate,
)

router = APIRouter(prefix="/candidates", tags=["candidates"])

CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


# ---- Profile ----------------------------------------------------------------


@router.get("/me/profile", response_model=CandidateProfileRead)
async def get_my_profile(current_user: CandidateUser, db: DB) -> CandidateProfile:
    return await candidate_service.get_or_create_profile(db, current_user.id)


@router.put("/me/profile", response_model=CandidateProfileRead)
async def update_my_profile(
    data: CandidateProfileUpdate,
    current_user: CandidateUser,
    db: DB,
) -> CandidateProfile:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    try:
        return await candidate_service.update_profile(db, profile, data)
    except ValueError as e:
        if str(e) == "availability_date_required":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="availability_date is required when availability_status is 'available_from'",
            )
        raise


# ---- Experiences ------------------------------------------------------------


@router.get("/me/experiences", response_model=list[ExperienceRead])
async def list_my_experiences(current_user: CandidateUser, db: DB) -> list[Experience]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_experiences(db, profile.id)


@router.post("/me/experiences", response_model=ExperienceRead, status_code=status.HTTP_201_CREATED)
async def create_my_experience(
    data: ExperienceCreate,
    current_user: CandidateUser,
    db: DB,
) -> Experience:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_experience(db, profile.id, data)


@router.put("/me/experiences/{experience_id}", response_model=ExperienceRead)
async def update_my_experience(
    experience_id: UUID,
    data: ExperienceUpdate,
    current_user: CandidateUser,
    db: DB,
) -> Experience:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    exp = await candidate_service.get_experience(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    return await candidate_service.update_experience(db, exp, data)


@router.delete("/me/experiences/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_experience(
    experience_id: UUID,
    current_user: CandidateUser,
    db: DB,
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    exp = await candidate_service.get_experience(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    await candidate_service.delete_experience(db, exp)


# ---- Skills -----------------------------------------------------------------


@router.get("/me/skills", response_model=list[SkillRead])
async def list_my_skills(current_user: CandidateUser, db: DB) -> list[Skill]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_skills(db, profile.id)


@router.post("/me/skills", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
async def create_my_skill(data: SkillCreate, current_user: CandidateUser, db: DB) -> Skill:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_skill(db, profile.id, data)


@router.put("/me/skills/{skill_id}", response_model=SkillRead)
async def update_my_skill(
    skill_id: UUID, data: SkillUpdate, current_user: CandidateUser, db: DB
) -> Skill:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    skill = await candidate_service.get_skill(db, skill_id, profile.id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    return await candidate_service.update_skill(db, skill, data)


@router.delete("/me/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_skill(skill_id: UUID, current_user: CandidateUser, db: DB) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    skill = await candidate_service.get_skill(db, skill_id, profile.id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    await candidate_service.delete_skill(db, skill)


# ---- Education --------------------------------------------------------------


@router.get("/me/education", response_model=list[EducationRead])
async def list_my_education(current_user: CandidateUser, db: DB) -> list[Education]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_education(db, profile.id)


@router.post("/me/education", response_model=EducationRead, status_code=status.HTTP_201_CREATED)
async def create_my_education(
    data: EducationCreate, current_user: CandidateUser, db: DB
) -> Education:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_education(db, profile.id, data)


@router.put("/me/education/{education_id}", response_model=EducationRead)
async def update_my_education(
    education_id: UUID,
    data: EducationUpdate,
    current_user: CandidateUser,
    db: DB,
) -> Education:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    edu = await candidate_service.get_education_item(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    return await candidate_service.update_education(db, edu, data)


@router.delete("/me/education/{education_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_education(education_id: UUID, current_user: CandidateUser, db: DB) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    edu = await candidate_service.get_education_item(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    await candidate_service.delete_education(db, edu)


# ---- Certifications ---------------------------------------------------------


@router.get("/me/certifications", response_model=list[CertificationRead])
async def list_my_certifications(current_user: CandidateUser, db: DB) -> list[Certification]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_certifications(db, profile.id)


@router.post(
    "/me/certifications",
    response_model=CertificationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_certification(
    data: CertificationCreate, current_user: CandidateUser, db: DB
) -> Certification:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_certification(db, profile.id, data)


@router.put("/me/certifications/{certification_id}", response_model=CertificationRead)
async def update_my_certification(
    certification_id: UUID,
    data: CertificationUpdate,
    current_user: CandidateUser,
    db: DB,
) -> Certification:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    cert = await candidate_service.get_certification(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="certification not found")
    return await candidate_service.update_certification(db, cert, data)


@router.delete("/me/certifications/{certification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_certification(
    certification_id: UUID, current_user: CandidateUser, db: DB
) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    cert = await candidate_service.get_certification(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="certification not found")
    await candidate_service.delete_certification(db, cert)


# ---- Languages --------------------------------------------------------------


@router.get("/me/languages", response_model=list[LanguageRead])
async def list_my_languages(current_user: CandidateUser, db: DB) -> list[Language]:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.list_languages(db, profile.id)


@router.post("/me/languages", response_model=LanguageRead, status_code=status.HTTP_201_CREATED)
async def create_my_language(data: LanguageCreate, current_user: CandidateUser, db: DB) -> Language:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    return await candidate_service.create_language(db, profile.id, data)


@router.put("/me/languages/{language_id}", response_model=LanguageRead)
async def update_my_language(
    language_id: UUID, data: LanguageUpdate, current_user: CandidateUser, db: DB
) -> Language:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    lang = await candidate_service.get_language(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    return await candidate_service.update_language(db, lang, data)


@router.delete("/me/languages/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_language(language_id: UUID, current_user: CandidateUser, db: DB) -> None:
    profile = await candidate_service.get_or_create_profile(db, current_user.id)
    lang = await candidate_service.get_language(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    await candidate_service.delete_language(db, lang)


# ---- RGPD -------------------------------------------------------------------


@router.get("/me/export", response_model=CandidateExport)
async def export_my_data(current_user: CandidateUser, db: DB) -> CandidateExport:
    return await rgpd_service.export_candidate_data(db, current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(current_user: CandidateUser, db: DB) -> None:
    await rgpd_service.delete_candidate_account(db, current_user)


# ---- Interaction timeline ---------------------------------------------------


@router.get("/me/organizations", response_model=list[OrganizationInteractionCard])
async def list_my_organizations(
    current_user: CandidateUser, db: DB
) -> list[OrganizationInteractionCard]:
    return await candidate_service.list_organization_interactions(
        db, current_user.id, current_user.email
    )
