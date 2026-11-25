"""Common adapter interface so any external scenario format plugs into M1 cleanly."""
from __future__ import annotations

from abc import ABC, abstractmethod
from backend.models import EvidenceItem


class FormatAdapter(ABC):
    """Base interface for incident telemetry adapters (logs, traces, metrics)."""

    source_name: str = "unknown"

    @abstractmethod
    def parse(self, content: str, source: str | None = None) -> list[EvidenceItem]:
        """Parse raw text content into normalized EvidenceItem records (IDs assigned later)."""
        raise NotImplementedError
