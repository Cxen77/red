"""M4 Deterministic citation & claim-support verifier."""
from __future__ import annotations

from typing import Any
from backend.models import EvidenceItem, Finding, VerificationSummary


def verify_findings(
    findings: list[Finding],
    evidence_map: dict[str, EvidenceItem],
) -> tuple[list[Finding], VerificationSummary]:
    """Verify every finding deterministically:
    (a) cited IDs exist
    (b) verbatim quote appears in at least one cited item's raw text
    (c) claim_type is supported by cited evidence kind & deterministic flags
    Any failure demotes the finding to 'hypothesis' with explicit failure reason.
    """
    verified: list[Finding] = []
    checks: list[dict[str, Any]] = []

    for finding in findings:
        f = finding.model_copy(deep=True)
        failures: list[str] = []

        # (a) Non-empty and existing IDs
        if not f.evidence_ids:
            failures.append("No supporting evidence cited")
        else:
            missing = [eid for eid in f.evidence_ids if eid not in evidence_map]
            if missing:
                failures.append(f"Citation not found: {', '.join(missing)}")

        cited_items = [evidence_map[eid] for eid in f.evidence_ids if eid in evidence_map]

        # (b) Verbatim quote match
        if cited_items:
            q = f.quote.strip()
            if not q:
                failures.append("Missing verbatim quote from cited evidence")
            elif not any(q in item.raw for item in cited_items):
                failures.append("Quoted text not found verbatim in cited evidence")

        # (c) Claim-type support check
        if cited_items:
            if f.claim_type == "spike":
                has_spike_metric = any(
                    item.kind == "metric" and any(fl.code == "METRIC_SPIKE" for fl in item.flags)
                    for item in cited_items
                )
                if not has_spike_metric:
                    failures.append("No supporting metric spike (METRIC_SPIKE) cited for spike claim")
            elif f.claim_type == "latency":
                has_trace_or_lat = any(
                    (item.kind == "trace" and any(fl.code == "TRACE_P99_OUTLIER" for fl in item.flags))
                    or (item.kind == "metric" and "latency" in (item.metric_name or "").lower())
                    for item in cited_items
                )
                if not has_trace_or_lat:
                    failures.append("No flagged latency trace outlier or latency metric cited")
            elif f.claim_type in {"error", "root_cause"}:
                has_log_or_flag = any(
                    item.kind in {"log", "event"}
                    and (
                        (item.level in {"ERROR", "CRITICAL", "WARN"})
                        or any(
                            fl.code in {"CONFIG_OR_DEPLOY_EVENT", "FIRST_ERROR_OCCURRENCE", "ERROR_BURST"}
                            for fl in item.flags
                        )
                    )
                    for item in cited_items
                )
                if not has_log_or_flag:
                    failures.append("No supporting error, deploy/config log, or change event cited")

        passed = len(failures) == 0
        f.verification_passed = passed
        if passed:
            f.kind = "conclusion"
            f.demotion_reason = None
        else:
            f.kind = "hypothesis"
            f.demotion_reason = "; ".join(failures)

        checks.append(
            {
                "finding_id": f.id,
                "passed": passed,
                "kind": f.kind,
                "evidence_ids": f.evidence_ids,
                "failures": failures,
            }
        )
        verified.append(f)

    conclusions_count = sum(1 for f in verified if f.kind == "conclusion")
    hypotheses_count = sum(1 for f in verified if f.kind == "hypothesis")
    valid_cited = sum(
        1 for f in verified if f.kind == "conclusion" and f.verification_passed
    )
    citation_validity_rate = (
        round(valid_cited / conclusions_count, 4) if conclusions_count > 0 else 0.0
    )

    summary = VerificationSummary(
        total_findings=len(verified),
        conclusions_count=conclusions_count,
        hypotheses_count=hypotheses_count,
        citation_validity_rate=citation_validity_rate,
        checks=checks,
    )
    return verified, summary
