"""OpenRouter Decisions API gateway (perplexity/pplx-decider-flash-v1.3:free) + replay cache."""
from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from typing import Any, Literal

import httpx

from backend.config import (
    OPENROUTER_API_KEY,
    OPENROUTER_DECISIONS_URL,
    OPENROUTER_MODEL,
    REPLAYS_DIR,
)
from backend.models import DeciderQuestionResult, DecisionTraceRecord


class DeciderGateway:
    """Single gateway for all OpenRouter alpha/decisions calls with deterministic replay caching."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        endpoint: str | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else OPENROUTER_API_KEY
        self.model = model or OPENROUTER_MODEL
        self.endpoint = endpoint or OPENROUTER_DECISIONS_URL

    @staticmethod
    def encode_image_state(image_bytes: bytes, mime_type: str = "image/png") -> dict[str, Any]:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        return {
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{b64}"},
        }

    def decide_live(
        self,
        stage: str,
        state: list[Any],
        questions: dict[str, dict[str, Any]],
        timeout_s: float = 30.0,
    ) -> tuple[dict[str, Any], DecisionTraceRecord]:
        """Call OpenRouter POST /api/alpha/decisions synchronously."""
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not configured.")

        payload = {
            "model": self.model,
            "state": state,
            "questions": questions,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Cxen77/red",
            "X-Title": "IncidentLens",
        }
        started = time.perf_counter()
        with httpx.Client(timeout=timeout_s) as client:
            resp = client.post(self.endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

        answers = data.get("answers", {})
        usage = data.get("usage", {})
        q_results: list[DeciderQuestionResult] = []
        for q_key, q_spec in questions.items():
            ans = answers.get(q_key, {})
            q_type = ans.get("type") or q_spec.get("type", "noul")
            q_results.append(
                DeciderQuestionResult(
                    question_key=q_key,
                    question_type=q_type,
                    instructions=q_spec.get("instructions", ""),
                    answer=ans.get(q_type) if q_type in ans else ans,
                    confidence=ans.get("confidence") or (ans.get("noul") if q_type == "noul" else None),
                    probabilities=ans.get("probabilities"),
                )
            )

        trace = DecisionTraceRecord(
            stage=stage,
            model=data.get("model", self.model),
            mode="live",
            latency_ms=elapsed_ms,
            input_tokens=int(usage.get("input_tokens", 0)),
            output_tokens=int(usage.get("output_tokens", 0)),
            cost=float(usage.get("cost", 0.0)),
            request_id=data.get("id"),
            questions=q_results,
        )
        return answers, trace

    @staticmethod
    def replay_path(incident_id: str) -> Path:
        REPLAYS_DIR.mkdir(parents=True, exist_ok=True)
        return REPLAYS_DIR / f"{incident_id}.decisions.json"

    def save_replay(self, incident_id: str, records: list[dict[str, Any]]) -> None:
        self.replay_path(incident_id).write_text(
            json.dumps(records, indent=2), encoding="utf-8"
        )

    def load_replay(self, incident_id: str) -> list[dict[str, Any]] | None:
        path = self.replay_path(incident_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def run_stage(
        self,
        incident_id: str,
        stage: str,
        state: list[Any],
        questions: dict[str, dict[str, Any]],
        mode: Literal["live", "replay"] = "live",
        replay_cache: dict[str, dict[str, Any]] | None = None,
    ) -> tuple[dict[str, Any], DecisionTraceRecord]:
        """Run a stage in live or replay mode; falls back to replay if live fails without network."""
        if mode == "replay" and replay_cache and stage in replay_cache:
            cached = replay_cache[stage]
            trace = DecisionTraceRecord.model_validate({**cached["trace"], "mode": "replay", "latency_ms": 0.5})
            return cached["answers"], trace

        if mode == "live":
            try:
                return self.decide_live(stage, state, questions)
            except Exception:
                if replay_cache and stage in replay_cache:
                    cached = replay_cache[stage]
                    trace = DecisionTraceRecord.model_validate({**cached["trace"], "mode": "replay", "latency_ms": 0.5})
                    return cached["answers"], trace
                raise

        raise RuntimeError(f"No replay recorded for incident '{incident_id}' stage '{stage}'. Run live once first.")
