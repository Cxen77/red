"""Grounded Incident Q&A chatbot powered by OpenRouter pplx-decider-flash-v1.3:free + read-only tools."""
from __future__ import annotations

import re
import time
from typing import Any

from backend.agent.llm import DeciderGateway
from backend.agent.tools import search_logs
from backend.models import (
    ChatCitation,
    ChatResponse,
    EvidenceItem,
    InvestigationResult,
    TimelineSummary,
)

INTENT_CRITERIA = {
    "root_cause": "User is asking what went wrong, why the incident happened, or the root cause",
    "where_failed": "User is asking which service, host, component, or location failed or cascaded",
    "timeline_when": "User is asking when the incident started, sequence of events, or timeline",
    "metrics_latency": "User is asking about metrics, spikes, latency, error rates, or traces",
    "remediation": "User is asking how to fix, mitigate, roll back, or what actions to approve",
    "hypotheses_audit": "User is asking about unverified hypotheses, demoted claims, or verification checks",
    "evidence_search": "User is asking to look up specific logs, error codes, keywords, or evidence IDs",
}


def _to_citation(item: EvidenceItem, quote: str = "") -> ChatCitation:
    q = quote or (item.raw.split(" ", 3)[-1][:90] if " " in item.raw else item.raw[:90])
    return ChatCitation(
        id=item.id,
        service=item.service,
        ts=item.ts,
        kind=item.kind,
        quote=q,
        summary=item.flags[0].label if item.flags else item.raw[:100],
    )


def _extract_keyword(message: str) -> str | None:
    # Look for explicit IDs like LOG-1021 or technical tokens
    id_match = re.search(r"\b(LOG-\d{4}|TRACE-\d{4}|MET-\d{4})\b", message, re.IGNORECASE)
    if id_match:
        return id_match.group(1).upper()

    stop = {
        "what", "went", "wrong", "where", "when", "why", "which", "service", "services",
        "happened", "failed", "failure", "cause", "root", "show", "tell", "about",
        "this", "that", "there", "with", "from", "have", "been", "incident", "logs",
        "traces", "metrics", "error", "errors", "please", "explain", "find", "check",
    }
    words = re.findall(r"[A-Za-z0-9_=-]{3,}", message)
    for w in words:
        if w.lower() not in stop:
            return w
    return None


