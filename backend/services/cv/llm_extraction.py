from __future__ import annotations

import json
from typing import Protocol

from pydantic import ValidationError

from services.cv.exceptions import CVLLMExtractionError
from services.cv.schemas import CVStructuredProposal


class CVLLMClient(Protocol):
    def extract_profile_json(self, text: str) -> str | None: ...


class NoopCVLLMClient:
    def extract_profile_json(self, text: str) -> str | None:
        return None


def parse_llm_json_strict(raw_json: str) -> CVStructuredProposal:
    try:
        payload = json.loads(raw_json)
        return CVStructuredProposal.model_validate(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise CVLLMExtractionError(
            "La réponse LLM n'est pas un JSON de proposition valide."
        ) from exc
