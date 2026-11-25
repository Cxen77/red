"""Evaluation harness comparing IncidentLens investigator + verifier against scenario ground truths."""
from __future__ import annotations

import json
import statistics
import time
from pathlib import Path
from typing import Literal

from backend.agent.investigator import investigate_incident
from backend.config import ARTIFACTS_DIR, SCENARIOS_DIR
from backend.ingest.pipeline import ingest_incident_dir
from backend.models import Finding
from backend.timeline.builder import build_timeline
from backend.verify.verifier import verify_findings


def run_evals(mode: Literal["live", "replay"] = "live") -> dict:
    results = []
    latencies = []

    for scen_dir in sorted(SCENARIOS_DIR.iterdir()):
        gt_path = scen_dir / "ground_truth.json"
        meta_path = scen_dir / "meta.json"
        if not gt_path.exists() or not meta_path.exists():
            continue

        gt = json.loads(gt_path.read_text(encoding="utf-8"))
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        scen_id = meta["id"]

        started = time.perf_counter()
        items = ingest_incident_dir(scen_dir)
        timeline = build_timeline(scen_id, items)
        img_path = scen_dir / "dashboard.png"
        image_bytes = img_path.read_bytes() if img_path.exists() else None

        inv = investigate_incident(
            incident_id=scen_id,
            title=meta["title"],
            opened_at=meta["opened_at"],
            severity=meta["severity"],
            timeline=timeline,
            mode=mode,
            image_bytes=image_bytes,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        latencies.append(elapsed_ms)

        combined_text = (inv.root_cause_summary + " " + " ".join(inv.root_cause_chain)).lower()
        service_hit = gt["root_cause_service"].lower() in combined_text
        keyword_hits = sum(1 for kw in gt.get("required_keywords", []) if kw.lower() in combined_text)
        citation_rate = inv.verification.citation_validity_rate
        demoted_count = len(inv.hypotheses)

        passed = service_hit and keyword_hits >= 1 and citation_rate >= 0.9 and len(inv.conclusions) >= 2
        results.append({
            "scenario_id": scen_id,
            "mode": inv.mode,
            "model": inv.model,
            "passed": passed,
            "root_cause_service_hit": service_hit,
            "keyword_hits": f"{keyword_hits}/{len(gt.get('required_keywords', []))}",
            "conclusions_count": len(inv.conclusions),
            "hypotheses_demoted": demoted_count,
            "citation_validity_rate": citation_rate,
            "elapsed_ms": elapsed_ms,
        })

    # Synthetic verifier unit check: ensure broken citations are always demoted
    bad_finding = Finding(
        id="BAD-1",
        claim="CPU spike on unknown-svc",
        claim_type="spike",
        evidence_ids=["LOG-9999"],
        quote="nonexistent text",
        confidence=0.95,
    )
    _, bad_ver = verify_findings([bad_finding], {})
    verifier_guard_passed = bad_ver.conclusions_count == 0 and bad_ver.hypotheses_count == 1

    summary = {
        "suite": "incidentlens-evals-v1",
        "mode": mode,
        "scenarios_total": len(results),
        "scenarios_passed": sum(1 for r in results if r["passed"]),
        "root_cause_accuracy": round(
            sum(1 for r in results if r["root_cause_service_hit"]) / max(1, len(results)), 4
        ),
        "avg_citation_validity_rate": round(
            statistics.mean(r["citation_validity_rate"] for r in results), 4
        ) if results else 0.0,
        "verifier_demotion_guard_passed": verifier_guard_passed,
        "median_latency_ms": round(statistics.median(latencies), 2) if latencies else 0.0,
        "results": results,
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS_DIR / "eval_results.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    return summary


if __name__ == "__main__":
    import sys
    run_mode = "replay" if "--replay" in sys.argv else "live"
    print(json.dumps(run_evals(mode=run_mode), indent=2))
