<div align="center">

# IncidentLens

**Evidence-Verified AI Incident Investigation & Guarded Remediation for Cloud-Native Systems**

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Gemini 2.5 Flash](https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-OTLP-F5A800?style=for-the-badge&logo=opentelemetry&logoColor=black)](https://opentelemetry.io/)

*Built for Niveus (NTT DATA) Track B — PS 02 · CodeRed'26*

</div>

---

## Overview

Cloud-native outages flood SREs with repetitive logs, distributed traces, metric spikes, and deployment events—while naive LLM summaries hallucinate unverified root causes.

**IncidentLens** is an evidence-verified AI incident investigation platform that:
1. **Redacts & Compresses Telemetry:** Scrubs secrets/PII at ingest and clusters repetitive log floods with **Drain3** (**98.27% average noise reduction**).
2. **Correlates Deterministically:** Aligns error bursts, `>3σ` metric anomalies, `p99` OTLP trace outliers, and Kubernetes/deploy events (`EVENT-*`) on a unified timeline with a service blast-radius graph.
3. **Investigates with Gemini (`gemini-2.5-flash`):** Generates structured root-cause briefs and powers interactive **Incident Chat** (with deterministic **Replay Mode** fallback).
4. **Enforces Zero Hallucinations:** A deterministic **Citation Verifier** checks Evidence ID existence, verbatim quote match, and claim-type support—automatically demoting unproven claims from **Conclusions** to **Hypotheses**.
5. **Gates Remediation:** Operators **Confirm / Correct / Reject** diagnoses, **Dry-Run / Approve / Block** runbook actions, and verify recovery with a live **Verify Live Health** probe.

---

## Architecture

```text
[Alertmanager · OTLP Traces · Prometheus · K8s Events · Dropzone]
        │
        ▼  M1: Secret Redaction + Drain3 Log Clustering (~98.3% Noise Cut)
[Deterministic Timeline & Service Blast-Radius Builder]
        │
        ▼  M2: >3σ Metric Spikes + p99 Trace Outliers + EVENT-* Correlation
[Gemini Investigator (gemini-2.5-flash)] ──► Live API / Replay Mode
        │
        ▼  M4: Deterministic Citation Verifier
   ┌────┴────────────────────┐
   ▼                         ▼
[Verified Conclusions]   [Hypotheses (Demoted)]
   │
   ▼  M5/M6: Operator Console (React + Watermelon UI)
[Confirm/Correct/Reject] ──► [Dry-Run / Approve / Block] ──► [Verify Live Health Probe]
```

---

## Benchmark Results (10-Fault Evaluation Suite · 5 Fault Types)

| Approach | Root-Cause Accuracy | Citation Validity | Avg Noise Reduction | Median Latency |
| :--- | :---: | :---: | :---: | :---: |
| **IncidentLens (Ours)** | **100% (10/10)** | **100%** | **98.27%** | **876.66ms live (7.72ms replay)** |
| Naive Raw-Log Keyword Baseline | 80% (8/10) | 0% | N/A | Deterministic |
| Single Raw-Log Window Baseline | 0% (0/10) | 0% | 0% | Truncated context |

---

## Tech Stack

- **Backend & Processing:** Python 3.12, FastAPI, Uvicorn, Pydantic, Drain3
- **AI & Verification:** Gemini (`gemini-2.5-flash`), Deterministic Citation Verifier, Replay Mode
- **Telemetry & Ops Connectors:** OpenTelemetry (OTLP `resourceSpans`), Prometheus CSV, Alertmanager Webhooks, Kubernetes / Deploy Events (`EVENT-*`), Log Dropzone
- **Frontend & UI:** React, Vite, Tailwind CSS, Watermelon UI (`#101010` dark + `#F97316` orange)

---

## Quickstart (Local Development)

### 1. Backend (FastAPI)
```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --reload --port 8000
```

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev -- --port 5173
```

### 3. Run Evaluation Suite
```bash
python -m backend.evals.run_evals
```

---

## Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend health & status |
| `GET` | `/api/incidents` | List investigated incidents |
| `POST` | `/api/ingest/alertmanager` | Ingest Alertmanager webhook alerts |
| `POST` | `/api/ingest/otlp` | Ingest OpenTelemetry `resourceSpans` |
| `POST` | `/api/incidents/{id}/chat` | Interactive Incident Chat |
| `POST` | `/api/incidents/{id}/review` | Operator `Confirm / Correct / Reject` |
| `POST` | `/api/incidents/{id}/remediate` | `Dry-Run / Approve / Block` runbook action |
| `POST` | `/api/incidents/{id}/verify-health` | Live post-fix recovery probe |

---

## Deployment

- **Backend (Render):** `pip install -r backend/requirements.txt` · `uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT`
- **Frontend (Vercel):** Root directory `frontend` · Framework `Vite` · `npm run build`
