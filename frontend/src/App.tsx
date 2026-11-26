import { useEffect, useState } from "react";
import {
  decideRemediationAction,
  fetchIncidentDetail,
  fetchIncidents,
  fetchTimeline,
  runInvestigation,
  submitHumanReview,
  verifyLiveRecovery,
} from "./api";
import { DeciderProbeView } from "./components/DeciderProbeView";
import { IncidentListView } from "./components/IncidentListView";
import { InvestigationView } from "./components/InvestigationView";
import { LandingView } from "./components/LandingView";
import { ReportView } from "./components/ReportView";
import { TopBar, type Screen } from "./components/TopBar";
import type {
  IncidentMetadata,
  InvestigationResult,
  ReviewDecision,
  TimelineSummary,
} from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
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

  async function openIncident(id: string, targetScreen: Screen = "investigation") {
    setScreen(targetScreen);
    const [detail, tl] = await Promise.all([
      fetchIncidentDetail(id),
      fetchTimeline(id),
    ]);
    setActiveMeta(detail.meta);
    setInvestigation(detail.investigation);
    setTimeline(tl);
  }

  function handleNavigate(target: Screen) {
    if ((target === "investigation" || target === "report") && !activeMeta && incidents.length > 0) {
      void openIncident(incidents[0].id, target);
      return;
    }
    setScreen(target);
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
              review_decision: result.human_review.decision,
            }
          : prev
      );
      void loadIncidents();
    } finally {
      setInvestigating(false);
    }
  }

  async function handleSubmitReview(
    decision: ReviewDecision,
    corrected?: string,
    note?: string
  ) {
    if (!activeMeta) return;
    const updated = await submitHumanReview(activeMeta.id, {
      decision,
      corrected_root_cause: corrected,
      note,
    });
    setInvestigation(updated);
    setActiveMeta((prev) =>
      prev
        ? {
            ...prev,
            root_cause: updated.root_cause_summary,
            review_decision: updated.human_review.decision,
          }
        : prev
    );
    void loadIncidents();
  }

  async function handleDecideAction(
    actionId: string,
    decision: "dry_run" | "approve" | "block"
  ) {
    if (!activeMeta) return;
    const updatedAction = await decideRemediationAction(activeMeta.id, actionId, {
      decision,
    });
    setInvestigation((prev) =>
      prev
        ? {
            ...prev,
            proposed_actions: prev.proposed_actions.map((a) =>
              a.id === updatedAction.id ? updatedAction : a
            ),
          }
        : prev
    );
  }

  async function handleVerifyRecovery() {
    if (!activeMeta) return;
    const updated = await verifyLiveRecovery(activeMeta.id);
    setInvestigation(updated);
    setActiveMeta((prev) =>
      prev ? { ...prev, status: updated.status } : prev
    );
    void loadIncidents();
  }

  async function handleIncidentCreated(created: IncidentMetadata) {
    await loadIncidents();
    await openIncident(created.id);
  }

  if (screen === "landing") {
    return <LandingView onNavigate={handleNavigate} />;
  }

  return (
    <div className="min-h-screen bg-[#101010] text-[#FAFAFA]">
      <TopBar
        activeScreen={screen}
        onNavigate={handleNavigate}
        hasAnyIncident={incidents.length > 0}
        incidents={incidents}
        activeIncidentId={activeMeta?.id}
        onSelectIncident={(id) => void openIncident(id, screen === "report" ? "report" : "investigation")}
      />

      {screen === "incidents" && (
        <IncidentListView
          incidents={incidents}
          loading={loadingList}
          onSelectIncident={(id) => void openIncident(id)}
          onIncidentCreated={(c) => void handleIncidentCreated(c)}
          onRefreshList={() => void loadIncidents()}
        />
      )}

      {screen === "investigation" && activeMeta && (
        <InvestigationView
          meta={activeMeta}
          timeline={timeline}
          investigation={investigation}
          investigating={investigating}
          onRunInvestigation={(mode) => void handleRunInvestigation(mode)}
          onSubmitReview={(d, c, n) => void handleSubmitReview(d, c, n)}
          onDecideAction={(aid, d) => void handleDecideAction(aid, d)}
          onVerifyRecovery={() => void handleVerifyRecovery()}
          onOpenReport={() => setScreen("report")}
        />
      )}

      {screen === "report" && (
        <ReportView
          investigation={investigation}
          activeMeta={activeMeta}
          incidents={incidents}
          onSelectIncident={(id) => void openIncident(id, "report")}
          onRunInvestigation={(mode) => void handleRunInvestigation(mode)}
        />
      )}

      {screen === "probe" && <DeciderProbeView />}
    </div>
  );
}
