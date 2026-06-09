"""Backward-compatible imports for document generation services."""

from services.documents.generation_service import (
    generate_for_candidate as generate_for_candidate,
)
from services.documents.generation_service import (
    generate_for_self as generate_for_self,
)
from services.documents.generation_service import (
    list_candidate_documents as list_candidate_documents,
)
from services.documents.generation_service import (
    list_candidate_documents_view as list_candidate_documents_view,
)
from services.documents.generation_service import (
    list_org_documents as list_org_documents,
)
from services.documents.generation_service import (
    list_org_documents_view as list_org_documents_view,
)
