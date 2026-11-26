import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricPoint } from "../types";

interface MetricsStripProps {
  metricSeries: Record<string, MetricPoint[]>;
  anomalyWindow?: [string, string] | null;
}

const METRIC_LABELS: Record<string, { title: string; unit: string }> = {
  latency_ms: { title: "Latency (p95)", unit: "ms" },
  error_rate_pct: { title: "Error rate", unit: "%" },
  pool_usage_pct: { title: "Pool usage", unit: "%" },
};

export function MetricsStrip({ metricSeries, anomalyWindow }: MetricsStripProps) {
  const keys = ["latency_ms", "error_rate_pct", "pool_usage_pct"].filter(
    (k) => (metricSeries[k]?.length ?? 0) > 0
  );
  const displayKeys =
    keys.length > 0 ? keys : Object.keys(metricSeries).slice(0, 3);

  if (displayKeys.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-white/10 bg-[#101010] px-6 py-3">
      {displayKeys.map((key) => {
        const points = metricSeries[key] || [];
        const meta = METRIC_LABELS[key] || { title: key, unit: "" };
        const hasAnom = points.some((p) => p.is_anomaly);
        const data = points.map((p) => ({
          label: p.ts.slice(11, 16),
          ts: p.ts,
          value: p.value,
        }));

        const anomPoints = points.filter((p) => p.is_anomaly);
        const bandStart =
          anomPoints.length > 0
            ? anomPoints[0].ts.slice(11, 16)
            : anomalyWindow
            ? anomalyWindow[0].slice(11, 16)
            : undefined;
        const bandEnd =
          anomPoints.length > 0
            ? anomPoints[anomPoints.length - 1].ts.slice(11, 16)
            : anomalyWindow
            ? anomalyWindow[1].slice(11, 16)
            : undefined;

        const latest = points[points.length - 1];

        return (
          <div key={key} className="relative border border-white/10 px-3 py-2 bg-[#141414]">
            <div className="pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-white/30" />
            <div className="pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-white/30" />
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-mono text-[11px] uppercase tracking-wider text-white/60">
                {meta.title}
              </span>
              <span
                className={`font-mono text-[12px] font-medium ${
                  hasAnom ? "text-[#F97316]" : "text-white"
                }`}
              >
                {latest ? `${latest.value.toFixed(1)}${meta.unit}` : "—"}
              </span>
            </div>
            <div className="h-[72px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 6, left: -4, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#71717A" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#71717A" }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#141414",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#FAFAFA",
                      fontSize: "11px",
                      fontFamily: "IBM Plex Mono, monospace",
                    }}
                  />
                  {bandStart && bandEnd && (
                    <ReferenceArea
                      x1={bandStart}
                      x2={bandEnd}
                      fill="#F97316"
                      fillOpacity={0.12}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={hasAnom ? "#F97316" : "#71717A"}
                    strokeWidth={1.75}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
