# backend/api/routes/candidates.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import services.candidate_service as candidate_service
import services.rgpd_service as rgpd_service
from api.deps import CandidateProfile_dep, get_db, require_role
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
    Skill,
)
from models.user import User, UserRole
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
from schemas.rgpd import CandidateExport

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
    return await candidate_service.update_profile(db, profile, data)


# ---- Experiences ------------------------------------------------------------


@router.get("/me/experiences", response_model=list[ExperienceRead])
async def list_my_experiences(profile: CandidateProfile_dep, db: DB) -> list[Experience]:
    return await candidate_service.list_experiences(db, profile.id)


@router.post("/me/experiences", response_model=ExperienceRead, status_code=status.HTTP_201_CREATED)
async def create_my_experience(
    data: ExperienceCreate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Experience:
    return await candidate_service.create_experience(db, profile.id, data)


@router.put("/me/experiences/{experience_id}", response_model=ExperienceRead)
async def update_my_experience(
    experience_id: UUID,
    data: ExperienceUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Experience:
    exp = await candidate_service.get_experience(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    return await candidate_service.update_experience(db, exp, data)


@router.delete("/me/experiences/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_experience(
    experience_id: UUID,
    profile: CandidateProfile_dep,
    db: DB,
) -> None:
    exp = await candidate_service.get_experience(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    await candidate_service.delete_experience(db, exp)


# ---- Skills -----------------------------------------------------------------


@router.get("/me/skills", response_model=list[SkillRead])
async def list_my_skills(profile: CandidateProfile_dep, db: DB) -> list[Skill]:
    return await candidate_service.list_skills(db, profile.id)


@router.post("/me/skills", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
async def create_my_skill(data: SkillCreate, profile: CandidateProfile_dep, db: DB) -> Skill:
    return await candidate_service.create_skill(db, profile.id, data)


@router.put("/me/skills/{skill_id}", response_model=SkillRead)
async def update_my_skill(
    skill_id: UUID, data: SkillUpdate, profile: CandidateProfile_dep, db: DB
) -> Skill:
    skill = await candidate_service.get_skill(db, skill_id, profile.id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    return await candidate_service.update_skill(db, skill, data)


@router.delete("/me/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_skill(skill_id: UUID, profile: CandidateProfile_dep, db: DB) -> None:
    skill = await candidate_service.get_skill(db, skill_id, profile.id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    await candidate_service.delete_skill(db, skill)


# ---- Education --------------------------------------------------------------


@router.get("/me/education", response_model=list[EducationRead])
async def list_my_education(profile: CandidateProfile_dep, db: DB) -> list[Education]:
    return await candidate_service.list_education(db, profile.id)


@router.post("/me/education", response_model=EducationRead, status_code=status.HTTP_201_CREATED)
async def create_my_education(
    data: EducationCreate, profile: CandidateProfile_dep, db: DB
) -> Education:
    return await candidate_service.create_education(db, profile.id, data)


@router.put("/me/education/{education_id}", response_model=EducationRead)
async def update_my_education(
    education_id: UUID,
    data: EducationUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Education:
    edu = await candidate_service.get_education_item(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    return await candidate_service.update_education(db, edu, data)


@router.delete("/me/education/{education_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_education(education_id: UUID, profile: CandidateProfile_dep, db: DB) -> None:
    edu = await candidate_service.get_education_item(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    await candidate_service.delete_education(db, edu)


# ---- Certifications ---------------------------------------------------------


@router.get("/me/certifications", response_model=list[CertificationRead])
async def list_my_certifications(profile: CandidateProfile_dep, db: DB) -> list[Certification]:
    return await candidate_service.list_certifications(db, profile.id)


@router.post(
    "/me/certifications",
    response_model=CertificationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_certification(
    data: CertificationCreate, profile: CandidateProfile_dep, db: DB
) -> Certification:
    return await candidate_service.create_certification(db, profile.id, data)


@router.put("/me/certifications/{certification_id}", response_model=CertificationRead)
async def update_my_certification(
    certification_id: UUID,
    data: CertificationUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Certification:
    cert = await candidate_service.get_certification(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="certification not found")
    return await candidate_service.update_certification(db, cert, data)


@router.delete("/me/certifications/{certification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_certification(
    certification_id: UUID, profile: CandidateProfile_dep, db: DB
) -> None:
    cert = await candidate_service.get_certification(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="certification not found")
    await candidate_service.delete_certification(db, cert)


# ---- Languages --------------------------------------------------------------


@router.get("/me/languages", response_model=list[LanguageRead])
async def list_my_languages(profile: CandidateProfile_dep, db: DB) -> list[Language]:
    return await candidate_service.list_languages(db, profile.id)


@router.post("/me/languages", response_model=LanguageRead, status_code=status.HTTP_201_CREATED)
async def create_my_language(
    data: LanguageCreate, profile: CandidateProfile_dep, db: DB
) -> Language:
    return await candidate_service.create_language(db, profile.id, data)


@router.put("/me/languages/{language_id}", response_model=LanguageRead)
async def update_my_language(
    language_id: UUID, data: LanguageUpdate, profile: CandidateProfile_dep, db: DB
) -> Language:
    lang = await candidate_service.get_language(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    return await candidate_service.update_language(db, lang, data)


@router.delete("/me/languages/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_language(language_id: UUID, profile: CandidateProfile_dep, db: DB) -> None:
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
