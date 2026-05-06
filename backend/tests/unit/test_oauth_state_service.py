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
    delete_result = MagicMock()
    select_result = MagicMock()
    select_result.scalar_one_or_none.return_value = entry
    mock_db.execute = AsyncMock(side_effect=[delete_result, select_result])

    result = await oauth_state_service.consume_state(mock_db, "test-state-token")

    assert result == ("google", "candidate")
    assert mock_db.execute.call_count == 2
    mock_db.delete.assert_called_once_with(entry)
    mock_db.commit.assert_called_once()


async def test_consume_state_returns_none_for_missing(mock_db: AsyncMock) -> None:
    delete_result = MagicMock()
    select_result = MagicMock()
    select_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(side_effect=[delete_result, select_result])

    result = await oauth_state_service.consume_state(mock_db, "nonexistent")

    assert result is None
    assert mock_db.execute.call_count == 2
    mock_db.commit.assert_called_once()


async def test_consume_state_returns_none_for_expired(mock_db: AsyncMock) -> None:
    expired_entry = OAuthState(
        state="expired-state-token",
        provider="google",
        role="candidate",
        created_at=datetime.now(UTC) - timedelta(minutes=20),
        expires_at=datetime.now(UTC) - timedelta(minutes=10),
    )
    delete_result = MagicMock()
    select_result = MagicMock()
    # The service's SELECT filters by expires_at > now(), so expired entries return None
    select_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(side_effect=[delete_result, select_result])

    result = await oauth_state_service.consume_state(mock_db, expired_entry.state)

    assert result is None
    assert mock_db.execute.call_count == 2
