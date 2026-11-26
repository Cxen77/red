import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Code2,
  FileText,
  GitBranch,
  Layers,
  MessageSquare,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { Screen } from "./TopBar";

interface LandingViewProps {
  onNavigate: (screen: Screen) => void;
}

const ROTATING_WORDS = ["evidence", "citations", "timelines", "operators"] as const;

const STATS_DATA = [
  { id: 1, value: "100%", label: "Root Cause Accuracy", icon: ShieldCheck },
  { id: 2, value: "98.3%", label: "Noise Reduction", icon: Layers },
  { id: 3, value: "100%", label: "Citation Validity", icon: CheckCircle2 },
  { id: 4, value: "877ms", label: "Median Live Latency", icon: Activity },
];

function Crosshair({
  position,
  accent = false,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  accent?: boolean;
}) {
  const isTop = position.startsWith("top");
  const isLeft = position.endsWith("left");
  const lineCls = accent ? "bg-[#F97316]/60" : "bg-white/20";
  return (
    <div
      className={`pointer-events-none absolute z-10 hidden h-4 w-4 lg:block ${
        isTop ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
      } ${isLeft ? "left-8 -translate-x-1/2 md:left-16" : "right-8 translate-x-1/2 md:right-16"}`}
    >
      <div className={`absolute top-1/2 right-0 left-0 h-px ${lineCls}`} />
      <div className={`absolute top-0 bottom-0 left-1/2 w-px ${lineCls}`} />
    </div>
  );
}

function CornerBrackets({ orange = false }: { orange?: boolean }) {
  const cls = orange ? "border-[#F97316]" : "border-white/40";
  return (
    <>
      <div className={`pointer-events-none absolute top-0 left-0 h-2 w-2 border-t border-l ${cls}`} />
      <div className={`pointer-events-none absolute top-0 right-0 h-2 w-2 border-t border-r ${cls}`} />
      <div className={`pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l ${cls}`} />
      <div className={`pointer-events-none absolute right-0 bottom-0 h-2 w-2 border-r border-b ${cls}`} />
    </>
  );
}

