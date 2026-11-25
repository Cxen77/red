import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Link2, RefreshCw, X } from "lucide-react";
import {
  fetchConnectorConfig,
  saveConnectorConfig,
  syncConnectorsNow,
  type ConnectorConfig,
} from "../api";
import type { IncidentMetadata } from "../types";

interface ConnectSystemModalProps {
  onIncidentIngested: (meta: IncidentMetadata) => void;
}

export function ConnectSystemModal({ onIncidentIngested }: ConnectSystemModalProps) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<ConnectorConfig>({
    enabled: false,
    prometheus_url: "",
    k8s_namespace: "default",
    log_file_path: "",
    poll_interval_sec: 30,
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchConnectorConfig()
        .then(setCfg)
        .catch(() => {});
    }
  }, [open]);

  const apiHost =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : "http://127.0.0.1:8000";

  const alertmanagerYaml = `receivers:
  - name: incidentlens-auto
    webhook_configs:
      - url: "${apiHost}/api/webhooks/alertmanager"
        send_resolved: false`;

  const otelYaml = `exporters:
  otlphttp/incidentlens:
    traces_endpoint: "${apiHost}/api/ingest/otel"`;

  const curlCmd = `curl -X POST "${apiHost}/api/webhooks/alert" -H "Content-Type: application/json" -d '{"alert_name":"PodErrorBurst","service":"checkout-svc","severity":"critical","logs":"2026-11-25T14:02:00Z checkout-svc ERROR HikariPool timeout"}'`;

  function copySnippet(key: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  async function handleSave() {
    setSaving(true);
    setStatusMsg(null);
    try {
      const saved = await saveConnectorConfig(cfg);
      setCfg(saved);
      setStatusMsg(
        saved.enabled
          ? `Auto-polling enabled every ${saved.poll_interval_sec}s.`
          : "Connector configuration saved."
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await syncConnectorsNow(cfg);
      if (res.ingested && res.meta) {
        setOpen(false);
        onIncidentIngested(res.meta);
      } else {
        setStatusMsg(res.reason || "No live anomalies detected right now.");
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="px-3 py-2 rounded border border-[#E7E5E4] bg-white hover:bg-[#F5F5F4] text-[#1C1917] text-[13px] font-medium flex items-center gap-1.5"
        >
          <Link2 className="w-3.5 h-3.5 text-[#15803D]" strokeWidth={1.75} />
          Connect system
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-stone-900/35 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-[680px] max-h-[88vh] overflow-y-auto bg-white rounded-md border border-[#E7E5E4] shadow-lg p-5 z-50">
          <div className="flex items-center justify-between pb-3 border-b border-[#E7E5E4]">
            <Dialog.Title className="text-[16px] font-semibold text-[#1C1917]">
              Connect Cloud-Native Systems
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

          <div className="mt-4 space-y-5 text-[13px]">
            {/* Option A: Pull from K8s / Prometheus / Log File */}
            <div className="space-y-3 pb-4 border-b border-[#E7E5E4]">
              <div className="font-semibold text-[#1C1917]">
                Option 1 — Pull automatically from Kubernetes, Prometheus, or Log File
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                    Prometheus URL (optional)
                  </label>
                  <input
                    type="text"
                    value={cfg.prometheus_url}
                    onChange={(e) => setCfg({ ...cfg, prometheus_url: e.target.value })}
                    placeholder="http://localhost:9090"
                    className="w-full border border-[#E7E5E4] rounded px-2.5 py-1.5 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                    Kubernetes Namespace (uses kubectl)
                  </label>
                  <input
                    type="text"
                    value={cfg.k8s_namespace}
                    onChange={(e) => setCfg({ ...cfg, k8s_namespace: e.target.value })}
                    placeholder="default"
                    className="w-full border border-[#E7E5E4] rounded px-2.5 py-1.5 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                    Log File / Mounted Stream Path
                  </label>
                  <input
                    type="text"
                    value={cfg.log_file_path}
                    onChange={(e) => setCfg({ ...cfg, log_file_path: e.target.value })}
                    placeholder="C:\logs\checkout-svc.log or /var/log/app.log"
                    className="w-full border border-[#E7E5E4] rounded px-2.5 py-1.5 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#57534E] mb-1">
                    Poll Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={cfg.poll_interval_sec}
                    onChange={(e) =>
                      setCfg({ ...cfg, poll_interval_sec: Number(e.target.value) || 30 })
                    }
                    className="w-full border border-[#E7E5E4] rounded px-2.5 py-1.5 font-mono text-[12px] focus:outline-none focus:border-[#C81E1E]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-[12px] text-[#1C1917] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
                    className="accent-[#C81E1E]"
                  />
                  Enable automatic background polling
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    className="px-3 py-1.5 rounded border border-[#E7E5E4] text-[12px] text-[#1C1917] hover:bg-[#F5F5F4]"
                  >
                    {saving ? "Saving..." : "Save config"}
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void handleSyncNow()}
                    className="px-3 py-1.5 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white text-[12px] font-medium flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {syncing ? "Syncing..." : "Sync live sources now"}
                  </button>
                </div>
              </div>

              {statusMsg && (
                <div className="text-[12px] font-mono text-[#57534E] bg-[#FAFAF9] border border-[#E7E5E4] rounded px-2.5 py-1.5">
                  {statusMsg}
                </div>
              )}
            </div>

            {/* Option B: Push via Alertmanager / OTel / Webhook */}
            <div className="space-y-3">
              <div className="font-semibold text-[#1C1917]">
                Option 2 — Push automatically from Alertmanager, OpenTelemetry, or CI/CD
              </div>

              {[
                { key: "am", label: "Prometheus Alertmanager webhook", code: alertmanagerYaml },
                { key: "otel", label: "OpenTelemetry Collector (OTLP HTTP)", code: otelYaml },
                { key: "curl", label: "Direct Webhook / Fluent Bit / Script push", code: curlCmd },
              ].map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px] text-[#57534E]">
                    <span>{item.label}</span>
                    <button
                      type="button"
                      onClick={() => copySnippet(item.key, item.code)}
                      className="text-[11px] text-[#1C1917] hover:text-[#C81E1E] flex items-center gap-1"
                    >
                      {copiedKey === item.key ? (
                        <>
                          <Check className="w-3 h-3 text-[#15803D]" strokeWidth={1.75} />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" strokeWidth={1.5} />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-2.5 rounded border border-[#E7E5E4] bg-[#FAFAF9] font-mono text-[11px] overflow-x-auto text-[#1C1917]">
                    {item.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
