# backend/main.py
from fastapi import FastAPI

from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
