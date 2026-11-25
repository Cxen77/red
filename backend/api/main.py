"""M5 FastAPI service for IncidentLens."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field

from backend.agent.llm import DeciderGateway
from backend.config import OPENROUTER_MODEL
from backend.models import IncidentMetadata, InvestigationResult, SeverityLevel, TimelineSummary
from backend.verify.report import build_html_report, build_json_report, build_markdown_report
from .store import get_store

app = FastAPI(
    title="IncidentLens API",
    version="1.0.0",
    description="AI Incident Investigation with deterministic citation verification and OpenRouter pplx-decider-flash-v1.3:free.",
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
    if not any([payload.logs, payload.traces, payload.metrics]):
        raise HTTPException(status_code=400, detail="Provide at least one telemetry input.")
    rec = get_store().create_incident(
        title=payload.title,
        severity=payload.severity,
        logs_text=payload.logs,
        traces_text=payload.traces,
        metrics_text=payload.metrics,
    )
    return rec.meta


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
        rec.investigation = get_store().investigate(incident_id, mode="replay" if False else "live")

    if format == "markdown":
        return PlainTextResponse(build_markdown_report(rec.investigation), media_type="text/markdown")
    if format == "html":
        return HTMLResponse(build_html_report(rec.investigation))
    return JSONResponse(build_json_report(rec.investigation))


@app.post("/api/decider/evaluate")
def evaluate_decider(payload: DeciderEvaluateRequest) -> dict[str, Any]:
    """Direct OpenRouter perplexity/pplx-decider-flash-v1.3:free decision endpoint."""
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
