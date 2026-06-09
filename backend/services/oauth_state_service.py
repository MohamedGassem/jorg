"""Backward-compatible imports for OAuth state services."""

from services.auth.oauth_state_service import (
    consume_state as consume_state,
)
from services.auth.oauth_state_service import (
    create_state as create_state,
)
