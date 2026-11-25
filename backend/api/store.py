"""In-memory + disk-backed incident store loading built-in scenarios and user uploads."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from backend.agent.investigator import investigate_incident
from backend.config import OPENROUTER_MODEL, REPLAYS_DIR, SCENARIOS_DIR, UPLOADS_DIR
from backend.ingest.pipeline import ingest_incident_dir, ingest_incident_payloads
from backend.models import (
    EvidenceItem,
    IncidentMetadata,
    InvestigationResult,
    SeverityLevel,
    TimelineSummary,
)
from backend.timeline.builder import build_timeline


class IncidentRecord:
    def __init__(
        self,
        meta: IncidentMetadata,
        items: list[EvidenceItem],
        timeline: TimelineSummary,
        image_bytes: bytes | None = None,
        investigation: InvestigationResult | None = None,
    ) -> None:
        self.meta = meta
        self.items = items
        self.timeline = timeline
        self.image_bytes = image_bytes
        self.investigation = investigation


class IncidentStore:
    def __init__(self) -> None:
        self.records: dict[str, IncidentRecord] = {}
        self._load_all()

    def _load_directory(self, inc_dir: Path) -> None:
        meta_path = inc_dir / "meta.json"
        if not meta_path.exists():
            return
        raw_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        inc_id = raw_meta["id"]
        items = ingest_incident_dir(inc_dir)
        timeline = build_timeline(inc_id, items)

        img_path = inc_dir / "dashboard.png"
        image_bytes = img_path.read_bytes() if img_path.exists() else None

        inv_path = REPLAYS_DIR / f"{inc_id}.investigation.json"
        investigation = None
        if inv_path.exists():
            investigation = InvestigationResult.model_validate_json(
                inv_path.read_text(encoding="utf-8")
            )

        meta = IncidentMetadata(
            id=inc_id,
            title=raw_meta["title"],
            services=timeline.services or raw_meta.get("services", []),
            opened_at=raw_meta["opened_at"],
            severity=raw_meta.get("severity", "medium"),
            status=investigation.status if investigation else "open",
            root_cause=investigation.root_cause_summary if investigation else None,
            has_image=image_bytes is not None,
            log_count=sum(1 for i in items if i.kind == "log"),
            trace_count=sum(1 for i in items if i.kind == "trace"),
            metric_count=sum(1 for i in items if i.kind == "metric"),
            anomaly_count=timeline.anomaly_count,
            model=OPENROUTER_MODEL,
        )
        self.records[inc_id] = IncidentRecord(
            meta=meta,
            items=items,
            timeline=timeline,
            image_bytes=image_bytes,
            investigation=investigation,
        )

    def _load_all(self) -> None:
        for base_dir in (SCENARIOS_DIR, UPLOADS_DIR):
            if base_dir.exists():
                for child in sorted(base_dir.iterdir()):
                    if child.is_dir():
                        self._load_directory(child)

    def list_incidents(self) -> list[IncidentMetadata]:
        return sorted(
            (r.meta for r in self.records.values()),
            key=lambda m: m.opened_at,
            reverse=True,
        )

    def get(self, incident_id: str) -> IncidentRecord | None:
        return self.records.get(incident_id)

    def create_incident(
        self,
        title: str,
        severity: SeverityLevel = "high",
        logs_text: str | None = None,
        traces_text: str | None = None,
        metrics_text: str | None = None,
        image_bytes: bytes | None = None,
    ) -> IncidentRecord:
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:32] or "incident"
        inc_id = f"{slug}-{uuid.uuid4().hex[:6]}"
        inc_dir = UPLOADS_DIR / inc_id
        inc_dir.mkdir(parents=True, exist_ok=True)

        if logs_text:
            (inc_dir / "logs.log").write_text(logs_text, encoding="utf-8")
        if traces_text:
            (inc_dir / "traces.json").write_text(traces_text, encoding="utf-8")
        if metrics_text:
            (inc_dir / "metrics.csv").write_text(metrics_text, encoding="utf-8")
        if image_bytes:
            (inc_dir / "dashboard.png").write_bytes(image_bytes)

        items = ingest_incident_payloads(logs_text, traces_text, metrics_text)
        timeline = build_timeline(inc_id, items)
        opened_at = items[0].ts if items else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        meta = IncidentMetadata(
            id=inc_id,
            title=title,
            services=timeline.services,
            opened_at=opened_at,
            severity=severity,
            status="open",
            has_image=image_bytes is not None,
            log_count=sum(1 for i in items if i.kind == "log"),
            trace_count=sum(1 for i in items if i.kind == "trace"),
            metric_count=sum(1 for i in items if i.kind == "metric"),
            anomaly_count=timeline.anomaly_count,
            model=OPENROUTER_MODEL,
        )
        (inc_dir / "meta.json").write_text(meta.model_dump_json(indent=2), encoding="utf-8")

        rec = IncidentRecord(
            meta=meta,
            items=items,
            timeline=timeline,
            image_bytes=image_bytes,
        )
        self.records[inc_id] = rec
        return rec

    def investigate(
        self,
        incident_id: str,
        mode: Literal["live", "replay"] = "live",
    ) -> InvestigationResult:
        rec = self.records.get(incident_id)
        if not rec:
            raise KeyError(incident_id)
        result = investigate_incident(
            incident_id=incident_id,
            title=rec.meta.title,
            opened_at=rec.meta.opened_at,
            severity=rec.meta.severity,
            timeline=rec.timeline,
            mode=mode,
            image_bytes=rec.image_bytes,
        )
        rec.investigation = result
        rec.meta.status = result.status
        rec.meta.root_cause = result.root_cause_summary

        REPLAYS_DIR.mkdir(parents=True, exist_ok=True)
        (REPLAYS_DIR / f"{incident_id}.investigation.json").write_text(
            result.model_dump_json(indent=2), encoding="utf-8"
        )
        return result


_STORE: IncidentStore | None = None


def get_store() -> IncidentStore:
    global _STORE
    if _STORE is None:
        _STORE = IncidentStore()
    return _STORE
