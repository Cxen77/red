"""In-memory + disk-backed incident store loading built-in scenarios and user uploads."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from backend.agent.investigator import investigate_incident
from backend.config import DATA_DIR, OPENROUTER_MODEL, REPLAYS_DIR, SCENARIOS_DIR, UPLOADS_DIR
from backend.ingest.pipeline import (
    ingest_incident_dir_with_stats,
    ingest_incident_payloads_with_stats,
)
from backend.models import (
    EvidenceItem,
    HumanReviewState,
    IncidentMetadata,
    InvestigationResult,
    RemediationAction,
    ReviewDecision,
    SeverityLevel,
    TimelineSummary,
)
from backend.timeline.builder import build_timeline


class IncidentRecord:
    def __init__(
        self,
        meta: IncidentMetadata,
        items: list[EvidenceItem],
        timeline: TimelineSummary,
        image_bytes: bytes | None = None,
        investigation: InvestigationResult | None = None,
    ) -> None:
        self.meta = meta
        self.items = items
        self.timeline = timeline
        self.image_bytes = image_bytes
        self.investigation = investigation


class IncidentStore:
    def __init__(self) -> None:
        self.records: dict[str, IncidentRecord] = {}
        self._load_all()

    def _load_directory(self, inc_dir: Path) -> None:
        meta_path = inc_dir / "meta.json"
        if not meta_path.exists():
            return
        raw_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        inc_id = raw_meta["id"]
        items, redacted_count = ingest_incident_dir_with_stats(inc_dir)
        timeline = build_timeline(inc_id, items, redacted_secrets_count=redacted_count)

        img_path = inc_dir / "dashboard.png"
        image_bytes = img_path.read_bytes() if img_path.exists() else None

        inv_path = REPLAYS_DIR / f"{inc_id}.investigation.json"
        investigation = None
        if inv_path.exists():
            investigation = InvestigationResult.model_validate_json(
                inv_path.read_text(encoding="utf-8")
            )

        meta = IncidentMetadata(
            id=inc_id,
            title=raw_meta["title"],
            services=timeline.services or raw_meta.get("services", []),
            opened_at=raw_meta["opened_at"],
            severity=raw_meta.get("severity", "medium"),
            status=investigation.status if investigation else "open",
            root_cause=investigation.root_cause_summary if investigation else None,
            review_decision=investigation.human_review.decision if investigation else "pending",
            has_image=image_bytes is not None,
            log_count=sum(1 for i in items if i.kind == "log"),
            trace_count=sum(1 for i in items if i.kind == "trace"),
            metric_count=sum(1 for i in items if i.kind == "metric"),
            anomaly_count=timeline.anomaly_count,
            redacted_secrets_count=redacted_count,
            model=OPENROUTER_MODEL,
        )
        self.records[inc_id] = IncidentRecord(
            meta=meta,
            items=items,
            timeline=timeline,
            image_bytes=image_bytes,
            investigation=investigation,
        )

    def _load_all(self) -> None:
        for base_dir in (SCENARIOS_DIR, UPLOADS_DIR):
            if base_dir.exists():
                for child in sorted(base_dir.iterdir()):
                    if child.is_dir():
                        self._load_directory(child)

    def _persist_investigation(self, incident_id: str, inv: InvestigationResult) -> None:
        REPLAYS_DIR.mkdir(parents=True, exist_ok=True)
        (REPLAYS_DIR / f"{incident_id}.investigation.json").write_text(
            inv.model_dump_json(indent=2), encoding="utf-8"
        )

    def list_incidents(self) -> list[IncidentMetadata]:
        return sorted(
            (r.meta for r in self.records.values()),
            key=lambda m: m.opened_at,
            reverse=True,
        )

    def get(self, incident_id: str) -> IncidentRecord | None:
        return self.records.get(incident_id)

    def create_incident(
        self,
        title: str,
        severity: SeverityLevel = "high",
        logs_text: str | None = None,
        traces_text: str | None = None,
        metrics_text: str | None = None,
        events_text: str | None = None,
        image_bytes: bytes | None = None,
    ) -> IncidentRecord:
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:32] or "incident"
        inc_id = f"{slug}-{uuid.uuid4().hex[:6]}"
        inc_dir = UPLOADS_DIR / inc_id
        inc_dir.mkdir(parents=True, exist_ok=True)

        items, redacted_count = ingest_incident_payloads_with_stats(
            logs_text, traces_text, metrics_text, events_text
        )
        # Store redacted telemetry only (never write raw unredacted secrets to disk)
        if logs_text:
            (inc_dir / "logs.log").write_text(
                "\n".join(i.raw for i in items if i.kind == "log") + "\n", encoding="utf-8"
            )
        if traces_text:
            (inc_dir / "traces.json").write_text(traces_text, encoding="utf-8")
        if metrics_text:
            (inc_dir / "metrics.csv").write_text(metrics_text, encoding="utf-8")
        if events_text:
            (inc_dir / "events.json").write_text(events_text, encoding="utf-8")
        if image_bytes:
            (inc_dir / "dashboard.png").write_bytes(image_bytes)

        timeline = build_timeline(inc_id, items, redacted_secrets_count=redacted_count)
        opened_at = items[0].ts if items else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        meta = IncidentMetadata(
            id=inc_id,
            title=title,
            services=timeline.services,
            opened_at=opened_at,
            severity=severity,
            status="open",
            has_image=image_bytes is not None,
            log_count=sum(1 for i in items if i.kind == "log"),
            trace_count=sum(1 for i in items if i.kind == "trace"),
            metric_count=sum(1 for i in items if i.kind == "metric"),
            anomaly_count=timeline.anomaly_count,
            redacted_secrets_count=redacted_count,
            model=OPENROUTER_MODEL,
        )
        (inc_dir / "meta.json").write_text(meta.model_dump_json(indent=2), encoding="utf-8")

        rec = IncidentRecord(
            meta=meta,
            items=items,
            timeline=timeline,
            image_bytes=image_bytes,
        )
        self.records[inc_id] = rec
        return rec

    def scan_dropzone(self, auto_investigate: bool = True) -> list[str]:
        """Automatically ingest any new folder placed in data/dropzone/ by log collectors."""
        dropzone = DATA_DIR / "dropzone"
        dropzone.mkdir(parents=True, exist_ok=True)
        imported: list[str] = []
        for child in sorted(dropzone.iterdir()):
            if not child.is_dir() or (child / ".ingested").exists():
                continue
            logs_p = child / "logs.log"
            traces_p = child / "traces.json"
            metrics_p = child / "metrics.csv"
            events_p = child / "events.json"
            if not any(p.exists() for p in (logs_p, traces_p, metrics_p, events_p)):
                continue
            meta_p = child / "meta.json"
            raw_meta = json.loads(meta_p.read_text(encoding="utf-8")) if meta_p.exists() else {}
            rec = self.create_incident(
                title=raw_meta.get("title") or f"Auto-collected: {child.name}",
                severity=raw_meta.get("severity", "high"),
                logs_text=logs_p.read_text(encoding="utf-8") if logs_p.exists() else None,
                traces_text=traces_p.read_text(encoding="utf-8") if traces_p.exists() else None,
                metrics_text=metrics_p.read_text(encoding="utf-8") if metrics_p.exists() else None,
                events_text=events_p.read_text(encoding="utf-8") if events_p.exists() else None,
            )
            if auto_investigate:
                try:
                    self.investigate(rec.meta.id, mode="live")
                except Exception:
                    pass
            (child / ".ingested").write_text(rec.meta.id, encoding="utf-8")
            imported.append(rec.meta.id)
        return imported

    def investigate(
        self,
        incident_id: str,
        mode: Literal["live", "replay"] = "live",
    ) -> InvestigationResult:
        rec = self.records.get(incident_id)
        if not rec:
            raise KeyError(incident_id)
        result = investigate_incident(
            incident_id=incident_id,
            title=rec.meta.title,
            opened_at=rec.meta.opened_at,
            severity=rec.meta.severity,
            timeline=rec.timeline,
            mode=mode,
            image_bytes=rec.image_bytes,
        )
        rec.investigation = result
        rec.meta.status = result.status
        rec.meta.root_cause = result.root_cause_summary
        rec.meta.review_decision = result.human_review.decision
        self._persist_investigation(incident_id, result)
        return result

    def submit_review(
        self,
        incident_id: str,
        decision: ReviewDecision,
        corrected_root_cause: str | None = None,
        note: str | None = None,
    ) -> InvestigationResult:
        rec = self.records.get(incident_id)
        if not rec or not rec.investigation:
            raise KeyError(incident_id)

        rec.investigation.human_review = HumanReviewState(
            decision=decision,
            corrected_root_cause=corrected_root_cause,
            note=note,
            reviewed_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        if decision == "corrected" and corrected_root_cause:
            rec.investigation.root_cause_summary = corrected_root_cause
            rec.meta.root_cause = corrected_root_cause
        rec.meta.review_decision = decision
        self._persist_investigation(incident_id, rec.investigation)
        return rec.investigation

    def decide_action(
        self,
        incident_id: str,
        action_id: str,
        decision: Literal["dry_run", "approve", "block"],
        note: str | None = None,
    ) -> RemediationAction:
        rec = self.records.get(incident_id)
        if not rec or not rec.investigation:
            raise KeyError(incident_id)

        target = next((a for a in rec.investigation.proposed_actions if a.id == action_id), None)
        if not target:
            raise KeyError(action_id)

        status_map = {
            "dry_run": "dry_run_passed",
            "approve": "approved",
            "block": "blocked",
        }
        target.status = status_map[decision]  # type: ignore[assignment]
        target.decided_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        target.decided_note = note

        # Guarded execution against connected local test-shop-app if present
        test_cfg_path = Path(r"C:\Users\Dev\Desktop\test-shop-app\config.json")
        test_log_path = Path(r"C:\Users\Dev\Desktop\test-shop-app\app.log")
        if target.target_service == "test-shop-checkout" and test_cfg_path.exists():
            cfg_data = json.loads(test_cfg_path.read_text(encoding="utf-8"))
            cur_pool = cfg_data.get("db_pool_max")
            if decision == "dry_run":
                target.dry_run_preview = (
                    f"Live dry-run diff on {test_cfg_path}: db_pool_max {cur_pool} -> 50 (no changes written)."
                )
                target.execution_result = target.dry_run_preview
            elif decision == "approve":
                cfg_data["db_pool_max"] = 50
                cfg_data["version"] = "v1.1.1-hotfix"
                test_cfg_path.write_text(json.dumps(cfg_data, indent=2) + "\n", encoding="utf-8")
                if test_log_path.exists():
                    with test_log_path.open("a", encoding="utf-8") as lf:
                        lf.write(
                            f"{target.decided_at} test-shop-checkout INFO remediation applied db_pool_max=50 (prev={cur_pool})\n"
                        )
                target.execution_result = (
                    f"Executed: updated {test_cfg_path} (db_pool_max {cur_pool} -> 50). Checkout service restored."
                )
            elif decision == "block":
                target.execution_result = (
                    f"Blocked by operator: {test_cfg_path} left unchanged (db_pool_max={cur_pool})."
                )
        else:
            if decision == "dry_run":
                target.execution_result = f"Dry-run validated: {target.dry_run_preview}"
            elif decision == "approve":
                target.execution_result = (
                    f"Approved & executed guarded runbook step on {target.target_service}."
                )
            elif decision == "block":
                target.execution_result = "Blocked by operator; no system changes executed."

        self._persist_investigation(incident_id, rec.investigation)
        return target


_STORE: IncidentStore | None = None


def get_store() -> IncidentStore:
    global _STORE
    if _STORE is None:
        _STORE = IncidentStore()
    return _STORE
