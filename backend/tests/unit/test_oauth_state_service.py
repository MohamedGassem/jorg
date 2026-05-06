# backend/tests/unit/test_oauth_state_service.py
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.oauth_state import OAuthState
from services import oauth_state_service


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    return db


async def test_create_state_returns_token(mock_db: AsyncMock) -> None:
    state = await oauth_state_service.create_state(mock_db, "google", "candidate")
    assert len(state) > 16
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


async def test_consume_state_returns_provider_and_role(mock_db: AsyncMock) -> None:
    entry = OAuthState(
        state="test-state-token",
        provider="google",
        role="candidate",
        created_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = entry
    mock_db.execute = AsyncMock(return_value=mock_result)

    result = await oauth_state_service.consume_state(mock_db, "test-state-token")

    assert result == ("google", "candidate")
    mock_db.delete.assert_called_once_with(entry)
    mock_db.commit.assert_called_once()


async def test_consume_state_returns_none_for_missing(mock_db: AsyncMock) -> None:
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_result)

    result = await oauth_state_service.consume_state(mock_db, "nonexistent")

    assert result is None
