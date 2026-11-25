import type {
  ChatResponse,
  IncidentMetadata,
  InvestigationResult,
  RemediationAction,
  ReviewDecision,
  SeverityLevel,
  TimelineSummary,
} from "./types";

const BASE = "/api";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchIncidents(): Promise<IncidentMetadata[]> {
  return jsonFetch<IncidentMetadata[]>(`${BASE}/incidents`);
}

export function fetchIncidentDetail(
  id: string
): Promise<{ meta: IncidentMetadata; investigation: InvestigationResult | null }> {
  return jsonFetch(`${BASE}/incidents/${encodeURIComponent(id)}`);
}

export function fetchTimeline(id: string): Promise<TimelineSummary> {
  return jsonFetch<TimelineSummary>(`${BASE}/incidents/${encodeURIComponent(id)}/timeline`);
}

export function runInvestigation(
  id: string,
  mode: "live" | "replay" = "live"
): Promise<InvestigationResult> {
  return jsonFetch<InvestigationResult>(
    `${BASE}/incidents/${encodeURIComponent(id)}/investigate?mode=${mode}`,
    { method: "POST" }
  );
}

export function submitHumanReview(
  id: string,
  payload: { decision: ReviewDecision; corrected_root_cause?: string; note?: string }
): Promise<InvestigationResult> {
  return jsonFetch<InvestigationResult>(
    `${BASE}/incidents/${encodeURIComponent(id)}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export function decideRemediationAction(
  id: string,
  actionId: string,
  payload: { decision: "dry_run" | "approve" | "block"; note?: string }
): Promise<RemediationAction> {
  return jsonFetch<RemediationAction>(
    `${BASE}/incidents/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export function fetchReportJson(id: string): Promise<Record<string, unknown>> {
  return jsonFetch<Record<string, unknown>>(
    `${BASE}/incidents/${encodeURIComponent(id)}/report?format=json`
  );
}

export function fetchEvals(): Promise<Record<string, unknown>> {
  return jsonFetch<Record<string, unknown>>(`${BASE}/evals`);
}

export function sendIncidentChat(
  id: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<ChatResponse> {
  return jsonFetch<ChatResponse>(
    `${BASE}/incidents/${encodeURIComponent(id)}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    }
  );
}

export async function createIncident(params: {
  title: string;
  severity: SeverityLevel;
  logsText?: string;
  tracesText?: string;
  metricsText?: string;
  logsFile?: File | null;
  tracesFile?: File | null;
  metricsFile?: File | null;
  imageFile?: File | null;
}): Promise<IncidentMetadata> {
  const fd = new FormData();
  fd.append("title", params.title);
  fd.append("severity", params.severity);
  if (params.logsText) fd.append("logs_text", params.logsText);
  if (params.tracesText) fd.append("traces_text", params.tracesText);
  if (params.metricsText) fd.append("metrics_text", params.metricsText);
  if (params.logsFile) fd.append("logs_file", params.logsFile);
  if (params.tracesFile) fd.append("traces_file", params.tracesFile);
  if (params.metricsFile) fd.append("metrics_file", params.metricsFile);
  if (params.imageFile) fd.append("image_file", params.imageFile);

  return jsonFetch<IncidentMetadata>(`${BASE}/incidents`, {
    method: "POST",
    body: fd,
  });
}

export function evaluateDecider(payload: {
  state: unknown[];
  questions: Record<string, Record<string, unknown>>;
  image_base64?: string;
  image_mime?: string;
}): Promise<{ answers: Record<string, Record<string, unknown>>; trace: Record<string, unknown> }> {
  return jsonFetch(`${BASE}/decider/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
