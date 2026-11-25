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
    <aside className="w-full lg:w-[380px] shrink-0 bg-white border-l border-[#E7E5E4] shadow-md flex flex-col max-h-[560px] lg:max-h-none lg:sticky lg:top-0 lg:h-[calc(100vh-48px)]">
      <div className="px-4 py-3 border-b border-[#E7E5E4] flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#1C1917] flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-[#C81E1E]" strokeWidth={1.75} />
            Incident Chat
          </div>
          <div className="text-[11px] text-[#78716C] truncate">{incidentTitle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-[#78716C] hover:text-[#1C1917]"
          aria-label="Close incident chat"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Quick question chips */}
      <div className="px-3 py-2 border-b border-[#E7E5E4] bg-[#FAFAF9] flex flex-wrap gap-1.5">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={sending}
            onClick={() => void submitQuestion(prompt)}
            className="text-[11px] px-2 py-1 rounded border border-[#E7E5E4] bg-white text-[#57534E] hover:text-[#1C1917] hover:border-stone-400 text-left disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`rounded border p-3 text-[13px] ${
              turn.role === "user"
                ? "bg-[#1C1917] text-white border-[#1C1917] ml-6"
                : "bg-[#FAFAF9] text-[#1C1917] border-[#E7E5E4] mr-2"
            }`}
          >
            {turn.role === "assistant" && turn.intent && (
              <div className="flex items-center justify-between text-[10px] font-mono text-[#78716C] mb-1.5 pb-1 border-b border-[#E7E5E4]">
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
              <div className="mt-2.5 pt-2 border-t border-[#E7E5E4] flex flex-wrap gap-1.5">
                {turn.citations.map((cit) => (
                  <button
                    key={cit.id}
                    type="button"
                    onClick={() => onSelectCitation(cit)}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-[#E7E5E4] bg-white hover:border-[#C81E1E] text-[#1C1917] flex items-center gap-0.5"
                    title={`${cit.service} (${cit.ts})`}
                  >
                    {cit.id}
                    <ChevronRight className="w-3 h-3 text-[#78716C]" strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="text-[12px] text-[#78716C] px-1">
            Querying incident evidence...
          </div>
        )}
        {error && <div className="text-[12px] text-[#B91C1C] px-1">{error}</div>}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleFormSubmit}
        className="p-3 border-t border-[#E7E5E4] bg-white flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask what went wrong, where, or paste LOG-ID..."
          className="flex-1 border border-[#E7E5E4] rounded px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#C81E1E]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="p-2 rounded bg-[#C81E1E] hover:bg-[#B91C1C] text-white disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </form>
    </aside>
  );
}
