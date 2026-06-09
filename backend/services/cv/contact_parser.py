from __future__ import annotations

import re

from services.cv.constants import _EMAIL_RE, _LINKEDIN_RE, _PHONE_RE
from services.cv.schemas import CVContact


def extract_contact(text: str) -> CVContact:
    email_match = _EMAIL_RE.search(text)
    linkedin_match = _LINKEDIN_RE.search(text)
    phone: str | None = None
    for candidate in _PHONE_RE.findall(text):
        digits = re.sub(r"\D", "", candidate)
        if 8 <= len(digits) <= 15:
            phone = candidate.strip()
            break

    linkedin_url: str | None = None
    if linkedin_match:
        linkedin_url = linkedin_match.group(0)
        if not linkedin_url.startswith("http"):
            linkedin_url = f"https://{linkedin_url}"

    return CVContact(
        email=email_match.group(0) if email_match else None,
        phone=phone,
        linkedin_url=linkedin_url,
    )
