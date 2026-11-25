import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Plus, X, Upload, Search } from "lucide-react";
import { createIncident } from "../api";
import type { IncidentMetadata, SeverityLevel } from "../types";

interface IncidentListViewProps {
  incidents: IncidentMetadata[];
  loading: boolean;
  onSelectIncident: (id: string) => void;
  onIncidentCreated: (created: IncidentMetadata) => void;
}

const SEVERITY_DOT: Record<SeverityLevel, string> = {
  critical: "bg-[#B91C1C]",
  high: "bg-[#C81E1E]",
  medium: "bg-[#B45309]",
  low: "bg-[#1D4ED8]",
};

const STATUS_STYLE: Record<string, string> = {
  verified: "text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]",
  investigated: "text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]",
  open: "text-[#78716C] bg-[#F5F5F4] border-[#E7E5E4]",
};

const columnHelper = createColumnHelper<IncidentMetadata>();

const SAMPLE_LOGS = `2026-11-25T15:00:00Z api-gateway INFO req-101 HTTP 200 GET /health latency_ms=11
2026-11-25T15:01:00Z checkout-svc INFO deploy v2.5.0 applied config db_pool_max=4 (prev=40)
2026-11-25T15:01:30Z checkout-svc ERROR req-102 HikariPool-1 connection timeout after 3000ms active=4/4
2026-11-25T15:01:40Z checkout-svc ERROR req-103 HikariPool-1 connection timeout after 3000ms active=4/4
2026-11-25T15:01:50Z checkout-svc ERROR req-104 HikariPool-1 connection timeout after 3000ms active=4/4
2026-11-25T15:02:00Z checkout-svc ERROR req-105 HikariPool-1 connection timeout after 3000ms active=4/4
2026-11-25T15:02:10Z payment-svc ERROR req-105 downstream checkout timeout status=504`;

const SAMPLE_METRICS = `ts,service,metric,value
2026-11-25T15:00:00Z,checkout-svc,latency_ms,45.0
2026-11-25T15:00:30Z,checkout-svc,latency_ms,48.0
2026-11-25T15:01:00Z,checkout-svc,latency_ms,52.0
2026-11-25T15:01:30Z,checkout-svc,latency_ms,3120.0
2026-11-25T15:02:00Z,checkout-svc,latency_ms,3490.0`;

