import { useState } from "react";
import { messagesAPI } from "../services/api";

const CONTEXT_COPY = {
  message: {
    title: "Aura AI Message Writer",
    typeLabel: "Tone",
    buttonLabel: "✨ Write with Aura AI",
    generateLabel: "Generate Message",
    useLabel: "Use This Message",
    placeholder: "What is this message about?",
    options: ["Formal", "Friendly", "Professional", "Casual", "Urgent"],
  },
  task: {
    title: "Aura AI Task Writer",
    typeLabel: "Task Type",
    buttonLabel: "✨ Aura AI",
    generateLabel: "Generate Task Description",
    useLabel: "Use This",
    placeholder: "What is this task about?",
    options: ["Reminder", "Follow-up", "Meeting", "Work", "Personal"],
  },
  chat: {
    title: "Aura AI Prompt Writer",
    typeLabel: "Intent",
    buttonLabel: "✨",
    generateLabel: "Write for me",
    useLabel: "Edit First",
    sendLabel: "Send This",
    placeholder: "What do you want to ask or say?",
    options: ["Ask a question", "Give instruction", "Request information", "Plan something", "Follow up"],
  },
  call: {
    title: "Aura AI Call Script Writer",
    typeLabel: "Call Type",
    buttonLabel: "✨ Write Call Script",
    generateLabel: "Generate Script",
    useLabel: "Use Script",
    placeholder: "What is this call about?",
    options: ["Reminder", "Follow-up", "Sales pitch", "Appointment", "Introduction", "Support"],
  },
};

function getCopy(context) {
  return CONTEXT_COPY[context] || CONTEXT_COPY.message;
}

function getOptions(options, fallback) {
  return Array.isArray(options) && options.length ? options : fallback;
}

export default function AIMessageWriter({
  context = "message",
  onUse,
  onSendDirect,
  placeholder,
  dropdownOptions = [],
  initialTopic = "",
  activeTab = "sms",
  buttonLabel,
  generateLabel,
  useLabel,
  panelMode = "inline",
  className = "",
}) {
  const copy = getCopy(context);
  const options = getOptions(dropdownOptions, copy.options);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [selectedType, setSelectedType] = useState(options[0] || "");
  const [generating, setGenerating] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [messageHistory, setMessageHistory] = useState([]);
  const [error, setError] = useState("");

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next && !topic.trim() && initialTopic.trim()) setTopic(initialTopic.trim());
      if (next) setError("");
      return next;
    });
  }

  function resetSession() {
    setTopic("");
    setGeneratedMessage("");
    setMessageHistory([]);
    setError("");
  }

  async function generate() {
    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      setError("Topic likhna zaroori hai");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const response = await messagesAPI.generateMessage({
        context,
        topic: cleanTopic,
        selectedType,
        tone: selectedType,
        activeTab,
        previousMessages: messageHistory,
      });
      const message = response.data?.message?.trim();
      if (!message) throw new Error("Empty AI response.");

      setGeneratedMessage(message);
      setMessageHistory((current) => current.includes(message) ? current : [...current, message]);
    } catch (err) {
      setError(err.response?.data?.error || "Aura AI could not write this right now.");
    } finally {
      setGenerating(false);
    }
  }

  function useGenerated() {
    if (!generatedMessage) return;
    onUse?.(generatedMessage);
    setOpen(false);
    resetSession();
  }

  function sendGenerated() {
    if (!generatedMessage) return;
    onSendDirect?.(generatedMessage);
    setOpen(false);
    resetSession();
  }

  const panelClasses = panelMode === "popover"
    ? "absolute bottom-full right-0 z-40 mb-3 w-[min(520px,calc(100vw-2rem))]"
    : "absolute right-0 top-full z-40 mt-2 w-[min(520px,calc(100vw-2rem))]";

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggleOpen}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:border-violet-400/50 hover:bg-violet-500/25"
        aria-expanded={open}
      >
        {buttonLabel || copy.buttonLabel}
      </button>

      {open ? (
        <div className={panelClasses}>
          <div className="rounded-2xl border border-violet-400/25 bg-[color:var(--bg-card)] p-4 shadow-2xl shadow-black/20">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">✨ {copy.title}</div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">Creates a structured 5-line draft.</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-xs text-[color:var(--text-muted)] transition hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-muted)]">Topic / Context</span>
                <input
                  value={topic}
                  onChange={(event) => {
                    setTopic(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder={placeholder || copy.placeholder}
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3.5 py-2.5 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-border)]"
                />
                {error ? <div className="mt-2 text-xs text-red-400">{error}</div> : null}
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1">
                  <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-muted)]">{copy.typeLabel}</span>
                  <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3.5 py-2.5 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating}
                  className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Writing...
                    </span>
                  ) : (generateLabel || copy.generateLabel)}
                </button>
              </div>

              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3">
                <pre className="min-h-[118px] whitespace-pre-wrap font-sans text-sm leading-6 text-[color:var(--text-primary)]">
                  {generatedMessage || "Generated preview will appear here."}
                </pre>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {onSendDirect ? (
                  <button
                    type="button"
                    onClick={sendGenerated}
                    disabled={!generatedMessage || generating}
                    className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copy.sendLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={useGenerated}
                  disabled={!generatedMessage || generating}
                  className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {useLabel || copy.useLabel}
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={!generatedMessage || generating}
                  className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generating ? "Writing..." : "🔄 Try Again"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
