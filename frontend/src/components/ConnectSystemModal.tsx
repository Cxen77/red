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
  onConfigChanged?: (cfg: ConnectorConfig) => void;
}

export function ConnectSystemModal({
  onIncidentIngested,
  onConfigChanged,
}: ConnectSystemModalProps) {
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
      onConfigChanged?.(saved);
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
          className="px-3 py-2 border border-white/15 bg-[#141414] hover:bg-white/[0.04] text-white font-mono text-[12px] font-medium flex items-center gap-1.5"
        >
          <Link2 className="w-3.5 h-3.5 text-[#F97316]" strokeWidth={1.75} />
          Connect system
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-[680px] max-h-[88vh] overflow-y-auto bg-[#141414] text-white border border-white/15 shadow-2xl p-5 z-50">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <Dialog.Title className="text-[16px] font-semibold text-white">
              Connect Cloud-Native Systems
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

          <div className="mt-4 space-y-5 text-[13px]">
            <div className="space-y-3 pb-4 border-b border-white/10">
              <div className="font-mono text-[12px] uppercase tracking-wider text-[#F97316]">
                Option 1 — Pull automatically from Kubernetes, Prometheus, or Log File
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[11px] text-white/60 mb-1">
                    Prometheus URL (optional)
                  </label>
                  <input
                    type="text"
                    value={cfg.prometheus_url}
                    onChange={(e) => setCfg({ ...cfg, prometheus_url: e.target.value })}
                    placeholder="http://localhost:9090"
                    className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-white/60 mb-1">
                    Kubernetes Namespace (uses kubectl)
                  </label>
                  <input
                    type="text"
                    value={cfg.k8s_namespace}
                    onChange={(e) => setCfg({ ...cfg, k8s_namespace: e.target.value })}
                    placeholder="default"
                    className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-white/60 mb-1">
                    Log File / Mounted Stream Path
                  </label>
                  <input
                    type="text"
                    value={cfg.log_file_path}
                    onChange={(e) => setCfg({ ...cfg, log_file_path: e.target.value })}
                    placeholder="C:\Users\Dev\Desktop\test-shop-app\app.log"
                    className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-white/60 mb-1">
                    Poll Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={cfg.poll_interval_sec}
                    onChange={(e) =>
                      setCfg({ ...cfg, poll_interval_sec: Number(e.target.value) || 30 })
                    }
                    className="w-full bg-[#101010] border border-white/15 px-2.5 py-1.5 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-[12px] text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
                    className="accent-[#F97316]"
                  />
                  Enable automatic background polling
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    className="px-3 py-1.5 border border-white/15 font-mono text-[12px] text-white/80 hover:bg-white/[0.04]"
                  >
                    {saving ? "Saving..." : "Save config"}
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void handleSyncNow()}
                    className="px-3 py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono text-[12px] font-bold uppercase flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                    {syncing ? "Syncing..." : "Sync live sources now"}
                  </button>
                </div>
              </div>

              {statusMsg && (
                <div className="text-[12px] font-mono text-[#F97316] bg-[#101010] border border-white/10 px-2.5 py-1.5">
                  {statusMsg}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="font-mono text-[12px] uppercase tracking-wider text-[#F97316]">
                Option 2 — Push automatically from Alertmanager, OpenTelemetry, or CI/CD
              </div>

              {[
                { key: "am", label: "Prometheus Alertmanager webhook", code: alertmanagerYaml },
                { key: "otel", label: "OpenTelemetry Collector (OTLP HTTP)", code: otelYaml },
                { key: "curl", label: "Direct Webhook / Fluent Bit / Script push", code: curlCmd },
              ].map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px] text-white/60">
                    <span>{item.label}</span>
                    <button
                      type="button"
                      onClick={() => copySnippet(item.key, item.code)}
                      className="text-[11px] font-mono text-white/80 hover:text-[#F97316] flex items-center gap-1"
                    >
                      {copiedKey === item.key ? (
                        <>
                          <Check className="w-3 h-3 text-[#22C55E]" strokeWidth={1.75} />
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
                  <pre className="p-2.5 border border-white/10 bg-[#101010] font-mono text-[11px] overflow-x-auto text-white/85">
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
