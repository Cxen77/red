# IncidentLens

AI Incident Investigation for Cloud-Native Systems (Code Red '26 · Niveus / NTT DATA Track B).

IncidentLens ingests logs (with **Drain3** template mining), traces, metrics, and optional dashboard screenshots into a unified chronological timeline, flags statistical anomalies deterministically, evaluates structured causal decisions using **OpenRouter `perplexity/pplx-decider-flash-v1.3:free`** (`noul`, `choice`, `score`), and verifies every finding against raw evidence IDs and verbatim quotes before promoting claims to **Conclusions** or demoting unsupported claims to **Hypotheses**.

## Architecture

- **M1 Ingest (`backend/ingest/`)**: Pluggable `FormatAdapter` parsers for logs (`LOG-*`), JSON trace spans (`TRACE-*`), and CSV metrics (`MET-*`).
- **M2 Timeline (`backend/timeline/`)**: Chronological merge, per-service lanes, and deterministic anomaly flags (`ERROR_BURST`, `METRIC_SPIKE` >3σ, `TRACE_P99_OUTLIER`, `FIRST_ERROR_OCCURRENCE`, `CONFIG_OR_DEPLOY_EVENT`).
- **M3 Investigator (`backend/agent/`)**: Read-only timeline/log/metric/trace tools paired with `DeciderGateway` (`POST https://openrouter.ai/api/alpha/decisions` using `perplexity/pplx-decider-flash-v1.3:free`) and deterministic replay caching.
- **M4 Verifier & Reports (`backend/verify/`)**: Deterministic existence, verbatim-quote, and claim-type support checks + JSON/Markdown/HTML evidence report exports.
- **M5 API (`backend/api/`)**: FastAPI server exposing `/api/incidents`, `/api/incidents/{id}/timeline`, `/api/incidents/{id}/investigate`, `/api/incidents/{id}/report`, and `/api/decider/evaluate`.
- **M6 Frontend (`frontend/`)**: React + Vite + Tailwind + TanStack Table + Recharts + Lucide UI with Incidents list, 3-column Investigation view (Timeline, Findings, Evidence drawer), printable Report view, and live Decider Probe.
- **Node SDK CLI (`sdk/`)**: `@openrouter/sdk` CLI (`openrouter.alpha.decisions.create`) for evaluating incident logs and images directly from Node.js.

## Setup

1. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`.
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
4. Node `@openrouter/sdk` CLI:
   ```powershell
   cd sdk
   npm install
   node decider_cli.mjs ..\data\scenarios\bad-deploy-friday\logs.log ..\data\scenarios\bad-deploy-friday\dashboard.png
   ```

## Tests & Evaluations

```powershell
.\.venv\Scripts\python.exe -m pytest -v
.\.venv\Scripts\python.exe -m backend.evals.run_evals
```
