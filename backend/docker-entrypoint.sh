#!/bin/sh
# Apply database migrations before starting, then hand off to the CMD.
set -e

echo "Running database migrations..."
alembic upgrade head

exec "$@"
