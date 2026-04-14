# backend/core/email.py
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import structlog

from core.config import get_settings

logger = structlog.get_logger()


@dataclass
class EmailMessage:
    to: str
    subject: str
    body: str
    from_: str | None = None


class EmailBackend(ABC):
    @abstractmethod
    def send(self, message: EmailMessage) -> None: ...


@dataclass
class ConsoleEmailBackend(EmailBackend):
    sent: list[EmailMessage] = field(default_factory=list)

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)
        logger.info(
            "email.send.console",
            to=message.to,
            subject=message.subject,
            body_preview=message.body[:200],
        )


class SmtpEmailBackend(EmailBackend):
    def send(self, message: EmailMessage) -> None:
        import smtplib
        from email.mime.text import MIMEText

        settings = get_settings()
        assert settings.smtp_host, "SMTP_HOST required for smtp backend"

        msg = MIMEText(message.body, "plain", "utf-8")
        msg["Subject"] = message.subject
        msg["From"] = message.from_ or settings.email_from
        msg["To"] = message.to

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)


_backend: EmailBackend | None = None


def get_email_backend() -> EmailBackend:
    global _backend
    if _backend is None:
        settings = get_settings()
        if settings.email_backend == "console":
            _backend = ConsoleEmailBackend()
        else:
            _backend = SmtpEmailBackend()
    return _backend


def override_email_backend(backend: EmailBackend | None) -> None:
    """Test helper: override le singleton backend."""
    global _backend
    _backend = backend
