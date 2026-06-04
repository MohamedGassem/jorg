# backend/core/limiter.py
from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory storage — sufficient for single-process deployment (single VM, one worker).
# For multi-worker deployments, pass storage_uri=settings.redis_url to share state.
limiter = Limiter(key_func=get_remote_address)
