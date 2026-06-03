import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from schemas.alpha import AlphaCodeBatchRequest, AlphaCodeBatchResponse
from services.alpha_service import create_alpha_codes

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[AsyncSession, Depends(get_db)]


def _require_admin_secret(request: Request) -> None:
    secret = os.getenv("ADMIN_SECRET", "")
    if not secret or request.headers.get("X-Admin-Secret") != secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post(
    "/alpha-codes",
    response_model=AlphaCodeBatchResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_require_admin_secret)],
)
async def generate_alpha_codes(
    payload: AlphaCodeBatchRequest,
    db: DB,
) -> AlphaCodeBatchResponse:
    codes = await create_alpha_codes(db, count=payload.count)
    return AlphaCodeBatchResponse(codes=codes)
