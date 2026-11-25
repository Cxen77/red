"""M1 Kubernetes / deployment / commit change-event JSON ingest adapter."""
from __future__ import annotations

import json
from backend.models import EvidenceItem
from .base import FormatAdapter
from .logs import _normalize_ts


class EventAdapter(FormatAdapter):
    """Parses Kubernetes/deploy/commit change events into EvidenceItems (kind='event')."""

    source_name = "events.json"

    def parse(self, content: str, source: str | None = None) -> list[EvidenceItem]:
        src = source or self.source_name
        stripped = content.strip()
        if not stripped:
            return []

        records: list[dict] = json.loads(stripped)
        if isinstance(records, dict) and "items" in records:
            records = records["items"]

        items: list[EvidenceItem] = []
        for idx, ev in enumerate(records, start=1):
            ts = _normalize_ts(str(ev.get("ts") or ev.get("timestamp") or "1970-01-01T00:00:00Z"))
            service = str(ev.get("service") or ev.get("involvedObject") or "unknown-svc")
            ev_type = str(ev.get("event_type") or ev.get("reason") or "ChangeEvent")
            reason = str(ev.get("message") or ev.get("diff") or "")
            actor = str(ev.get("actor") or "ci-cd")
            commit = str(ev.get("commit") or "")
            raw = (
                f"{ts} {service} {ev_type} actor={actor}"
                + (f" commit={commit}" if commit else "")
                + (f" {reason}" if reason else "")
            )
            items.append(
                EvidenceItem(
                    id=f"EVENT-{idx:04d}",
                    ts=ts,
                    source=src,
                    service=service,
                    kind="event",
                    raw=raw,
                    level="WARN" if "fail" in reason.lower() or "oom" in reason.lower() else "INFO",
                )
            )
        return items
