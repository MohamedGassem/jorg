from pydantic import BaseModel, Field


class AlphaCodeBatchRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=100)


class AlphaCodeBatchResponse(BaseModel):
    codes: list[str]
