# backend/api/routes/auth.py
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from api.deps import CurrentUser, get_db
from core.config import get_settings
from core.limiter import limiter
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
from services import oauth_state_service
from services.alpha_service import InvalidAlphaCodeError, validate_and_consume_code
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
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    settings = get_settings()
    if settings.alpha_invite_required and payload.role == UserRole.RECRUITER:
        if not payload.alpha_invite_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un code d'invitation alpha est requis pour créer un compte recruteur.",
            )
        try:
            # Validate only — do NOT consume yet so the code is not burned if
            # user creation fails (e.g. EmailAlreadyRegisteredError).
            await validate_and_consume_code(db, payload.alpha_invite_code, consume=False)
        except InvalidAlphaCodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code d'invitation invalide ou déjà utilisé.",
            ) from e

    try:
        user = await register_user(db, payload.email, payload.password, payload.role)
    except EmailAlreadyRegisteredError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        ) from e

    # For recruiter: consume the alpha code now that the user was created
    # successfully, then create the profile and link used_by.
    if (
        payload.role == UserRole.RECRUITER
        and payload.alpha_invite_code
        and settings.alpha_invite_required
    ):
        # Consume the code now that user creation succeeded.
        # Note: validate_and_consume_code calls db.expire_all() internally, so
        # we must refresh `user` afterwards to avoid a MissingGreenlet error
        # when accessing user attributes in async context.
        await validate_and_consume_code(
            db, payload.alpha_invite_code, consume=True, recruiter_id=None
        )
        await db.refresh(user)

        from services.recruiter_service import get_or_create_profile

        recruiter_profile = await get_or_create_profile(db, user.id)
        # Update the consumed alpha code's used_by field
        from sqlalchemy import select

        from models.alpha import AlphaInviteCode

        result = await db.execute(
            select(AlphaInviteCode).where(AlphaInviteCode.code == payload.alpha_invite_code.upper())
        )
        alpha_code = result.scalar_one_or_none()
        if alpha_code:
            alpha_code.used_by = recruiter_profile.id
            await db.commit()

    # Save first_name / last_name to profile at registration time
    if payload.first_name or payload.last_name:
        if user.role == UserRole.CANDIDATE:
            from services.candidate_service import (
                get_or_create_profile as get_or_create_candidate_profile,
            )

            candidate_profile = await get_or_create_candidate_profile(db, user.id)
            if payload.first_name:
                candidate_profile.first_name = payload.first_name
            if payload.last_name:
                candidate_profile.last_name = payload.last_name
            await db.commit()
        elif user.role == UserRole.RECRUITER:
            from services.recruiter_service import get_or_create_profile

            recruiter_profile = await get_or_create_profile(db, user.id)
            if payload.first_name:
                recruiter_profile.first_name = payload.first_name
            if payload.last_name:
                recruiter_profile.last_name = payload.last_name
            await db.commit()

    send_verification_email(user)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
async def login(
    request: Request,
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
async def get_me(current_user: CurrentUser) -> User:
    return current_user


@router.post("/request-password-reset", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def request_reset(
    request: Request,
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
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    state = await oauth_state_service.create_state(db, provider.value, role.value)
    client = get_oauth_client(provider)
    return RedirectResponse(url=client.authorization_url(state), status_code=307)


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: OAuthProvider,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    result = await oauth_state_service.consume_state(db, state)
    if result is None:
        raise HTTPException(status_code=400, detail="invalid or expired state")

    stored_provider_str, role_str = result
    if stored_provider_str != provider.value:
        raise HTTPException(status_code=400, detail="invalid or expired state")
    role = UserRole(role_str)

    # Block OAuth recruiter registration during alpha
    settings = get_settings()
    if role == UserRole.RECRUITER and settings.alpha_invite_required:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "L'inscription recruteur via OAuth n'est pas disponible pendant la phase alpha. "
                "Utilisez l'inscription par email avec votre code d'invitation."
            ),
        )

    client = get_oauth_client(provider)
    info = await client.exchange_code(code)
    user = await find_or_create_oauth_user(db, info, default_role=role)

    access, refresh = await issue_token_pair(db, user)
    redirect_url = (
        f"{settings.frontend_url}/candidate/profile"
        if user.role == UserRole.CANDIDATE
        else f"{settings.frontend_url}/recruiter/templates"
    )
    redirect_response = RedirectResponse(url=redirect_url, status_code=302)
    _set_auth_cookies(redirect_response, access, refresh)
    return redirect_response
