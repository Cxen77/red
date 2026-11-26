import { useState } from "react";
import { Play } from "lucide-react";
import { evaluateDecider } from "../api";

const DEFAULT_STATE = `[LOG-0042] 2026-11-25T14:02:00Z checkout-svc INFO deploy v2.4.1 applied config db_pool_max=5 (prev=50)
[LOG-0188] 2026-11-25T14:03:12Z checkout-svc ERROR HikariPool-1 connection timeout after 3000ms active=5/5
[MET-0035] 2026-11-25T14:04:00Z checkout-svc pool_usage_pct=100.00 (z=5.42)`;

export function DeciderProbeView() {
  const [stateText, setStateText] = useState(DEFAULT_STATE);
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageName, setImageName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    answers: Record<string, Record<string, unknown>>;
    trace: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleImageChange(file: File | undefined) {
    if (!file) {
      setImageBase64(undefined);
      setImageName("");
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const lines = stateText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await evaluateDecider({
        state: lines,
        image_base64: imageBase64,
        questions: {
          matches_incident: {
            type: "noul",
            instructions: "Does the attached state indicate an active service incident?",
            criteria: {
              true: "Errors, timeouts, or resource saturation shown",
              false: "Healthy system state",
            },
          },
          category: {
            type: "choice",
            instructions: "Which failure category fits best?",
            criteria: {
              connection_pool: "Database connection pool misconfiguration or exhaustion",
              cache_stampede: "Cache eviction or thundering herd",
              auth_failure: "Token or JWKS key mismatch",
              healthy: "No failure detected",
            },
          },
          severity: {
            type: "score",
            instructions: "How severe is the observed issue?",
            criteria: ["Low", "Medium", "High"],
          },
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
      <div>
        <div className="font-mono text-[11px] tracking-widest uppercase text-[#F97316] mb-1">
          {"// DECISION SANDBOX"}
        </div>
        <h1 className="text-[22px] font-semibold text-white">
          Decider Probe
        </h1>
        <p className="text-[13px] text-white/55 mt-0.5">
          Evaluate arbitrary telemetry lines and optional images directly via{" "}
          <span className="font-mono text-[#F97316]">
            perplexity/pplx-decider-flash-v1.3:free
          </span>{" "}
          (<span className="font-mono">noul</span>, <span className="font-mono">choice</span>,{" "}
          <span className="font-mono">score</span>).
        </p>
      </div>

      <div className="bg-[#141414] border border-white/10 p-4 space-y-4">
        <div>
          <label className="block font-mono text-[11px] uppercase text-white/60 mb-1">
            State items (one telemetry line per row)
          </label>
          <textarea
            rows={5}
            value={stateText}
            onChange={(e) => setStateText(e.target.value)}
            className="w-full bg-[#101010] border border-white/15 p-2.5 font-mono text-[12px] text-white focus:outline-none focus:border-[#F97316]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-[12px] text-white/60">
            <label className="font-medium mr-2">Optional image attachment:</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e.target.files?.[0])}
              className="text-[12px]"
            />
            {imageName && (
              <span className="font-mono text-[11px] ml-2 text-[#F97316]">
                ({imageName})
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleRun}
            className="px-4 py-2 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono text-[12px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={2} />
            {loading ? "Evaluating..." : "Run Decider"}
          </button>
        </div>

        {error && <div className="text-[12px] text-[#EF4444]">{error}</div>}
      </div>

      {result && (
        <div className="bg-[#141414] border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h2 className="font-mono text-[12px] uppercase tracking-wider text-[#F97316]">
              Structured Decision Output
            </h2>
            <span className="font-mono text-[11px] text-white/50">
              {String(result.trace.model)} · {String(result.trace.latency_ms)}ms · cost $
              {String(result.trace.cost)}
            </span>
          </div>
          <pre className="bg-[#101010] border border-white/10 p-3 font-mono text-[12px] overflow-x-auto text-white/90">
            {JSON.stringify(result.answers, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
