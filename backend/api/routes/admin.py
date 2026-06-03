from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.config import get_settings
from schemas.alpha import AlphaCodeBatchRequest, AlphaCodeBatchResponse
from services.alpha_service import create_alpha_codes

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[AsyncSession, Depends(get_db)]

logger = structlog.get_logger()


def _require_admin_secret(request: Request) -> None:
    secret = get_settings().admin_secret
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
    logger.info("alpha_codes_generated", count=len(codes))
    return AlphaCodeBatchResponse(codes=codes)
