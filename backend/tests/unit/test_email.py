# backend/tests/unit/test_email.py
from core.email import ConsoleEmailBackend, EmailMessage


def test_console_backend_captures_messages() -> None:
    backend = ConsoleEmailBackend()
    msg = EmailMessage(
        to="alice@example.com",
        subject="Hello",
        body="Welcome, Alice!",
    )
    backend.send(msg)
    assert len(backend.sent) == 1
    assert backend.sent[0].to == "alice@example.com"
    assert backend.sent[0].subject == "Hello"
