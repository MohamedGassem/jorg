# backend/api/routes/auth.py
import secrets
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import CurrentUser, get_db
from core.config import get_settings
from models.user import OAuthProvider, UserRole
from schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    TokenPair,
    VerifyEmailRequest,
)
from schemas.user import UserRead
from services.auth_service import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    authenticate_user,
    issue_token_pair,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
)
from services.email_verification_service import (
    InvalidVerificationTokenError,
    confirm_email,
    send_verification_email,
)
from services.oauth_service import find_or_create_oauth_user, get_oauth_client
from services.password_reset_service import (
    InvalidResetTokenError,
    request_password_reset,
    reset_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_oauth_states: dict[str, dict[str, object]] = {}  # { state: { role, created_at } }

_settings = get_settings()
_SECURE = _settings.env != "development"


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    settings = get_settings()
    response.set_cookie(
        "access_token",
        access,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        path="/",
        secure=_SECURE,
    )
    response.set_cookie(
        "refresh_token",
        refresh,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        path="/",
        secure=_SECURE,
    )


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    try:
        user = await register_user(db, payload.email, payload.password, payload.role)
    except EmailAlreadyRegisteredError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        ) from e

    send_verification_email(user)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    try:
        user = await authenticate_user(db, payload.email, payload.password)
    except InvalidCredentialsError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        ) from e

    access, refresh = await issue_token_pair(db, user)
    _set_auth_cookies(response, access, refresh)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(
    payload: RefreshRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token_cookie: str | None = Cookie(alias="refresh_token", default=None),
) -> TokenPair:
    raw_token = payload.refresh_token or refresh_token_cookie
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="no refresh token provided",
        )

    try:
        access, new_refresh = await rotate_refresh_token(db, raw_token)
    except InvalidCredentialsError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        ) from e

    _set_auth_cookies(response, access, new_refresh)
    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: RefreshRequest | None = None,
    refresh_token_cookie: str | None = Cookie(alias="refresh_token", default=None),
) -> Response:
    raw_token = (payload.refresh_token if payload else None) or refresh_token_cookie
    if raw_token:
        await revoke_refresh_token(db, raw_token)
    response.delete_cookie("access_token", path="/", secure=_SECURE)
    response.delete_cookie("refresh_token", path="/", secure=_SECURE)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify-email", response_model=UserRead)
async def verify_email(
    payload: VerifyEmailRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    try:
        user = await confirm_email(db, payload.token)
    except InvalidVerificationTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid verification token: {e}",
        ) from e
    return UserRead.model_validate(user)


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.post("/request-password-reset", status_code=status.HTTP_204_NO_CONTENT)
async def request_reset(
    payload: RequestPasswordResetRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await request_password_reset(db, payload.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def perform_reset(
    payload: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    try:
        await reset_password(db, payload.token, payload.new_password)
    except InvalidResetTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid reset token: {e}",
        ) from e
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/oauth/{provider}/login")
async def oauth_login(
    provider: OAuthProvider,
    role: Annotated[UserRole, Query()],
) -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {
        "role": role,
        "created_at": __import__("datetime").datetime.now(__import__("datetime").UTC),
    }
    client = get_oauth_client(provider)
    return RedirectResponse(url=client.authorization_url(state), status_code=307)


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: OAuthProvider,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    state_data = _oauth_states.pop(state, None)
    if state_data is None:
        raise HTTPException(status_code=400, detail="invalid or expired state")

    role = UserRole(str(state_data["role"]))
    client = get_oauth_client(provider)
    info = await client.exchange_code(code)
    user = await find_or_create_oauth_user(db, info, default_role=role)

    access, refresh = await issue_token_pair(db, user)
    settings = get_settings()
    redirect_url = (
        f"{settings.frontend_url}/candidate/profile"
        if user.role == UserRole.CANDIDATE
        else f"{settings.frontend_url}/recruiter/templates"
    )
    redirect_response = RedirectResponse(url=redirect_url, status_code=302)
    _set_auth_cookies(redirect_response, access, refresh)
    return redirect_response
