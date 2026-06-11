# backend/api/routes/recruiters.py
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

import services.recruiter_service as recruiter_service
import services.rgpd_service as rgpd_service
from api.deps import get_db, require_role
from models.recruiter import RecruiterProfile
from models.user import User, UserRole
from schemas.recruiter import RecruiterProfileRead, RecruiterProfileUpdate
from schemas.rgpd import RecruiterExport

router = APIRouter(prefix="/recruiters", tags=["recruiters"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me/profile", response_model=RecruiterProfileRead)
async def get_my_profile(current_user: RecruiterUser, db: DB) -> RecruiterProfile:
    return await recruiter_service.get_or_create_profile(db, current_user.id)


@router.put("/me/profile", response_model=RecruiterProfileRead)
async def update_my_profile(
    data: RecruiterProfileUpdate,
    current_user: RecruiterUser,
    db: DB,
) -> RecruiterProfile:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    return await recruiter_service.update_profile(db, profile, data)


@router.get("/me/export", response_model=RecruiterExport)
async def export_my_data(current_user: RecruiterUser, db: DB) -> RecruiterExport:
    return await rgpd_service.export_recruiter_data(db, current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(current_user: RecruiterUser, db: DB) -> None:
    await rgpd_service.delete_recruiter_account(db, current_user)
