# backend/api/deps.py
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import services.candidate_service as candidate_service
from core.database import get_db as get_db
from core.security import TokenType, decode_token
from models.candidate_profile import CandidateProfile
from models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token subject",
        ) from e

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found or inactive",
        )
    return user


def require_role(role: UserRole) -> Any:
    async def _dep(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"role {role.value} required",
            )
        return current_user

    return _dep


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_candidate_profile(
    current_user: Annotated[User, Depends(require_role(UserRole.CANDIDATE))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateProfile:
    return await candidate_service.get_or_create_profile(db, current_user.id)


CandidateProfile_dep = Annotated[CandidateProfile, Depends(get_candidate_profile)]
