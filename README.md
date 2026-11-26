# IncidentLens

AI Incident Investigation for Cloud-Native Systems (Code Red '26 · Niveus / NTT DATA Track B).

IncidentLens ingests logs (with **Drain3** template mining), traces, metrics, and Kubernetes events into a unified chronological timeline, flags statistical anomalies deterministically, evaluates structured causal decisions using **Gemini (`gemini-2.5-flash`)**, and verifies every finding against raw evidence IDs and verbatim quotes before promoting claims to **Conclusions** or demoting unsupported claims to **Hypotheses**.

## Architecture

- **M1 Ingest (`backend/ingest/`)**: Pluggable `FormatAdapter` parsers for logs (`LOG-*`), JSON & OpenTelemetry `resourceSpans` traces (`TRACE-*`), CSV metrics (`MET-*`), and Kubernetes/deploy change events (`EVENT-*`), with automatic secret redaction.
- **M2 Timeline (`backend/timeline/`)**: Chronological merge, service blast-radius mapping (`origin` → `cascade` → `healthy`), and deterministic anomaly flags (`ERROR_BURST`, `METRIC_SPIKE` >3σ, `TRACE_P99_OUTLIER`, `FIRST_ERROR_OCCURRENCE`, `CONFIG_OR_DEPLOY_EVENT`).
- **M3 Investigator (`backend/agent/`)**: Read-only timeline/log/metric/trace tools paired with the structured decision gateway (`gemini-2.5-flash`) and deterministic replay caching.
- **M4 Verifier & Reports (`backend/verify/`)**: Deterministic existence, verbatim-quote, and claim-type support checks + JSON/Markdown/HTML evidence report exports.
- **M5 API (`backend/api/`)**: FastAPI server exposing `/api/incidents`, `/api/incidents/{id}/timeline`, `/api/incidents/{id}/investigate`, `/api/incidents/{id}/review`, `/api/incidents/{id}/actions/{action_id}`, `/api/incidents/{id}/verify-recovery`, `/api/incidents/{id}/chat`, `/api/webhooks/alertmanager`, `/api/ingest/otel`, and `/api/incidents/{id}/report`.
- **M6 Frontend (`frontend/`)**: React + Vite + Tailwind + Watermelon UI (`shadcn` registry) + TanStack Table + Recharts + Lucide UI with Landing Page, Incidents console, 3-column Investigation view, Incident Chat, Guarded Remediation controls, and Evidence Report.

## Setup

1. Copy `.env.example` to `.env` and configure your API key.
2. Backend:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   .\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --reload --port 8000
   ```
3. Frontend:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

## Tests & Evaluations

```powershell
.\.venv\Scripts\python.exe -m pytest -v
.\.venv\Scripts\python.exe -m backend.evals.run_evals
```
