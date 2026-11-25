"""CSV metric time-series ingest adapter."""
from __future__ import annotations

import csv
import io
from backend.models import EvidenceItem
from .base import FormatAdapter
from .logs import _normalize_ts


class MetricAdapter(FormatAdapter):
    """Parses CSV metrics (ts,service,metric,value) into EvidenceItems."""

    source_name = "metrics.csv"

    def parse(self, content: str, source: str | None = None) -> list[EvidenceItem]:
        src = source or self.source_name
        stripped = content.strip()
        if not stripped:
            return []

        reader = csv.DictReader(io.StringIO(stripped))
        items: list[EvidenceItem] = []
        for idx, row in enumerate(reader, start=1):
            ts = _normalize_ts(str(row.get("ts") or row.get("timestamp") or "1970-01-01T00:00:00Z"))
            service = str(row.get("service") or "unknown-svc").strip()
            metric_name = str(row.get("metric") or row.get("metric_name") or "value").strip()
            value = float(row.get("value") or 0.0)
            raw = f"{ts} {service} {metric_name}={value:.2f}"
            items.append(
                EvidenceItem(
                    id=f"MET-{idx:04d}",
                    ts=ts,
                    source=src,
                    service=service,
                    kind="metric",
                    raw=raw,
                    metric_name=metric_name,
                    metric_value=value,
                )
            )
        return items
