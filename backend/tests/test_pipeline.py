"""Comprehensive pytest suite for M1 Ingest, M2 Timeline, M3 Replay/Investigator, M4 Verifier, M5 API."""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.config import SCENARIOS_DIR
from backend.ingest.pipeline import ingest_incident_dir
from backend.models import Finding
from backend.timeline.builder import build_timeline
from backend.verify.verifier import verify_findings


def test_ingest_assigns_stable_ids_and_drain3_templates() -> None:
    items = ingest_incident_dir(SCENARIOS_DIR / "bad-deploy-friday")
    logs = [i for i in items if i.kind == "log"]
    traces = [i for i in items if i.kind == "trace"]
    metrics = [i for i in items if i.kind == "metric"]

    assert len(logs) >= 2000
    assert logs[0].id == "LOG-0001"
    assert traces[0].id == "TRACE-0001"
    assert metrics[0].id == "MET-0001"
    assert all(log.template_id and log.template_id.startswith("TPL-") for log in logs)


def test_timeline_flags_deterministic_anomalies() -> None:
    items = ingest_incident_dir(SCENARIOS_DIR / "bad-deploy-friday")
    tl = build_timeline("bad-deploy-friday", items)
    codes = {flag.code for item in tl.items for flag in item.flags}
    assert "CONFIG_OR_DEPLOY_EVENT" in codes
    assert "FIRST_ERROR_OCCURRENCE" in codes
    assert "ERROR_BURST" in codes
    assert "METRIC_SPIKE" in codes
    assert "TRACE_P99_OUTLIER" in codes
    assert tl.anomaly_window is not None


def test_verifier_enforces_citations_quotes_and_claim_types() -> None:
    items = ingest_incident_dir(SCENARIOS_DIR / "bad-deploy-friday")
    tl = build_timeline("bad-deploy-friday", items)
    emap = {i.id: i for i in tl.items}

    deploy_log = next(i for i in tl.items if "db_pool_max=5" in i.raw)
    spike_met = next(i for i in tl.items if i.kind == "metric" and any(f.code == "METRIC_SPIKE" for f in i.flags))

    findings = [
        Finding(
            id="OK-1",
            claim="Deploy applied db_pool_max=5",
            claim_type="root_cause",
            evidence_ids=[deploy_log.id],
            quote="db_pool_max=5",
            confidence=0.95,
        ),
        Finding(
            id="OK-2",
            claim="Metric spike observed",
            claim_type="spike",
            evidence_ids=[spike_met.id],
            quote=spike_met.raw.split(" ", 3)[3],
            confidence=0.92,
        ),
        Finding(
            id="BAD-NO-CITE",
            claim="Uncited guess",
            claim_type="error",
            evidence_ids=[],
            quote="",
            confidence=0.5,
        ),
        Finding(
            id="BAD-WRONG-QUOTE",
            claim="Wrong quote",
            claim_type="root_cause",
            evidence_ids=[deploy_log.id],
            quote="definitely not in log",
            confidence=0.8,
        ),
        Finding(
            id="BAD-TYPE-MISMATCH",
            claim="Spike citing a log",
            claim_type="spike",
            evidence_ids=[deploy_log.id],
            quote="db_pool_max=5",
            confidence=0.8,
        ),
    ]
    verified, summary = verify_findings(findings, emap)
    by_id = {f.id: f for f in verified}
    assert by_id["OK-1"].kind == "conclusion"
    assert by_id["OK-2"].kind == "conclusion"
    assert by_id["BAD-NO-CITE"].kind == "hypothesis"
    assert by_id["BAD-WRONG-QUOTE"].kind == "hypothesis"
    assert by_id["BAD-TYPE-MISMATCH"].kind == "hypothesis"
    assert summary.conclusions_count == 2
    assert summary.hypotheses_count == 3


def test_api_endpoints_replay_and_report() -> None:
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["model"] == "perplexity/pplx-decider-flash-v1.3:free"

    incs = client.get("/api/incidents").json()
    assert any(i["id"] == "bad-deploy-friday" for i in incs)

    tl_res = client.get("/api/incidents/bad-deploy-friday/timeline")
    assert tl_res.status_code == 200
    assert tl_res.json()["total_items"] > 2000

    inv_res = client.post("/api/incidents/bad-deploy-friday/investigate?mode=replay")
    assert inv_res.status_code == 200
    data = inv_res.json()
    assert data["verification"]["citation_validity_rate"] == 1.0
    assert len(data["conclusions"]) >= 4
    assert len(data["hypotheses"]) >= 1

    rep_res = client.get("/api/incidents/bad-deploy-friday/report?format=json")
    assert rep_res.status_code == 200
    assert rep_res.json()["schema"] == "incidentlens.evidence-report.v1"
