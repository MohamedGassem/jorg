"""Backward-compatible imports for email verification services."""

from services.auth.email_verification_service import (
    InvalidVerificationTokenError as InvalidVerificationTokenError,
)
from services.auth.email_verification_service import (
    confirm_email as confirm_email,
)
from services.auth.email_verification_service import (
    decode_verification_token as decode_verification_token,
)
from services.auth.email_verification_service import (
    send_verification_email as send_verification_email,
)
