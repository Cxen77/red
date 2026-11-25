"""Read-only investigation tools over the M2 Timeline."""
from __future__ import annotations

import time
from typing import Any
from backend.models import EvidenceItem, MetricPoint, TimelineSummary


def get_timeline_window(
    timeline: TimelineSummary,
    start_ts: str | None = None,
    end_ts: str | None = None,
    flagged_only: bool = False,
    limit: int = 60,
) -> tuple[list[EvidenceItem], dict[str, Any]]:
    started = time.perf_counter()
    rows = timeline.items
    if start_ts:
        rows = [item for item in rows if item.ts >= start_ts]
    if end_ts:
        rows = [item for item in rows if item.ts <= end_ts]
    if flagged_only:
        rows = [item for item in rows if item.flags]
    selected = rows[:limit]
    return selected, {
        "tool": "get_timeline_window",
        "arguments": {"start_ts": start_ts, "end_ts": end_ts, "flagged_only": flagged_only, "limit": limit},
        "returned": len(selected),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def get_service_events(
    timeline: TimelineSummary,
    service: str,
    level: str | None = None,
    limit: int = 40,
) -> tuple[list[EvidenceItem], dict[str, Any]]:
    started = time.perf_counter()
    rows = [item for item in timeline.items if item.service == service]
    if level:
        rows = [item for item in rows if (item.level or "").upper() == level.upper()]
    selected = rows[:limit]
    return selected, {
        "tool": "get_service_events",
        "arguments": {"service": service, "level": level, "limit": limit},
        "returned": len(selected),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def get_metric_series(
    timeline: TimelineSummary,
    metric_name: str | None = None,
    anomalies_only: bool = False,
) -> tuple[dict[str, list[MetricPoint]], dict[str, Any]]:
    started = time.perf_counter()
    out: dict[str, list[MetricPoint]] = {}
    for name, points in timeline.metric_series.items():
        if metric_name and name != metric_name:
            continue
        filtered = [p for p in points if (not anomalies_only or p.is_anomaly)]
        out[name] = filtered
    return out, {
        "tool": "get_metric_series",
        "arguments": {"metric_name": metric_name, "anomalies_only": anomalies_only},
        "returned": sum(len(v) for v in out.values()),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def search_logs(
    timeline: TimelineSummary,
    keyword: str | None = None,
    template_id: str | None = None,
    limit: int = 30,
) -> tuple[list[EvidenceItem], dict[str, Any]]:
    started = time.perf_counter()
    rows = [item for item in timeline.items if item.kind == "log"]
    if template_id:
        rows = [item for item in rows if item.template_id == template_id]
    if keyword:
        kw = keyword.lower()
        rows = [item for item in rows if kw in item.raw.lower()]
    selected = rows[:limit]
    return selected, {
        "tool": "search_logs",
        "arguments": {"keyword": keyword, "template_id": template_id, "limit": limit},
        "returned": len(selected),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def get_trace(
    timeline: TimelineSummary,
    trace_id: str | None = None,
    outliers_only: bool = False,
    limit: int = 25,
) -> tuple[list[EvidenceItem], dict[str, Any]]:
    started = time.perf_counter()
    rows = [item for item in timeline.items if item.kind == "trace"]
    if trace_id:
        rows = [item for item in rows if item.trace_id == trace_id]
    if outliers_only:
        rows = [item for item in rows if any(f.code == "TRACE_P99_OUTLIER" for f in item.flags)]
    selected = rows[:limit]
    return selected, {
        "tool": "get_trace",
        "arguments": {"trace_id": trace_id, "outliers_only": outliers_only, "limit": limit},
        "returned": len(selected),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
    }
