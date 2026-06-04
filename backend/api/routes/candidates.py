# backend/api/routes/candidates.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import services.candidate_service as candidate_service
import services.cv_parser_service as cv_parser_service
import services.rgpd_service as rgpd_service
from api.deps import CandidateProfile_dep, get_db, require_role
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
)
from models.skill import Achievement, AchievementSkillTag, ExperienceSkillUsage
from models.user import User, UserRole
from schemas.candidate import (
    CandidateProfileRead,
    CandidateProfileUpdate,
    CertificationCreate,
    CertificationRead,
    CertificationUpdate,
    CVParseResult,
    CVSkillSuggestion,
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
    validate_certification_dates,
    validate_education_dates,
    validate_experience_dates,
)
from schemas.rgpd import CandidateExport

router = APIRouter(prefix="/candidates", tags=["candidates"])

CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]

_EXP_OPTIONS = [
    selectinload(Experience.achievements)
    .selectinload(Achievement.skill_tags)
    .selectinload(AchievementSkillTag.skill_ref),
    selectinload(Experience.skill_usages).selectinload(ExperienceSkillUsage.skill_ref),
]


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


@router.post("/me/parse-cv", response_model=CVParseResult)
async def parse_my_cv(
    request: Request,
    current_user: CandidateUser,
    db: DB,
    file: Annotated[UploadFile, File()],
) -> CVParseResult:
    """Parse an uploaded CV (PDF/DOCX/TXT) into profile pre-fill suggestions.

    Read-only: returns extracted contact details and matched ESCO skills; it
    never mutates the profile — the candidate confirms the suggestions client-side.
    """
    # Read at most MAX_CV_BYTES + 1 so an oversized upload never inflates a
    # multi-MB bytes object in the handler before we reject it.
    data = await file.read(cv_parser_service.MAX_CV_BYTES + 1)
    if len(data) > cv_parser_service.MAX_CV_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Le fichier dépasse la taille maximale de 5 Mo.",
        )

    # Shared catalogue index built at startup; falls back to a DB build if the
    # lifespan did not run (e.g. under the test ASGI transport).
    index = getattr(request.app.state, "skill_index", None)
    try:
        parsed = await cv_parser_service.parse_cv(file.filename or "", data, db, index=index)
    except cv_parser_service.CVTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Le fichier dépasse la taille maximale de 5 Mo.",
        ) from e
    except cv_parser_service.UnsupportedCVFormatError as e:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(e),
        ) from e
    except cv_parser_service.CVTextExtractionError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    skills = [
        CVSkillSuggestion(skill_ref_id=ref.id, name=ref.name, kind=ref.kind)
        for ref in parsed["skills"]
    ]
    return CVParseResult(
        email=parsed["email"],
        phone=parsed["phone"],
        linkedin_url=parsed["linkedin_url"],
        skills=skills,
    )


# ---- Experiences ------------------------------------------------------------


@router.get("/me/experiences", response_model=list[ExperienceRead])
async def list_my_experiences(profile: CandidateProfile_dep, db: DB) -> list[Experience]:
    result = await db.execute(
        select(Experience).where(Experience.profile_id == profile.id).options(*_EXP_OPTIONS)
    )
    return list(result.scalars().all())


