import { useEffect, useState } from "react";
import { Download, Play, Printer } from "lucide-react";
import { fetchEvals, fetchReportJson } from "../api";
import type { IncidentMetadata, InvestigationResult } from "../types";

interface ReportViewProps {
  investigation: InvestigationResult | null;
  activeMeta: IncidentMetadata | null;
  incidents: IncidentMetadata[];
  onSelectIncident: (id: string) => void;
  onRunInvestigation: (mode: "live" | "replay") => void;
}

export function ReportView({
  investigation,
  activeMeta,
  incidents,
  onSelectIncident,
  onRunInvestigation,
}: ReportViewProps) {
  const [evals, setEvals] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchEvals()
      .then(setEvals)
      .catch(() => setEvals(null));
  }, []);

  if (!investigation) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10 bg-white min-h-[calc(100vh-48px)] border-x border-[#E7E5E4] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E7E5E4]">
          <div>
            <h1 className="text-[18px] font-semibold text-[#1C1917]">
              Report — {activeMeta?.title || "Select an incident"}
            </h1>
            {activeMeta && (
              <div className="font-mono text-[12px] text-[#78716C]">
                Incident ID: {activeMeta.id} · Status: {activeMeta.status}
              </div>
            )}
          </div>
          {incidents.length > 0 && (
            <select
              value={activeMeta?.id || incidents[0]?.id}
              onChange={(e) => onSelectIncident(e.target.value)}
              className="border border-[#E7E5E4] rounded px-2.5 py-1.5 text-[13px] bg-white"
            >
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.title} ({inc.id})
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-[13px] text-[#78716C]">
          No investigation has been executed yet for{" "}
          <span className="font-mono text-[#1C1917]">{activeMeta?.id}</span>. Run an
          investigation to generate its cited evidence report.
        </p>
        <button
          type="button"
          onClick={() => onRunInvestigation("live")}
          className="px-3.5 py-2 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[13px] font-medium inline-flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
          Investigate now
        </button>
      </main>
    );
  }

  async function handleExportJson() {
    if (!investigation) return;
    const report = await fetchReportJson(investigation.incident_id);
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${investigation.incident_id}-evidence-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const baseline = evals?.baseline_comparison as Record<string, unknown> | undefined;

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 bg-white min-h-[calc(100vh-48px)] border-x border-[#E7E5E4]">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E7E5E4]">
        <div>
          <div className="text-[12px] font-medium text-[#C81E1E] mb-1">
            Incident Evidence Report · {investigation.incident_id}
          </div>
          <h1 className="text-[20px] font-semibold text-[#1C1917]">
            {investigation.title}
          </h1>
          <div className="font-mono text-[12px] text-[#78716C] mt-1">
            Opened: {investigation.opened_at} · Severity: {investigation.severity} · Review:{" "}
            {investigation.human_review.decision} · Noise reduction:{" "}
            {investigation.noise_reduction_pct.toFixed(1)}%
          </div>
          {activeMeta && activeMeta.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {activeMeta.services.map((svc) => (
                <span
                  key={svc}
                  className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F5F5F4] text-[#57534E] border border-[#E7E5E4]"
                >
                  {svc}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          {incidents.length > 0 && (
            <select
              aria-label="Switch incident report"
              value={investigation.incident_id}
              onChange={(e) => onSelectIncident(e.target.value)}
              className="border border-[#E7E5E4] rounded px-2.5 py-1.5 text-[12px] bg-white max-w-[240px]"
            >
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.title} ({inc.id})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-1.5 rounded border border-[#E7E5E4] text-[13px] text-[#1C1917] hover:bg-[#F5F5F4] flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-1.5 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[13px] font-medium flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={1.5} />
            Print / PDF
          </button>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-[14px] font-semibold text-[#1C1917] mb-1.5">
          Executive Summary
        </h2>
        <p className="text-[14px] text-[#1C1917] leading-relaxed">
          {investigation.root_cause_summary}
        </p>
        <div className="mt-2 text-[12px] text-[#57534E] font-mono">
          Telemetry filtered: {investigation.raw_items_total} raw items →{" "}
          {investigation.filtered_items_sent} signals · Secrets redacted:{" "}
          {investigation.redacted_secrets_count}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[14px] font-semibold text-[#1C1917] mb-2">
          Root-Cause Chain
        </h2>
        <ol className="list-decimal list-inside space-y-1.5 text-[13px] text-[#1C1917]">
          {investigation.root_cause_chain.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="text-[14px] font-semibold text-[#1C1917] mb-2">
          Verified Conclusions ({investigation.conclusions.length})
        </h2>
        <table className="w-full border-collapse text-left border border-[#E7E5E4]">
          <thead>
            <tr className="bg-[#FAFAF9] border-b border-[#E7E5E4]">
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                ID
              </th>
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                Claim
              </th>
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                Confidence
              </th>
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                Citations
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E5E4]">
            {investigation.conclusions.map((f) => (
              <tr key={f.id}>
                <td className="py-2.5 px-3 font-mono text-[12px] text-[#78716C]">
                  {f.id}
                </td>
                <td className="py-2.5 px-3 text-[13px] text-[#1C1917]">{f.claim}</td>
                <td className="py-2.5 px-3 font-mono text-[12px]">
                  {(f.confidence * 100).toFixed(0)}%
                </td>
                <td className="py-2.5 px-3 font-mono text-[12px]">
                  {f.evidence_ids.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-[14px] font-semibold text-[#57534E] mb-2">
          Demoted Hypotheses ({investigation.hypotheses.length})
        </h2>
        <table className="w-full border-collapse text-left border border-dashed border-[#D6D3D1] bg-[#F5F5F4]">
          <thead>
            <tr className="border-b border-dashed border-[#D6D3D1]">
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                ID
              </th>
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                Hypothesis
              </th>
              <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                Demotion Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-[#D6D3D1]">
            {investigation.hypotheses.map((h) => (
              <tr key={h.id}>
                <td className="py-2.5 px-3 font-mono text-[12px] text-[#78716C]">
                  {h.id}
                </td>
                <td className="py-2.5 px-3 text-[13px] text-[#57534E]">{h.claim}</td>
                <td className="py-2.5 px-3 text-[12px] text-[#B45309]">
                  {h.demotion_reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {investigation.proposed_actions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[14px] font-semibold text-[#1C1917] mb-2">
            Guarded Remediation Actions ({investigation.proposed_actions.length})
          </h2>
          <table className="w-full border-collapse text-left border border-[#E7E5E4]">
            <thead>
              <tr className="bg-[#FAFAF9] border-b border-[#E7E5E4]">
                <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                  ID
                </th>
                <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                  Action
                </th>
                <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E4]">
              {investigation.proposed_actions.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-3 font-mono text-[12px] text-[#78716C]">
                    {a.id}
                  </td>
                  <td className="py-2 px-3 text-[13px] text-[#1C1917]">{a.title}</td>
                  <td className="py-2 px-3 font-mono text-[12px]">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {evals && baseline && (
        <section className="mt-6">
          <h2 className="text-[14px] font-semibold text-[#1C1917] mb-2">
            Global Benchmark Suite vs Named Baselines ({String(evals.scenarios_total)} faults)
          </h2>
          <div className="border border-[#E7E5E4] rounded p-3 text-[12px] space-y-1.5 bg-[#FAFAF9] mb-3">
            <div>
              <strong>IncidentLens:</strong>{" "}
              <span className="font-mono text-[#15803D]">
                {(Number(evals.root_cause_accuracy) * 100).toFixed(1)}%
              </span>{" "}
              ({String(evals.scenarios_passed)}/{String(evals.scenarios_total)} passed,{" "}
              {String(evals.scenarios_missed)} missed) · Citation validity:{" "}
              <span className="font-mono">
                {(Number(evals.avg_citation_validity_rate) * 100).toFixed(1)}%
              </span>{" "}
              · Avg noise reduction:{" "}
              <span className="font-mono">{String(evals.avg_noise_reduction_pct)}%</span> ·
              Median latency: <span className="font-mono">{String(evals.median_latency_ms)}ms</span>
            </div>
            <div>
              <strong>Baseline 1 ({String(baseline.baseline_name)}):</strong>{" "}
              <span className="font-mono">
                {(Number(baseline.baseline_root_cause_accuracy) * 100).toFixed(1)}%
              </span>{" "}
              accuracy · Citation validity: <span className="font-mono">0.0%</span> —{" "}
              <span className="text-[#57534E]">{String(baseline.baseline_limitation)}</span>
            </div>
            {Boolean(baseline.raw_window_baseline_name) && (
              <div>
                <strong>Baseline 2 ({String(baseline.raw_window_baseline_name)}):</strong>{" "}
                <span className="font-mono">
                  {(Number(baseline.raw_window_root_cause_accuracy) * 100).toFixed(1)}%
                </span>{" "}
                accuracy · Citation validity: <span className="font-mono">0.0%</span> —{" "}
                <span className="text-[#57534E]">{String(baseline.raw_window_limitation)}</span>
              </div>
            )}
          </div>

          {Array.isArray(evals.results) && (
            <table className="w-full border-collapse text-left border border-[#E7E5E4] text-[12px]">
              <thead>
                <tr className="bg-[#FAFAF9] border-b border-[#E7E5E4]">
                  <th className="py-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                    Scenario
                  </th>
                  <th className="py-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                    Fault Type
                  </th>
                  <th className="py-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                    IncidentLens
                  </th>
                  <th className="py-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                    B1 Keyword
                  </th>
                  <th className="py-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                    B2 Window
                  </th>
                  <th className="py-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]">
                    Reduction
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {(evals.results as Array<Record<string, unknown>>).map((row) => (
                  <tr key={String(row.scenario_id)}>
                    <td className="py-1.5 px-2.5 font-mono">{String(row.scenario_id)}</td>
                    <td className="py-1.5 px-2.5 text-[#57534E]">{String(row.fault_type)}</td>
                    <td className="py-1.5 px-2.5 font-mono text-[#15803D]">
                      {row.passed ? "PASS" : "MISS"}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono">
                      {row.baseline_service_hit ? "PASS" : "MISS"}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono">
                      {row.raw_window_baseline_hit ? "PASS" : "MISS"}
                    </td>
                    <td className="py-1.5 px-2.5 font-mono">
                      {String(row.noise_reduction_pct)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="mt-6 pt-4 border-t border-[#E7E5E4] text-[12px] text-[#78716C] flex flex-wrap justify-between gap-4">
        <span>
          Verification citation validity rate:{" "}
          <strong className="font-mono text-[#15803D]">
            {(investigation.verification.citation_validity_rate * 100).toFixed(1)}%
          </strong>
        </span>
        <span>Generated at {investigation.investigated_at}</span>
      </section>
    </main>
  );
}
