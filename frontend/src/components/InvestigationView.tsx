import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSearch,
  Image as ImageIcon,
  MessageSquare,
  Play,
  RotateCcw,
  ShieldAlert,
  Terminal,
  X,
} from "lucide-react";
import { IncidentChatDrawer } from "./IncidentChatDrawer";
import { MetricsStrip } from "./MetricsStrip";
import type {
  ActionStatus,
  ChatCitation,
  EvidenceItem,
  Finding,
  IncidentMetadata,
  InvestigationResult,
  ReviewDecision,
  SeverityLevel,
  TimelineSummary,
} from "../types";

interface InvestigationViewProps {
  meta: IncidentMetadata;
  timeline: TimelineSummary | null;
  investigation: InvestigationResult | null;
  investigating: boolean;
  onRunInvestigation: (mode: "live" | "replay") => void;
  onSubmitReview: (decision: ReviewDecision, corrected?: string, note?: string) => void;
  onDecideAction: (actionId: string, decision: "dry_run" | "approve" | "block") => void;
  onVerifyRecovery: () => void;
  onOpenReport: () => void;
}

const SEV_DOT: Record<SeverityLevel, string> = {
  critical: "bg-[#EF4444]",
  high: "bg-[#F97316]",
  medium: "bg-[#F59E0B]",
  low: "bg-[#3B82F6]",
};

const ACTION_BADGE: Record<ActionStatus, string> = {
  pending_approval: "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30",
  dry_run_passed: "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30",
  approved: "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30",
  blocked: "text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/30",
};

function HighlightedRaw({ raw, quote }: { raw: string; quote?: string }) {
  if (!quote || !quote.trim()) {
    return <span>{raw}</span>;
  }
  const idx = raw.indexOf(quote);
  if (idx === -1) {
    return <span>{raw}</span>;
  }
  const before = raw.slice(0, idx);
  const match = raw.slice(idx, idx + quote.length);
  const after = raw.slice(idx + quote.length);
  return (
    <>
      <span>{before}</span>
      <mark className="bg-[#F97316]/30 text-white px-0.5 font-medium border-b border-[#F97316]">
        {match}
      </mark>
      <span>{after}</span>
    </>
  );
}

