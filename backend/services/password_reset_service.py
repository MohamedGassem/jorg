"""Backward-compatible imports for password reset services."""

from services.auth.password_reset_service import (
    InvalidResetTokenError as InvalidResetTokenError,
)
from services.auth.password_reset_service import (
    request_password_reset as request_password_reset,
)
from services.auth.password_reset_service import (
    reset_password as reset_password,
)
