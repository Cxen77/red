"""M1 Ingest adapters and pipeline."""
from .pipeline import ingest_incident_dir, ingest_incident_payloads

__all__ = ["ingest_incident_dir", "ingest_incident_payloads"]
