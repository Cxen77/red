"""M5 FastAPI service for IncidentLens."""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field

from backend.agent.chat import answer_incident_question
from backend.agent.llm import DeciderGateway
from backend.config import ARTIFACTS_DIR, OPENROUTER_MODEL
from backend.models import (
    ChatRequest,
    ChatResponse,
    IncidentMetadata,
    InvestigationResult,
    RemediationAction,
    ReviewDecision,
    SeverityLevel,
    TimelineSummary,
)
from backend.verify.report import build_html_report, build_json_report, build_markdown_report
from .store import get_store

@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop_event = asyncio.Event()

    async def _dropzone_loop() -> None:
        while not stop_event.is_set():
            try:
                get_store().scan_dropzone(auto_investigate=True)
                if _CONNECTOR_CFG.enabled:
                    _run_connector_sync(_CONNECTOR_CFG)
            except Exception:
                pass
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=float(max(5, _CONNECTOR_CFG.poll_interval_sec if _CONNECTOR_CFG.enabled else 5)),
                )
            except asyncio.TimeoutError:
                continue

    task = asyncio.create_task(_dropzone_loop())
    try:
        yield
    finally:
        stop_event.set()
        task.cancel()


app = FastAPI(
    title="IncidentLens API",
    version="1.2.0",
    description="Incident investigation with automated Alertmanager/OTLP ingestion, deterministic citation verification, human review controls, and guarded remediation.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DeciderEvaluateRequest(BaseModel):
    state: list[Any]
    questions: dict[str, dict[str, Any]]
    image_base64: str | None = None
    image_mime: str = "image/png"


class CreateIncidentJson(BaseModel):
    title: str = Field(..., min_length=2)
    severity: SeverityLevel = "high"
    logs: str | None = None
    traces: str | None = None
    metrics: str | None = None
    events: str | None = None
    auto_investigate: bool = True


class WebhookAlertPayload(BaseModel):
    alert_name: str = Field(..., min_length=2)
    service: str = "checkout-svc"
    severity: SeverityLevel = "high"
    source: str = "alertmanager"
    logs: str | None = None
    traces: str | None = None
    metrics: str | None = None
    events: str | None = None
    auto_investigate: bool = True


class ReviewSubmission(BaseModel):
    decision: ReviewDecision
    corrected_root_cause: str | None = None
    note: str | None = None


class ActionDecisionRequest(BaseModel):
    decision: Literal["dry_run", "approve", "block"]
    note: str | None = None


class ConnectorConfig(BaseModel):
    enabled: bool = False
    prometheus_url: str = ""
    k8s_namespace: str = "default"
    log_file_path: str = ""
    poll_interval_sec: int = 30


_CONNECTOR_CFG = ConnectorConfig()


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "incidentlens", "model": OPENROUTER_MODEL}


@app.get("/incidents", response_model=list[IncidentMetadata])
@app.get("/api/incidents", response_model=list[IncidentMetadata])
def list_incidents() -> list[IncidentMetadata]:
    return get_store().list_incidents()


@app.post("/incidents", response_model=IncidentMetadata)
@app.post("/api/incidents", response_model=IncidentMetadata)
async def create_incident(
    title: str = Form(...),
    severity: SeverityLevel = Form("high"),
    logs_text: str | None = Form(None),
    traces_text: str | None = Form(None),
    metrics_text: str | None = Form(None),
    logs_file: UploadFile | None = File(None),
    traces_file: UploadFile | None = File(None),
    metrics_file: UploadFile | None = File(None),
    image_file: UploadFile | None = File(None),
) -> IncidentMetadata:
    final_logs = (await logs_file.read()).decode("utf-8", errors="replace") if logs_file else logs_text
    final_traces = (await traces_file.read()).decode("utf-8", errors="replace") if traces_file else traces_text
    final_metrics = (await metrics_file.read()).decode("utf-8", errors="replace") if metrics_file else metrics_text
    img_bytes = await image_file.read() if image_file else None

    if not any([final_logs, final_traces, final_metrics]):
        raise HTTPException(status_code=400, detail="Provide at least one telemetry input (logs, traces, or metrics).")

    rec = get_store().create_incident(
        title=title,
        severity=severity,
        logs_text=final_logs,
        traces_text=final_traces,
        metrics_text=final_metrics,
        image_bytes=img_bytes,
    )
    return rec.meta


