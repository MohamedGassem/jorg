# backend/api/routes/templates.py
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response

import services.documents.builtin_template_service as builtin_template_service
from api.deps import CurrentUser, require_role
from models.user import User, UserRole
from schemas.template import BuiltinTemplateRead

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


@router.get("/templates/builtin", response_model=list[BuiltinTemplateRead])
async def list_builtin_templates(current_user: CurrentUser) -> list[BuiltinTemplateRead]:
    return [
        BuiltinTemplateRead(
            key=template.key,
            name=template.name,
            description=template.description,
        )
        for template in builtin_template_service.list_builtin_templates()
    ]


@router.get("/templates/builtin/{template_key}/preview")
async def preview_builtin_template(template_key: str, current_user: CurrentUser) -> Response:
    template = builtin_template_service.get_builtin_template(template_key)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    try:
        content = builtin_template_service.render_mock_preview(template)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="template preview unavailable",
        ) from exc
    safe_name = f"jorg-preview-{template.key}.docx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )
