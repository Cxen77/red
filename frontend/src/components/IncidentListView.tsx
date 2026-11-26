import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { PauseCircle, Plus, RefreshCw, Radio, Search, Upload, X } from "lucide-react";
import {
  createIncident,
  fetchConnectorConfig,
  saveConnectorConfig,
  scanDropzone,
  simulateLiveAlert,
  type ConnectorConfig,
} from "../api";
import { ConnectSystemModal } from "./ConnectSystemModal";
import type { IncidentMetadata, SeverityLevel, SourceType } from "../types";

interface IncidentListViewProps {
  incidents: IncidentMetadata[];
  loading: boolean;
  onSelectIncident: (id: string) => void;
  onIncidentCreated: (created: IncidentMetadata) => void;
  onRefreshList: () => void;
}

const SEVERITY_DOT: Record<SeverityLevel, string> = {
  critical: "bg-[#EF4444]",
  high: "bg-[#F97316]",
  medium: "bg-[#F59E0B]",
  low: "bg-[#3B82F6]",
};

const STATUS_STYLE: Record<string, string> = {
  resolved: "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30",
  verified: "text-[#F97316] bg-[#F97316]/10 border-[#F97316]/30",
  investigated: "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30",
  open: "text-white/60 bg-white/[0.04] border-white/10",
};

const SOURCE_STYLE: Record<SourceType, string> = {
  connected: "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30",
  manual: "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30",
  benchmark: "text-white/60 bg-white/[0.04] border-white/10",
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
  onRefreshList,
}: IncidentListViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [scanningDropzone, setScanningDropzone] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [connectorCfg, setConnectorCfg] = useState<ConnectorConfig | null>(null);

  useEffect(() => {
    fetchConnectorConfig()
      .then(setConnectorCfg)
      .catch(() => {});
  }, []);

  async function handleToggleTracking() {
    if (!connectorCfg) return;
    const nextEnabled = !connectorCfg.enabled;
    const updated = await saveConnectorConfig({ ...connectorCfg, enabled: nextEnabled });
    setConnectorCfg(updated);
    setAutoMsg(nextEnabled ? `Live tracking started (${updated.poll_interval_sec}s).` : "Live tracking stopped.");
  }

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
            <div className="font-medium text-white text-[13px]">
              {info.getValue()}
            </div>
            <div className="font-mono text-[11px] text-white/45 mt-0.5">
              {info.row.original.id} · {info.row.original.log_count} logs ·{" "}
              {info.row.original.anomaly_count} anomalies
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("source_label", {
        header: "Source",
        cell: (info) => {
          const stype = info.row.original.source_type || "benchmark";
          return (
            <span
              className={`inline-block font-mono text-[11px] font-medium px-2 py-0.5 border whitespace-nowrap ${SOURCE_STYLE[stype]}`}
            >
              {info.getValue() || "Built-in Fault"}
            </span>
          );
        },
      }),
      columnHelper.accessor("services", {
        header: "Service(s)",
        cell: (info) => (
          <div className="flex flex-wrap gap-1">
            {info.getValue().map((svc) => (
              <span
                key={svc}
                className="font-mono text-[11px] px-1.5 py-0.5 bg-white/[0.04] text-white/75 border border-white/10"
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
          <span className="font-mono text-[12px] text-white/60">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("severity", {
        header: "Severity",
        cell: (info) => {
          const sev = info.getValue();
          return (
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px] capitalize text-white">
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
              className={`inline-block font-mono text-[11px] font-medium px-2 py-0.5 border capitalize ${
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
          <span className="text-[12px] text-white/60 line-clamp-2 max-w-[320px]">
            {info.getValue() || "Pending investigation"}
          </span>
        ),
      }),
    ],
    []
  );

  const filteredIncidents = useMemo(() => {
    if (sourceFilter === "all") return incidents;
    return incidents.filter((inc) => (inc.source_type || "benchmark") === sourceFilter);
  }, [incidents, sourceFilter]);

  const counts = useMemo(
    () => ({
      all: incidents.length,
      connected: incidents.filter((i) => i.source_type === "connected").length,
      manual: incidents.filter((i) => i.source_type === "manual").length,
      benchmark: incidents.filter((i) => (i.source_type || "benchmark") === "benchmark").length,
    }),
    [incidents]
  );

  const table = useReactTable({
    data: filteredIncidents,
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

  async function handleSimulateLive() {
    setSimulating(true);
    setAutoMsg(null);
    try {
      const res = await simulateLiveAlert();
      onIncidentCreated(res.meta);
    } catch (err) {
      setAutoMsg(err instanceof Error ? err.message : "Failed to trigger live alert");
    } finally {
      setSimulating(false);
    }
  }

  async function handleScanDropzone() {
    setScanningDropzone(true);
    setAutoMsg(null);
    try {
      const res = await scanDropzone();
      onRefreshList();
      setAutoMsg(
        res.count > 0
          ? `Imported ${res.count} incident(s) from data/dropzone/.`
          : "No new folders found in data/dropzone/."
      );
    } finally {
      setScanningDropzone(false);
    }
  }

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-widest uppercase text-[#F97316] mb-1">
            {"// INCIDENT CONSOLE"}
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-white">Incidents</h1>
          <p className="text-[13px] text-white/55 mt-0.5">
            Select an incident row to inspect its timeline, findings, and report, or ingest automatically via webhook / dropzone.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {connectorCfg && (
            <button
              type="button"
              onClick={() => void handleToggleTracking()}
              className={`px-3 py-2 border font-mono text-[12px] font-medium flex items-center gap-1.5 transition-colors ${
                connectorCfg.enabled
                  ? "border-[#F97316]/50 bg-[#F97316]/15 hover:bg-[#F97316]/25 text-[#F97316]"
                  : "border-white/15 bg-[#141414] hover:bg-white/[0.04] text-white/70"
              }`}
              title={
                connectorCfg.enabled
                  ? "Click to stop automatic background tracking"
                  : "Tracking is currently paused (click to start)"
              }
            >
              <PauseCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
              {connectorCfg.enabled
                ? `Stop tracking (${connectorCfg.poll_interval_sec}s)`
                : "Tracking: Off (Start)"}
            </button>
          )}
          <ConnectSystemModal
            onIncidentIngested={onIncidentCreated}
            onConfigChanged={setConnectorCfg}
          />

          <button
            type="button"
            disabled={scanningDropzone}
            onClick={() => void handleScanDropzone()}
            className="px-3 py-2 border border-white/15 bg-[#141414] hover:bg-white/[0.04] text-white/80 font-mono text-[12px] flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-white/50" strokeWidth={1.5} />
            {scanningDropzone ? "Scanning..." : "Scan dropzone"}
          </button>

          <button
            type="button"
            disabled={simulating}
            onClick={() => void handleSimulateLive()}
            className="px-3 py-2 border border-white/15 bg-[#141414] hover:bg-white/[0.04] text-white font-mono text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <Radio className="w-3.5 h-3.5 text-[#F97316]" strokeWidth={1.75} />
            {simulating ? "Receiving alert..." : "Simulate live webhook"}
          </button>

          <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="shrink-0 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono text-[12px] font-bold tracking-wider uppercase px-3.5 py-2 flex items-center gap-1.5 transition-colors duration-150"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                New investigation
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[640px] max-h-[88vh] overflow-y-auto bg-[#141414] text-white border border-white/15 shadow-2xl p-5 z-50">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <Dialog.Title className="text-[16px] font-semibold text-white">
                    New investigation
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="text-white/50 hover:text-white p-1"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </Dialog.Close>
                </div>

                <form onSubmit={handleCreate} className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block font-mono text-[11px] uppercase text-white/60 mb-1">
                        Incident title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Checkout DB Pool Regression"
                        className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[11px] uppercase text-white/60 mb-1">
                        Severity
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                        className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#F97316]"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-white/50">
                      Paste telemetry below or attach files (.log, .json, .csv, optional dashboard .png).
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!title) setTitle("Custom Pool Timeout Check");
                        setLogsText(SAMPLE_LOGS);
                        setMetricsText(SAMPLE_METRICS);
                      }}
                      className="text-[12px] font-mono text-[#F97316] hover:underline font-medium"
                    >
                      Load sample payload
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-mono text-[11px] uppercase text-white/60">
                        Logs (.log / JSONL)
                      </label>
                      <label className="text-[11px] text-white/60 hover:text-white cursor-pointer flex items-center gap-1">
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
                      className="w-full bg-[#101010] border border-white/15 p-2 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-mono text-[11px] uppercase text-white/60">
                          Metrics (.csv)
                        </label>
                        <label className="text-[11px] text-white/60 hover:text-white cursor-pointer flex items-center gap-1">
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
                        className="w-full bg-[#101010] border border-white/15 p-2 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-mono text-[11px] uppercase text-white/60">
                          Traces (.json)
                        </label>
                        <label className="text-[11px] text-white/60 hover:text-white cursor-pointer flex items-center gap-1">
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
                        className="w-full bg-[#101010] border border-white/15 p-2 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[11px] uppercase text-white/60 mb-1">
                      Optional dashboard screenshot (.png / .jpg)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                      className="text-[12px] text-white/60"
                    />
                  </div>

                  {formError && (
                    <p className="text-[12px] text-[#EF4444]">{formError}</p>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="px-3 py-1.5 border border-white/15 text-[12px] font-mono text-white/70 hover:bg-white/[0.04]"
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono text-[12px] font-bold uppercase disabled:opacity-60"
                    >
                      {submitting ? "Ingesting..." : "Ingest & open"}
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

      <div className="mb-3 px-3.5 py-2 bg-[#141414] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/60">
        <div>
          <strong className="font-medium text-white">Automated cloud-native ingestion:</strong>{" "}
          Connect Prometheus Alertmanager (<code className="font-mono bg-white/[0.06] text-[#F97316] px-1.5 py-0.5">POST /api/webhooks/alertmanager</code>),{" "}
          OTel Collector (<code className="font-mono bg-white/[0.06] text-[#F97316] px-1.5 py-0.5">POST /api/ingest/otel</code>),{" "}
          custom alerts (<code className="font-mono bg-white/[0.06] text-[#F97316] px-1.5 py-0.5">POST /api/webhooks/alert</code>),{" "}
          or drop files into <code className="font-mono bg-white/[0.06] text-[#F97316] px-1.5 py-0.5">data/dropzone/</code> (auto-watched every 5s).
        </div>
        {autoMsg && <span className="font-mono text-[11px] text-[#22C55E]">{autoMsg}</span>}
      </div>

      {/* Source filter tabs */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all" as const, label: `All (${counts.all})` },
            { id: "connected" as const, label: `Live Connected (${counts.connected})` },
            { id: "manual" as const, label: `Manual Uploads (${counts.manual})` },
            { id: "benchmark" as const, label: `Built-in Faults (${counts.benchmark})` },
          ].map((tab) => {
            const active = sourceFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`px-3 py-1.5 font-mono text-[12px] font-medium border transition-colors ${
                  active
                    ? "bg-[#F97316] text-[#101010] border-[#F97316] font-bold"
                    : "bg-[#141414] text-white/65 border-white/10 hover:border-white/30 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-white/50">
          {sourceFilter === "connected"
            ? "Auto-ingested from connected apps, webhooks, OTel, or dropzone"
            : sourceFilter === "manual"
            ? "Uploaded or pasted manually via New investigation"
            : sourceFilter === "benchmark"
            ? "10 documented faults used for baseline accuracy evaluation"
            : "Showing live connected, manual uploads, and benchmark faults"}
        </span>
      </div>

      <div className="relative bg-[#141414] border border-white/10 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-[13px] text-white/50">Loading incidents...</div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="w-6 h-6 text-white/25 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-[13px] text-white/50">
              No incidents in this category yet.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-white/10 bg-[#0A0A0A]">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="py-2.5 px-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-white/50"
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
                  className="border-b border-white/10 last:border-b-0 hover:bg-white/[0.03] cursor-pointer transition-colors duration-100"
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