@app.post("/api/incidents/json", response_model=IncidentMetadata)
def create_incident_json(payload: CreateIncidentJson) -> IncidentMetadata:
    if not any([payload.logs, payload.traces, payload.metrics, payload.events]):
        raise HTTPException(status_code=400, detail="Provide at least one telemetry input.")
    store = get_store()
    rec = store.create_incident(
        title=payload.title,
        severity=payload.severity,
        logs_text=payload.logs,
        traces_text=payload.traces,
        metrics_text=payload.metrics,
        events_text=payload.events,
    )
    if payload.auto_investigate:
        store.investigate(rec.meta.id, mode="live")
    return rec.meta


@app.post("/api/webhooks/alert")
def webhook_auto_ingest(payload: WebhookAlertPayload) -> dict[str, Any]:
    """Automated webhook receiver (Alertmanager / Grafana / Log forwarder):
    automatically ingests telemetry, redacts secrets, builds timeline, and runs investigation."""
    store = get_store()
    if not any([payload.logs, payload.traces, payload.metrics, payload.events]):
        raise HTTPException(status_code=400, detail="Webhook payload must include telemetry.")
    rec = store.create_incident(
        title=f"[{payload.source}] {payload.alert_name}",
        severity=payload.severity,
        logs_text=payload.logs,
        traces_text=payload.traces,
        metrics_text=payload.metrics,
        events_text=payload.events,
    )
    investigation = None
    if payload.auto_investigate:
        investigation = store.investigate(rec.meta.id, mode="live")
    return {"meta": rec.meta, "investigation": investigation}


@app.post("/api/incidents/simulate-live")
def simulate_live_alert() -> dict[str, Any]:
    """Simulate an automated webhook alert arriving from a live cluster and investigate it immediately."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    t0 = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    logs = "\n".join([
        f"{t0} api-gateway INFO req-9001 HTTP 200 GET /health latency_ms=9",
        f"{t0} payment-svc INFO deploy v4.2.0 applied config timeout_ms=250 (prev=5000)",
        f"{t0} payment-svc ERROR req-9002 upstream gateway timeout after 250ms provider=stripe",
        f"{t0} payment-svc ERROR req-9003 upstream gateway timeout after 250ms provider=stripe",
        f"{t0} payment-svc ERROR req-9004 upstream gateway timeout after 250ms provider=stripe",
        f"{t0} payment-svc ERROR req-9005 upstream gateway timeout after 250ms provider=stripe",
        f"{t0} checkout-svc ERROR req-9005 payment authorization failed status=504",
    ])
    metrics = "\n".join([
        "ts,service,metric,value",
        f"{t0},payment-svc,latency_ms,48.0",
        f"{t0},payment-svc,latency_ms,52.0",
        f"{t0},payment-svc,latency_ms,49.0",
        f"{t0},payment-svc,latency_ms,3180.0",
        f"{t0},payment-svc,error_rate_pct,0.2",
        f"{t0},payment-svc,error_rate_pct,0.3",
        f"{t0},payment-svc,error_rate_pct,0.2",
        f"{t0},payment-svc,error_rate_pct,38.4",
    ])
    events = json.dumps([
        {
            "ts": t0,
            "service": "payment-svc",
            "event_type": "ConfigMapUpdated",
            "actor": "argocd-sync",
            "commit": "f48c91d",
            "message": "Updated payment-svc timeout_ms 5000 -> 250",
        }
    ])
    store = get_store()
    rec = store.create_incident(
        title="Auto-Alert: Payment Timeout Regression",
        severity="critical",
        logs_text=logs,
        metrics_text=metrics,
        events_text=events,
    )
    inv = store.investigate(rec.meta.id, mode="live")
    return {"meta": rec.meta, "investigation": inv}


@app.post("/api/dropzone/scan")
def scan_dropzone(auto_investigate: bool = True) -> dict[str, Any]:
    imported = get_store().scan_dropzone(auto_investigate=auto_investigate)
    return {"imported_ids": imported, "count": len(imported)}


@app.post("/api/webhooks/alertmanager")
def alertmanager_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """Native Prometheus Alertmanager webhook receiver for automatic cloud-native ingestion."""
    alerts = payload.get("alerts", [])
    if not alerts:
        raise HTTPException(status_code=400, detail="Alertmanager payload contains no alerts.")

    first = alerts[0]
    labels = first.get("labels", {})
    annotations = first.get("annotations", {})
    alert_name = labels.get("alertname") or "AlertmanagerFiring"
    service = labels.get("service") or labels.get("job") or "cloud-service"
    sev_raw = str(labels.get("severity") or "high").lower()
    severity: SeverityLevel = sev_raw if sev_raw in {"critical", "high", "medium", "low"} else "high"

    log_lines = []
    event_list = []
    for a in alerts:
        lbl = a.get("labels", {})
        ann = a.get("annotations", {})
        ts = a.get("startsAt") or "2026-11-25T14:00:00Z"
        svc = lbl.get("service") or lbl.get("job") or service
        summary = ann.get("summary") or ann.get("description") or lbl.get("alertname") or "Alert firing"
        log_lines.append(f"{ts} {svc} ERROR alert={lbl.get('alertname', alert_name)} {summary}")
        event_list.append({
            "ts": ts,
            "service": svc,
            "event_type": "AlertmanagerFiring",
            "actor": "prometheus-alertmanager",
            "message": summary,
        })

    store = get_store()
    rec = store.create_incident(
        title=f"[Alertmanager] {alert_name} ({service})",
        severity=severity,
        logs_text="\n".join(log_lines),
        events_text=json.dumps(event_list),
    )
    inv = store.investigate(rec.meta.id, mode="live")
    return {"meta": rec.meta, "investigation": inv}


@app.post("/api/ingest/otel")
def ingest_otel_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Direct OTLP HTTP JSON receiver for OpenTelemetry Collector resourceSpans."""
    if "resourceSpans" not in payload:
        raise HTTPException(status_code=400, detail="Expected OTLP resourceSpans payload.")
    store = get_store()
    rec = store.create_incident(
        title="OTLP Live Trace Anomaly",
        severity="high",
        traces_text=json.dumps(payload),
    )
    inv = store.investigate(rec.meta.id, mode="live")
    return {"meta": rec.meta, "investigation": inv}