export function InvestigationView({
  meta,
  timeline,
  investigation,
  investigating,
  onRunInvestigation,
  onSubmitReview,
  onDecideAction,
  onVerifyRecovery,
  onOpenReport,
}: InvestigationViewProps) {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [errorsOnly, setErrorsOnly] = useState<boolean>(true);
  const [selectedEvidence, setSelectedEvidence] = useState<{
    item: EvidenceItem;
    quote?: string;
    findingId?: string;
  } | null>(null);
  const [showImagePanel, setShowImagePanel] = useState<boolean>(false);
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [editingCorrection, setEditingCorrection] = useState<boolean>(false);
  const [correctedText, setCorrectedText] = useState<string>("");
  const [reviewNote, setReviewNote] = useState<string>("");

  const evidenceLookup = useMemo(() => {
    const map: Record<string, EvidenceItem> = {};
    if (timeline) {
      for (const item of timeline.items) {
        map[item.id] = item;
      }
    }
    if (investigation?.evidence_map) {
      Object.assign(map, investigation.evidence_map);
    }
    return map;
  }, [timeline, investigation]);

  const filteredTimeline = useMemo(() => {
    if (!timeline) return [];
    const list = timeline.items.filter((item) => {
      if (selectedServices.length > 0 && !selectedServices.includes(item.service)) {
        return false;
      }
      if (errorsOnly) {
        const isErr =
          item.level === "ERROR" ||
          item.level === "CRITICAL" ||
          item.level === "WARN" ||
          item.flags.length > 0;
        if (!isErr) return false;
      }
      return true;
    });
    return list.slice(0, 160);
  }, [timeline, selectedServices, errorsOnly]);

  function toggleService(svc: string) {
    setSelectedServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  }

  function handleCitationClick(evidenceId: string, finding?: Finding) {
    const item = evidenceLookup[evidenceId];
    if (!item) return;
    setSelectedEvidence({
      item,
      quote: finding?.quote,
      findingId: finding?.id,
    });
    setChatOpen(false);
  }

  function handleChatCitationClick(cit: ChatCitation) {
    const item = evidenceLookup[cit.id];
    if (!item) return;
    setSelectedEvidence({
      item,
      quote: cit.quote,
      findingId: "Chat",
    });
    setChatOpen(false);
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-48px)] bg-[#101010] text-white">
      {/* Top strip */}
      <div className="bg-[#141414] border-b border-white/10 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${SEV_DOT[meta.severity]}`} />
            <h1 className="text-[20px] font-semibold text-white">
              {meta.title}
            </h1>
            <span
              className={`font-mono text-[11px] px-2 py-0.5 border uppercase ${
                meta.status === "resolved"
                  ? "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30"
                  : meta.status === "verified"
                  ? "bg-[#F97316]/15 text-[#F97316] border-[#F97316]/30"
                  : "bg-white/[0.04] text-white/60 border-white/10"
              }`}
            >
              {meta.status}
            </span>
          </div>
          <div className="text-[12px] text-white/50 mt-0.5 flex flex-wrap items-center gap-3">
            <span className="font-mono text-white/70">{meta.id}</span>
            <span>Opened {meta.opened_at}</span>
            <span>
              {meta.log_count} logs · {meta.trace_count} traces · {meta.metric_count} metrics ·{" "}
              <strong className="font-medium text-[#F97316]">
                {meta.anomaly_count} deterministic anomalies
              </strong>
              {meta.redacted_secrets_count > 0 && (
                <> · {meta.redacted_secrets_count} secrets redacted</>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {meta.has_image && (
            <button
              type="button"
              onClick={() => setShowImagePanel((v) => !v)}
              className="px-3 py-1.5 border border-white/15 font-mono text-[12px] text-white/80 bg-[#101010] hover:bg-white/[0.04] flex items-center gap-1.5"
            >
              <ImageIcon className="w-4 h-4 text-[#F97316]" strokeWidth={1.5} />
              {showImagePanel ? "Hide chart image" : "Dashboard image"}
            </button>
          )}
          <button
            type="button"
            disabled={investigating}
            onClick={() => onRunInvestigation("replay")}
            className="px-3 py-1.5 border border-white/15 font-mono text-[12px] text-white/80 bg-[#101010] hover:bg-white/[0.04] flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-white/60" strokeWidth={1.5} />
            Replay
          </button>
          <button
            type="button"
            disabled={investigating}
            onClick={() => onRunInvestigation("live")}
            className="px-3.5 py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono text-[12px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={2} />
            {investigating ? "Investigating..." : "Investigate live"}
          </button>
          <button
            type="button"
            onClick={() => {
              setChatOpen((v) => !v);
              setSelectedEvidence(null);
            }}
            className={`px-3 py-1.5 border font-mono text-[12px] flex items-center gap-1.5 ${
              chatOpen
                ? "bg-white text-[#101010] border-white font-semibold"
                : "border-white/15 text-white/80 bg-[#101010] hover:bg-white/[0.04]"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
            Ask incident
          </button>
          {investigation && (
            <button
              type="button"
              onClick={onVerifyRecovery}
              className="px-3 py-1.5 border border-[#22C55E]/40 font-mono text-[12px] text-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/20 font-medium flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              Verify live health
            </button>
          )}
          {investigation && (
            <button
              type="button"
              onClick={onOpenReport}
              className="px-3 py-1.5 border border-white/15 font-mono text-[12px] text-white/80 bg-[#101010] hover:bg-white/[0.04] flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-white/60" strokeWidth={1.5} />
              Export report
            </button>
          )}
        </div>
      </div>

      {/* Metrics Strip */}
      {timeline && (
        <MetricsStrip
          metricSeries={timeline.metric_series}
          anomalyWindow={timeline.anomaly_window}
        />
      )}

      {/* Service Blast-Radius Strip */}
      {timeline?.service_map && timeline.service_map.length > 0 && (
        <div className="bg-[#0A0A0A] border-b border-white/10 px-6 py-2 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#F97316] mr-1">
            {"// BLAST RADIUS"}
          </span>
          {timeline.service_map.map((node, idx) => {
            const dotColor =
              node.role === "origin"
                ? "bg-[#EF4444]"
                : node.role === "cascade"
                ? "bg-[#F97316]"
                : "bg-[#22C55E]";
            const isActive = selectedServices.includes(node.service);
            return (
              <div key={node.service} className="flex items-center gap-2">
                {idx > 0 && node.role !== "healthy" && (
                  <ChevronRight className="w-3.5 h-3.5 text-white/30" strokeWidth={1.5} />
                )}
                <button
                  type="button"
                  onClick={() => toggleService(node.service)}
                  className={`px-2 py-0.5 border font-mono text-[11px] flex items-center gap-1.5 transition-colors ${
                    isActive
                      ? "bg-[#F97316] text-[#101010] border-[#F97316] font-bold"
                      : "bg-[#141414] text-white/85 border-white/15 hover:border-[#F97316]/60"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  <span>{node.service}</span>
                  <span className="text-[10px] opacity-75">
                    {node.role}
                    {node.anomaly_count > 0 ? ` (${node.anomaly_count})` : ""}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Optional Multimodal Image + Decider Visual Assessment */}
      {showImagePanel && meta.has_image && (
        <div className="bg-[#141414] border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-6">
          <img
            src={`/api/incidents/${encodeURIComponent(meta.id)}/image`}
            alt="Attached incident dashboard chart"
            className="h-[110px] border border-white/15"
          />
          <div className="text-[13px]">
            <div className="font-medium text-white">
              Attached dashboard image (multimodal Decider state)
            </div>
            {investigation?.image_assessment ? (
              <div className="mt-1 space-y-1 text-[12px] text-white/60">
                <div>
                  Matches telemetry (noul):{" "}
                  <span className="font-mono text-[#F97316]">
                    {typeof investigation.image_assessment.matches_telemetry === "number"
                      ? investigation.image_assessment.matches_telemetry.toFixed(3)
                      : "—"}
                  </span>
                </div>
                <div>
                  Visual pattern (choice):{" "}
                  <span className="font-mono text-white">
                    {investigation.image_assessment.visual_pattern || "—"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-white/50 mt-1">
                Run Investigate live to evaluate this image alongside logs and metrics.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 3-Column Investigation Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* LEFT (296px): Timeline */}
        <aside className="w-full lg:w-[296px] shrink-0 bg-[#141414] border-r border-white/10 flex flex-col max-h-[520px] lg:max-h-none lg:sticky lg:top-0 lg:h-[calc(100vh-48px)]">
          <div className="p-3 border-b border-white/10 space-y-2 bg-[#0A0A0A]">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[12px] font-bold uppercase tracking-wider text-white">
                Timeline
              </h2>
              <label className="flex items-center gap-1.5 text-[12px] text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={errorsOnly}
                  onChange={(e) => setErrorsOnly(e.target.checked)}
                  className="accent-[#F97316]"
                />
                Anomalies &amp; errors
              </label>
            </div>
            <div className="flex flex-wrap gap-1">
              {(timeline?.services || meta.services).map((svc) => {
                const active = selectedServices.includes(svc);
                return (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => toggleService(svc)}
                    className={`font-mono text-[11px] px-1.5 py-0.5 border transition-colors ${
                      active
                        ? "bg-[#F97316] text-[#101010] border-[#F97316] font-bold"
                        : "bg-[#141414] text-white/65 border-white/10 hover:border-white/30"
                    }`}
                  >
                    {svc}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/10">
            {filteredTimeline.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-white/45">
                No events match the current filter.
              </div>
            ) : (
              filteredTimeline.map((item) => {
                const hasCrit = item.flags.some((f) => f.severity === "critical");
                const hasWarn = item.flags.some((f) => f.severity === "warning");
                const isSelected = selectedEvidence?.item.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedEvidence({ item });
                      setChatOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors duration-100 ${
                      isSelected ? "bg-[#F97316]/15 border-l-2 border-[#F97316]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        hasCrit
                          ? "bg-[#EF4444]"
                          : hasWarn
                          ? "bg-[#F97316]"
                          : item.flags.length > 0
                          ? "bg-[#3B82F6]"
                          : "bg-white/25"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[11px] text-white/50">
                          {item.ts.slice(11, 19)}
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.2 bg-white/[0.04] text-white/65 border border-white/10">
                          {item.service}
                        </span>
                      </div>
                      <div className="text-[12px] text-white/90 truncate mt-0.5">
                        {item.flags[0]?.label || item.raw}
                      </div>
                      <div className="font-mono text-[10px] text-[#F97316]/80 mt-0.5">
                        {item.id}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* CENTRE (flex): Findings */}
        <section className="flex-1 min-w-0 px-6 py-5 overflow-y-auto bg-[#101010]">
          {!investigation ? (
            <div className="bg-[#141414] border border-white/10 p-10 text-center max-w-lg mx-auto mt-10">
              <FileSearch className="w-6 h-6 text-[#F97316] mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[14px] font-medium text-white">
                No investigation run recorded yet
              </p>
              <p className="text-[13px] text-white/55 mt-1 mb-4">
                Run Investigate live to evaluate telemetry and verify every finding against deterministic citations.
              </p>
              <button
                type="button"
                disabled={investigating}
                onClick={() => onRunInvestigation("live")}
                className="px-4 py-2 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono text-[12px] font-bold uppercase"
              >
                {investigating ? "Investigating..." : "Investigate live"}
              </button>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl">
              {/* Root cause summary + Human Review gate */}
              <div className="relative bg-[#141414] border border-white/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-white/55">
                    Verified Root Cause Summary · Noise reduction{" "}
                    <span className="text-[#F97316]">
                      {investigation.raw_items_total} → {investigation.filtered_items_sent} ({investigation.noise_reduction_pct.toFixed(1)}%)
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#22C55E]">
                    {(investigation.verification.citation_validity_rate * 100).toFixed(0)}% citations verified ·{" "}
                    {investigation.mode} ({investigation.model})
                  </span>
                </div>
                <p className="text-[14px] text-white font-medium">
                  {investigation.root_cause_summary}
                </p>

                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] text-white/60">
                    Operator review:{" "}
                    <span className="font-mono font-bold uppercase text-[#F97316]">
                      {investigation.human_review.decision}
                    </span>
                    {investigation.human_review.reviewed_at && (
                      <span className="text-white/40 ml-2 font-mono text-[11px]">
                        ({investigation.human_review.reviewed_at})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSubmitReview("confirmed")}
                      className="px-2.5 py-1 border border-[#22C55E]/40 hover:bg-[#22C55E]/15 font-mono text-[11px] text-[#22C55E] flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Confirm diagnosis
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCorrectedText(investigation.root_cause_summary);
                        setEditingCorrection((v) => !v);
                      }}
                      className="px-2.5 py-1 border border-white/15 hover:border-white/40 font-mono text-[11px] text-white bg-[#101010]"
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      onClick={() => onSubmitReview("rejected", undefined, "Diagnosis rejected by operator")}
                      className="px-2.5 py-1 border border-[#EF4444]/40 hover:bg-[#EF4444]/15 font-mono text-[11px] text-[#EF4444]"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {editingCorrection && (
                  <div className="pt-2 space-y-2">
                    <input
                      type="text"
                      value={correctedText}
                      onChange={(e) => setCorrectedText(e.target.value)}
                      className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#F97316]"
                      placeholder="Enter corrected root cause summary"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="flex-1 bg-[#101010] border border-white/15 px-2.5 py-1 text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                        placeholder="Optional review note"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onSubmitReview("corrected", correctedText, reviewNote);
                          setEditingCorrection(false);
                        }}
                        className="px-3 py-1 bg-[#F97316] text-[#101010] font-mono text-[11px] font-bold uppercase"
                      >
                        Save correction
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Conclusions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[15px] font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E]" strokeWidth={1.75} />
                    Conclusions ({investigation.conclusions.length})
                  </h2>
                  <span className="font-mono text-[11px] text-white/45">
                    Passed existence, verbatim quote, and claim-type checks
                  </span>
                </div>

                <div className="bg-[#141414] border border-white/10 divide-y divide-white/10">
                  {investigation.conclusions.map((finding) => (
                    <div key={finding.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[11px] text-[#F97316]">
                              {finding.id}
                            </span>
                            {finding.service && (
                              <span className="font-mono text-[11px] px-1.5 py-0.5 bg-white/[0.04] text-white/75 border border-white/10">
                                {finding.service}
                              </span>
                            )}
                            <span className="text-[11px] text-white/45 capitalize">
                              {finding.claim_type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-[14px] text-white/95 leading-snug">
                            {finding.claim}
                          </p>
                        </div>

                        <div className="w-28 shrink-0 text-right">
                          <div className="font-mono text-[12px] font-medium text-[#22C55E]">
                            {(finding.confidence * 100).toFixed(0)}%
                          </div>
                          <div className="w-full h-1.5 bg-white/10 mt-1 overflow-hidden">
                            <div
                              className="h-full bg-[#F97316]"
                              style={{ width: `${Math.round(finding.confidence * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {finding.evidence_ids.map((eid) => (
                          <button
                            key={eid}
                            type="button"
                            onClick={() => handleCitationClick(eid, finding)}
                            className={`font-mono text-[12px] px-2 py-0.5 border flex items-center gap-1 transition-colors ${
                              selectedEvidence?.item.id === eid
                                ? "bg-[#F97316] text-[#101010] border-[#F97316] font-bold"
                                : "bg-[#101010] text-[#F97316] border-[#F97316]/40 hover:border-[#F97316]"
                            }`}
                          >
                            {eid}
                            <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hypotheses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[15px] font-semibold text-white/70 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#F59E0B]" strokeWidth={1.75} />
                    Hypotheses ({investigation.hypotheses.length})
                  </h2>
                  <span className="font-mono text-[11px] text-white/45">
                    Demoted by deterministic verifier — unverified guesses
                  </span>
                </div>

                <div className="bg-[#141414]/60 border border-dashed border-white/20 divide-y divide-dashed divide-white/15">
                  {investigation.hypotheses.length === 0 ? (
                    <div className="p-4 text-[13px] text-white/45">
                      No demoted hypotheses in this run.
                    </div>
                  ) : (
                    investigation.hypotheses.map((hyp) => (
                      <div key={hyp.id} className="p-4 text-white/65">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-mono text-[11px] text-white/45 mb-1">
                              {hyp.id} · Unverified
                            </div>
                            <p className="text-[13px] text-white/70">{hyp.claim}</p>
                            <div className="mt-2 font-mono text-[12px] text-[#F59E0B]">
                              Demotion reason: {hyp.demotion_reason}
                            </div>
                          </div>
                          <span className="font-mono text-[12px] text-white/45">
                            {(hyp.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Guarded Remediation Actions */}
              {investigation.proposed_actions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[15px] font-semibold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-[#F97316]" strokeWidth={1.75} />
                      Proposed Remediation Actions ({investigation.proposed_actions.length})
                    </h2>
                    <button
                      type="button"
                      onClick={onVerifyRecovery}
                      className="px-2.5 py-1 border border-[#22C55E]/40 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 font-mono text-[11px] text-[#22C55E] font-medium flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Verify live health
                    </button>
                  </div>

                  {investigation.recovery_check && (
                    <div
                      className={`mb-2 border px-3 py-2 text-[12px] font-mono ${
                        investigation.recovery_check.verified
                          ? "bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]"
                          : "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]"
                      }`}
                    >
                      [{investigation.recovery_check.verified ? "RESOLVED" : "STILL FAILING"}]{" "}
                      {investigation.recovery_check.detail} (checked{" "}
                      {investigation.recovery_check.checked_at})
                    </div>
                  )}

                  <div className="bg-[#141414] border border-white/10 divide-y divide-white/10">
                    {investigation.proposed_actions.map((act) => (
                      <div key={act.id} className="p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[#F97316]">
                              {act.id}
                            </span>
                            <span className="font-medium text-[13px] text-white">
                              {act.title}
                            </span>
                            <span className="font-mono text-[11px] px-1.5 py-0.5 bg-white/[0.04] text-white/60 border border-white/10">
                              risk:{act.risk_level}
                            </span>
                          </div>
                          <span
                            className={`font-mono text-[11px] px-2 py-0.5 border ${ACTION_BADGE[act.status]}`}
                          >
                            {act.status.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div className="font-mono text-[12px] bg-[#101010] border border-white/10 px-2.5 py-1.5 text-white/85 flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-[#F97316] shrink-0" strokeWidth={1.5} />
                          <span className="truncate">{act.command}</span>
                        </div>

                        <div className="text-[12px] text-white/55">
                          {act.dry_run_preview}
                        </div>

                        {act.execution_result && (
                          <div className="font-mono text-[11px] bg-[#101010] border border-[#F97316]/30 px-2.5 py-1.5 text-[#F97316]">
                            {act.execution_result}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onDecideAction(act.id, "dry_run")}
                            className="px-2.5 py-1 border border-white/15 hover:bg-white/[0.04] font-mono text-[11px] text-white"
                          >
                            Run dry-run
                          </button>
                          <button
                            type="button"
                            onClick={() => onDecideAction(act.id, "approve")}
                            className="px-2.5 py-1 border border-[#22C55E]/40 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 font-mono text-[11px] text-[#22C55E] font-medium"
                          >
                            Approve change
                          </button>
                          <button
                            type="button"
                            onClick={() => onDecideAction(act.id, "block")}
                            className="px-2.5 py-1 border border-[#EF4444]/40 hover:bg-[#EF4444]/10 font-mono text-[11px] text-[#EF4444]"
                          >
                            Block action
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decider Audit Strip */}
              {investigation.decision_traces.length > 0 && (
                <div>
                  <h3 className="font-mono text-[12px] uppercase tracking-wider text-[#F97316] mb-2">
                    Decider Evaluations
                  </h3>
                  <div className="bg-[#141414] border border-white/10 divide-y divide-white/10">
                    {investigation.decision_traces.map((tr, i) => (
                      <div key={i} className="p-3 text-[12px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="font-medium text-white">
                            Stage: <span className="font-mono text-[#F97316]">{tr.stage}</span>
                          </span>
                          <span className="font-mono text-[11px] text-white/50">
                            {tr.mode} · {tr.latency_ms}ms · {tr.context_items_sent} items ·{" "}
                            {tr.input_tokens} in / {tr.output_tokens} out · retries {tr.retries} · cost ${tr.cost}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {tr.questions.map((q) => (
                            <div
                              key={q.question_key}
                              className="bg-[#101010] border border-white/10 px-2.5 py-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[11px] text-white/55">
                                  {q.question_key} ({q.question_type})
                                </span>
                                <span className="font-mono text-[11px] font-medium text-white">
                                  {typeof q.answer === "number"
                                    ? q.answer.toFixed(3)
                                    : String(q.answer)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT (360px, Drawer): Evidence Inspector */}
        {selectedEvidence && (
          <aside className="w-full lg:w-[360px] shrink-0 bg-[#141414] border-l border-white/10 flex flex-col lg:sticky lg:top-0 lg:h-[calc(100vh-48px)]">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
              <div>
                <div className="font-mono text-[13px] font-semibold text-[#F97316]">
                  {selectedEvidence.item.id}
                </div>
                <div className="text-[12px] text-white/50">
                  {selectedEvidence.item.source} · {selectedEvidence.item.service}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEvidence(null);
                    setChatOpen(true);
                  }}
                  className="font-mono text-[11px] px-2 py-1 border border-white/15 text-white/70 hover:text-white"
                >
                  Back to chat
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEvidence(null)}
                  className="p-1 text-white/50 hover:text-white"
                  aria-label="Close evidence drawer"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-white/45 block text-[11px]">Timestamp</span>
                  <span className="font-mono text-white">
                    {selectedEvidence.item.ts}
                  </span>
                </div>
                <div>
                  <span className="text-white/45 block text-[11px]">Kind</span>
                  <span className="font-mono uppercase text-white">
                    {selectedEvidence.item.kind}
                  </span>
                </div>
                {selectedEvidence.item.template_id && (
                  <div className="col-span-2">
                    <span className="text-white/45 block text-[11px]">
                      Drain3 Template ({selectedEvidence.item.template_id})
                    </span>
                    <span className="font-mono text-[11px] text-white/70 break-all">
                      {selectedEvidence.item.template}
                    </span>
                  </div>
                )}
              </div>

              {selectedEvidence.item.flags.length > 0 && (
                <div>
                  <div className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-[#F97316] mb-1.5">
                    Deterministic Anomaly Flags
                  </div>
                  <div className="space-y-1.5">
                    {selectedEvidence.item.flags.map((fl, idx) => (
                      <div
                        key={idx}
                        className="border border-white/10 px-2.5 py-1.5 bg-[#101010]"
                      >
                        <div className="text-[12px] font-medium text-white">
                          {fl.label}
                        </div>
                        <div className="text-[11px] text-white/55">{fl.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-white/50 mb-1.5">
                  Raw Evidence Payload
                </div>
                <pre className="p-3 border border-white/10 bg-[#101010] font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all text-white/90">
                  <HighlightedRaw
                    raw={selectedEvidence.item.raw}
                    quote={selectedEvidence.quote}
                  />
                </pre>
                {selectedEvidence.quote && (
                  <p className="text-[11px] text-white/50 mt-1.5">
                    Highlighted fragment was verified verbatim for finding{" "}
                    <span className="font-mono text-[#F97316]">{selectedEvidence.findingId}</span>.
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* RIGHT (380px, Drawer): Incident Chatbot */}
        {chatOpen && (
          <IncidentChatDrawer
            incidentId={meta.id}
            incidentTitle={meta.title}
            onSelectCitation={handleChatCitationClick}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
