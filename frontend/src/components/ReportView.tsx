import { Download, Printer } from "lucide-react";
import { fetchReportJson } from "../api";
import type { InvestigationResult } from "../types";

interface ReportViewProps {
  investigation: InvestigationResult | null;
}

export function ReportView({ investigation }: ReportViewProps) {
  if (!investigation) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10 text-[13px] text-[#78716C]">
        Run an investigation first to view and export its evidence report.
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

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 bg-white min-h-[calc(100vh-48px)] border-x border-[#E7E5E4]">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E7E5E4]">
        <div>
          <h1 className="text-[20px] font-semibold text-[#1C1917]">
            Evidence Report — {investigation.title}
          </h1>
          <div className="font-mono text-[12px] text-[#78716C] mt-1">
            ID: {investigation.incident_id} · Severity: {investigation.severity} · Model:{" "}
            {investigation.model} ({investigation.mode})
          </div>
        </div>

        <div className="no-print flex items-center gap-2">
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
