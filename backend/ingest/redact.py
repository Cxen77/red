"""M1 Credential & secret redaction before telemetry storage or model submission."""
from __future__ import annotations

import re

_REDACTION_RULES: list[tuple[re.Pattern[str], str]] = [
    # OpenRouter / OpenAI / generic sk- keys
    (re.compile(r"\bsk-(?:or-v1-)?[A-Za-z0-9_-]{16,}\b"), "[REDACTED_API_KEY]"),
    # Bearer tokens
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._-]{12,}", re.IGNORECASE), r"\1[REDACTED_TOKEN]"),
    # JWTs (three base64url segments)
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[REDACTED_JWT]"),
    # Key=value secrets (password, secret, api_key, token)
    (
        re.compile(
            r"\b(password|passwd|secret|api_key|apikey|access_token|auth_token)=([^\s,;\"']+)",
            re.IGNORECASE,
        ),
        r"\1=[REDACTED]",
    ),
]


def redact_text(text: str) -> tuple[str, int]:
    """Redact credentials/tokens from raw telemetry text; returns (cleaned_text, redaction_count)."""
    total = 0
    cleaned = text
    for pattern, replacement in _REDACTION_RULES:
        cleaned, count = pattern.subn(replacement, cleaned)
        total += count
    return cleaned, total
