# backend/services/email_verification_service.py
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.email import EmailMessage, get_email_backend
from core.security import TokenType, create_access_token, decode_token
from models.user import User

EMAIL_VERIFY_EXPIRE_HOURS = 24


class InvalidVerificationTokenError(Exception):
    pass


def _create_verification_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        extra={"purpose": "email_verification"},
        expires_delta=timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS),
    )


def send_verification_email(user: User) -> str:
    """Envoie le mail et retourne le token (utile pour les tests)."""
    token = _create_verification_token(user)
    link = f"{get_settings().frontend_url}/verify-email?token={token}"
    message = EmailMessage(
        to=user.email,
        subject="Verifiez votre email Jorg",
        body=(
            f"Bonjour,\n\nCliquez pour vérifier votre email : {link}\n\n"
            f"Ce lien expire dans {EMAIL_VERIFY_EXPIRE_HOURS}h."
        ),
    )
    get_email_backend().send(message)
    return token


def decode_verification_token(token: str) -> str:
    """Retourne l'user_id (str UUID) si le token est valide et a le bon purpose."""
    payload = decode_token(token, expected_type=TokenType.ACCESS)
    if payload.get("purpose") != "email_verification":
        raise ValueError("wrong token purpose")
    return str(payload["sub"])


async def confirm_email(db: AsyncSession, token: str) -> User:
    try:
        user_id_str = decode_verification_token(token)
    except ValueError as e:
        raise InvalidVerificationTokenError(str(e)) from e

    result = await db.execute(select(User).where(User.id == UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if user is None:
        raise InvalidVerificationTokenError("user not found")

    user.email_verified = True
    await db.commit()
    await db.refresh(user)
    return user
