# backend/main.py
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.generation import router as generation_router
from api.routes.invitations import router as invitations_router
from api.routes.organizations import router as organizations_router
from api.routes.recruiters import router as recruiters_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")
app.include_router(auth_router)
app.include_router(candidates_router)
app.include_router(organizations_router)
app.include_router(recruiters_router)
app.include_router(invitations_router)
app.include_router(generation_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
