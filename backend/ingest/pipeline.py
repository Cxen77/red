"""Unified M1 ingest pipeline assigning stable sequential IDs and redacting secrets."""
from __future__ import annotations

from pathlib import Path
from backend.models import EvidenceItem
from .events import EventAdapter
from .logs import LogAdapter
from .traces import TraceAdapter
from .metrics import MetricAdapter
from .redact import redact_text


def _assign_stable_ids(items: list[EvidenceItem]) -> list[EvidenceItem]:
    """Sort chronologically within each kind and assign stable LOG/TRACE/MET/EVENT IDs."""
    counters = {"log": 0, "trace": 0, "metric": 0, "event": 0}
    prefixes = {"log": "LOG", "trace": "TRACE", "metric": "MET", "event": "EVENT"}
    sorted_items = sorted(items, key=lambda x: (x.ts, x.kind, x.service, x.raw))
    for item in sorted_items:
        counters[item.kind] += 1
        item.id = f"{prefixes[item.kind]}-{counters[item.kind]:04d}"
    return sorted_items


def ingest_incident_payloads_with_stats(
    logs_text: str | None = None,
    traces_text: str | None = None,
    metrics_text: str | None = None,
    events_text: str | None = None,
    log_source: str = "app.log",
    trace_source: str = "traces.json",
    metric_source: str = "metrics.csv",
    event_source: str = "events.json",
) -> tuple[list[EvidenceItem], int]:
    items: list[EvidenceItem] = []
    redacted_total = 0

    if logs_text:
        clean_logs, cnt = redact_text(logs_text)
        redacted_total += cnt
        items.extend(LogAdapter().parse(clean_logs, source=log_source))
    if traces_text:
        clean_traces, cnt = redact_text(traces_text)
        redacted_total += cnt
        items.extend(TraceAdapter().parse(clean_traces, source=trace_source))
    if metrics_text:
        clean_metrics, cnt = redact_text(metrics_text)
        redacted_total += cnt
        items.extend(MetricAdapter().parse(clean_metrics, source=metric_source))
    if events_text:
        clean_events, cnt = redact_text(events_text)
        redacted_total += cnt
        items.extend(EventAdapter().parse(clean_events, source=event_source))

    return _assign_stable_ids(items), redacted_total


def ingest_incident_payloads(
    logs_text: str | None = None,
    traces_text: str | None = None,
    metrics_text: str | None = None,
    events_text: str | None = None,
    log_source: str = "app.log",
    trace_source: str = "traces.json",
    metric_source: str = "metrics.csv",
    event_source: str = "events.json",
) -> list[EvidenceItem]:
    items, _ = ingest_incident_payloads_with_stats(
        logs_text,
        traces_text,
        metrics_text,
        events_text,
        log_source,
        trace_source,
        metric_source,
        event_source,
    )
    return items


def ingest_incident_dir_with_stats(incident_dir: Path) -> tuple[list[EvidenceItem], int]:
    logs_path = incident_dir / "logs.log"
    traces_path = incident_dir / "traces.json"
    metrics_path = incident_dir / "metrics.csv"
    events_path = incident_dir / "events.json"
    return ingest_incident_payloads_with_stats(
        logs_text=logs_path.read_text(encoding="utf-8") if logs_path.exists() else None,
        traces_text=traces_path.read_text(encoding="utf-8") if traces_path.exists() else None,
        metrics_text=metrics_path.read_text(encoding="utf-8") if metrics_path.exists() else None,
        events_text=events_path.read_text(encoding="utf-8") if events_path.exists() else None,
    )


def ingest_incident_dir(incident_dir: Path) -> list[EvidenceItem]:
    items, _ = ingest_incident_dir_with_stats(incident_dir)
    return items