def answer_incident_question(
    message: str,
    timeline: TimelineSummary,
    investigation: InvestigationResult,
    history: list[dict[str, str]] | None = None,
    gateway: DeciderGateway | None = None,
) -> ChatResponse:
    """Route the user's question with pplx-decider-flash-v1.3:free and answer strictly from verified evidence."""
    gw = gateway or DeciderGateway()
    started = time.perf_counter()

    evidence_map = {item.id: item for item in timeline.items}
    conclusions_text = [
        f"[{f.id}] ({f.service}) {f.claim} | cites={','.join(f.evidence_ids)}"
        for f in investigation.conclusions
    ]
    hyp_text = [
        f"[{h.id}] (HYPOTHESIS/DEMOTED: {h.demotion_reason}) {h.claim}"
        for h in investigation.hypotheses
    ]
    actions_text = [
        f"[{a.id}] {a.title} (status={a.status}, risk={a.risk_level})"
        for a in investigation.proposed_actions
    ]
    history_lines = [
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}"
        for m in (history or [])[-4:]
    ]

    state: list[Any] = [
        f"INCIDENT: {investigation.title} (id={investigation.incident_id}, severity={investigation.severity})",
        f"ROOT_CAUSE_SUMMARY: {investigation.root_cause_summary}",
        f"SERVICES: {', '.join(timeline.services)}",
        f"TELEMETRY_COUNTS: total={timeline.total_items}, anomalies={timeline.anomaly_count}",
        *conclusions_text,
        *hyp_text,
        *actions_text,
        *history_lines,
        f"USER_QUESTION: {message}",
    ]

    service_criteria = {svc: f"The question focuses on {svc}" for svc in timeline.services}
    service_criteria["all_services"] = "The question spans multiple or all services"

    questions: dict[str, dict[str, Any]] = {
        "intent": {
            "type": "choice",
            "instructions": "Classify what the operator is asking in USER_QUESTION.",
            "criteria": INTENT_CRITERIA,
        },
        "focus_service": {
            "type": "choice",
            "instructions": "Which microservice does USER_QUESTION ask about or point to?",
            "criteria": service_criteria,
        },
        "answerable": {
            "type": "noul",
            "instructions": "Is USER_QUESTION answerable using the incident telemetry and verified conclusions?",
            "criteria": {
                "true": "Relevant telemetry or conclusions exist in state",
                "false": "Telemetry is missing or question is unrelated to the incident",
            },
        },
    }

    intent = "root_cause"
    focus_service = "all_services"
    confidence = 0.88
    answerable_prob = 0.92
    model_used = gw.model

    try:
        answers, trace = gw.decide_live(
            stage="incident_chat",
            state=state,
            questions=questions,
            timeout_s=15.0,
        )
        intent = answers.get("intent", {}).get("choice") or intent
        focus_service = answers.get("focus_service", {}).get("choice") or focus_service
        confidence = float(answers.get("intent", {}).get("confidence") or confidence)
        answerable_prob = float(answers.get("answerable", {}).get("noul") or answerable_prob)
        model_used = trace.model
    except Exception:
        # Deterministic keyword fallback if live API is temporarily unreachable
        low = message.lower()
        if any(k in low for k in ("where", "which service", "component", "cascade")):
            intent = "where_failed"
        elif any(k in low for k in ("when", "timeline", "start", "sequence")):
            intent = "timeline_when"
        elif any(k in low for k in ("metric", "latency", "spike", "trace", "p99")):
            intent = "metrics_latency"
        elif any(k in low for k in ("fix", "remediat", "rollback", "action", "approve")):
            intent = "remediation"
        elif any(k in low for k in ("hypothes", "demot", "unverified", "guess")):
            intent = "hypotheses_audit"
        elif re.search(r"\b(LOG|TRACE|MET)-\d{4}\b", message, re.IGNORECASE):
            intent = "evidence_search"

    citations: list[ChatCitation] = []
    seen_ids: set[str] = set()

    def add_citation(item: EvidenceItem | None, quote: str = "") -> None:
        if item and item.id not in seen_ids:
            seen_ids.add(item.id)
            citations.append(_to_citation(item, quote))

    # Direct ID lookup if user pasted LOG-1021 / TRACE-0075 / MET-0068
    explicit_ids = re.findall(r"\b(LOG-\d{4}|TRACE-\d{4}|MET-\d{4})\b", message.upper())
    for eid in explicit_ids:
        if eid in evidence_map:
            add_citation(evidence_map[eid])

    # Check if user mentions a specific keyword/error in logs
    kw = _extract_keyword(message)
    kw_matches: list[EvidenceItem] = []
    if kw and not explicit_ids:
        kw_matches, _ = search_logs(timeline, keyword=kw, limit=4)

    lines: list[str] = []
    has_logs = any(i.kind == "log" for i in timeline.items)

    if explicit_ids and citations:
        c = citations[0]
        item = evidence_map[c.id]
        lines.append(
            f"**{item.id}** (`{item.service}`, `{item.ts}`): `{item.raw}`"
        )
        if item.flags:
            lines.append(
                "Deterministic flags: " + ", ".join(f"{fl.label} ({fl.detail})" for fl in item.flags)
            )

    elif intent == "where_failed":
        root_finding = investigation.conclusions[0] if investigation.conclusions else None
        downstream = [f for f in investigation.conclusions[1:] if f.service and root_finding and f.service != root_finding.service]
        origin_svc = root_finding.service if root_finding else (timeline.services[0] if timeline.services else "unknown")

        lines.append(f"**Where it went wrong:** Originates in **`{origin_svc}`**.")
        if root_finding:
            lines.append(f"- **Primary fault ({root_finding.service}):** {root_finding.claim}")
            for eid in root_finding.evidence_ids:
                add_citation(evidence_map.get(eid), root_finding.quote)
        if downstream:
            lines.append("- **Downstream cascade:**")
            for df in downstream[:3]:
                lines.append(f"  - `{df.service}`: {df.claim}")
                for eid in df.evidence_ids:
                    add_citation(evidence_map.get(eid), df.quote)
        if not has_logs:
            lines.append("Note: Raw application logs are missing in this scenario, so diagnosis is limited to metrics and trace spans.")

    elif intent == "timeline_when":
        lines.append(
            f"**When it happened:** Incident opened at `{investigation.opened_at}`"
            + (
                f" (deterministic anomaly window `{timeline.anomaly_window[0]}` to `{timeline.anomaly_window[1]}`)."
                if timeline.anomaly_window
                else "."
            )
        )
        flagged = [i for i in timeline.items if i.flags]
        milestones: list[EvidenceItem] = []
        seen_codes: set[str] = set()
        for item in flagged:
            for fl in item.flags:
                if fl.code not in seen_codes:
                    seen_codes.add(fl.code)
                    milestones.append(item)
                    break
        for m in milestones[:5]:
            lines.append(f"- `{m.ts}` (`{m.service}` / `{m.id}`): {m.flags[0].label} — {m.flags[0].detail}")
            add_citation(m)

    elif intent == "metrics_latency":
        lines.append("**Metrics & trace outliers:**")
        met_findings = [f for f in investigation.conclusions if f.claim_type in {"spike", "latency"}]
        for mf in met_findings:
            lines.append(f"- {mf.claim}")
            for eid in mf.evidence_ids:
                add_citation(evidence_map.get(eid), mf.quote)
        if not met_findings:
            for name, pts in timeline.metric_series.items():
                anoms = [p for p in pts if p.is_anomaly]
                if anoms:
                    peak = max(anoms, key=lambda p: p.value)
                    lines.append(f"- `{name}` peaked at `{peak.value}` (z={peak.z_score}) on `{peak.service}` at `{peak.ts}`.")
                    add_citation(evidence_map.get(peak.evidence_id))

    elif intent == "remediation":
        lines.append(f"**Human review status:** `{investigation.human_review.decision}`.")
        if investigation.proposed_actions:
            lines.append("**Proposed guarded remediation steps (approval required before execution):**")
            for act in investigation.proposed_actions:
                lines.append(
                    f"- **{act.id}** (`{act.target_service}`, risk={act.risk_level}, status=`{act.status}`): {act.title}\n"
                    f"  Dry-run preview: {act.dry_run_preview}"
                )
        for f in investigation.conclusions[:2]:
            for eid in f.evidence_ids:
                add_citation(evidence_map.get(eid), f.quote)

    elif intent == "hypotheses_audit":
        if investigation.hypotheses:
            lines.append("**Demoted hypotheses (failed deterministic citation verifier):**")
            for h in investigation.hypotheses:
                lines.append(f"- **{h.id}:** {h.claim} — *Reason:* {h.demotion_reason}")
        else:
            lines.append("All findings in this investigation passed deterministic citation checks.")

    elif intent == "evidence_search" and kw_matches:
        lines.append(f"**Matching log evidence for `{kw}` ({len(kw_matches)} shown):**")
        for m in kw_matches[:4]:
            lines.append(f"- `{m.id}` (`{m.ts}`, `{m.service}`): `{m.raw}`")
            add_citation(m)

    else:
        # Default: root_cause — full "what went wrong and where" breakdown
        lines.append(f"**What went wrong:** {investigation.root_cause_summary}")
        if investigation.conclusions:
            lines.append("**Verified evidence chain:**")
            for f in investigation.conclusions[:4]:
                lines.append(f"- **[{f.id} · {f.service or 'system'}]** {f.claim}")
                for eid in f.evidence_ids:
                    add_citation(evidence_map.get(eid), f.quote)
        if not has_logs:
            lines.append(
                "**Missing data disclosure:** Log telemetry is absent for this incident, so conclusions are restricted to metric spikes and trace spans."
            )

    if kw_matches and intent not in {"evidence_search"} and len(citations) < 4:
        for m in kw_matches[:2]:
            add_citation(m)

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return ChatResponse(
        reply="\n".join(lines),
        intent=intent,
        focus_service=focus_service,
        confidence=round(confidence, 3),
        answerable_prob=round(answerable_prob, 3),
        citations=citations,
        suggested_followups=[
            "Where did the failure start and cascade?",
            "When did the anomaly window begin?",
            "What remediation actions are proposed?",
            "Why were hypotheses demoted?",
        ],
        model=model_used,
        latency_ms=latency_ms,
    )