@router.post("/me/experiences", response_model=ExperienceRead, status_code=status.HTTP_201_CREATED)
async def create_my_experience(
    data: ExperienceCreate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Experience:
    validate_experience_dates(data.start_date, data.end_date, data.is_current)
    exp = await candidate_service.experience_crud.create(db, profile.id, data)
    result = await db.execute(
        select(Experience).where(Experience.id == exp.id).options(*_EXP_OPTIONS)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="experience unavailable after create",
        )
    return row


@router.put("/me/experiences/{experience_id}", response_model=ExperienceRead)
async def update_my_experience(
    experience_id: UUID,
    data: ExperienceUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Experience:
    exp = await candidate_service.experience_crud.get(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    merged_start = data.start_date if data.start_date is not None else exp.start_date
    merged_end = data.end_date if "end_date" in data.model_fields_set else exp.end_date
    merged_current = data.is_current if data.is_current is not None else exp.is_current
    validate_experience_dates(merged_start, merged_end, merged_current)
    await candidate_service.experience_crud.update(db, exp, data)
    result = await db.execute(
        select(Experience).where(Experience.id == experience_id).options(*_EXP_OPTIONS)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="experience not found after update",
        )
    return row


@router.delete("/me/experiences/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_experience(
    experience_id: UUID,
    profile: CandidateProfile_dep,
    db: DB,
) -> None:
    exp = await candidate_service.experience_crud.get(db, experience_id, profile.id)
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    await candidate_service.experience_crud.delete(db, exp)


# ---- Education --------------------------------------------------------------


@router.get("/me/education", response_model=list[EducationRead])
async def list_my_education(profile: CandidateProfile_dep, db: DB) -> list[Education]:
    return await candidate_service.list_education(db, profile.id)


@router.post("/me/education", response_model=EducationRead, status_code=status.HTTP_201_CREATED)
async def create_my_education(
    data: EducationCreate, profile: CandidateProfile_dep, db: DB
) -> Education:
    validate_education_dates(data.start_date, data.end_date)
    return await candidate_service.education_crud.create(db, profile.id, data)


@router.put("/me/education/{education_id}", response_model=EducationRead)
async def update_my_education(
    education_id: UUID,
    data: EducationUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Education:
    edu = await candidate_service.education_crud.get(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    merged_start = data.start_date if data.start_date is not None else edu.start_date
    merged_end = data.end_date if "end_date" in data.model_fields_set else edu.end_date
    validate_education_dates(merged_start, merged_end)
    return await candidate_service.education_crud.update(db, edu, data)


@router.delete("/me/education/{education_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_education(education_id: UUID, profile: CandidateProfile_dep, db: DB) -> None:
    edu = await candidate_service.education_crud.get(db, education_id, profile.id)
    if edu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="education not found")
    await candidate_service.education_crud.delete(db, edu)


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
    validate_certification_dates(data.issue_date, data.expiry_date)
    return await candidate_service.certification_crud.create(db, profile.id, data)


@router.put("/me/certifications/{certification_id}", response_model=CertificationRead)
async def update_my_certification(
    certification_id: UUID,
    data: CertificationUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> Certification:
    cert = await candidate_service.certification_crud.get(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="certification not found")
    merged_issue = data.issue_date if data.issue_date is not None else cert.issue_date
    merged_expiry = data.expiry_date if "expiry_date" in data.model_fields_set else cert.expiry_date
    validate_certification_dates(merged_issue, merged_expiry)
    return await candidate_service.certification_crud.update(db, cert, data)


@router.delete("/me/certifications/{certification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_certification(
    certification_id: UUID, profile: CandidateProfile_dep, db: DB
) -> None:
    cert = await candidate_service.certification_crud.get(db, certification_id, profile.id)
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="certification not found")
    await candidate_service.certification_crud.delete(db, cert)


# ---- Languages --------------------------------------------------------------


@router.get("/me/languages", response_model=list[LanguageRead])
async def list_my_languages(profile: CandidateProfile_dep, db: DB) -> list[Language]:
    return await candidate_service.list_languages(db, profile.id)


@router.post("/me/languages", response_model=LanguageRead, status_code=status.HTTP_201_CREATED)
async def create_my_language(
    data: LanguageCreate, profile: CandidateProfile_dep, db: DB
) -> Language:
    return await candidate_service.language_crud.create(db, profile.id, data)


@router.put("/me/languages/{language_id}", response_model=LanguageRead)
async def update_my_language(
    language_id: UUID, data: LanguageUpdate, profile: CandidateProfile_dep, db: DB
) -> Language:
    lang = await candidate_service.language_crud.get(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    return await candidate_service.language_crud.update(db, lang, data)


@router.delete("/me/languages/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_language(language_id: UUID, profile: CandidateProfile_dep, db: DB) -> None:
    lang = await candidate_service.language_crud.get(db, language_id, profile.id)
    if lang is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="language not found")
    await candidate_service.language_crud.delete(db, lang)


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
