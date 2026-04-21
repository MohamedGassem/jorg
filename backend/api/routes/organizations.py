# backend/api/routes/organizations.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

import core.storage as storage
import services.recruiter_service as recruiter_service
import services.template_service as template_service
from api.deps import get_db, require_role
from models.recruiter import Organization
from models.template import Template
from models.user import User, UserRole
from schemas.recruiter import AccessibleCandidateRead, OrganizationCreate, OrganizationRead
from schemas.template import TemplateMappingsUpdate, TemplateRead
from services.docx_parser import extract_placeholders

router = APIRouter(prefix="/organizations", tags=["organizations"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _get_org_or_404(db: AsyncSession, org_id: UUID) -> Organization:
    org = await recruiter_service.get_organization(db, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org


async def _require_org_membership(db: AsyncSession, user_id: UUID, org_id: UUID) -> None:
    """Raise 403 if the recruiter is not linked to the given organization."""
    profile = await recruiter_service.get_or_create_profile(db, user_id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )


# ---- Organization CRUD ------------------------------------------------------


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate, current_user: RecruiterUser, db: DB
) -> Organization:
    return await recruiter_service.create_organization(db, data)


@router.get("/{org_id}", response_model=OrganizationRead)
async def get_organization(org_id: UUID, current_user: RecruiterUser, db: DB) -> Organization:
    return await _get_org_or_404(db, org_id)


# ---- Candidates -------------------------------------------------------------


@router.get("/{org_id}/candidates", response_model=list[AccessibleCandidateRead])
async def list_accessible_candidates(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[dict[str, object]]:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await recruiter_service.list_accessible_candidates(db, org_id)


# ---- Templates --------------------------------------------------------------


@router.get("/{org_id}/templates", response_model=list[TemplateRead])
async def list_templates(org_id: UUID, current_user: RecruiterUser, db: DB) -> list[Template]:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await template_service.list_templates(db, org_id)


@router.post(
    "/{org_id}/templates",
    response_model=TemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_template(
    org_id: UUID,
    current_user: RecruiterUser,
    db: DB,
    name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    description: Annotated[str | None, Form()] = None,
) -> Template:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)

    content = await file.read()
    file_path = storage.save_upload(content, file.filename or "template.docx")
    placeholders = extract_placeholders(file_path)

    return await template_service.create_template(
        db,
        organization_id=org_id,
        created_by_user_id=current_user.id,
        name=name,
        description=description,
        word_file_path=file_path,
        detected_placeholders=placeholders,
    )


@router.get("/{org_id}/templates/{template_id}", response_model=TemplateRead)
async def get_template(
    org_id: UUID, template_id: UUID, current_user: RecruiterUser, db: DB
) -> Template:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return tmpl


@router.put("/{org_id}/templates/{template_id}/mappings", response_model=TemplateRead)
async def update_template_mappings(
    org_id: UUID,
    template_id: UUID,
    data: TemplateMappingsUpdate,
    current_user: RecruiterUser,
    db: DB,
) -> Template:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return await template_service.update_mappings(db, tmpl, data.mappings)


@router.delete("/{org_id}/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    org_id: UUID, template_id: UUID, current_user: RecruiterUser, db: DB
) -> None:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    storage.delete_file(tmpl.word_file_path)
    await template_service.delete_template(db, tmpl)
