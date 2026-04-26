# backend/main.py
import uuid

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.generation import router as generation_router
from api.routes.invitations import router as invitations_router
from api.routes.opportunities import router as opportunities_router
from api.routes.organizations import router as organizations_router
from api.routes.recruiters import router as recruiters_router
from api.routes.templates import router as templates_router
from core.config import get_settings
from core.logging import configure_logging

settings = get_settings()
configure_logging(log_level=settings.log_level)

app = FastAPI(title="Jorg API", version="0.1.0")


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)
app.include_router(auth_router)
app.include_router(candidates_router)
app.include_router(organizations_router)
app.include_router(recruiters_router)
app.include_router(invitations_router)
app.include_router(generation_router)
app.include_router(opportunities_router)
app.include_router(templates_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
