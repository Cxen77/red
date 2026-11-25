"""Trace span JSON ingest adapter."""
from __future__ import annotations

import json
from backend.models import EvidenceItem
from .base import FormatAdapter
from .logs import _normalize_ts


class TraceAdapter(FormatAdapter):
    """Parses JSON array or JSON-lines trace spans into EvidenceItems."""

    source_name = "traces.json"

    def parse(self, content: str, source: str | None = None) -> list[EvidenceItem]:
        src = source or self.source_name
        stripped = content.strip()
        if not stripped:
            return []

        records: list[dict] = []
        if stripped.startswith("["):
            records = json.loads(stripped)
        elif stripped.startswith("{"):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, dict) and "spans" in parsed:
                    records = parsed["spans"]
                else:
                    records = [parsed]
            except json.JSONDecodeError:
                records = [json.loads(line) for line in stripped.splitlines() if line.strip()]
        else:
            records = [json.loads(line) for line in stripped.splitlines() if line.strip()]

        items: list[EvidenceItem] = []
        for idx, span in enumerate(records, start=1):
            ts = _normalize_ts(str(span.get("ts") or span.get("start_time") or "1970-01-01T00:00:00Z"))
            service = str(span.get("service") or span.get("service_name") or "unknown-svc")
            op = str(span.get("operation") or span.get("name") or "span")
            duration_ms = float(span.get("duration_ms") or span.get("latency_ms") or 0.0)
            status = str(span.get("status") or "OK").upper()
            trace_id = str(span.get("trace_id") or f"tr-{idx:04d}")
            span_id = str(span.get("span_id") or f"sp-{idx:04d}")
            error_msg = span.get("error") or ""
            raw = (
                f"{ts} {service} trace={trace_id} span={span_id} op={op} "
                f"duration_ms={duration_ms:.1f} status={status}"
                + (f" error={error_msg}" if error_msg else "")
            )
            items.append(
                EvidenceItem(
                    id=f"TRACE-{idx:04d}",
                    ts=ts,
                    source=src,
                    service=service,
                    kind="trace",
                    raw=raw,
                    level="ERROR" if status in {"ERROR", "TIMEOUT", "500", "504"} else "INFO",
                    duration_ms=duration_ms,
                    trace_id=trace_id,
                    span_id=span_id,
                )
            )
        return items
