"""Backward-compatible imports for template services."""

from services.documents.template_service import (
    _compute_is_valid as _compute_is_valid,
)
from services.documents.template_service import (
    create_template as create_template,
)
from services.documents.template_service import (
    delete_template as delete_template,
)
from services.documents.template_service import (
    get_template as get_template,
)
from services.documents.template_service import (
    list_templates as list_templates,
)
