"""Deterministic fixed-seed scenario generator for IncidentLens."""
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
    # Warm off-white background (#FAFAF9) with a flat crimson (#C81E1E) spike curve
    bg = (250, 250, 249)
    axis = (214, 211, 209)
    line_base = (120, 113, 108)
    spike_color = (200, 30, 30)
    band_bg = (254, 242, 242)

    rows = []
    for y in range(height):
        row = bytearray([0])  # filter type 0
        for x in range(width):
            r, g, b = bg
            if 180 <= x <= 290 and 20 <= y <= 135:
                r, g, b = band_bg
            if x == 30 or y == 135:
                r, g, b = axis
            # Flat baseline until x=180, then sharp spike to top
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


def generate_bad_deploy_friday(out_dir: Path) -> dict:
    """Scenario 1: Bad Deploy Friday (~2,000 log lines, 4 services, traces, 3 metrics, ground truth)."""
    rng = random.Random(42)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = datetime(2026, 11, 25, 13, 45, 0, tzinfo=timezone.utc)

    services = ["api-gateway", "checkout-svc", "payment-svc", "auth-svc"]
    logs: list[str] = []
    traces: list[dict] = []
    metrics: list[tuple[str, str, str, float]] = []

    # Generate ~2,000 logs across 30 minutes (13:45:00Z to 14:15:00Z)
    # 0..1020s (13:45..14:02): healthy baseline
    # 1020s (14:02:00Z): deploy v2.4.1 on checkout-svc sets db_pool_max=5 (prev=50)
    # 1080..1800s (14:03..14:15): checkout-svc pool exhaustion -> retries -> payment-svc timeouts -> api-gateway 504s
    for sec in range(0, 1800):
        ts = _ts(base, sec)
        if sec == 1020:
            logs.append(
                f"{ts} checkout-svc INFO deploy v2.4.1 applied config db_pool_max=5 (prev=50) commit=a91f4c2"
            )
            continue

        # Healthy traffic logs (~1 per second across services)
        svc = services[sec % 4]
        req_id = f"req-{10000 + sec}"
        if sec < 1020:
            if svc == "checkout-svc":
                logs.append(f"{ts} checkout-svc INFO {req_id} cart checkout completed latency_ms={rng.randint(28, 65)} pool_active={rng.randint(4, 14)}/50")
            elif svc == "payment-svc":
                logs.append(f"{ts} payment-svc INFO {req_id} payment authorized provider=stripe latency_ms={rng.randint(40, 90)}")
            elif svc == "auth-svc":
                logs.append(f"{ts} auth-svc INFO {req_id} token verified user_tier=standard latency_ms={rng.randint(6, 18)}")
            else:
                logs.append(f"{ts} api-gateway INFO {req_id} HTTP 200 POST /v1/checkout latency_ms={rng.randint(65, 140)}")
        else:
            # Post-deploy degradation
            if sec % 5 == 0:
                logs.append(f"{ts} auth-svc INFO {req_id} token verified user_tier=standard latency_ms={rng.randint(7, 19)}")
            if sec >= 1080 and sec % 2 == 0:
                logs.append(
                    f"{ts} checkout-svc ERROR {req_id} HikariPool-1 connection acquisition timeout after 3000ms active=5/5 waiting={rng.randint(18, 64)}"
                )
            elif sec >= 1060 and sec % 3 == 0:
                logs.append(
                    f"{ts} checkout-svc WARN {req_id} retry attempt={rng.randint(1, 3)} waiting for db connection pool_max=5"
                )
            if sec >= 1110 and sec % 3 == 0:
                logs.append(
                    f"{ts} payment-svc ERROR {req_id} downstream checkout callback timed out after 4500ms retry_storm=true"
                )
            if sec >= 1125 and sec % 2 == 0:
                logs.append(
                    f"{ts} api-gateway ERROR {req_id} HTTP 504 upstream timeout service=checkout-svc latency_ms={rng.randint(3200, 5100)}"
                )

    # Pad to ~2000 lines with background healthcheck/worker info logs
    while len(logs) < 2000:
        sec = rng.randint(0, 1799)
        svc = rng.choice(services)
        logs.append(f"{_ts(base, sec)} {svc} INFO worker heartbeat queue_depth={rng.randint(0, 4)} status=ok")

    logs.sort()

    # Traces (120 spans)
    for i in range(120):
        sec = i * 15
        ts = _ts(base, sec)
        if sec < 1050:
            dur = round(rng.uniform(35.0, 95.0), 1)
            traces.append({
                "trace_id": f"tr-{i+1:04d}",
                "span_id": f"sp-{i+1:04d}",
                "ts": ts,
                "service": "checkout-svc" if i % 2 == 0 else "payment-svc",
                "operation": "POST /checkout/confirm" if i % 2 == 0 else "POST /payment/charge",
                "duration_ms": dur,
                "status": "OK",
            })
        else:
            is_checkout = i % 2 == 0
            dur = round(rng.uniform(2850.0, 4950.0), 1)
            traces.append({
                "trace_id": f"tr-{i+1:04d}",
                "span_id": f"sp-{i+1:04d}",
                "ts": ts,
                "service": "checkout-svc" if is_checkout else "payment-svc",
                "operation": "db.pool.acquire" if is_checkout else "POST /payment/charge",
                "duration_ms": dur,
                "status": "TIMEOUT",
                "error": "HikariPool-1 pool_max=5 exhausted" if is_checkout else "upstream_checkout_timeout",
            })

    # Metrics (30 1-minute buckets for 3 series: latency_ms, error_rate_pct, pool_usage_pct)
    for minute in range(30):
        sec = minute * 60
        ts = _ts(base, sec)
        if minute < 17:  # before 14:02
            lat = round(rng.uniform(42.0, 62.0), 2)
            err = round(rng.uniform(0.1, 0.4), 2)
            pool = round(rng.uniform(22.0, 32.0), 2)
        elif minute == 17:  # 14:02 deploy
            lat = 185.4
            err = 1.8
            pool = 88.0
        else:
            lat = round(rng.uniform(2450.0, 4120.0), 2)
            err = round(rng.uniform(28.0, 46.5), 2)
            pool = 100.0
        metrics.append((ts, "checkout-svc", "latency_ms", lat))
        metrics.append((ts, "checkout-svc", "error_rate_pct", err))
        metrics.append((ts, "checkout-svc", "pool_usage_pct", pool))

    (out_dir / "logs.log").write_text("\n".join(logs) + "\n", encoding="utf-8")
    (out_dir / "traces.json").write_text(json.dumps(traces, indent=2), encoding="utf-8")

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf)
    writer.writerow(["ts", "service", "metric", "value"])
    writer.writerows(metrics)
    (out_dir / "metrics.csv").write_text(csv_buf.getvalue(), encoding="utf-8")
    _write_synthetic_chart_png(out_dir / "dashboard.png", title_seed=1)

    meta = {
        "id": "bad-deploy-friday",
        "title": "Bad Deploy Friday — Checkout DB Pool Exhaustion",
        "opened_at": "2026-11-25T14:04:00Z",
        "severity": "critical",
        "services": services,
        "has_image": True,
    }
    ground_truth = {
        "scenario_id": "bad-deploy-friday",
        "root_cause_service": "checkout-svc",
        "root_cause_category": "connection_pool_exhaustion",
        "root_cause_summary": "Deploy v2.4.1 on checkout-svc reduced db_pool_max from 50 to 5 at 14:02:00Z, exhausting connections and cascading into retry storms and payment/gateway 504 timeouts.",
        "required_keywords": ["db_pool_max=5", "checkout-svc", "HikariPool-1"],
        "milestones": [
            {"ts": "2026-11-25T14:02:00Z", "event": "Deploy v2.4.1 applied db_pool_max=5"},
            {"ts": "2026-11-25T14:03:00Z", "event": "HikariPool-1 connection timeouts begin"},
            {"ts": "2026-11-25T14:03:30Z", "event": "Payment and API Gateway 504 cascade"},
        ],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (out_dir / "ground_truth.json").write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")
    return meta


def generate_cache_stampede(out_dir: Path) -> dict:
    """Scenario 2: RCAEval-style Redis cache flush causing catalog-svc DB overload."""
    rng = random.Random(108)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = datetime(2026, 11, 24, 9, 10, 0, tzinfo=timezone.utc)
    services = ["api-gateway", "catalog-svc", "redis-proxy", "cart-svc"]
    logs: list[str] = []
    traces: list[dict] = []
    metrics: list[tuple[str, str, str, float]] = []

    for sec in range(0, 1200):
        ts = _ts(base, sec)
        req_id = f"cat-{2000 + sec}"
        if sec == 660:
            logs.append(f"{ts} redis-proxy WARN admin_op ttl_flush executed namespace=product_catalog evicted_keys=48210")
            continue
        if sec < 660:
            svc = services[sec % 4]
            logs.append(f"{ts} {svc} INFO {req_id} cache_hit=true latency_ms={rng.randint(8, 28)}")
        else:
            if sec % 2 == 0:
                logs.append(f"{ts} catalog-svc ERROR {req_id} cache miss stampede db_cpu=98% query_timeout=2000ms")
            if sec % 3 == 0:
                logs.append(f"{ts} cart-svc ERROR {req_id} failed fetching item metadata from catalog-svc status=503")
            if sec % 4 == 0:
                logs.append(f"{ts} api-gateway INFO {req_id} health probe ok")

    for i in range(60):
        sec = i * 20
        ts = _ts(base, sec)
        bad = sec >= 680
        traces.append({
            "trace_id": f"tr-cs-{i+1:04d}",
            "span_id": f"sp-cs-{i+1:04d}",
            "ts": ts,
            "service": "catalog-svc",
            "operation": "SELECT * FROM products",
            "duration_ms": round(rng.uniform(1900.0, 3200.0), 1) if bad else round(rng.uniform(12.0, 35.0), 1),
            "status": "ERROR" if bad else "OK",
            "error": "db_query_timeout" if bad else "",
        })

    for minute in range(20):
        ts = _ts(base, minute * 60)
        bad = minute >= 11
        metrics.append((ts, "catalog-svc", "latency_ms", round(rng.uniform(1750, 2600), 2) if bad else round(rng.uniform(18, 32), 2)))
        metrics.append((ts, "catalog-svc", "error_rate_pct", round(rng.uniform(18, 34), 2) if bad else round(rng.uniform(0.1, 0.3), 2)))
        metrics.append((ts, "catalog-svc", "pool_usage_pct", round(rng.uniform(92, 99), 2) if bad else round(rng.uniform(18, 28), 2)))

    (out_dir / "logs.log").write_text("\n".join(sorted(logs)) + "\n", encoding="utf-8")
    (out_dir / "traces.json").write_text(json.dumps(traces, indent=2), encoding="utf-8")
    csv_buf = io.StringIO()
    w = csv.writer(csv_buf)
    w.writerow(["ts", "service", "metric", "value"])
    w.writerows(metrics)
    (out_dir / "metrics.csv").write_text(csv_buf.getvalue(), encoding="utf-8")
    _write_synthetic_chart_png(out_dir / "dashboard.png", title_seed=2)

    meta = {
        "id": "cache-stampede-rcaeval",
        "title": "Catalog Cache Stampede After Redis TTL Flush",
        "opened_at": "2026-11-24T09:22:00Z",
        "severity": "high",
        "services": services,
        "has_image": True,
    }
    ground_truth = {
        "scenario_id": "cache-stampede-rcaeval",
        "root_cause_service": "redis-proxy",
        "root_cause_category": "cache_stampede",
        "root_cause_summary": "Redis ttl_flush evicted 48,210 product_catalog keys, triggering a DB query stampede on catalog-svc and 503 responses in cart-svc.",
        "required_keywords": ["ttl_flush", "redis-proxy", "catalog-svc"],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (out_dir / "ground_truth.json").write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")
    return meta


def generate_auth_jwks_rotation(out_dir: Path) -> dict:
    """Scenario 3: JWKS key rotation mismatch causing 401/503 bursts."""
    rng = random.Random(77)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = datetime(2026, 11, 23, 18, 0, 0, tzinfo=timezone.utc)
    services = ["auth-svc", "api-gateway", "orders-svc"]
    logs: list[str] = []
    traces: list[dict] = []
    metrics: list[tuple[str, str, str, float]] = []

    for sec in range(0, 900):
        ts = _ts(base, sec)
        req_id = f"auth-{3000 + sec}"
        if sec == 480:
            logs.append(f"{ts} auth-svc INFO jwks_rotate activated kid=key-2026-11b cache_ttl_sec=3600")
            continue
        if sec < 480:
            logs.append(f"{ts} {services[sec % 3]} INFO {req_id} jwt verified kid=key-2026-11a status=200")
        else:
            if sec % 2 == 0:
                logs.append(f"{ts} api-gateway ERROR {req_id} jwt signature invalid kid=key-2026-11b not found in stale JWKS cache")
            if sec % 5 == 0:
                logs.append(f"{ts} orders-svc ERROR {req_id} upstream auth rejected status=401")

    for i in range(45):
        sec = i * 20
        ts = _ts(base, sec)
        bad = sec >= 500
        traces.append({
            "trace_id": f"tr-au-{i+1:04d}",
            "span_id": f"sp-au-{i+1:04d}",
            "ts": ts,
            "service": "api-gateway",
            "operation": "middleware.jwt.verify",
            "duration_ms": round(rng.uniform(45.0, 80.0), 1),
            "status": "ERROR" if bad else "OK",
            "error": "jwks_kid_not_found" if bad else "",
        })

    for minute in range(15):
        ts = _ts(base, minute * 60)
        bad = minute >= 8
        metrics.append((ts, "api-gateway", "latency_ms", round(rng.uniform(35, 65), 2)))
        metrics.append((ts, "api-gateway", "error_rate_pct", round(rng.uniform(32, 51), 2) if bad else round(rng.uniform(0.1, 0.2), 2)))
        metrics.append((ts, "api-gateway", "pool_usage_pct", round(rng.uniform(15, 25), 2)))

    (out_dir / "logs.log").write_text("\n".join(sorted(logs)) + "\n", encoding="utf-8")
    (out_dir / "traces.json").write_text(json.dumps(traces, indent=2), encoding="utf-8")
    csv_buf = io.StringIO()
    w = csv.writer(csv_buf)
    w.writerow(["ts", "service", "metric", "value"])
    w.writerows(metrics)
    (out_dir / "metrics.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    meta = {
        "id": "auth-jwks-rotation",
        "title": "JWKS Key Rotation Cache Mismatch (401 Spike)",
        "opened_at": "2026-11-23T18:08:30Z",
        "severity": "medium",
        "services": services,
        "has_image": False,
    }
    ground_truth = {
        "scenario_id": "auth-jwks-rotation",
        "root_cause_service": "auth-svc",
        "root_cause_category": "auth_failure",
        "root_cause_summary": "auth-svc rotated active signing key to kid=key-2026-11b while api-gateway held a 3600s stale JWKS cache, rejecting valid tokens with 401.",
        "required_keywords": ["jwks_rotate", "key-2026-11b", "api-gateway"],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (out_dir / "ground_truth.json").write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")
    return meta


def generate_all() -> list[dict]:
    return [
        generate_bad_deploy_friday(SCENARIOS_DIR / "bad-deploy-friday"),
        generate_cache_stampede(SCENARIOS_DIR / "cache-stampede-rcaeval"),
        generate_auth_jwks_rotation(SCENARIOS_DIR / "auth-jwks-rotation"),
    ]


if __name__ == "__main__":
    metas = generate_all()
    print(f"Generated {len(metas)} scenarios:", [m["id"] for m in metas])
