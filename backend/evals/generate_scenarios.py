"""Deterministic fixed-seed 10-scenario fault-injection generator for IncidentLens (5 fault types)."""
from __future__ import annotations

import csv
import io
import json
import random
import struct
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.config import SCENARIOS_DIR


def _ts(base: datetime, seconds: int) -> str:
    return (base + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_synthetic_chart_png(path: Path, title_seed: int = 1) -> None:
    """Create a valid, lightweight 320x160 PNG chart image using stdlib zlib+struct."""
    width, height = 320, 160
    bg = (250, 250, 249)
    axis = (214, 211, 209)
    line_base = (120, 113, 108)
    spike_color = (200, 30, 30)
    band_bg = (254, 242, 242)

    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            r, g, b = bg
            if 180 <= x <= 290 and 20 <= y <= 135:
                r, g, b = band_bg
            if x == 30 or y == 135:
                r, g, b = axis
            curve_y = 115
            if x > 180:
                progress = min(1.0, (x - 180) / 45.0)
                curve_y = int(115 - progress * (75 + (title_seed % 10)))
            if abs(y - curve_y) <= 1 and 30 <= x <= 300:
                r, g, b = spike_color if x >= 180 else line_base
            row.extend((r, g, b))
        rows.append(bytes(row))

    raw_data = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw_data, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def _write_bundle(
    out_dir: Path,
    meta: dict,
    ground_truth: dict,
    logs: list[str],
    traces: list[dict],
    metrics: list[tuple[str, str, str, float]],
    with_image: bool = False,
    seed: int = 1,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    if logs:
        (out_dir / "logs.log").write_text("\n".join(sorted(logs)) + "\n", encoding="utf-8")
    elif (out_dir / "logs.log").exists():
        (out_dir / "logs.log").unlink()

    if traces:
        (out_dir / "traces.json").write_text(json.dumps(traces, indent=2), encoding="utf-8")
    elif (out_dir / "traces.json").exists():
        (out_dir / "traces.json").unlink()

    if metrics:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["ts", "service", "metric", "value"])
        w.writerows(metrics)
        (out_dir / "metrics.csv").write_text(buf.getvalue(), encoding="utf-8")
    elif (out_dir / "metrics.csv").exists():
        (out_dir / "metrics.csv").unlink()

    if with_image:
        _write_synthetic_chart_png(out_dir / "dashboard.png", title_seed=seed)

    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (out_dir / "ground_truth.json").write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")
    return meta


def generate_bad_deploy_friday(out_dir: Path) -> dict:
    rng = random.Random(42)
    base = datetime(2026, 11, 25, 13, 45, 0, tzinfo=timezone.utc)
    services = ["api-gateway", "checkout-svc", "payment-svc", "auth-svc"]
    logs: list[str] = []
    traces: list[dict] = []
    metrics: list[tuple[str, str, str, float]] = []

    for sec in range(0, 1800):
        ts = _ts(base, sec)
        if sec == 1020:
            logs.append(f"{ts} checkout-svc INFO deploy v2.4.1 applied config db_pool_max=5 (prev=50) commit=a91f4c2")
            continue
        svc = services[sec % 4]
        req_id = f"req-{10000 + sec}"
        if sec < 1020:
            if svc == "checkout-svc":
                logs.append(f"{ts} checkout-svc INFO {req_id} cart checkout completed latency_ms={rng.randint(28, 65)} pool_active={rng.randint(4, 14)}/50")
            elif svc == "payment-svc":
                logs.append(f"{ts} payment-svc INFO {req_id} payment authorized provider=stripe latency_ms={rng.randint(40, 90)}")
            elif svc == "auth-svc":
                logs.append(f"{ts} auth-svc INFO {req_id} token verified Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sig123456 user_tier=standard")
            else:
                logs.append(f"{ts} api-gateway INFO {req_id} HTTP 200 POST /v1/checkout latency_ms={rng.randint(65, 140)}")
        else:
            if sec % 5 == 0:
                logs.append(f"{ts} auth-svc INFO {req_id} token verified user_tier=standard latency_ms={rng.randint(7, 19)}")
            if sec >= 1080 and sec % 2 == 0:
                logs.append(f"{ts} checkout-svc ERROR {req_id} HikariPool-1 connection acquisition timeout after 3000ms active=5/5 waiting={rng.randint(18, 64)}")
            elif sec >= 1060 and sec % 3 == 0:
                logs.append(f"{ts} checkout-svc WARN {req_id} retry attempt={rng.randint(1, 3)} waiting for db connection pool_max=5")
            if sec >= 1110 and sec % 3 == 0:
                logs.append(f"{ts} payment-svc ERROR {req_id} downstream checkout callback timed out after 4500ms retry_storm=true")
            if sec >= 1125 and sec % 2 == 0:
                logs.append(f"{ts} api-gateway ERROR {req_id} HTTP 504 upstream timeout service=checkout-svc latency_ms={rng.randint(3200, 5100)}")

    while len(logs) < 2000:
        sec = rng.randint(0, 1799)
        svc = rng.choice(services)
        logs.append(f"{_ts(base, sec)} {svc} INFO worker heartbeat queue_depth={rng.randint(0, 4)} status=ok")

    for i in range(120):
        sec = i * 15
        ts = _ts(base, sec)
        if sec < 1050:
            traces.append({
                "trace_id": f"tr-{i+1:04d}", "span_id": f"sp-{i+1:04d}", "ts": ts,
                "service": "checkout-svc" if i % 2 == 0 else "payment-svc",
                "operation": "POST /checkout/confirm" if i % 2 == 0 else "POST /payment/charge",
                "duration_ms": round(rng.uniform(35.0, 95.0), 1), "status": "OK",
            })
        else:
            is_checkout = i % 2 == 0
            traces.append({
                "trace_id": f"tr-{i+1:04d}", "span_id": f"sp-{i+1:04d}", "ts": ts,
                "service": "checkout-svc" if is_checkout else "payment-svc",
                "operation": "db.pool.acquire" if is_checkout else "POST /payment/charge",
                "duration_ms": round(rng.uniform(2850.0, 4950.0), 1), "status": "TIMEOUT",
                "error": "HikariPool-1 pool_max=5 exhausted" if is_checkout else "upstream_checkout_timeout",
            })

    for minute in range(30):
        ts = _ts(base, minute * 60)
        if minute < 17:
            lat, err, pool = round(rng.uniform(42, 62), 2), round(rng.uniform(0.1, 0.4), 2), round(rng.uniform(22, 32), 2)
        elif minute == 17:
            lat, err, pool = 185.4, 1.8, 88.0
        else:
            lat, err, pool = round(rng.uniform(2450, 4120), 2), round(rng.uniform(28, 46.5), 2), 100.0
        metrics.extend([
            (ts, "checkout-svc", "latency_ms", lat),
            (ts, "checkout-svc", "error_rate_pct", err),
            (ts, "checkout-svc", "pool_usage_pct", pool),
        ])

    return _write_bundle(
        out_dir,
        meta={"id": "bad-deploy-friday", "title": "Bad Deploy Friday — Checkout DB Pool Exhaustion", "opened_at": "2026-11-25T14:04:00Z", "severity": "critical", "services": services, "has_image": True},
        ground_truth={"scenario_id": "bad-deploy-friday", "root_cause_service": "checkout-svc", "root_cause_category": "connection_pool_exhaustion", "required_keywords": ["db_pool_max=5", "checkout-svc", "HikariPool-1"]},
        logs=logs, traces=traces, metrics=metrics, with_image=True, seed=1,
    )


def _gen_simple_fault(
    scen_id: str,
    title: str,
    opened_at: str,
    severity: str,
    services: list[str],
    root_svc: str,
    downstream_svc: str,
    category: str,
    trigger_log: str,
    error_log_tpl: str,
    downstream_log_tpl: str,
    required_keywords: list[str],
    seed: int,
    with_image: bool = False,
    omit_logs: bool = False,
) -> dict:
    rng = random.Random(seed)
    base = datetime.fromisoformat(opened_at.replace("Z", "+00:00")) - timedelta(minutes=12)
    logs: list[str] = []
    traces: list[dict] = []
    metrics: list[tuple[str, str, str, float]] = []

    if not omit_logs:
        for sec in range(0, 900):
            ts = _ts(base, sec)
            req = f"req-{seed}-{sec}"
            if sec == 480:
                logs.append(f"{ts} {root_svc} WARN {trigger_log}")
                continue
            if sec < 480:
                logs.append(f"{ts} {services[sec % len(services)]} INFO {req} request ok latency_ms={rng.randint(10, 40)}")
            else:
                if sec % 2 == 0:
                    logs.append(f"{ts} {root_svc} ERROR {req} {error_log_tpl}")
                if sec % 3 == 0:
                    logs.append(f"{ts} {downstream_svc} ERROR {req} {downstream_log_tpl}")
                if sec % 5 == 0:
                    logs.append(f"{ts} api-gateway ERROR {req} HTTP 503 upstream={downstream_svc}")

    for i in range(40):
        sec = i * 22
        bad = sec >= 500
        traces.append({
            "trace_id": f"tr-{seed}-{i+1:03d}", "span_id": f"sp-{seed}-{i+1:03d}",
            "ts": _ts(base, sec), "service": root_svc if i % 2 == 0 else downstream_svc,
            "operation": f"{root_svc}.handle",
            "duration_ms": round(rng.uniform(2100, 3900), 1) if bad else round(rng.uniform(18, 55), 1),
            "status": "ERROR" if bad else "OK",
            "error": category if bad else "",
        })

    for minute in range(15):
        ts = _ts(base, minute * 60)
        bad = minute >= 8
        metrics.extend([
            (ts, root_svc, "latency_ms", round(rng.uniform(1850, 2900), 2) if bad else round(rng.uniform(22, 42), 2)),
            (ts, root_svc, "error_rate_pct", round(rng.uniform(22, 45), 2) if bad else round(rng.uniform(0.1, 0.3), 2)),
            (ts, root_svc, "pool_usage_pct", round(rng.uniform(90, 99), 2) if bad else round(rng.uniform(20, 35), 2)),
        ])

    return _write_bundle(
        SCENARIOS_DIR / scen_id,
        meta={"id": scen_id, "title": title, "opened_at": opened_at, "severity": severity, "services": services, "has_image": with_image},
        ground_truth={"scenario_id": scen_id, "root_cause_service": root_svc, "root_cause_category": category, "required_keywords": required_keywords},
        logs=logs, traces=traces, metrics=metrics, with_image=with_image, seed=seed,
    )


def generate_all() -> list[dict]:
    return [
        generate_bad_deploy_friday(SCENARIOS_DIR / "bad-deploy-friday"),
        _gen_simple_fault(
            "cache-stampede-rcaeval",
            "Catalog Cache Stampede After Redis TTL Flush",
            "2026-11-24T09:22:00Z", "high",
            ["api-gateway", "catalog-svc", "redis-proxy", "cart-svc"],
            "redis-proxy", "catalog-svc", "cache_stampede",
            "admin_op ttl_flush executed namespace=product_catalog evicted_keys=48210",
            "cache miss storm namespace=product_catalog evicted_keys=48210",
            "db overload from catalog-svc cache miss stampede",
            ["ttl_flush", "redis-proxy", "catalog-svc"],
            seed=108, with_image=True,
        ),
        _gen_simple_fault(
            "auth-jwks-rotation",
            "JWKS Key Rotation Cache Mismatch (401 Spike)",
            "2026-11-23T18:08:30Z", "medium",
            ["auth-svc", "api-gateway", "orders-svc"],
            "auth-svc", "api-gateway", "auth_token_mismatch",
            "jwks_rotate activated kid=key-2026-11b cache_ttl_sec=3600",
            "signing key rotated kid=key-2026-11b missing in consumer cache",
            "jwt signature invalid kid=key-2026-11b rejected 401",
            ["jwks_rotate", "auth-svc", "key-2026-11b"],
            seed=77,
        ),
        _gen_simple_fault(
            "inventory-oom-kill",
            "Inventory Worker OOMKill After Batch Export Deploy",
            "2026-11-22T11:15:00Z", "critical",
            ["api-gateway", "inventory-svc", "warehouse-sync"],
            "inventory-svc", "warehouse-sync", "memory_exhaustion",
            "deploy v3.8.0 enabled unbounded_csv_buffer=true heap_limit=512Mi",
            "OutOfMemoryError Java heap space oom_kill container=inventory-svc",
            "warehouse-sync failed calling inventory-svc connection reset",
            ["OutOfMemoryError", "inventory-svc", "oom_kill"],
            seed=201,
        ),
        _gen_simple_fault(
            "payment-webhook-timeout",
            "Payment Provider TLS Handshake Timeout Cascade",
            "2026-11-21T16:40:00Z", "high",
            ["api-gateway", "checkout-svc", "payment-svc"],
            "payment-svc", "checkout-svc", "upstream_timeout",
            "deploy egress_proxy_pool=2 upstream=stripe-webhook timeout_ms=5000",
            "upstream TLS handshake timeout after 5000ms partner=stripe-webhook",
            "checkout-svc payment authorization timed out status=504",
            ["payment-svc", "timeout", "stripe-webhook"],
            seed=305,
        ),
        _gen_simple_fault(
            "orders-db-pool-exhaustion",
            "Orders Service Connection Pool Saturation on Bulk Import",
            "2026-11-20T08:30:00Z", "high",
            ["api-gateway", "orders-svc", "billing-svc"],
            "orders-svc", "billing-svc", "connection_pool_exhaustion",
            "deploy v1.9.4 applied config db_pool_max=3 max_wait_ms=1500",
            "pgpool connection pool exhausted active=3/3 queued=48",
            "billing-svc failed reading orders-svc ledger timeout",
            ["orders-svc", "db_pool_max=3", "exhausted"],
            seed=412,
        ),
        _gen_simple_fault(
            "session-redis-eviction",
            "Session Store Memory Eviction Causing Login Failures",
            "2026-11-19T21:10:00Z", "high",
            ["api-gateway", "session-svc", "auth-svc"],
            "session-svc", "auth-svc", "cache_stampede",
            "redis maxmemory-policy volatile-lru triggered mass eviction keys=19400",
            "session lookup miss after mass eviction redis_oom=true",
            "auth-svc session validation failed unexpected cache miss",
            ["session-svc", "eviction", "redis"],
            seed=518,
        ),
        _gen_simple_fault(
            "search-gc-pause",
            "Search Indexer Stop-The-World GC Pause Outage",
            "2026-11-18T14:50:00Z", "medium",
            ["api-gateway", "search-svc", "catalog-svc"],
            "search-svc", "catalog-svc", "memory_exhaustion",
            "config heap_ratio=0.95 triggered continuous Full GC pause_ms=4200",
            "JVM Full GC pause exceeded 4000ms oom_pressure=high",
            "catalog-svc fallback search query timed out",
            ["search-svc", "GC", "oom_pressure"],
            seed=624,
        ),
        _gen_simple_fault(
            "shipping-rate-api-timeout",
            "Carrier Rate Calculator Upstream Timeout Storm",
            "2026-11-17T10:05:00Z", "medium",
            ["api-gateway", "shipping-svc", "checkout-svc"],
            "shipping-svc", "checkout-svc", "upstream_timeout",
            "config retry_attempts=8 backoff=0ms partner=fedex-rates",
            "carrier rate endpoint timed out retry_storm=8x",
            "checkout-svc shipping quote call failed status=504",
            ["shipping-svc", "timed out", "retry_storm"],
            seed=731,
        ),
        # Scenario 10: Deliberate degraded/missing-logs edge case for honest miss/partial-telemetry reporting
        _gen_simple_fault(
            "partial-telemetry-missing-logs",
            "Partial Telemetry Edge Case (Logs Dropped, Metrics/Traces Only)",
            "2026-11-16T04:15:00Z", "low",
            ["api-gateway", "metrics-collector"],
            "metrics-collector", "api-gateway", "upstream_timeout",
            "log forwarder dropped buffer",
            "unused",
            "unused",
            ["metrics-collector", "missing-logs"],
            seed=899, omit_logs=True,
        ),
    ]


if __name__ == "__main__":
    metas = generate_all()
    print(f"Generated {len(metas)} scenarios:", [m["id"] for m in metas])
