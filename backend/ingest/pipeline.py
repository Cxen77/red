"""Unified M1 ingest pipeline assigning stable sequential IDs per evidence kind."""
from __future__ import annotations

from pathlib import Path
from backend.models import EvidenceItem
from .logs import LogAdapter
from .traces import TraceAdapter
from .metrics import MetricAdapter


def _assign_stable_ids(items: list[EvidenceItem]) -> list[EvidenceItem]:
    """Sort chronologically within each kind and assign stable LOG-0001 / TRACE-0001 / MET-0001 IDs."""
    counters = {"log": 0, "trace": 0, "metric": 0}
    prefixes = {"log": "LOG", "trace": "TRACE", "metric": "MET"}
    sorted_items = sorted(items, key=lambda x: (x.ts, x.kind, x.service, x.raw))
    for item in sorted_items:
        counters[item.kind] += 1
        item.id = f"{prefixes[item.kind]}-{counters[item.kind]:04d}"
    return sorted_items


def ingest_incident_payloads(
    logs_text: str | None = None,
    traces_text: str | None = None,
    metrics_text: str | None = None,
    log_source: str = "app.log",
    trace_source: str = "traces.json",
    metric_source: str = "metrics.csv",
) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []
    if logs_text:
        items.extend(LogAdapter().parse(logs_text, source=log_source))
    if traces_text:
        items.extend(TraceAdapter().parse(traces_text, source=trace_source))
    if metrics_text:
        items.extend(MetricAdapter().parse(metrics_text, source=metric_source))
    return _assign_stable_ids(items)


def ingest_incident_dir(incident_dir: Path) -> list[EvidenceItem]:
    logs_path = incident_dir / "logs.log"
    traces_path = incident_dir / "traces.json"
    metrics_path = incident_dir / "metrics.csv"
    return ingest_incident_payloads(
        logs_text=logs_path.read_text(encoding="utf-8") if logs_path.exists() else None,
        traces_text=traces_path.read_text(encoding="utf-8") if traces_path.exists() else None,
        metrics_text=metrics_path.read_text(encoding="utf-8") if metrics_path.exists() else None,
    )
