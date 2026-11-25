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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-[#E7E5E4] bg-white px-6 py-3">
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
          <div key={key} className="border border-[#E7E5E4] rounded-md px-3 py-2 bg-white">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[12px] font-medium text-[#57534E]">
                {meta.title}
              </span>
              <span
                className={`font-mono text-[12px] font-medium ${
                  hasAnom ? "text-[#C81E1E]" : "text-[#1C1917]"
                }`}
              >
                {latest ? `${latest.value.toFixed(1)}${meta.unit}` : "—"}
              </span>
            </div>
            <div className="h-[72px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#78716C" }}
                    axisLine={{ stroke: "#E7E5E4" }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#78716C" }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #E7E5E4",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "IBM Plex Mono, monospace",
                    }}
                  />
                  {bandStart && bandEnd && (
                    <ReferenceArea
                      x1={bandStart}
                      x2={bandEnd}
                      fill="#FEF2F2"
                      fillOpacity={1}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={hasAnom ? "#C81E1E" : "#A8A29E"}
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
