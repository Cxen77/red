import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSearch,
  Image as ImageIcon,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { MetricsStrip } from "./MetricsStrip";
import type {
  EvidenceItem,
  Finding,
  IncidentMetadata,
  InvestigationResult,
  SeverityLevel,
  TimelineSummary,
} from "../types";

interface InvestigationViewProps {
  meta: IncidentMetadata;
  timeline: TimelineSummary | null;
  investigation: InvestigationResult | null;
  investigating: boolean;
  onRunInvestigation: (mode: "live" | "replay") => void;
  onOpenReport: () => void;
}

const SEV_DOT: Record<SeverityLevel, string> = {
  critical: "bg-[#B91C1C]",
  high: "bg-[#C81E1E]",
  medium: "bg-[#B45309]",
  low: "bg-[#1D4ED8]",
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
      <mark className="bg-amber-100 text-[#1C1917] px-0.5 rounded-sm font-medium">
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
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-48px)]">
      {/* Top strip */}
      <div className="bg-white border-b border-[#E7E5E4] px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${SEV_DOT[meta.severity]}`} />
            <h1 className="text-[20px] font-semibold text-[#1C1917]">
              {meta.title}
            </h1>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#F5F5F4] text-[#57534E] border border-[#E7E5E4]">
              {meta.status}
            </span>
          </div>
          <div className="text-[12px] text-[#78716C] mt-0.5 flex flex-wrap items-center gap-3">
            <span className="font-mono">{meta.id}</span>
            <span>Opened {meta.opened_at}</span>
            <span>
              {meta.log_count} logs · {meta.trace_count} traces · {meta.metric_count} metrics ·{" "}
              <strong className="font-medium text-[#1C1917]">
                {meta.anomaly_count} deterministic anomalies
              </strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meta.has_image && (
            <button
              type="button"
              onClick={() => setShowImagePanel((v) => !v)}
              className="px-3 py-1.5 rounded border border-[#E7E5E4] text-[13px] text-[#1C1917] bg-white hover:bg-[#F5F5F4] flex items-center gap-1.5"
            >
              <ImageIcon className="w-4 h-4 text-[#78716C]" strokeWidth={1.5} />
              {showImagePanel ? "Hide chart image" : "Dashboard image"}
            </button>
          )}
          <button
            type="button"
            disabled={investigating}
            onClick={() => onRunInvestigation("replay")}
            className="px-3 py-1.5 rounded border border-[#E7E5E4] text-[13px] text-[#1C1917] bg-white hover:bg-[#F5F5F4] flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#78716C]" strokeWidth={1.5} />
            Replay
          </button>
          <button
            type="button"
            disabled={investigating}
            onClick={() => onRunInvestigation("live")}
            className="px-3.5 py-1.5 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
            {investigating ? "Investigating..." : "Investigate live"}
          </button>
          {investigation && (
            <button
              type="button"
              onClick={onOpenReport}
              className="px-3 py-1.5 rounded border border-[#E7E5E4] text-[13px] text-[#1C1917] bg-white hover:bg-[#F5F5F4] flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-[#78716C]" strokeWidth={1.5} />
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

      {/* Optional Multimodal Image + Decider Visual Assessment */}
      {showImagePanel && meta.has_image && (
        <div className="bg-white border-b border-[#E7E5E4] px-6 py-3 flex flex-wrap items-center gap-6">
          <img
            src={`/api/incidents/${encodeURIComponent(meta.id)}/image`}
            alt="Attached incident dashboard chart"
            className="h-[110px] border border-[#E7E5E4] rounded"
          />
          <div className="text-[13px]">
            <div className="font-medium text-[#1C1917]">
              Attached dashboard image (multimodal Decider state)
            </div>
            {investigation?.image_assessment ? (
              <div className="mt-1 space-y-1 text-[12px] text-[#57534E]">
                <div>
                  Matches telemetry (noul):{" "}
                  <span className="font-mono text-[#1C1917]">
                    {typeof investigation.image_assessment.matches_telemetry === "number"
                      ? investigation.image_assessment.matches_telemetry.toFixed(3)
                      : "—"}
                  </span>
                </div>
                <div>
                  Visual pattern (choice):{" "}
                  <span className="font-mono text-[#1C1917]">
                    {investigation.image_assessment.visual_pattern || "—"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[#78716C] mt-1">
                Run Investigate live to evaluate this image alongside logs and metrics.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 3-Column Investigation Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* LEFT (280px): Timeline */}
        <aside className="w-full lg:w-[296px] shrink-0 bg-white border-r border-[#E7E5E4] flex flex-col max-h-[calc(100vh-220px)]">
          <div className="p-3 border-b border-[#E7E5E4] space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-[#1C1917]">Timeline</h2>
              <label className="flex items-center gap-1.5 text-[12px] text-[#57534E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={errorsOnly}
                  onChange={(e) => setErrorsOnly(e.target.checked)}
                  className="accent-[#C81E1E]"
                />
                Anomalies & errors
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
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                      active
                        ? "bg-[#C81E1E] text-white border-[#C81E1E]"
                        : "bg-[#F5F5F4] text-[#57534E] border-[#E7E5E4] hover:border-stone-400"
                    }`}
                  >
                    {svc}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#E7E5E4]">
            {filteredTimeline.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-[#78716C]">
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
                    onClick={() => setSelectedEvidence({ item })}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors duration-100 ${
                      isSelected ? "bg-[#FEF2F2]" : "hover:bg-[#FAFAF9]"
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        hasCrit
                          ? "bg-[#B91C1C]"
                          : hasWarn
                          ? "bg-[#B45309]"
                          : item.flags.length > 0
                          ? "bg-[#1D4ED8]"
                          : "bg-stone-300"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[11px] text-[#78716C]">
                          {item.ts.slice(11, 19)}
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#F5F5F4] text-[#57534E]">
                          {item.service}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#1C1917] truncate mt-0.5">
                        {item.flags[0]?.label || item.raw}
                      </div>
                      <div className="font-mono text-[10px] text-[#78716C] mt-0.5">
                        {item.id}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* CENTRE (flex): Findings — Conclusions + Hypotheses */}
        <section className="flex-1 min-w-0 px-6 py-5 overflow-y-auto bg-[#FAFAF9]">
          {!investigation ? (
            <div className="bg-white border border-[#E7E5E4] rounded-md p-10 text-center max-w-lg mx-auto mt-10">
              <FileSearch className="w-6 h-6 text-stone-300 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[14px] font-medium text-[#1C1917]">
                No investigation run recorded yet
              </p>
              <p className="text-[13px] text-[#78716C] mt-1 mb-4">
                Run Investigate live to query OpenRouter perplexity/pplx-decider-flash-v1.3:free and verify every finding against deterministic citations.
              </p>
              <button
                type="button"
                disabled={investigating}
                onClick={() => onRunInvestigation("live")}
                className="px-4 py-2 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[13px] font-medium"
              >
                {investigating ? "Investigating..." : "Investigate live"}
              </button>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl">
              {/* Root cause summary bar */}
              <div className="bg-white border border-[#E7E5E4] rounded-md px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#78716C]">
                    Verified Root Cause Summary
                  </span>
                  <span className="font-mono text-[11px] text-[#15803D]">
                    {(investigation.verification.citation_validity_rate * 100).toFixed(0)}% citations verified ·{" "}
                    {investigation.mode} ({investigation.model})
                  </span>
                </div>
                <p className="text-[14px] text-[#1C1917] font-medium mt-1">
                  {investigation.root_cause_summary}
                </p>
              </div>

              {/* Conclusions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[16px] font-semibold text-[#1C1917] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#15803D]" strokeWidth={1.75} />
                    Conclusions ({investigation.conclusions.length})
                  </h2>
                  <span className="text-[12px] text-[#78716C]">
                    Passed existence, verbatim quote, and claim-type checks
                  </span>
                </div>

                <div className="bg-white border border-[#E7E5E4] rounded-md divide-y divide-[#E7E5E4]">
                  {investigation.conclusions.map((finding) => (
                    <div key={finding.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[11px] text-[#78716C]">
                              {finding.id}
                            </span>
                            {finding.service && (
                              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F5F5F4] text-[#57534E]">
                                {finding.service}
                              </span>
                            )}
                            <span className="text-[11px] text-[#78716C] capitalize">
                              {finding.claim_type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-[14px] text-[#1C1917] leading-snug">
                            {finding.claim}
                          </p>
                        </div>

                        <div className="w-28 shrink-0 text-right">
                          <div className="font-mono text-[12px] font-medium text-[#1C1917]">
                            {(finding.confidence * 100).toFixed(0)}%
                          </div>
                          <div className="w-full h-1.5 bg-[#F5F5F4] rounded-sm mt-1 overflow-hidden">
                            <div
                              className="h-full bg-[#15803D]"
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
                            className={`font-mono text-[12px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                              selectedEvidence?.item.id === eid
                                ? "bg-[#FEF2F2] text-[#C81E1E] border-[#C81E1E]"
                                : "bg-[#F5F5F4] text-[#1C1917] border-[#E7E5E4] hover:border-stone-400"
                            }`}
                          >
                            {eid}
                            <ChevronRight className="w-3 h-3 text-[#78716C]" strokeWidth={1.5} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hypotheses (demoted lane) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[16px] font-semibold text-[#57534E] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#B45309]" strokeWidth={1.75} />
                    Hypotheses ({investigation.hypotheses.length})
                  </h2>
                  <span className="text-[12px] text-[#78716C]">
                    Demoted by deterministic verifier — unverified guesses
                  </span>
                </div>

                <div className="bg-[#F5F5F4] border border-dashed border-[#D6D3D1] rounded-md divide-y divide-dashed divide-[#D6D3D1]">
                  {investigation.hypotheses.length === 0 ? (
                    <div className="p-4 text-[13px] text-[#78716C]">
                      No demoted hypotheses in this run.
                    </div>
                  ) : (
                    investigation.hypotheses.map((hyp) => (
                      <div key={hyp.id} className="p-4 text-[#57534E]">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-mono text-[11px] text-[#78716C] mb-1">
                              {hyp.id} · Unverified
                            </div>
                            <p className="text-[13px] text-[#57534E]">{hyp.claim}</p>
                            <div className="mt-2 text-[12px] text-[#B45309] font-medium">
                              Demotion reason: {hyp.demotion_reason}
                            </div>
                          </div>
                          <span className="font-mono text-[12px] text-[#78716C]">
                            {(hyp.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* OpenRouter Decider Audit Strip */}
              {investigation.decision_traces.length > 0 && (
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1C1917] mb-2">
                    OpenRouter Decider Evaluations
                  </h3>
                  <div className="bg-white border border-[#E7E5E4] rounded-md divide-y divide-[#E7E5E4]">
                    {investigation.decision_traces.map((tr, i) => (
                      <div key={i} className="p-3 text-[12px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="font-medium text-[#1C1917]">
                            Stage: <span className="font-mono">{tr.stage}</span>
                          </span>
                          <span className="font-mono text-[11px] text-[#78716C]">
                            {tr.mode} · {tr.latency_ms}ms · {tr.input_tokens} in / {tr.output_tokens} out · cost ${tr.cost}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {tr.questions.map((q) => (
                            <div
                              key={q.question_key}
                              className="bg-[#FAFAF9] border border-[#E7E5E4] rounded px-2.5 py-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[11px] text-[#57534E]">
                                  {q.question_key} ({q.question_type})
                                </span>
                                <span className="font-mono text-[11px] font-medium text-[#1C1917]">
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
          <aside className="w-full lg:w-[360px] shrink-0 bg-white border-l border-[#E7E5E4] shadow-md flex flex-col">
            <div className="px-4 py-3 border-b border-[#E7E5E4] flex items-center justify-between">
              <div>
                <div className="font-mono text-[13px] font-semibold text-[#1C1917]">
                  {selectedEvidence.item.id}
                </div>
                <div className="text-[12px] text-[#78716C]">
                  {selectedEvidence.item.source} · {selectedEvidence.item.service}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvidence(null)}
                className="p-1 rounded text-[#78716C] hover:text-[#1C1917]"
                aria-label="Close evidence drawer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-[#78716C] block text-[11px]">Timestamp</span>
                  <span className="font-mono text-[#1C1917]">
                    {selectedEvidence.item.ts}
                  </span>
                </div>
                <div>
                  <span className="text-[#78716C] block text-[11px]">Kind</span>
                  <span className="font-mono uppercase text-[#1C1917]">
                    {selectedEvidence.item.kind}
                  </span>
                </div>
                {selectedEvidence.item.template_id && (
                  <div className="col-span-2">
                    <span className="text-[#78716C] block text-[11px]">
                      Drain3 Template ({selectedEvidence.item.template_id})
                    </span>
                    <span className="font-mono text-[11px] text-[#57534E] break-all">
                      {selectedEvidence.item.template}
                    </span>
                  </div>
                )}
              </div>

              {selectedEvidence.item.flags.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C] mb-1.5">
                    Deterministic Anomaly Flags
                  </div>
                  <div className="space-y-1.5">
                    {selectedEvidence.item.flags.map((fl, idx) => (
                      <div
                        key={idx}
                        className="border border-[#E7E5E4] rounded px-2.5 py-1.5 bg-[#FAFAF9]"
                      >
                        <div className="text-[12px] font-medium text-[#1C1917]">
                          {fl.label}
                        </div>
                        <div className="text-[11px] text-[#57534E]">{fl.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C] mb-1.5">
                  Raw Evidence Payload
                </div>
                <pre className="p-3 rounded border border-[#E7E5E4] bg-[#FAFAF9] font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all text-[#1C1917]">
                  <HighlightedRaw
                    raw={selectedEvidence.item.raw}
                    quote={selectedEvidence.quote}
                  />
                </pre>
                {selectedEvidence.quote && (
                  <p className="text-[11px] text-[#78716C] mt-1.5">
                    Highlighted fragment was verified verbatim for finding{" "}
                    <span className="font-mono">{selectedEvidence.findingId}</span>.
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
