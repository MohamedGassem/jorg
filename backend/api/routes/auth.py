# backend/api/routes/auth.py
import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import CurrentUser, get_db
from core.security import TokenType, decode_token
from models.user import OAuthProvider, User, UserRole
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

# Simple in-memory state store (suffisant pour MVP single-instance).
# À remplacer par Redis quand on passera en multi-process.
_oauth_states: dict[str, UserRole] = {}


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
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(
    payload: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type=TokenType.REFRESH)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        ) from e

    user_id = UUID(claims["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found or inactive",
        )

    access, new_refresh = await issue_token_pair(db, user)
    return TokenPair(access_token=access, refresh_token=new_refresh)


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
    _oauth_states[state] = role
    client = get_oauth_client(provider)
    return RedirectResponse(url=client.authorization_url(state), status_code=307)


@router.get("/oauth/{provider}/callback", response_model=TokenPair)
async def oauth_callback(
    provider: OAuthProvider,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    role = _oauth_states.pop(state, None)
    if role is None:
        raise HTTPException(status_code=400, detail="invalid or expired state")

    client = get_oauth_client(provider)
    info = await client.exchange_code(code)
    user = await find_or_create_oauth_user(db, info, default_role=role)

    access, refresh = await issue_token_pair(db, user)
    return TokenPair(access_token=access, refresh_token=refresh)
