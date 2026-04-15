# backend/api/routes/generation.py
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import services.generation_service as generation_service
import services.recruiter_service as recruiter_service
from api.deps import CurrentUser, get_db, require_role
from models.generated_document import GeneratedDocument
from models.user import User, UserRole
from schemas.generation import GeneratedDocumentRead, GenerateRequest

router = APIRouter(tags=["generation"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/organizations/{org_id}/generate",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def generate_document(
    org_id: UUID,
    data: GenerateRequest,
    current_user: RecruiterUser,
    db: DB,
) -> GeneratedDocument:
    # Verify recruiter belongs to org
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )

    try:
        return await generation_service.generate_for_candidate(
            db,
            organization_id=org_id,
            template_id=data.template_id,
            candidate_id=data.candidate_id,
            generated_by_user_id=current_user.id,
            fmt=data.format,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "no_active_grant":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="no active access grant for this candidate",
            ) from e
        if msg == "template_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="template not found",
            ) from e
        if msg == "template_invalid":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="template is not fully mapped (is_valid=false)",
            ) from e
        if msg == "candidate_profile_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="candidate has no profile",
            ) from e
        raise


@router.get(
    "/organizations/{org_id}/documents",
    response_model=list[GeneratedDocumentRead],
)
async def list_org_documents(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[GeneratedDocument]:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )
    return await generation_service.list_org_documents(db, org_id)


@router.get(
    "/candidates/me/documents",
    response_model=list[GeneratedDocumentRead],
)
async def list_my_documents(current_user: CandidateUser, db: DB) -> list[GeneratedDocument]:
    return await generation_service.list_candidate_documents(db, current_user.id)


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: UUID,
    current_user: CurrentUser,
    db: DB,
) -> FileResponse:
    result = await db.execute(select(GeneratedDocument).where(GeneratedDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    # Authorization: recruiter from org OR the candidate themselves
    from models.invitation import AccessGrant

    grant_result = await db.execute(
        select(AccessGrant).where(AccessGrant.id == doc.access_grant_id)
    )
    grant = grant_result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    is_candidate = grant.candidate_id == current_user.id
    is_recruiter_of_org = False
    if current_user.role == UserRole.RECRUITER:
        profile = await recruiter_service.get_or_create_profile(db, current_user.id)
        is_recruiter_of_org = profile.organization_id == grant.organization_id

    if not is_candidate and not is_recruiter_of_org:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="access denied")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    mime = (
        "application/pdf"
        if doc.file_format == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=mime,
    )