export function LandingView({ onNavigate }: LandingViewProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#101010] text-[#FAFAFA] selection:bg-[#F97316] selection:text-[#101010]">
      {/* Fixed Navbar */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300 ${
          scrolled
            ? "bg-[#101010]/85 backdrop-blur-md border-white/10 py-3"
            : "bg-transparent border-transparent py-5"
        }`}
      >
        <div className="mx-auto max-w-[1360px] px-4 md:px-8 lg:px-12 flex items-center justify-between">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 group"
          >
            <span className="w-8 h-8 bg-[#F97316] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <Activity className="w-4 h-4 text-[#101010]" strokeWidth={2} />
            </span>
            <span className="font-mono font-bold text-sm tracking-widest uppercase text-white">
              IncidentLens
            </span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate("probe")}
              className="hidden sm:inline-flex items-center h-10 border border-white/10 px-4 font-mono text-xs uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Decider Probe
            </button>
            <button
              type="button"
              onClick={() => onNavigate("incidents")}
              className="inline-flex items-center h-10 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] font-mono font-bold tracking-widest uppercase px-6 text-xs transition-colors"
            >
              Open Console
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative flex min-h-screen w-full flex-col justify-center overflow-hidden pt-32 pb-24 font-mono">
        {/* Background Dot Grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Ambient Orange Glow */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[420px] w-[640px] -translate-x-1/2 -translate-y-[58%] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(249,115,22,0.11) 0%, rgba(249,115,22,0.03) 45%, transparent 72%)",
          }}
        />

        {/* Decorative Technical Borders */}
        <div className="absolute top-24 right-0 left-0 hidden h-px bg-white/5 lg:block" />
        <div className="absolute right-0 bottom-24 left-0 hidden h-px bg-white/5 lg:block" />
        <div className="absolute top-0 bottom-0 left-8 hidden w-px bg-white/5 md:left-16 lg:block" />
        <div className="absolute top-0 right-8 bottom-0 hidden w-px bg-white/5 md:right-16 lg:block" />

        <div className="absolute top-24 left-8 hidden h-4 w-4 -translate-x-1/2 -translate-y-1/2 md:left-16 lg:block">
          <div className="bg-[#F97316]/60 absolute top-1/2 right-0 left-0 h-px" />
          <div className="bg-[#F97316]/60 absolute top-0 bottom-0 left-1/2 w-px" />
        </div>
        <div className="absolute top-24 right-8 hidden h-4 w-4 translate-x-1/2 -translate-y-1/2 md:right-16 lg:block">
          <div className="absolute top-1/2 right-0 left-0 h-px bg-white/20" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
        </div>
        <div className="absolute bottom-24 left-8 hidden h-4 w-4 -translate-x-1/2 translate-y-1/2 md:left-16 lg:block">
          <div className="absolute top-1/2 right-0 left-0 h-px bg-white/20" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
        </div>
        <div className="absolute right-8 bottom-24 hidden h-4 w-4 translate-x-1/2 translate-y-1/2 md:right-16 lg:block">
          <div className="absolute top-1/2 right-0 left-0 h-px bg-white/20" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
        </div>

        {/* Concentric Circles Left Edge */}
        <div className="pointer-events-none absolute top-1/2 left-0 flex h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/5 opacity-30">
          <div className="flex h-[560px] w-[560px] items-center justify-center rounded-full border border-dashed border-white/10">
            <div className="flex h-[360px] w-[360px] items-center justify-center rounded-full border border-white/5" />
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-[1200px] px-6 flex flex-col items-center text-center">
          <div className="text-[#F97316] mb-10 inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-bold tracking-widest uppercase">
            Code Red &apos;26 &mdash; Niveus / NTT DATA Track B
          </div>

          <h1 className="font-sans text-4xl md:text-6xl lg:text-[78px] font-semibold tracking-tighter leading-[0.95] text-white mb-2">
            Find the Cause.
          </h1>
          <h1 className="font-sans text-4xl md:text-6xl lg:text-[78px] font-semibold tracking-tighter leading-[0.95] mb-8">
            <span className="text-white">Verified by </span>
            <span className="text-[#F97316] inline-block min-w-[7ch]">
              {ROTATING_WORDS[wordIndex]}
            </span>
          </h1>

          <p className="font-mono text-sm md:text-base lg:text-lg text-white/60 max-w-2xl mb-12 leading-relaxed">
            Ingest logs, traces, metrics, and Kubernetes events into one deterministic timeline.
            Every diagnosis cites verbatim evidence &mdash; unproven guesses are demoted, and humans approve every fix.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => onNavigate("incidents")}
              className="group bg-[#F97316] hover:bg-[#EA580C] text-[#101010] inline-flex items-center justify-center gap-2 px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-colors"
            >
              Launch Console
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("investigation")}
              className="text-white inline-flex items-center justify-center border border-white/15 px-8 py-3.5 text-xs font-bold tracking-widest uppercase hover:bg-white/5 transition-colors"
            >
              Inspect Live Incident
            </button>
          </div>

          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 font-mono text-xs tracking-widest text-white/40 uppercase">
              <span className="h-px w-8 bg-white/10" />
              Built for 3 AM on-call investigations
              <span className="h-px w-8 bg-white/10" />
            </div>
            <div className="flex flex-wrap justify-center items-center gap-4">
              {["10 Fault Scenarios", "Zero Uncited Claims", "Guarded Remediation"].map((pill) => (
                <div
                  key={pill}
                  className="border border-white/5 bg-white/[0.02] px-4 py-2 text-xs font-bold tracking-wider text-white/60 uppercase"
                >
                  {pill}
                </div>
              ))}
            </div>
          </div>

          {/* Showcase Mockup Frame */}
          <div className="relative mt-20 w-full max-w-5xl border border-white/10 bg-black/60 p-3 text-left">
            <CornerBrackets />
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-4 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-white/20" />
                <span className="w-2.5 h-2.5 bg-white/20" />
                <span className="w-2.5 h-2.5 bg-[#F97316]" />
              </div>
              <span className="text-[11px] text-white/50 tracking-widest uppercase">
                incidentlens // bad-deploy-friday // verified
              </span>
              <span className="text-[11px] text-[#F97316]">100% CITED</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-white/10 bg-[#141414] p-4">
                <div className="text-[10px] text-[#F97316] tracking-widest uppercase mb-2">
                  // 01 BLAST RADIUS
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-white">
                    <span>checkout-svc</span>
                    <span className="text-[#F97316]">ORIGIN (204)</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>payment-svc</span>
                    <span>CASCADE (37)</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>api-gateway</span>
                    <span>CASCADE (12)</span>
                  </div>
                </div>
              </div>

              <div className="border border-white/10 bg-[#141414] p-4">
                <div className="text-[10px] text-[#F97316] tracking-widest uppercase mb-2">
                  // 02 VERIFIED CONCLUSION
                </div>
                <p className="text-xs text-white/80 leading-relaxed mb-3">
                  Deploy v2.4.1 reduced db_pool_max=5 (prev=50), triggering HikariPool-1 timeouts.
                </p>
                <span className="inline-block border border-[#F97316]/40 bg-[#F97316]/10 px-2 py-0.5 text-[11px] text-[#F97316]">
                  LOG-1021 &middot; VERBATIM MATCH
                </span>
              </div>

              <div className="border border-dashed border-white/20 bg-[#141414] p-4">
                <div className="text-[10px] text-white/50 tracking-widest uppercase mb-2">
                  // 03 DEMOTED HYPOTHESIS
                </div>
                <p className="text-xs text-white/50 leading-relaxed mb-3">
                  Transient network packet loss coincided with the error window.
                </p>
                <span className="inline-block border border-white/15 px-2 py-0.5 text-[11px] text-white/50">
                  DEMOTED: NO CITATION
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS SECTION */}
      <section className="bg-[#101010] relative w-full overflow-hidden py-24 font-mono border-t border-white/5">
        <div className="absolute top-0 bottom-0 left-8 hidden w-px bg-white/5 md:left-16 lg:block" />
        <div className="absolute top-0 right-8 bottom-0 hidden w-px bg-white/5 md:right-16 lg:block" />
        <Crosshair position="top-left" />
        <Crosshair position="top-right" />
        <Crosshair position="bottom-left" />
        <Crosshair position="bottom-right" />

        <div className="relative z-10 mx-auto max-w-[1200px] px-6">
          <div className="mb-16 flex flex-col items-start md:items-center md:text-center">
            <div className="text-[#F97316] mb-6 inline-flex items-center text-xs font-bold tracking-widest uppercase">
              <span className="mr-3 opacity-70">{"//"}</span>
              TELEMETRY BENCHMARKS
            </div>
            <h2 className="font-sans text-3xl md:text-5xl font-semibold tracking-tighter text-white">
              Everything you need to <span className="text-[#F97316]">resolve faster</span>
            </h2>
            <p className="mt-5 max-w-2xl text-xs md:text-sm tracking-widest text-white/50 uppercase">
              Measured across 10 fault-injection scenarios and 5 failure mechanisms against two named baselines.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STATS_DATA.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.id}
                  className="group relative border border-white/10 bg-neutral-950 p-10 text-center transition-colors hover:bg-white/[0.02]"
                >
                  <CornerBrackets />
                  <div className="mb-5 flex justify-center">
                    <Icon className="h-6 w-6 text-[#F97316] transition-transform group-hover:scale-110" />
                  </div>
                  <div className="mb-2 text-4xl lg:text-5xl font-bold tracking-tight tabular-nums text-white">
                    {stat.value}
                  </div>
                  <div className="text-xs font-bold tracking-widest text-white/40 uppercase">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURE BENTO */}
      <section className="bg-[#101010] relative overflow-hidden py-24 font-mono border-t border-white/5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative z-10 mx-auto max-w-[1200px] px-6">
          <div className="mb-16 flex flex-col items-start md:items-center md:text-center">
            <div className="text-[#F97316] mb-6 inline-flex items-center text-xs font-bold tracking-widest uppercase">
              <span className="mr-3 opacity-70">{"//"}</span>
              PIPELINE ARCHITECTURE
            </div>
            <h2 className="font-sans text-3xl md:text-5xl font-semibold tracking-tighter text-white">
              Why <span className="text-[#F97316]">IncidentLens</span>?
            </h2>
          </div>

          <div className="grid auto-rows-[300px] grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Card 1 */}
            <div className="group relative lg:col-span-2 border border-white/10 bg-black/40 p-8 flex flex-col justify-center overflow-hidden">
              <CornerBrackets />
              <Code2 className="h-8 w-8 text-[#F97316] mb-5" />
              <h3 className="text-lg font-bold tracking-widest uppercase text-white mb-3">
                Deterministic First (M1-M2)
              </h3>
              <p className="text-xs leading-relaxed tracking-widest text-white/50 uppercase max-w-sm">
                Drain3 log clustering, z-score &gt;3&sigma; metric spikes, p99 trace outliers, and credential redaction run before any model call.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group relative lg:col-span-3 border border-white/10 bg-black/40 p-8 flex flex-col justify-center overflow-hidden">
              <CornerBrackets />
              <GitBranch className="h-8 w-8 text-[#F97316] mb-5" />
              <h3 className="text-lg font-bold tracking-widest uppercase text-white mb-3">
                Calibrated Decision Engine (M3)
              </h3>
              <p className="text-xs leading-relaxed tracking-widest text-white/50 uppercase max-w-md">
                Evaluates filtered telemetry and dashboard images with typed probabilities (noul, choice, score) and offline replay support.
              </p>
              <div className="pointer-events-none absolute right-6 bottom-6 hidden md:flex items-center gap-1.5">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-6 ${i < 9 ? "bg-[#F97316]" : "bg-white/10"}`}
                  />
                ))}
              </div>
            </div>

            {/* Card 3 */}
            <div className="group relative lg:col-span-3 border border-white/10 bg-black/40 p-8 flex flex-col justify-center overflow-hidden">
              <CornerBrackets />
              <ShieldCheck className="h-8 w-8 text-[#F97316] mb-5" />
              <h3 className="text-lg font-bold tracking-widest uppercase text-white mb-3">
                Hard Citation Verifier (M4)
              </h3>
              <p className="text-xs leading-relaxed tracking-widest text-white/50 uppercase max-w-lg">
                Every conclusion must pass ID existence, verbatim quote match, and claim-type checks. Unproven claims are demoted to Hypotheses.
              </p>
            </div>

            {/* Card 4 */}
            <div className="group relative lg:col-span-2 border border-[#F97316]/30 bg-[#F97316]/[0.05] p-8 flex flex-col justify-center overflow-hidden">
              <CornerBrackets orange />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at center, rgba(249,115,22,0.14) 1px, transparent 1px)",
                  backgroundSize: "14px 14px",
                }}
              />
              <div className="relative z-10">
                <Terminal className="h-8 w-8 text-[#F97316] mb-5" />
                <h3 className="text-lg font-bold tracking-widest uppercase text-[#F97316] mb-3">
                  Human Control Gate
                </h3>
                <p className="text-xs leading-relaxed tracking-widest text-white/70 uppercase">
                  Confirm, correct, or reject diagnoses. Dry-run, approve, or block fixes and verify live recovery.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE MODULES STRIP */}
      <section className="bg-[#101010] py-24 font-mono border-t border-white/5">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="mb-12 flex flex-col items-start">
            <div className="text-[#F97316] mb-4 inline-flex items-center text-xs font-bold tracking-widest uppercase">
              <span className="mr-3 opacity-70">{"//"}</span>
              OPERATOR WORKFLOW
            </div>
            <h2 className="font-sans text-3xl md:text-4xl font-semibold tracking-tighter text-white">
              Jump directly into any workspace
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              type="button"
              onClick={() => onNavigate("incidents")}
              className="group relative text-left border border-white/10 bg-black/40 p-6 hover:border-[#F97316]/60 transition-colors"
            >
              <CornerBrackets />
              <div className="text-[11px] text-[#F97316] mb-3">[ 01 / CONNECT &amp; INGEST ]</div>
              <div className="font-sans text-lg font-semibold text-white mb-2">
                Live Cluster &amp; Log Sync
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Connect Alertmanager, OTel OTLP HTTP, Kubernetes events, or local app logs with zero manual uploads.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("investigation")}
              className="group relative text-left border border-white/10 bg-black/40 p-6 hover:border-[#F97316]/60 transition-colors"
            >
              <CornerBrackets />
              <div className="text-[11px] text-[#F97316] mb-3">[ 02 / INVESTIGATE &amp; CHAT ]</div>
              <div className="font-sans text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#F97316]" />
                Timeline &amp; Incident Chat
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Ask what went wrong and where, click verbatim citation chips, and approve guarded remediation steps.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("report")}
              className="group relative text-left border border-white/10 bg-black/40 p-6 hover:border-[#F97316]/60 transition-colors"
            >
              <CornerBrackets />
              <div className="text-[11px] text-[#F97316] mb-3">[ 03 / AUDIT &amp; EXPORT ]</div>
              <div className="font-sans text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#F97316]" />
                Evidence Report &amp; Evals
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Export machine-readable JSON/PDF reports and compare 10-fault accuracy against two named baselines.
              </p>
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative bg-[#0A0A0A] border-t border-white/5 font-mono py-16">
        <Crosshair position="top-left" />
        <Crosshair position="top-right" />
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-12 border-b border-white/5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 bg-[#F97316] flex items-center justify-center">
                  <Activity className="w-4 h-4 text-[#101010]" strokeWidth={2} />
                </span>
                <span className="font-bold text-sm tracking-widest uppercase text-white">
                  IncidentLens
                </span>
              </div>
              <p className="text-xs text-white/50 max-w-md">
                AI Incident Investigation for Cloud-Native Systems. Find the cause. Show the evidence.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("incidents")}
              className="bg-[#F97316] hover:bg-[#EA580C] text-[#101010] px-7 py-3 text-xs font-bold tracking-widest uppercase transition-colors"
            >
              Open Incident Console
            </button>
          </div>

          {/* Segmented status strip */}
          <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-[11px] text-white/60 uppercase tracking-widest">
              <span
                className="w-2 h-2 rounded-full bg-[#F97316]"
                style={{ boxShadow: "0 0 8px rgba(249,115,22,0.75)" }}
              />
              <span>All M1-M6 modules operational</span>
            </div>

            <div className="flex items-center gap-1">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-3.5 ${i < 12 ? "bg-[#F97316]" : "bg-white/10"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
