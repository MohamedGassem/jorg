# backend/api/routes/recruiters.py
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

import services.recruiter_service as recruiter_service
from api.deps import get_db, require_role
from models.recruiter import RecruiterProfile
from models.user import User, UserRole
from schemas.recruiter import RecruiterProfileRead, RecruiterProfileUpdate

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
