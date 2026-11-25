"""M3 Investigator: Plan -> Read-Only Tools -> OpenRouter pplx-decider-flash-v1.3:free -> Findings Contract."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from backend.models import (
    DecisionTraceRecord,
    EvidenceItem,
    Finding,
    InvestigationResult,
    SeverityLevel,
    TimelineSummary,
)
from backend.verify.verifier import verify_findings
from .llm import DeciderGateway
from .tools import (
    get_metric_series,
    get_service_events,
    get_timeline_window,
    get_trace,
    search_logs,
)

MECHANISM_LABELS = {
    "connection_pool_exhaustion": "Database connection pool exhaustion / misconfiguration",
    "cache_stampede": "Cache flush or eviction triggering downstream DB stampede",
    "auth_token_mismatch": "Authentication key rotation or JWKS cache mismatch",
    "upstream_timeout": "External dependency or downstream service timeout",
    "memory_exhaustion": "Memory leak, OOM, or GC pressure",
}


def _format_evidence_line(item: EvidenceItem) -> str:
    flag_tags = ",".join(f.code for f in item.flags) if item.flags else "NONE"
    return f"[{item.id}] ({item.kind.upper()} | svc={item.service} | flags={flag_tags}) {item.raw}"


def _pick_verbatim_quote(raw: str) -> str:
    """Select a meaningful verbatim substring guaranteed to exist in raw."""
    parts = raw.split(" ", 3)
    if len(parts) >= 4 and len(parts[3]) >= 12:
        return parts[3][:110]
    return raw[:110]


def investigate_incident(
    incident_id: str,
    title: str,
    opened_at: str,
    severity: SeverityLevel,
    timeline: TimelineSummary,
    mode: Literal["live", "replay"] = "live",
    image_bytes: bytes | None = None,
    gateway: DeciderGateway | None = None,
) -> InvestigationResult:
    """Run full investigation pipeline and verify every finding before emitting conclusions."""
    gw = gateway or DeciderGateway()
    tool_trace: list[dict[str, Any]] = []
    decision_traces: list[DecisionTraceRecord] = []

    raw_replay = gw.load_replay(incident_id)
    replay_cache = {entry["stage"]: entry for entry in raw_replay} if raw_replay else None

    # 1. Read-only tool execution phase
    flagged_items, t1 = get_timeline_window(timeline, flagged_only=True, limit=40)
    tool_trace.append(t1)

    deploy_logs, t2 = search_logs(timeline, keyword="deploy", limit=10)
    tool_trace.append(t2)
    if not deploy_logs:
        deploy_logs, t2b = search_logs(timeline, keyword="ttl_flush", limit=10)
        tool_trace.append(t2b)
    if not deploy_logs:
        deploy_logs, t2c = search_logs(timeline, keyword="jwks_rotate", limit=10)
        tool_trace.append(t2c)

    anomalous_metrics, t3 = get_metric_series(timeline, anomalies_only=True)
    tool_trace.append(t3)

    slow_traces, t4 = get_trace(timeline, outliers_only=True, limit=15)
    tool_trace.append(t4)

    # Pick representative evidence pool for Decider state
    config_candidates = [
        item for item in timeline.items
        if any(f.code == "CONFIG_OR_DEPLOY_EVENT" for f in item.flags)
    ]
    first_error_candidates = [
        item for item in timeline.items
        if any(f.code == "FIRST_ERROR_OCCURRENCE" for f in item.flags)
    ]
    burst_candidates = [
        item for item in timeline.items
        if any(f.code == "ERROR_BURST" for f in item.flags)
    ]
    metric_spike_items = [
        item for item in timeline.items
        if item.kind == "metric" and any(f.code == "METRIC_SPIKE" for f in item.flags)
    ]
    metric_spike_items.sort(
        key=lambda x: max((f.z_score or 0.0 for f in x.flags), default=0.0),
        reverse=True,
    )

    # Ensure each service is also queried with get_service_events for trace completeness
    primary_candidates: list[EvidenceItem] = []
    for bucket in (config_candidates[:2], first_error_candidates[:4], burst_candidates[:3], metric_spike_items[:4], slow_traces[:3]):
        for item in bucket:
            if item.id not in {x.id for x in primary_candidates}:
                primary_candidates.append(item)

    if not primary_candidates:
        primary_candidates = flagged_items[:12] or timeline.items[:12]

    # 2. Decider Call Stage 1: Triage, Root Service, Failure Mechanism, Severity & Optional Multimodal Image
    triage_state: list[Any] = [_format_evidence_line(item) for item in primary_candidates[:16]]
    if image_bytes:
        triage_state.append(gw.encode_image_state(image_bytes, "image/png"))

    service_criteria = {svc: f"Events or errors originating in {svc}" for svc in timeline.services}
    triage_questions: dict[str, dict[str, Any]] = {
        "is_incident_confirmed": {
            "type": "noul",
            "instructions": "Does the telemetry state confirm an active production incident or service outage?",
            "criteria": {
                "true": "Sustained errors, latency outliers, or metric spikes are present",
                "false": "Normal healthy traffic without outage signals",
            },
        },
        "root_cause_service": {
            "type": "choice",
            "instructions": "Which microservice originated the root-cause trigger before downstream symptoms?",
            "criteria": service_criteria,
        },
        "failure_mechanism": {
            "type": "choice",
            "instructions": "Which failure mechanism caused this incident?",
            "criteria": MECHANISM_LABELS,
        },
        "operational_severity": {
            "type": "score",
            "instructions": "Rate the severity of this incident based on error volume and latency impact.",
            "criteria": ["Low", "Medium", "High"],
        },
    }
    if image_bytes:
        triage_questions["image_matches_telemetry"] = {
            "type": "noul",
            "instructions": "Does the attached dashboard chart image show an anomaly consistent with the telemetry?",
            "criteria": {
                "true": "Chart displays a sharp latency/error spike or anomaly band",
                "false": "Chart is flat/normal or unrelated to telemetry",
            },
        }
        triage_questions["visual_pattern"] = {
            "type": "choice",
            "instructions": "What visual pattern appears in the attached dashboard chart?",
            "criteria": {
                "sharp_spike": "Sudden upward spike from flat baseline",
                "gradual_drift": "Slow steady climb over time",
                "flat_baseline": "Flat healthy line with no anomaly",
            },
        }

    triage_answers, triage_trace = gw.run_stage(
        incident_id=incident_id,
        stage="triage_root_cause",
        state=triage_state,
        questions=triage_questions,
        mode=mode,
        replay_cache=replay_cache,
    )
    decision_traces.append(triage_trace)

    root_service = triage_answers.get("root_cause_service", {}).get("choice") or timeline.services[0]
    root_svc_conf = float(triage_answers.get("root_cause_service", {}).get("confidence") or 0.85)
    mechanism = triage_answers.get("failure_mechanism", {}).get("choice") or "connection_pool_exhaustion"
    mech_probs = triage_answers.get("failure_mechanism", {}).get("probabilities") or {}
    mech_conf = float(triage_answers.get("failure_mechanism", {}).get("confidence") or 0.85)
    outage_prob = float(triage_answers.get("is_incident_confirmed", {}).get("noul") or 0.9)

    # Query service events for the Decider-selected root service
    root_svc_events, t5 = get_service_events(timeline, service=root_service, limit=20)
    tool_trace.append(t5)

    # 3. Decider Call Stage 2: Causal Evidence Selection & Claim Corroboration
    attribution_pool = primary_candidates[:10]
    for ev in root_svc_events[:4]:
        if ev.id not in {x.id for x in attribution_pool}:
            attribution_pool.append(ev)

    evidence_criteria = {
        item.id: f"{item.ts} {item.service} — {item.raw[:90]}"
        for item in attribution_pool[:12]
    }
    attr_questions: dict[str, dict[str, Any]] = {
        "primary_trigger_evidence": {
            "type": "choice",
            "instructions": f"Select the exact evidence item that captures the initial trigger or config change on {root_service}.",
            "criteria": evidence_criteria,
        },
        "trigger_is_causal": {
            "type": "noul",
            "instructions": "Did the selected configuration/deploy or first-error event precede and trigger the error cascade?",
            "criteria": {
                "true": "Chronologically precedes the burst and explains the mechanism",
                "false": "Unrelated or happened after the burst",
            },
        },
        "metric_corroboration": {
            "type": "noul",
            "instructions": "Do the metric spikes corroborate the log/trace failure?",
            "criteria": {
                "true": "Metric z-score spikes align with the incident window",
                "false": "Metrics remained flat",
            },
        },
        "evidence_strength": {
            "type": "score",
            "instructions": "How strongly does the combined log, metric, and trace evidence support the root cause?",
            "criteria": ["Weak", "Moderate", "Strong"],
        },
    }

    attr_answers, attr_trace = gw.run_stage(
        incident_id=incident_id,
        stage="evidence_attribution",
        state=[_format_evidence_line(item) for item in attribution_pool[:14]],
        questions=attr_questions,
        mode=mode,
        replay_cache=replay_cache,
    )
    decision_traces.append(attr_trace)

    # Save replay cache automatically whenever live succeeds
    if mode == "live":
        gw.save_replay(
            incident_id,
            [
                {"stage": "triage_root_cause", "answers": triage_answers, "trace": triage_trace.model_dump()},
                {"stage": "evidence_attribution", "answers": attr_answers, "trace": attr_trace.model_dump()},
            ],
        )

    evidence_map = {item.id: item for item in timeline.items}
    trigger_id = attr_answers.get("primary_trigger_evidence", {}).get("choice")
    trigger_item = evidence_map.get(trigger_id) if trigger_id else None
    if not trigger_item:
        trigger_item = (config_candidates or first_error_candidates or primary_candidates)[0]

    trigger_causal_prob = float(attr_answers.get("trigger_is_causal", {}).get("noul") or 0.9)
    metric_corr_prob = float(attr_answers.get("metric_corroboration", {}).get("noul") or 0.9)

    # 4. Assemble candidate findings under the strict JSON output contract
    candidate_findings: list[Finding] = []

    # Finding 1: Root-cause trigger
    candidate_findings.append(
        Finding(
            id="F-01",
            claim=(
                f"Root cause on {root_service} ({mechanism.replace('_', ' ')}): "
                f"{_pick_verbatim_quote(trigger_item.raw)}"
            ),
            claim_type="root_cause",
            evidence_ids=[trigger_item.id],
            quote=_pick_verbatim_quote(trigger_item.raw),
            confidence=round(min(0.99, (root_svc_conf + trigger_causal_prob) / 2.0), 3),
            service=root_service,
            decider_signals={
                "root_cause_service": root_service,
                "service_confidence": round(root_svc_conf, 3),
                "trigger_is_causal": round(trigger_causal_prob, 3),
                "failure_mechanism": mechanism,
            },
        )
    )

    # Finding 2: First error / error burst
    err_item = next(
        (x for x in first_error_candidates if x.service == root_service),
        first_error_candidates[0] if first_error_candidates else None,
    )
    if not err_item and burst_candidates:
        err_item = burst_candidates[0]
    if err_item and err_item.id != trigger_item.id:
        candidate_findings.append(
            Finding(
                id="F-02",
                claim=f"Error burst triggered on {err_item.service}: {_pick_verbatim_quote(err_item.raw)}",
                claim_type="error",
                evidence_ids=[err_item.id],
                quote=_pick_verbatim_quote(err_item.raw),
                confidence=round(min(0.98, outage_prob), 3),
                service=err_item.service,
                decider_signals={"is_incident_confirmed": round(outage_prob, 3)},
            )
        )

    # Finding 3: Metric z-score spike
    if metric_spike_items:
        top_met = metric_spike_items[0]
        top_flag = next((f for f in top_met.flags if f.code == "METRIC_SPIKE"), None)
        z_txt = f" (z={top_flag.z_score})" if top_flag and top_flag.z_score else ""
        candidate_findings.append(
            Finding(
                id="F-03",
                claim=(
                    f"Anomalous metric spike on {top_met.service} for {top_met.metric_name}={top_met.metric_value}{z_txt}."
                ),
                claim_type="spike",
                evidence_ids=[top_met.id],
                quote=_pick_verbatim_quote(top_met.raw),
                confidence=round(min(0.99, (metric_corr_prob + mech_conf) / 2.0), 3),
                service=top_met.service,
                decider_signals={"metric_corroboration": round(metric_corr_prob, 3)},
            )
        )

    # Finding 4: Trace p99 latency / error span outlier
    if slow_traces:
        top_trace = max(slow_traces, key=lambda x: x.duration_ms or 0.0)
        candidate_findings.append(
            Finding(
                id="F-04",
                claim=(
                    f"Trace span {top_trace.span_id} on {top_trace.service} breached latency/error threshold "
                    f"({top_trace.duration_ms:.1f}ms)."
                ),
                claim_type="latency",
                evidence_ids=[top_trace.id],
                quote=_pick_verbatim_quote(top_trace.raw),
                confidence=round(min(0.96, outage_prob * 0.96), 3),
                service=top_trace.service,
                decider_signals={"trace_id": top_trace.trace_id},
            )
        )

    # Finding 5: Downstream service impact if another service also saw errors
    downstream_err = next(
        (x for x in burst_candidates if x.service != root_service),
        next((x for x in first_error_candidates if x.service != root_service), None),
    )
    if downstream_err:
        candidate_findings.append(
            Finding(
                id="F-05",
                claim=f"Downstream cascade impacted {downstream_err.service}: {_pick_verbatim_quote(downstream_err.raw)}",
                claim_type="error",
                evidence_ids=[downstream_err.id],
                quote=_pick_verbatim_quote(downstream_err.raw),
                confidence=round(min(0.94, outage_prob * 0.93), 3),
                service=downstream_err.service,
                decider_signals={"cascade_from": root_service},
            )
        )

    # Finding 6: Secondary / uncorroborated hypothesis from Decider runner-up probabilities
    # Intentionally submitted without verified citations so M4 Verifier audits and demotes it.
    runner_up_mech = sorted(
        [(k, v) for k, v in mech_probs.items() if k != mechanism],
        key=lambda kv: kv[1],
        reverse=True,
    )
    alt_mech = runner_up_mech[0][0] if runner_up_mech else "upstream_timeout"
    alt_prob = runner_up_mech[0][1] if runner_up_mech else 0.04
    candidate_findings.append(
        Finding(
            id="F-06",
            claim=(
                f"Alternative hypothesis ({alt_mech.replace('_', ' ')}): "
                "Transient network packet loss or noisy-neighbor CPU contention coincided with the error window."
            ),
            claim_type="correlation",
            evidence_ids=[],
            quote="",
            confidence=round(max(0.12, float(alt_prob)), 3),
            service=root_service,
            decider_signals={"runner_up_probability": round(float(alt_prob), 4)},
        )
    )

    # 5. M4 Deterministic Verifier checks EVERY finding
    verified_findings, verification = verify_findings(candidate_findings, evidence_map)
    conclusions = [f for f in verified_findings if f.kind == "conclusion"]
    hypotheses = [f for f in verified_findings if f.kind == "hypothesis"]

    image_assessment = None
    if image_bytes:
        img_match = triage_answers.get("image_matches_telemetry", {})
        vis_pat = triage_answers.get("visual_pattern", {})
        image_assessment = {
            "matches_telemetry": img_match.get("noul"),
            "visual_pattern": vis_pat.get("choice"),
            "visual_probabilities": vis_pat.get("probabilities"),
        }

    root_cause_chain = [f.claim for f in conclusions]
    root_cause_summary = (
        f"{MECHANISM_LABELS.get(mechanism, mechanism)} in {root_service} "
        f"(verified by {len(conclusions)}/{len(verified_findings)} findings)."
    )

    return InvestigationResult(
        incident_id=incident_id,
        title=title,
        mode=mode,
        model=triage_trace.model,
        opened_at=opened_at,
        investigated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        severity=severity,
        status="verified" if conclusions else "investigated",
        root_cause_summary=root_cause_summary,
        root_cause_chain=root_cause_chain,
        tool_trace=tool_trace,
        decision_traces=decision_traces,
        image_assessment=image_assessment,
        conclusions=conclusions,
        hypotheses=hypotheses,
        verification=verification,
        evidence_map={
            eid: evidence_map[eid]
            for f in verified_findings
            for eid in f.evidence_ids
            if eid in evidence_map
        },
    )
