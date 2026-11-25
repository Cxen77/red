"""Log ingest adapter using regex parsing + Drain3 template mining."""
from __future__ import annotations

import json
import re
from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig

from backend.models import EvidenceItem
from .base import FormatAdapter

# Matches ISO timestamp + service + level + message, e.g.:
# 2026-11-25T14:02:01Z checkout-svc INFO deploy v2.4.1 applied config db_pool_max=5
LOG_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+"
    r"(?P<service>[a-zA-Z0-9_.-]+)\s+"
    r"(?P<level>DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\s+"
    r"(?P<msg>.+)$"
)

# Alternate bracketed log format: [2026-11-25 14:02:01] [ERROR] [checkout-svc] msg
BRACKET_LOG_RE = re.compile(
    r"^\[(?P<ts>[^\]]+)\]\s+\[(?P<level>[A-Z]+)\]\s+\[(?P<service>[^\]]+)\]\s+(?P<msg>.+)$"
)


def _create_template_miner() -> TemplateMiner:
    cfg = TemplateMinerConfig()
    cfg.drain_sim_th = 0.4
    cfg.drain_depth = 4
    cfg.drain_max_children = 100
    cfg.profiling_enabled = False
    return TemplateMiner(config=cfg)


def _normalize_ts(ts: str) -> str:
    cleaned = ts.strip().replace(" ", "T")
    if not cleaned.endswith("Z") and "+" not in cleaned:
        cleaned += "Z"
    return cleaned


class LogAdapter(FormatAdapter):
    """Parses plain-text or JSON-lines logs and assigns Drain3 template IDs."""

    source_name = "app.log"

    def parse(self, content: str, source: str | None = None) -> list[EvidenceItem]:
        src = source or self.source_name
        miner = _create_template_miner()
        items: list[EvidenceItem] = []

        for idx, raw_line in enumerate(content.splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue

            ts = "1970-01-01T00:00:00Z"
            service = "unknown-svc"
            level = "INFO"
            msg = line

            if line.startswith("{"):
                try:
                    obj = json.loads(line)
                    ts = _normalize_ts(str(obj.get("ts") or obj.get("timestamp") or ts))
                    service = str(obj.get("service") or obj.get("svc") or service)
                    level = str(obj.get("level") or obj.get("severity") or level).upper()
                    msg = str(obj.get("message") or obj.get("msg") or line)
                except json.JSONDecodeError:
                    pass
            else:
                match = LOG_LINE_RE.match(line) or BRACKET_LOG_RE.match(line)
                if match:
                    ts = _normalize_ts(match.group("ts"))
                    service = match.group("service")
                    level = match.group("level").upper()
                    if level == "WARNING":
                        level = "WARN"
                    msg = match.group("msg")

            result = miner.add_log_message(msg)
            cluster_id = result.get("cluster_id")
            template_mined = result.get("template_mined") or msg
            template_id = f"TPL-{int(cluster_id):03d}" if cluster_id is not None else None

            items.append(
                EvidenceItem(
                    id=f"LOG-{idx:04d}",
                    ts=ts,
                    source=src,
                    service=service,
                    kind="log",
                    raw=line,
                    template_id=template_id,
                    template=template_mined,
                    level=level,
                )
            )
        return items