export function IncidentListView({
  incidents,
  loading,
  onSelectIncident,
  onIncidentCreated,
}: IncidentListViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<SeverityLevel>("high");
  const [logsText, setLogsText] = useState("");
  const [metricsText, setMetricsText] = useState("");
  const [tracesText, setTracesText] = useState("");
  const [logsFile, setLogsFile] = useState<File | null>(null);
  const [tracesFile, setTracesFile] = useState<File | null>(null);
  const [metricsFile, setMetricsFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Incident",
        cell: (info) => (
          <div>
            <div className="font-medium text-[#1C1917] text-[13px]">
              {info.getValue()}
            </div>
            <div className="font-mono text-[11px] text-[#78716C] mt-0.5">
              {info.row.original.id} · {info.row.original.log_count} logs ·{" "}
              {info.row.original.anomaly_count} anomalies
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("services", {
        header: "Service(s)",
        cell: (info) => (
          <div className="flex flex-wrap gap-1">
            {info.getValue().map((svc) => (
              <span
                key={svc}
                className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F5F5F4] text-[#57534E] border border-[#E7E5E4]"
              >
                {svc}
              </span>
            ))}
          </div>
        ),
      }),
      columnHelper.accessor("opened_at", {
        header: "Opened",
        cell: (info) => (
          <span className="font-mono text-[12px] text-[#57534E]">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("severity", {
        header: "Severity",
        cell: (info) => {
          const sev = info.getValue();
          return (
            <span className="inline-flex items-center gap-1.5 text-[13px] capitalize text-[#1C1917]">
              <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[sev]}`} />
              {sev}
            </span>
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const st = info.getValue();
          return (
            <span
              className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${
                STATUS_STYLE[st] ?? STATUS_STYLE.open
              }`}
            >
              {st}
            </span>
          );
        },
      }),
      columnHelper.accessor("root_cause", {
        header: "Root cause",
        cell: (info) => (
          <span className="text-[12px] text-[#57534E] line-clamp-2 max-w-[340px]">
            {info.getValue() || "Pending investigation"}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: incidents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError("Incident title is required.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createIncident({
        title: title.trim(),
        severity,
        logsText: logsText.trim() || undefined,
        metricsText: metricsText.trim() || undefined,
        tracesText: tracesText.trim() || undefined,
        logsFile,
        tracesFile,
        metricsFile,
        imageFile,
      });
      setModalOpen(false);
      setTitle("");
      setLogsText("");
      setMetricsText("");
      setTracesText("");
      setLogsFile(null);
      setTracesFile(null);
      setMetricsFile(null);
      setImageFile(null);
      onIncidentCreated(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to ingest incident");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-[#1C1917]">Incidents</h1>
          <p className="text-[13px] text-[#78716C] mt-0.5">
            Select an incident row to inspect its deterministic timeline, verified conclusions, and evidence citations.
          </p>
        </div>

        <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="shrink-0 bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[13px] font-medium px-3.5 py-2 rounded flex items-center gap-1.5 transition-colors duration-150"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New investigation
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-stone-900/35 z-40" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[640px] max-h-[88vh] overflow-y-auto bg-white rounded-md border border-[#E7E5E4] shadow-lg p-5 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-[#E7E5E4]">
                <Dialog.Title className="text-[16px] font-semibold text-[#1C1917]">
                  New investigation
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="text-[#78716C] hover:text-[#1C1917] p-1 rounded"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </Dialog.Close>
              </div>

              <form onSubmit={handleCreate} className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                      Incident title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Checkout DB Pool Regression"
                      className="w-full border border-[#E7E5E4] rounded px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#C81E1E]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                      Severity
                    </label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                      className="w-full border border-[#E7E5E4] rounded px-2.5 py-1.5 text-[13px] bg-white focus:outline-none focus:border-[#C81E1E]"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#78716C]">
                    Paste telemetry below or attach files (.log, .json, .csv, optional dashboard .png).
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!title) setTitle("Custom Pool Timeout Check");
                      setLogsText(SAMPLE_LOGS);
                      setMetricsText(SAMPLE_METRICS);
                    }}
                    className="text-[12px] text-[#C81E1E] hover:underline font-medium"
                  >
                    Load sample payload
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-medium text-[#57534E]">
                      Logs (.log / JSONL)
                    </label>
                    <label className="text-[11px] text-[#57534E] hover:text-[#1C1917] cursor-pointer flex items-center gap-1">
                      <Upload className="w-3 h-3" strokeWidth={1.5} />
                      {logsFile ? logsFile.name : "Upload file"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".log,.txt,.json,.jsonl"
                        onChange={(e) => setLogsFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <textarea
                    rows={4}
                    value={logsText}
                    onChange={(e) => setLogsText(e.target.value)}
                    placeholder="2026-11-25T14:02:00Z checkout-svc ERROR ..."
                    className="w-full border border-[#E7E5E4] rounded p-2 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-[#57534E]">
                        Metrics (.csv)
                      </label>
                      <label className="text-[11px] text-[#57534E] hover:text-[#1C1917] cursor-pointer flex items-center gap-1">
                        <Upload className="w-3 h-3" strokeWidth={1.5} />
                        {metricsFile ? metricsFile.name : "Upload CSV"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".csv"
                          onChange={(e) => setMetricsFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={3}
                      value={metricsText}
                      onChange={(e) => setMetricsText(e.target.value)}
                      placeholder="ts,service,metric,value"
                      className="w-full border border-[#E7E5E4] rounded p-2 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-[#57534E]">
                        Traces (.json)
                      </label>
                      <label className="text-[11px] text-[#57534E] hover:text-[#1C1917] cursor-pointer flex items-center gap-1">
                        <Upload className="w-3 h-3" strokeWidth={1.5} />
                        {tracesFile ? tracesFile.name : "Upload JSON"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".json,.jsonl"
                          onChange={(e) => setTracesFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={3}
                      value={tracesText}
                      onChange={(e) => setTracesText(e.target.value)}
                      placeholder='[{"ts":"...","service":"...","duration_ms":2400}]'
                      className="w-full border border-[#E7E5E4] rounded p-2 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                    Optional dashboard screenshot (.png / .jpg for multimodal Decider check)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="text-[12px] text-[#57534E]"
                  />
                </div>

                {formError && (
                  <p className="text-[12px] text-[#B91C1C]">{formError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E5E4]">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded border border-[#E7E5E4] text-[13px] text-[#57534E] hover:bg-[#F5F5F4]"
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-1.5 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[13px] font-medium disabled:opacity-60"
                  >
                    {submitting ? "Ingesting..." : "Ingest & open"}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      <div className="bg-white border border-[#E7E5E4] rounded-md overflow-x-auto">
        {loading ? (
          <div className="p-8 text-[13px] text-[#78716C]">Loading incidents...</div>
        ) : incidents.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="w-6 h-6 text-stone-300 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-[13px] text-[#78716C]">
              No incidents loaded yet. Click New investigation to ingest telemetry.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-[#E7E5E4] bg-[#FAFAF9]">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="py-2.5 px-4 text-[11px] font-medium uppercase tracking-[0.04em] text-[#78716C]"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onSelectIncident(row.original.id)}
                  className="border-b border-[#E7E5E4] last:border-b-0 hover:bg-[#FAFAF9] cursor-pointer transition-colors duration-100"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="py-3 px-4 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
