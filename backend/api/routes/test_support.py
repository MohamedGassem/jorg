from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.config import Settings, get_settings
from models.invitation import Invitation

router = APIRouter(prefix="/test", tags=["test-support"])

DB = Annotated[AsyncSession, Depends(get_db)]


def get_settings_dep() -> Settings:
    return get_settings()


@router.get("/last-invitation-token")
async def last_invitation_token(
    email: str,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> dict[str, str]:
    if not settings.e2e_test_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    result = await db.execute(
        select(Invitation)
        .where(Invitation.candidate_email == email)
        .order_by(Invitation.created_at.desc())
    )
    invitation = result.scalars().first()
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no invitation")
    return {
        "token": invitation.token,
        "public_url": f"{settings.frontend_url}/invitation/{invitation.token}",
    }
