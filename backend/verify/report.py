"""Evidence report formatters (machine-readable JSON, Markdown, and print-clean HTML)."""
from __future__ import annotations

import html
from backend.models import InvestigationResult


def build_json_report(result: InvestigationResult) -> dict:
    return {
        "schema": "incidentlens.evidence-report.v1",
        "incident_id": result.incident_id,
        "title": result.title,
        "opened_at": result.opened_at,
        "investigated_at": result.investigated_at,
        "mode": result.mode,
        "model": result.model,
        "severity": result.severity,
        "status": result.status,
        "root_cause_summary": result.root_cause_summary,
        "root_cause_chain": result.root_cause_chain,
        "telemetry_filtering": {
            "raw_items_total": result.raw_items_total,
            "filtered_items_sent": result.filtered_items_sent,
            "noise_reduction_pct": result.noise_reduction_pct,
            "redacted_secrets_count": result.redacted_secrets_count,
        },
        "human_review": result.human_review.model_dump(),
        "proposed_actions": [a.model_dump() for a in result.proposed_actions],
        "findings": {
            "conclusions": [f.model_dump() for f in result.conclusions],
            "hypotheses": [f.model_dump() for f in result.hypotheses],
        },
        "citations": {
            eid: item.model_dump() for eid, item in result.evidence_map.items()
        },
        "verification": result.verification.model_dump(),
        "decision_traces": [t.model_dump() for t in result.decision_traces],
        "tool_trace": result.tool_trace,
        "image_assessment": result.image_assessment,
    }


def build_markdown_report(result: InvestigationResult) -> str:
    lines = [
        f"# Evidence Report — {result.title}",
        "",
        f"- **Incident ID:** `{result.incident_id}`",
        f"- **Severity:** {result.severity}",
        f"- **Mode / Model:** {result.mode} (`{result.model}`)",
        f"- **Human Review:** {result.human_review.decision}",
        f"- **Noise Reduction:** {result.raw_items_total} raw items -> {result.filtered_items_sent} signals ({result.noise_reduction_pct:.1f}% reduction)",
        f"- **Redacted Secrets:** {result.redacted_secrets_count}",
        f"- **Summary:** {result.root_cause_summary}",
        "",
        "## Root-Cause Chain",
    ]
    for idx, step in enumerate(result.root_cause_chain, start=1):
        lines.append(f"{idx}. {step}")

    lines.extend(["", "## Verified Conclusions"])
    for f in result.conclusions:
        cites = ", ".join(f"`{eid}`" for eid in f.evidence_ids)
        lines.append(f"- **[{f.id}]** {f.claim} (confidence: {f.confidence:.2f}, citations: {cites})")

    lines.extend(["", "## Demoted Hypotheses"])
    for f in result.hypotheses:
        lines.append(f"- **[{f.id}]** {f.claim} — *Demoted:* {f.demotion_reason}")

    lines.extend(["", "## Guarded Remediation Actions"])
    for a in result.proposed_actions:
        lines.append(f"- **[{a.id}]** {a.title} (`{a.target_service}`) — status: `{a.status}`")

    lines.extend([
        "",
        "## Verification Summary",
        f"- Total findings: {result.verification.total_findings}",
        f"- Conclusions: {result.verification.conclusions_count}",
        f"- Hypotheses: {result.verification.hypotheses_count}",
        f"- Citation validity rate: {result.verification.citation_validity_rate * 100:.1f}%",
    ])
    return "\n".join(lines) + "\n"


def build_html_report(result: InvestigationResult) -> str:
    conclusions_rows = "".join(
        f"<tr><td><code>{html.escape(f.id)}</code></td>"
        f"<td>{html.escape(f.claim)}</td>"
        f"<td>{f.confidence:.0%}</td>"
        f"<td>{', '.join(f'<code>{html.escape(eid)}</code>' for eid in f.evidence_ids)}</td></tr>"
        for f in result.conclusions
    )
    hyp_rows = "".join(
        f"<tr><td><code>{html.escape(f.id)}</code></td>"
        f"<td>{html.escape(f.claim)}</td>"
        f"<td>{html.escape(f.demotion_reason or '')}</td></tr>"
        for f in result.hypotheses
    )
    act_rows = "".join(
        f"<tr><td><code>{html.escape(a.id)}</code></td>"
        f"<td>{html.escape(a.title)}</td>"
        f"<td><code>{html.escape(a.status)}</code></td></tr>"
        for a in result.proposed_actions
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>IncidentLens Report — {html.escape(result.title)}</title>
<style>
  body {{ font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #1C1917; max-width: 900px; margin: 32px auto; padding: 0 20px; font-size: 13px; }}
  h1 {{ font-size: 20px; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; margin-top: 24px; border-bottom: 1px solid #E7E5E4; padding-bottom: 6px; }}
  .meta {{ color: #78716C; font-size: 12px; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th, td {{ border-bottom: 1px solid #E7E5E4; text-align: left; padding: 8px; vertical-align: top; }}
  th {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #78716C; }}
  code {{ font-family: 'IBM Plex Mono', monospace; background: #F5F5F4; padding: 1px 5px; border-radius: 3px; font-size: 12px; }}
</style>
</head>
<body>
  <h1>{html.escape(result.title)}</h1>
  <div class="meta">ID: <code>{html.escape(result.incident_id)}</code> · Severity: {html.escape(result.severity)} · Review: <code>{html.escape(result.human_review.decision)}</code> · Noise reduction: {result.noise_reduction_pct:.1f}%</div>
  <p>{html.escape(result.root_cause_summary)}</p>
  <h2>Verified Conclusions ({len(result.conclusions)})</h2>
  <table><thead><tr><th>ID</th><th>Claim</th><th>Confidence</th><th>Citations</th></tr></thead><tbody>{conclusions_rows}</tbody></table>
  <h2>Demoted Hypotheses ({len(result.hypotheses)})</h2>
  <table><thead><tr><th>ID</th><th>Hypothesis</th><th>Demotion Reason</th></tr></thead><tbody>{hyp_rows}</tbody></table>
  <h2>Guarded Remediation Actions ({len(result.proposed_actions)})</h2>
  <table><thead><tr><th>ID</th><th>Action</th><th>Status</th></tr></thead><tbody>{act_rows}</tbody></table>
</body>
</html>"""
