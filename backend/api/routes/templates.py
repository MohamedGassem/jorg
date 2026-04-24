# backend/api/routes/templates.py
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(tags=["templates"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]

SAMPLE_PATH = Path(__file__).parent.parent.parent / "static" / "sample_template.docx"


@router.get("/templates/sample")
async def download_sample_template(current_user: RecruiterUser) -> FileResponse:
    if not SAMPLE_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sample template not available",
        )
    return FileResponse(
        path=str(SAMPLE_PATH),
        filename="jorg-sample-template.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
