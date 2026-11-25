import { useEffect, useState } from "react";
import {
  fetchIncidentDetail,
  fetchIncidents,
  fetchTimeline,
  runInvestigation,
} from "./api";
import { DeciderProbeView } from "./components/DeciderProbeView";
import { IncidentListView } from "./components/IncidentListView";
import { InvestigationView } from "./components/InvestigationView";
import { ReportView } from "./components/ReportView";
import { TopBar, type Screen } from "./components/TopBar";
import type {
  IncidentMetadata,
  InvestigationResult,
  TimelineSummary,
} from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("incidents");
  const [incidents, setIncidents] = useState<IncidentMetadata[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [activeMeta, setActiveMeta] = useState<IncidentMetadata | null>(null);
  const [timeline, setTimeline] = useState<TimelineSummary | null>(null);
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [investigating, setInvestigating] = useState(false);

  async function loadIncidents() {
    setLoadingList(true);
    try {
      const list = await fetchIncidents();
      setIncidents(list);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void loadIncidents();
  }, []);

  async function openIncident(id: string) {
    setScreen("investigation");
    const [detail, tl] = await Promise.all([
      fetchIncidentDetail(id),
      fetchTimeline(id),
    ]);
    setActiveMeta(detail.meta);
    setInvestigation(detail.investigation);
    setTimeline(tl);
  }

  async function handleRunInvestigation(mode: "live" | "replay") {
    if (!activeMeta) return;
    setInvestigating(true);
    try {
      const result = await runInvestigation(activeMeta.id, mode);
      setInvestigation(result);
      setActiveMeta((prev) =>
        prev
          ? {
              ...prev,
              status: result.status,
              root_cause: result.root_cause_summary,
            }
          : prev
      );
      void loadIncidents();
    } finally {
      setInvestigating(false);
    }
  }

  async function handleIncidentCreated(created: IncidentMetadata) {
    await loadIncidents();
    await openIncident(created.id);
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#1C1917]">
      <TopBar
        activeScreen={screen}
        onNavigate={setScreen}
        hasActiveIncident={activeMeta !== null}
        activeTitle={activeMeta?.title}
      />

      {screen === "incidents" && (
        <IncidentListView
          incidents={incidents}
          loading={loadingList}
          onSelectIncident={(id) => void openIncident(id)}
          onIncidentCreated={(c) => void handleIncidentCreated(c)}
        />
      )}

      {screen === "investigation" && activeMeta && (
        <InvestigationView
          meta={activeMeta}
          timeline={timeline}
          investigation={investigation}
          investigating={investigating}
          onRunInvestigation={(mode) => void handleRunInvestigation(mode)}
          onOpenReport={() => setScreen("report")}
        />
      )}

      {screen === "report" && <ReportView investigation={investigation} />}

      {screen === "probe" && <DeciderProbeView />}
    </div>
  );
}
