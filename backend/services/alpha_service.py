"""Backward-compatible imports for alpha access services."""

from services.auth.alpha_service import (
    InvalidAlphaCodeError as InvalidAlphaCodeError,
)
from services.auth.alpha_service import (
    create_alpha_codes as create_alpha_codes,
)
from services.auth.alpha_service import (
    validate_and_consume_code as validate_and_consume_code,
)