def _run_connector_sync(cfg: ConnectorConfig) -> dict[str, Any]:
    from connectors.cloud_native_agent import (
        fetch_k8s_events,
        fetch_prometheus_metrics,
        tail_log_errors,
    )

    logs_text, err_count = tail_log_errors(cfg.log_file_path) if cfg.log_file_path else ("", 0)
    k8s_events = fetch_k8s_events(cfg.k8s_namespace) if cfg.k8s_namespace else []
    metrics_csv = fetch_prometheus_metrics(cfg.prometheus_url) if cfg.prometheus_url else ""

    has_warning = any(
        "fail" in (e.get("message") or "").lower() or "backoff" in (e.get("event_type") or "").lower()
        for e in k8s_events
    )
    if not logs_text and not k8s_events and not metrics_csv:
        return {"ingested": False, "reason": "No live telemetry reachable from configured sources."}

    if err_count < 1 and not has_warning and not metrics_csv:
        return {"ingested": False, "reason": "Sources healthy; no error burst detected."}

    store = get_store()
    svc = k8s_events[-1]["service"] if k8s_events else "connected-cluster"
    rec = store.create_incident(
        title=f"Cloud-Native Sync: {svc}",
        severity="critical" if err_count >= 10 else "high",
        logs_text=logs_text or None,
        metrics_text=metrics_csv or None,
        events_text=json.dumps(k8s_events) if k8s_events else None,
    )
    inv = store.investigate(rec.meta.id, mode="live")
    return {"ingested": True, "incident_id": rec.meta.id, "meta": rec.meta, "investigation": inv}


@app.get("/api/connectors/config", response_model=ConnectorConfig)
def get_connector_config() -> ConnectorConfig:
    return _CONNECTOR_CFG


@app.post("/api/connectors/config", response_model=ConnectorConfig)
def save_connector_config(cfg: ConnectorConfig) -> ConnectorConfig:
    global _CONNECTOR_CFG
    _CONNECTOR_CFG = cfg
    return _CONNECTOR_CFG


@app.post("/api/connectors/sync")
def sync_connectors(cfg: ConnectorConfig | None = None) -> dict[str, Any]:
    target = cfg or _CONNECTOR_CFG
    return _run_connector_sync(target)


