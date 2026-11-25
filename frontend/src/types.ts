export type EvidenceKind = "log" | "trace" | "metric";
export type SeverityLevel = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "investigated" | "verified";
export type FindingKind = "conclusion" | "hypothesis";
export type ReviewDecision = "pending" | "confirmed" | "corrected" | "rejected";
export type ActionStatus = "pending_approval" | "dry_run_passed" | "approved" | "blocked";

export interface AnomalyFlag {
  code: string;
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
  metric_name?: string | null;
  z_score?: number | null;
  value?: number | null;
}

export interface EvidenceItem {
  id: string;
  ts: string;
  source: string;
  service: string;
  kind: EvidenceKind;
  raw: string;
  template_id?: string | null;
  template?: string | null;
  level?: string | null;
  duration_ms?: number | null;
  trace_id?: string | null;
  span_id?: string | null;
  metric_name?: string | null;
  metric_value?: number | null;
  flags: AnomalyFlag[];
}

export interface MetricPoint {
  ts: string;
  service: string;
  metric_name: string;
  value: number;
  z_score?: number | null;
  is_anomaly: boolean;
  evidence_id: string;
}

export interface TimelineSummary {
  incident_id: string;
  services: string[];
  total_items: number;
  anomaly_count: number;
  redacted_secrets_count: number;
  anomaly_window?: [string, string] | null;
  items: EvidenceItem[];
  metric_series: Record<string, MetricPoint[]>;
}

export interface DeciderQuestionResult {
  question_key: string;
  question_type: "noul" | "choice" | "score" | "box";
  instructions: string;
  answer: unknown;
  confidence?: number | null;
  probabilities?: Record<string, number> | null;
}

export interface DecisionTraceRecord {
  stage: string;
  model: string;
  mode: "live" | "replay";
  latency_ms: number;
  retries: number;
  context_items_sent: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  request_id?: string | null;
  error?: string | null;
  questions: DeciderQuestionResult[];
}

export interface Finding {
  id: string;
  claim: string;
  claim_type: string;
  evidence_ids: string[];
  quote: string;
  confidence: number;
  kind: FindingKind;
  service?: string | null;
  demotion_reason?: string | null;
  verification_passed: boolean;
  decider_signals: Record<string, unknown>;
}

export interface RemediationAction {
  id: string;
  title: string;
  target_service: string;
  command: string;
  risk_level: "low" | "medium" | "high";
  dry_run_preview: string;
  status: ActionStatus;
  decided_at?: string | null;
  decided_note?: string | null;
}

export interface HumanReviewState {
  decision: ReviewDecision;
  corrected_root_cause?: string | null;
  note?: string | null;
  reviewed_at?: string | null;
}

export interface VerificationSummary {
  total_findings: number;
  conclusions_count: number;
  hypotheses_count: number;
  citation_validity_rate: number;
  checks: Array<{
    finding_id: string;
    passed: boolean;
    kind: string;
    evidence_ids: string[];
    failures: string[];
  }>;
}

export interface InvestigationResult {
  incident_id: string;
  title: string;
  mode: "live" | "replay";
  model: string;
  opened_at: string;
  investigated_at: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  root_cause_summary: string;
  root_cause_chain: string[];
  raw_items_total: number;
  filtered_items_sent: number;
  noise_reduction_pct: number;
  redacted_secrets_count: number;
  tool_trace: Array<Record<string, unknown>>;
  decision_traces: DecisionTraceRecord[];
  image_assessment?: {
    matches_telemetry?: number;
    visual_pattern?: string;
    visual_probabilities?: Record<string, number>;
  } | null;
  conclusions: Finding[];
  hypotheses: Finding[];
  proposed_actions: RemediationAction[];
  human_review: HumanReviewState;
  verification: VerificationSummary;
  evidence_map: Record<string, EvidenceItem>;
}

export interface IncidentMetadata {
  id: string;
  title: string;
  services: string[];
  opened_at: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  root_cause?: string | null;
  review_decision: ReviewDecision;
  has_image: boolean;
  log_count: number;
  trace_count: number;
  metric_count: number;
  anomaly_count: number;
  redacted_secrets_count: number;
  model: string;
}

export interface ChatCitation {
  id: string;
  service: string;
  ts: string;
  kind: EvidenceKind;
  quote: string;
  summary: string;
}

export interface ChatResponse {
  reply: string;
  intent: string;
  focus_service: string;
  confidence: number;
  answerable_prob: number;
  citations: ChatCitation[];
  suggested_followups: string[];
  model: string;
  latency_ms: number;
}
