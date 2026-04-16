# backend/services/password_reset_service.py
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.email import EmailMessage, get_email_backend
from core.security import TokenType, create_access_token, decode_token, hash_password
from models.user import User

PASSWORD_RESET_EXPIRE_HOURS = 1


class InvalidResetTokenError(Exception):
    pass


def _create_reset_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        extra={"purpose": "password_reset"},
        expires_delta=timedelta(hours=PASSWORD_RESET_EXPIRE_HOURS),
    )


async def request_password_reset(db: AsyncSession, email: str) -> None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        return  # silent - ne pas divulguer l'existence du compte

    token = _create_reset_token(user)
    link = f"{get_settings().frontend_url}/reset-password?token={token}"
    message = EmailMessage(
        to=user.email,
        subject="Réinitialisation de votre mot de passe Jorg",
        body=(
            "Bonjour,\n\n"
            f"Cliquez pour réinitialiser votre mot de passe : {link}\n\n"
            f"Ce lien expire dans {PASSWORD_RESET_EXPIRE_HOURS}h."
        ),
    )
    get_email_backend().send(message)


async def reset_password(db: AsyncSession, token: str, new_password: str) -> User:
    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError as e:
        raise InvalidResetTokenError(str(e)) from e

    if payload.get("purpose") != "password_reset":
        raise InvalidResetTokenError("wrong token purpose")

    result = await db.execute(select(User).where(User.id == UUID(payload["sub"])))
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidResetTokenError("user not found")

    user.hashed_password = hash_password(new_password)
    await db.commit()
    await db.refresh(user)
    return user