@app.get("/incidents/{incident_id}")
@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str) -> dict[str, Any]:
    rec = get_store().get(incident_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {
        "meta": rec.meta,
        "investigation": rec.investigation,
    }


@app.get("/incidents/{incident_id}/timeline", response_model=TimelineSummary)
@app.get("/api/incidents/{incident_id}/timeline", response_model=TimelineSummary)
def get_timeline(incident_id: str) -> TimelineSummary:
    rec = get_store().get(incident_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Incident not found")
    return rec.timeline


@app.get("/incidents/{incident_id}/image")
@app.get("/api/incidents/{incident_id}/image")
def get_incident_image(incident_id: str) -> Response:
    rec = get_store().get(incident_id)
    if not rec or not rec.image_bytes:
        raise HTTPException(status_code=404, detail="No image attached to incident")
    return Response(content=rec.image_bytes, media_type="image/png")


@app.post("/incidents/{incident_id}/investigate", response_model=InvestigationResult)
@app.post("/api/incidents/{incident_id}/investigate", response_model=InvestigationResult)
def investigate(
    incident_id: str,
    mode: Literal["live", "replay"] = Query("live"),
) -> InvestigationResult:
    try:
        return get_store().investigate(incident_id, mode=mode)
    except KeyError:
        raise HTTPException(status_code=404, detail="Incident not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Investigation failed: {exc}")


@app.post("/incidents/{incident_id}/review", response_model=InvestigationResult)
@app.post("/api/incidents/{incident_id}/review", response_model=InvestigationResult)
def submit_review(incident_id: str, payload: ReviewSubmission) -> InvestigationResult:
    try:
        return get_store().submit_review(
            incident_id=incident_id,
            decision=payload.decision,
            corrected_root_cause=payload.corrected_root_cause,
            note=payload.note,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Incident or investigation not found")


@app.post("/incidents/{incident_id}/actions/{action_id}", response_model=RemediationAction)
@app.post("/api/incidents/{incident_id}/actions/{action_id}", response_model=RemediationAction)
def decide_action(
    incident_id: str,
    action_id: str,
    payload: ActionDecisionRequest,
) -> RemediationAction:
    try:
        return get_store().decide_action(
            incident_id=incident_id,
            action_id=action_id,
            decision=payload.decision,
            note=payload.note,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Incident or action not found")


@app.post("/incidents/{incident_id}/verify-recovery", response_model=InvestigationResult)
@app.post("/api/incidents/{incident_id}/verify-recovery", response_model=InvestigationResult)
def verify_recovery(
    incident_id: str,
    target_url: str = Query("http://127.0.0.1:9001"),
) -> InvestigationResult:
    try:
        return get_store().verify_recovery(incident_id, target_url=target_url)
    except KeyError:
        raise HTTPException(status_code=404, detail="Incident or investigation not found")


@app.get("/incidents/{incident_id}/report")
@app.get("/api/incidents/{incident_id}/report")
def get_report(
    incident_id: str,
    format: Literal["json", "markdown", "html"] = Query("json"),
) -> Response:
    rec = get_store().get(incident_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Incident not found")
    if not rec.investigation:
        rec.investigation = get_store().investigate(incident_id, mode="live")

    if format == "markdown":
        return PlainTextResponse(build_markdown_report(rec.investigation), media_type="text/markdown")
    if format == "html":
        return HTMLResponse(build_html_report(rec.investigation))
    return JSONResponse(build_json_report(rec.investigation))


@app.post("/incidents/{incident_id}/chat", response_model=ChatResponse)
@app.post("/api/incidents/{incident_id}/chat", response_model=ChatResponse)
def chat_with_incident(incident_id: str, payload: ChatRequest) -> ChatResponse:
    store = get_store()
    rec = store.get(incident_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Incident not found")
    if not rec.investigation:
        rec.investigation = store.investigate(incident_id, mode="live")
    return answer_incident_question(
        message=payload.message,
        timeline=rec.timeline,
        investigation=rec.investigation,
        history=[m.model_dump() for m in payload.history],
    )


@app.get("/api/evals")
def get_evals() -> JSONResponse:
    eval_path = ARTIFACTS_DIR / "eval_results.json"
    if not eval_path.exists():
        raise HTTPException(status_code=404, detail="Evaluation results not generated yet")
    return JSONResponse(json.loads(eval_path.read_text(encoding="utf-8")))


@app.post("/api/decider/evaluate")
def evaluate_decider(payload: DeciderEvaluateRequest) -> dict[str, Any]:
    """Direct structured decision endpoint."""
    gw = DeciderGateway()
    state = list(payload.state)
    if payload.image_base64:
        state.append({
            "type": "image_url",
            "image_url": {"url": f"data:{payload.image_mime};base64,{payload.image_base64}"},
        })
    answers, trace = gw.decide_live(
        stage="ad_hoc_evaluation",
        state=state,
        questions=payload.questions,
    )
    return {"answers": answers, "trace": trace.model_dump()}
