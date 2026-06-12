from typing import cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import BusinessRuleError, NotFoundError
from services.documents.generation_service import ResolvedTemplate, resolve_template

# Le chemin builtin ne touche jamais la session : None suffit en unitaire.
NO_DB = cast("AsyncSession", None)


@pytest.mark.asyncio
async def test_resolve_template_builtin() -> None:
    resolved = await resolve_template(
        NO_DB, organization_id=None, template_id=None, system_template_key="compact_esn"
    )
    assert isinstance(resolved, ResolvedTemplate)
    assert resolved.template_id is None
    assert resolved.filename_token == "compact_esn"
    assert resolved.path.endswith("compact_esn.docx")
    assert resolved.name == "Synthèse"


@pytest.mark.asyncio
async def test_resolve_template_unknown_builtin_raises() -> None:
    with pytest.raises(NotFoundError):
        await resolve_template(
            NO_DB, organization_id=None, template_id=None, system_template_key="nope"
        )


@pytest.mark.asyncio
async def test_resolve_template_requires_a_source() -> None:
    with pytest.raises(BusinessRuleError):
        await resolve_template(
            NO_DB, organization_id=None, template_id=None, system_template_key=None
        )
