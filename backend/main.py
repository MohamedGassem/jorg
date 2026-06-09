# backend/main.py
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from api.routes.admin import router as admin_router
from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.generation import router as generation_router
from api.routes.invitations import router as invitations_router
from api.routes.opportunities import router as opportunities_router
from api.routes.organizations import router as organizations_router
from api.routes.recruiters import router as recruiters_router
from api.routes.skills import router as skills_router
from api.routes.templates import router as templates_router
from core.config import get_settings
from core.exceptions import JorgError
from core.limiter import limiter
from core.logging import configure_logging

settings = get_settings()
configure_logging(log_level=settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    from core.storage import get_storage

    try:
        get_storage()
    except ValueError as exc:
        raise RuntimeError(f"Storage configuration error: {exc}") from exc

    # Build the (effectively static) ESCO skill index once at startup so
    # /candidates/me/parse-cv doesn't rescan the whole catalogue per request.
    log = structlog.get_logger()
    from core.database import AsyncSessionLocal
    from services.cv_parser_service import build_skill_index
    from services.language_reference_service import build_language_index

    async with AsyncSessionLocal() as session:
        app.state.skill_index = await build_skill_index(session)
        app.state.language_index = await build_language_index(session)
    log.info(
        "startup_indexes.built",
        skill_entries=len(app.state.skill_index),
        language_entries=len(app.state.language_index),
    )

    yield


app = FastAPI(title="Jorg API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": str(exc.detail)},
        headers={"Retry-After": str(getattr(exc, "retry_after", ""))},
    )


@app.exception_handler(JorgError)
async def jorg_error_handler(request: Request, exc: JorgError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    # Safety net for UNIQUE-constraint violations not handled locally.
    # Local handlers (skills race-recovery, shortlist conflict) catch their own
    # IntegrityErrors first. Only unique violations (PostgreSQL SQLSTATE 23505)
    # map to 409; FK / NOT NULL / CHECK violations are bugs or bad requests, so
    # re-raise them to surface as 500 rather than a misleading conflict.
    if getattr(exc.orig, "sqlstate", None) == "23505":
        return JSONResponse(status_code=409, content={"detail": "resource already exists"})
    raise exc


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(candidates_router)
app.include_router(organizations_router)
app.include_router(recruiters_router)
app.include_router(invitations_router)
app.include_router(generation_router)
app.include_router(opportunities_router)
app.include_router(skills_router)
app.include_router(templates_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
