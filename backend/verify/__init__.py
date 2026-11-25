"""M4 Deterministic citation verifier and evidence report generator."""
from .verifier import verify_findings
from .report import build_json_report, build_markdown_report, build_html_report

__all__ = [
    "verify_findings",
    "build_json_report",
    "build_markdown_report",
    "build_html_report",
]
