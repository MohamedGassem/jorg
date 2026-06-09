# backend/api/routes/generation.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

import services.documents.generation_service as generation_service
import services.recruiter_service as recruiter_service
from api.deps import CurrentUser, RecruiterOrgMember, get_db, require_role
from core.limiter import limiter
from core.storage import LocalStorageBackend, get_storage
from models.generated_document import GeneratedDocument
from models.user import User, UserRole
from schemas.generation import (
    GeneratedDocumentCandidateView,
    GeneratedDocumentRead,
    GeneratedDocumentRecruiterView,
    GenerateRequest,
    GenerateSelfRequest,
)
from services import access_policy

router = APIRouter(tags=["generation"])

CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/organizations/{org_id}/generate",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def generate_document(
    request: Request,
    org_id: UUID,
    data: GenerateRequest,
    member: RecruiterOrgMember,
    db: DB,
) -> GeneratedDocument:
    return await generation_service.generate_for_candidate(
        db,
        organization_id=org_id,
        template_id=data.template_id,
        system_template_key=data.system_template_key,
        candidate_id=data.candidate_id,
        generated_by_user_id=member.user_id,
        fmt=data.format,
    )


@router.post(
    "/candidates/me/generate",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def generate_my_document(
    request: Request,
    data: GenerateSelfRequest,
    current_user: CandidateUser,
    db: DB,
) -> GeneratedDocument:
    return await generation_service.generate_for_self(
        db,
        candidate_id=current_user.id,
        system_template_key=data.system_template_key,
        fmt=data.format,
    )


@router.get(
    "/organizations/{org_id}/documents",
    response_model=list[GeneratedDocumentRecruiterView],
)
async def list_org_documents(
    org_id: UUID, member: RecruiterOrgMember, db: DB
) -> list[GeneratedDocumentRecruiterView]:
    return await generation_service.list_org_documents_view(db, org_id)


@router.get(
    "/candidates/me/documents",
    response_model=list[GeneratedDocumentCandidateView],
)
async def list_my_documents(
    current_user: CandidateUser, db: DB
) -> list[GeneratedDocumentCandidateView]:
    return await generation_service.list_candidate_documents_view(db, current_user.id)


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: UUID,
    current_user: CurrentUser,
    db: DB,
) -> Response:
    result = await db.execute(select(GeneratedDocument).where(GeneratedDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    from models.invitation import AccessGrant  # lazy: avoids circular import

    grant = None
    if doc.access_grant_id is not None:
        grant_result = await db.execute(
            select(AccessGrant).where(AccessGrant.id == doc.access_grant_id)
        )
        grant = grant_result.scalar_one_or_none()
        if grant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    is_candidate = (
        grant.candidate_id == current_user.id
        if grant is not None
        else doc.generated_by_user_id == current_user.id
    )
    is_recruiter_of_org = False
    if current_user.role == UserRole.RECRUITER and grant is not None:
        profile = await recruiter_service.get_or_create_profile(db, current_user.id)
        is_recruiter_of_org = access_policy.is_member(profile, grant.organization_id)

    if not is_candidate and not is_recruiter_of_org:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="access denied")

    storage = get_storage()
    download_url = await storage.get_download_url(doc.file_path)
    if download_url is not None:
        return RedirectResponse(url=download_url, status_code=302)

    # get_download_url returned None — storage serves files locally.
    # Only LocalStorageBackend does this; any other backend returning None
    # means the file is unavailable.
    if not isinstance(storage, LocalStorageBackend):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    try:
        file_path = storage.resolve_local_path(doc.file_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid file path"
        ) from exc
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    mime = (
        "application/pdf"
        if doc.file_format == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(path=str(file_path), filename=file_path.name, media_type=mime)
