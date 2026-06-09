"""Backward-compatible imports for OAuth services."""

from services.auth.oauth_service import (
    GoogleOAuthClient as GoogleOAuthClient,
)
from services.auth.oauth_service import (
    LinkedInOAuthClient as LinkedInOAuthClient,
)
from services.auth.oauth_service import (
    OAuthClient as OAuthClient,
)
from services.auth.oauth_service import (
    OAuthUserInfo as OAuthUserInfo,
)
from services.auth.oauth_service import (
    find_or_create_oauth_user as find_or_create_oauth_user,
)
from services.auth.oauth_service import (
    get_oauth_client as get_oauth_client,
)
from services.auth.oauth_service import (
    override_oauth_client as override_oauth_client,
)
