"""M2 Timeline merger and deterministic anomaly flagger (no LLM involved)."""
from __future__ import annotations

import math
import statistics
from collections import defaultdict
from backend.models import AnomalyFlag, EvidenceItem, MetricPoint, TimelineSummary


def _minute_bucket(ts: str) -> str:
    # ISO8601 e.g. 2026-11-25T14:02:15Z -> 2026-11-25T14:02
    return ts[:16]


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = (len(ordered) - 1) * pct
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def build_timeline(
    incident_id: str,
    items: list[EvidenceItem],
    redacted_secrets_count: int = 0,
) -> TimelineSummary:
    """Merge evidence items chronologically and attach deterministic statistical anomaly flags."""
    # Clone items so repeated calls don't accumulate duplicate flags
    cloned = [item.model_copy(deep=True) for item in items]
    for item in cloned:
        item.flags = []

    cloned.sort(key=lambda x: (x.ts, x.kind, x.id))
    services = sorted({item.service for item in cloned})

    # 1. Track first occurrence of error templates
    seen_error_templates: set[tuple[str, str]] = set()
    error_counts_by_bucket: dict[tuple[str, str], int] = defaultdict(int)
    bucket_error_items: dict[tuple[str, str], list[EvidenceItem]] = defaultdict(list)

    for item in cloned:
        if item.kind == "log" and item.level in {"ERROR", "CRITICAL", "FATAL"}:
            tpl_key = (item.service, item.template_id or "RAW")
            if tpl_key not in seen_error_templates:
                seen_error_templates.add(tpl_key)
                item.flags.append(
                    AnomalyFlag(
                        code="FIRST_ERROR_OCCURRENCE",
                        severity="warning",
                        label="First error occurrence",
                        detail=f"First appearance of error template {item.template_id or 'RAW'} on {item.service}.",
                    )
                )
            b = (_minute_bucket(item.ts), item.service)
            error_counts_by_bucket[b] += 1
            bucket_error_items[b].append(item)

        if item.kind == "log" and any(
            kw in item.raw.lower() for kw in ("deploy", "pool_max=", "config applied", "ttl_flush", "jwks_rotate")
        ):
            item.flags.append(
                AnomalyFlag(
                    code="CONFIG_OR_DEPLOY_EVENT",
                    severity="info",
                    label="Deploy / config event",
                    detail=f"Deployment or configuration change recorded on {item.service}.",
                )
            )

    # 2. Error burst detection (counts per minute vs baseline across non-zero/all buckets)
    all_buckets = sorted({_minute_bucket(item.ts) for item in cloned})
    for svc in services:
        counts = [error_counts_by_bucket[(b, svc)] for b in all_buckets]
        if not counts:
            continue
        baseline_slice = counts[: max(3, len(counts) // 2)]
        mean_c = statistics.mean(baseline_slice) if baseline_slice else 0.0
        std_c = statistics.pstdev(baseline_slice) if len(baseline_slice) > 1 else 0.0
        threshold = max(4.0, mean_c + 3.0 * std_c)
        for b in all_buckets:
            cnt = error_counts_by_bucket[(b, svc)]
            if cnt >= threshold:
                # Flag the first error item in that burst bucket so the timeline stays readable
                burst_items = bucket_error_items[(b, svc)]
                if burst_items:
                    burst_items[0].flags.append(
                        AnomalyFlag(
                            code="ERROR_BURST",
                            severity="critical",
                            label="Error burst",
                            detail=f"{cnt} errors/min on {svc} (baseline mean={mean_c:.1f}, threshold={threshold:.1f}).",
                            value=float(cnt),
                        )
                    )

    # 3. Metric z-score spike (> 3 sigma)
    metrics_by_key: dict[tuple[str, str], list[EvidenceItem]] = defaultdict(list)
    for item in cloned:
        if item.kind == "metric" and item.metric_name is not None and item.metric_value is not None:
            metrics_by_key[(item.service, item.metric_name)].append(item)

    metric_series: dict[str, list[MetricPoint]] = defaultdict(list)
    for (svc, metric_name), m_items in metrics_by_key.items():
        m_items.sort(key=lambda x: x.ts)
        vals = [m.metric_value or 0.0 for m in m_items]
        baseline_vals = vals[: max(3, len(vals) // 2)]
        mean_v = statistics.mean(baseline_vals)
        std_v = statistics.pstdev(baseline_vals) if len(baseline_vals) > 1 else 0.0
        effective_std = max(std_v, max(abs(mean_v) * 0.05, 0.5))

        for m in m_items:
            val = m.metric_value or 0.0
            z = (val - mean_v) / effective_std
            is_anom = z > 3.0
            if is_anom:
                m.flags.append(
                    AnomalyFlag(
                        code="METRIC_SPIKE",
                        severity="critical" if z >= 5.0 else "warning",
                        label=f"Metric spike ({metric_name})",
                        detail=f"{metric_name}={val:.2f} on {svc} (z={z:.2f}, baseline={mean_v:.2f}).",
                        metric_name=metric_name,
                        z_score=round(z, 2),
                        value=val,
                    )
                )
            metric_series[metric_name].append(
                MetricPoint(
                    ts=m.ts,
                    service=svc,
                    metric_name=metric_name,
                    value=val,
                    z_score=round(z, 2),
                    is_anomaly=is_anom,
                    evidence_id=m.id,
                )
            )

    # 4. Trace latency outlier detection (p99 / >3x baseline p95)
    traces_by_svc: dict[str, list[EvidenceItem]] = defaultdict(list)
    for item in cloned:
        if item.kind == "trace" and item.duration_ms is not None:
            traces_by_svc[item.service].append(item)

    for svc, t_items in traces_by_svc.items():
        t_items.sort(key=lambda x: x.ts)
        durations = [t.duration_ms or 0.0 for t in t_items]
        baseline_durs = durations[: max(4, len(durations) // 2)]
        p95 = _percentile(baseline_durs, 0.95)
        p99_threshold = max(p95 * 2.5, 500.0)
        for t in t_items:
            dur = t.duration_ms or 0.0
            if dur >= p99_threshold or t.level == "ERROR":
                t.flags.append(
                    AnomalyFlag(
                        code="TRACE_P99_OUTLIER",
                        severity="critical" if dur >= p99_threshold * 1.5 or t.level == "ERROR" else "warning",
                        label="Latency outlier",
                        detail=f"Trace span {t.span_id} duration={dur:.1f}ms on {svc} (threshold={p99_threshold:.1f}ms).",
                        value=dur,
                    )
                )

    flagged_items = [item for item in cloned if item.flags]
    critical_or_warn = [
        item for item in flagged_items if any(f.severity in {"critical", "warning"} for f in item.flags)
    ]
    anomaly_window = (
        [critical_or_warn[0].ts, critical_or_warn[-1].ts] if critical_or_warn else None
    )

    for key in metric_series:
        metric_series[key].sort(key=lambda p: p.ts)

    return TimelineSummary(
        incident_id=incident_id,
        services=services,
        total_items=len(cloned),
        anomaly_count=len(flagged_items),
        redacted_secrets_count=redacted_secrets_count,
        anomaly_window=anomaly_window,
        items=cloned,
        metric_series=dict(metric_series),
    )
