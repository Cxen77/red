import { useEffect, useRef, useState } from "react";
import { ChevronRight, MessageSquare, Send, X } from "lucide-react";
import { sendIncidentChat } from "../api";
import type { ChatCitation } from "../types";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  focus_service?: string;
  confidence?: number;
  latency_ms?: number;
  citations?: ChatCitation[];
}

interface IncidentChatDrawerProps {
  incidentId: string;
  incidentTitle: string;
  onSelectCitation: (citation: ChatCitation) => void;
  onClose: () => void;
}

const STARTER_PROMPTS = [
  "What went wrong and where?",
  "Where did the failure start and cascade?",
  "When did the anomaly window begin?",
  "What remediation actions are proposed?",
];

export function IncidentChatDrawer({
  incidentId,
  incidentTitle,
  onSelectCitation,
  onClose,
}: IncidentChatDrawerProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask about what went wrong, which service failed, timeline milestones, metrics, or remediation steps. Every answer cites verified telemetry IDs.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns([
      {
        id: `welcome-${incidentId}`,
        role: "assistant",
        content: `Connected to ${incidentId}. Ask what went wrong, where the failure originated, or search for any log/metric/trace ID.`,
      },
    ]);
    setError(null);
  }, [incidentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function submitQuestion(questionText: string) {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const historyPayload = nextTurns
        .filter((t) => t.id !== "welcome" && !t.id.startsWith("welcome-"))
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.content }));

      const res = await sendIncidentChat(incidentId, trimmed, historyPayload);
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          intent: res.intent,
          focus_service: res.focus_service,
          confidence: res.confidence,
          latency_ms: res.latency_ms,
          citations: res.citations,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to query incident");
    } finally {
      setSending(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitQuestion(input);
  }

  return (
    <aside className="w-full lg:w-[380px] shrink-0 bg-[#141414] border-l border-white/10 flex flex-col max-h-[560px] lg:max-h-none lg:sticky lg:top-0 lg:h-[calc(100vh-48px)]">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-[#F97316]" strokeWidth={1.75} />
            Incident Chat
          </div>
          <div className="text-[11px] text-white/45 truncate">{incidentTitle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-white/50 hover:text-white"
          aria-label="Close incident chat"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-white/10 bg-[#101010] flex flex-wrap gap-1.5">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={sending}
            onClick={() => void submitQuestion(prompt)}
            className="text-[11px] px-2 py-1 border border-white/10 bg-[#141414] text-white/70 hover:text-white hover:border-[#F97316]/60 text-left disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`border p-3 text-[13px] ${
              turn.role === "user"
                ? "bg-[#F97316] text-[#101010] border-[#F97316] font-medium ml-6"
                : "bg-[#101010] text-white/90 border-white/10 mr-2"
            }`}
          >
            {turn.role === "assistant" && turn.intent && (
              <div className="flex items-center justify-between text-[10px] font-mono text-[#F97316] mb-1.5 pb-1 border-b border-white/10">
                <span>
                  intent:{turn.intent} · svc:{turn.focus_service}
                </span>
                <span>
                  {typeof turn.confidence === "number"
                    ? `${Math.round(turn.confidence * 100)}%`
                    : ""}{" "}
                  {turn.latency_ms ? `· ${turn.latency_ms}ms` : ""}
                </span>
              </div>
            )}

            <div className="whitespace-pre-wrap leading-relaxed break-words">
              {turn.content}
            </div>

            {turn.citations && turn.citations.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                {turn.citations.map((cit) => (
                  <button
                    key={cit.id}
                    type="button"
                    onClick={() => onSelectCitation(cit)}
                    className="font-mono text-[11px] px-1.5 py-0.5 border border-[#F97316]/40 bg-[#F97316]/10 hover:bg-[#F97316]/20 text-[#F97316] flex items-center gap-0.5"
                    title={`${cit.service} (${cit.ts})`}
                  >
                    {cit.id}
                    <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="font-mono text-[11px] text-[#F97316] px-1">
            Querying incident evidence...
          </div>
        )}
        {error && <div className="text-[12px] text-[#EF4444] px-1">{error}</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={handleFormSubmit}
        className="p-3 border-t border-white/10 bg-[#0A0A0A] flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask what went wrong, where, or paste LOG-ID..."
          className="flex-1 bg-[#141414] border border-white/15 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#F97316]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="p-2 bg-[#F97316] hover:bg-[#EA580C] text-[#101010] disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" strokeWidth={2} />
        </button>
      </form>
    </aside>
  );
}
