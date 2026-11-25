"""Lightweight Cloud-Native Collector Agent for Kubernetes, Prometheus, and Container Logs.

Connects to a live cluster or local microservices environment and automatically pushes
telemetry + alerts to IncidentLens (POST /api/webhooks/alert) whenever an anomaly occurs —
no manual downloading or uploading required.

Environment variables:
  INCIDENTLENS_URL   Base URL of IncidentLens API (default: http://127.0.0.1:8000)
  PROMETHEUS_URL     Optional Prometheus URL to query error/latency metrics automatically
  K8S_NAMESPACE      Kubernetes namespace to watch via kubectl (default: default)
  LOG_FILE_PATH      Optional local/mounted log file to tail for error bursts
  POLL_INTERVAL_SEC  Poll interval in seconds (default: 15)
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

INCIDENTLENS_URL = os.getenv("INCIDENTLENS_URL", "http://127.0.0.1:8000").rstrip("/")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "").rstrip("/")
K8S_NAMESPACE = os.getenv("K8S_NAMESPACE", "default")
LOG_FILE_PATH = os.getenv("LOG_FILE_PATH", "")
POLL_INTERVAL_SEC = int(os.getenv("POLL_INTERVAL_SEC", "15"))


def fetch_k8s_events(namespace: str) -> list[dict]:
    """Collect recent Kubernetes Warning/Normal events via kubectl (read-only)."""
    try:
        out = subprocess.check_output(
            ["kubectl", "get", "events", "-n", namespace, "-o", "json"],
            stderr=subprocess.DEVNULL,
            timeout=5,
            text=True,
        )
        items = json.loads(out).get("items", [])
        events = []
        for ev in items[-30:]:
            events.append({
                "ts": ev.get("lastTimestamp") or ev.get("eventTime") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "service": ev.get("involvedObject", {}).get("name", "k8s-pod"),
                "event_type": ev.get("reason", "K8sEvent"),
                "actor": "kube-controller",
                "message": ev.get("message", ""),
            })
        return events
    except Exception:
        return []


def fetch_prometheus_metrics(prom_url: str) -> str:
    """Query instant HTTP error rate / latency metrics from Prometheus if configured."""
    if not prom_url:
        return ""
    rows = ["ts,service,metric,value"]
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    queries = {
        "error_rate_pct": 'sum(rate(http_requests_total{status=~"5.."}[1m])) by (service) * 100',
        "latency_ms": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service)) * 1000",
    }
    with httpx.Client(timeout=5.0) as client:
        for metric_name, expr in queries.items():
            try:
                res = client.get(f"{prom_url}/api/v1/query", params={"query": expr}).json()
                for item in res.get("data", {}).get("result", []):
                    svc = item.get("metric", {}).get("service") or "unknown-svc"
                    val = float(item["value"][1])
                    rows.append(f"{now_ts},{svc},{metric_name},{val:.2f}")
            except Exception:
                continue
    return "\n".join(rows) if len(rows) > 1 else ""


def tail_log_errors(path_str: str, max_lines: int = 400) -> tuple[str, int]:
    """Read tail of a mounted log file and count ERROR/CRITICAL lines."""
    p = Path(path_str)
    if not p.exists():
        return "", 0
    lines = p.read_text(encoding="utf-8", errors="replace").splitlines()[-max_lines:]
    err_count = sum(1 for ln in lines if "ERROR" in ln or "CRITICAL" in ln or "FATAL" in ln)
    return "\n".join(lines), err_count


def run_once() -> bool:
    logs_text, err_count = tail_log_errors(LOG_FILE_PATH) if LOG_FILE_PATH else ("", 0)
    k8s_events = fetch_k8s_events(K8S_NAMESPACE)
    metrics_csv = fetch_prometheus_metrics(PROMETHEUS_URL)

    has_warning_event = any(
        "fail" in (e.get("message") or "").lower() or "backoff" in (e.get("event_type") or "").lower()
        for e in k8s_events
    )
    if err_count < 3 and not has_warning_event:
        return False

    payload = {
        "alert_name": f"Automated Cloud-Native Anomaly ({err_count} errors)",
        "service": k8s_events[-1]["service"] if k8s_events else "cluster-workload",
        "severity": "critical" if err_count >= 10 else "high",
        "source": "cloud-native-agent",
        "logs": logs_text or None,
        "metrics": metrics_csv or None,
        "events": json.dumps(k8s_events) if k8s_events else None,
        "auto_investigate": True,
    }
    resp = httpx.post(f"{INCIDENTLENS_URL}/api/webhooks/alert", json=payload, timeout=30.0)
    resp.raise_for_status()
    print(f"[{datetime.now(timezone.utc).isoformat()}] Auto-ingested incident:", resp.json()["meta"]["id"])
    return True


if __name__ == "__main__":
    print(f"Watching cloud-native telemetry -> {INCIDENTLENS_URL} (every {POLL_INTERVAL_SEC}s)...")
    while True:
        try:
            run_once()
        except Exception as exc:
            print("Collector cycle error:", exc)
        time.sleep(POLL_INTERVAL_SEC)
