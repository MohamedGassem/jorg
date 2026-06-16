# backend/api/routes/org_templates.py
import re
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

import core.storage as storage
import services.documents.builtin_template_service as builtin_template_service
import services.documents.template_service as template_service
import services.documents.templatize_service as templatize_service
import services.llm.client as llm_client
from api.deps import RecruiterOrgMember, get_db
from api.routes.organizations import _get_org_or_404
from core.config import get_settings
from core.limiter import limiter
from models.template import Template
from schemas.template import TemplateRead
from services.documents.docx_parser import extract_placeholders
from services.llm.templatize import TemplatizeLLMError

router = APIRouter(prefix="/organizations", tags=["templates"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/{org_id}/templates", response_model=list[TemplateRead])
async def list_templates(org_id: UUID, member: RecruiterOrgMember, db: DB) -> list[Template]:
    await _get_org_or_404(db, org_id)
    return await template_service.list_templates(db, org_id)


@router.post(
    "/{org_id}/templates",
    response_model=TemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_template(
    org_id: UUID,
    member: RecruiterOrgMember,
    db: DB,
    name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    description: Annotated[str | None, Form()] = None,
) -> Template:
    await _get_org_or_404(db, org_id)

    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="file exceeds 10 MB limit",
        )
    file_path = storage.save_upload(content, file.filename or "template.docx")
    placeholders = extract_placeholders(file_path)

    return await template_service.create_template(
        db,
        organization_id=org_id,
        created_by_user_id=member.user_id,
        name=name,
        description=description,
        word_file_path=file_path,
        detected_placeholders=placeholders,
    )


@router.get("/{org_id}/templates/{template_id}", response_model=TemplateRead)
async def get_template(
    org_id: UUID, template_id: UUID, member: RecruiterOrgMember, db: DB
) -> Template:
    await _get_org_or_404(db, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return tmpl


@router.delete("/{org_id}/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    org_id: UUID, template_id: UUID, member: RecruiterOrgMember, db: DB
) -> None:
    await _get_org_or_404(db, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    storage.delete_file(tmpl.word_file_path)
    if tmpl.source_file_path and tmpl.source_file_path != tmpl.word_file_path:
        storage.delete_file(tmpl.source_file_path)
    await template_service.delete_template(db, tmpl)


@router.get("/{org_id}/templates/{template_id}/file")
async def download_template_file(
    org_id: UUID, template_id: UUID, member: RecruiterOrgMember, db: DB
) -> FileResponse:
    await _get_org_or_404(db, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")

    file_path = Path(tmpl.word_file_path).resolve()
    if not file_path.is_relative_to(storage.upload_dir()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid file path")
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    safe_stem = re.sub(r"[^\w\-. ]", "_", tmpl.name).strip() or "template"
    safe_name = f"{safe_stem}.docx"
    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/{org_id}/templates/{template_id}/preview")
async def preview_template(
    org_id: UUID, template_id: UUID, member: RecruiterOrgMember, db: DB
) -> Response:
    await _get_org_or_404(db, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")

    file_path = Path(tmpl.word_file_path).resolve()
    if not file_path.is_relative_to(storage.upload_dir()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid file path")
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    try:
        content = builtin_template_service.render_mock_preview_from_path(str(file_path))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="template preview unavailable",
        ) from exc

    safe_stem = re.sub(r"[^\w\-. ]", "_", tmpl.name).strip() or "template"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="apercu-{safe_stem}.docx"'},
    )


@router.post("/{org_id}/templates/{template_id}/templatize", response_model=TemplateRead)
@limiter.limit("5/minute")
async def templatize_template(
    request: Request, org_id: UUID, template_id: UUID, member: RecruiterOrgMember, db: DB
) -> Template:
    await _get_org_or_404(db, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")

    anthropic_client = llm_client.get_anthropic_client()
    if anthropic_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="assisted templating is not configured",
        )

    # Always templatize from the original upload, never from a previous draft.
    source_path = Path(tmpl.source_file_path or tmpl.word_file_path).resolve()
    if not source_path.is_relative_to(storage.upload_dir()) or not source_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    try:
        outcome = await templatize_service.run_templatize_pipeline(
            anthropic_client, get_settings().llm_model, str(source_path)
        )
    except TemplatizeLLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="assisted templating failed, use the manual flow",
        ) from exc

    previous_path = tmpl.word_file_path
    new_path = storage.save_upload(outcome.docx_bytes, f"templatized-{tmpl.name}.docx")
    placeholders = extract_placeholders(new_path)
    template = await template_service.apply_templatize_outcome(
        db, tmpl, new_path, placeholders, outcome.report, outcome.render_error
    )
    # Drop the superseded draft file, but never the preserved source.
    if previous_path not in (template.source_file_path, new_path):
        storage.delete_file(previous_path)
    return template


@router.post("/{org_id}/templates/{template_id}/activate", response_model=TemplateRead)
async def activate_template(
    org_id: UUID, template_id: UUID, member: RecruiterOrgMember, db: DB
) -> Template:
    await _get_org_or_404(db, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return await template_service.activate_template(db, tmpl)
