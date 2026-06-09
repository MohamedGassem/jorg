"""Backward-compatible imports for credential auth services."""

from services.auth.auth_service import (
    EmailAlreadyRegisteredError as EmailAlreadyRegisteredError,
)
from services.auth.auth_service import (
    InvalidCredentialsError as InvalidCredentialsError,
)
from services.auth.auth_service import (
    authenticate_user as authenticate_user,
)
from services.auth.auth_service import (
    issue_token_pair as issue_token_pair,
)
from services.auth.auth_service import (
    register_user as register_user,
)
from services.auth.auth_service import (
    revoke_refresh_token as revoke_refresh_token,
)
from services.auth.auth_service import (
    rotate_refresh_token as rotate_refresh_token,
)
