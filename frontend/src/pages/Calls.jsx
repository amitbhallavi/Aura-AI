import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCalls, scheduleCall, cancelCall } from "../features/calls/callSlice";
import { fetchConfig, setActiveMode } from "../features/phoneConfig/phoneConfigSlice";
import AIMessageWriter from "../components/AIMessageWriter";

function Badge({ status }) {
  const colors = {
    scheduled: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "rgba(59,130,246,0.25)" },
    ongoing:   { bg: "rgba(16,217,160,0.12)", color: "#10d9a0", border: "rgba(16,217,160,0.25)" },
    completed: { bg: "rgba(16,217,160,0.08)", color: "#10d9a0", border: "rgba(16,217,160,0.2)" },
    failed:    { bg: "rgba(248,113,113,0.12)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
    cancelled: { bg: "rgba(156,163,175,0.1)", color: "#9ca3af", border: "rgba(156,163,175,0.2)" },
  };
  const s = colors[status] || colors.cancelled;
  return <span className="text-[10px] px-2.5 py-0.5 rounded-full border" style={{ background: s.bg, color: s.color, borderColor: s.border }}>{status}</span>;
}

export default function Calls() {
  const dispatch = useDispatch();
  const { list, isLoading, error } = useSelector((s) => s.calls);
  const {
    personalNumber,
    businessNumber,
    activeMode,
    hasAnyConfiguredNumber,
    activeCallerIdMasked,
    error: phoneConfigError,
  } = useSelector((s) => s.phoneConfig);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ phoneNumber: "", contactName: "", purpose: "general", message: "", scheduledAt: "", language: "en" });

  useEffect(() => {
    dispatch(fetchCalls());
    dispatch(fetchConfig());
  }, [dispatch]);
  useEffect(() => {
    const raw = localStorage.getItem("aura_pending_form_fill");
    if (!raw) return;
    try {
      const fill = JSON.parse(raw);
      if (fill.page !== "/calls") return;
      setShowForm(true);
      setForm((current) => ({
        ...current,
        phoneNumber: fill.fields.phoneNumber || fill.fields.toNumber || current.phoneNumber,
        contactName: fill.fields.contactName || current.contactName,
        purpose: fill.fields.purpose || current.purpose,
        message: fill.fields.message || current.message,
        scheduledAt: fill.fields.scheduledAt?.slice?.(0, 16) || current.scheduledAt,
        language: fill.fields.language || current.language,
      }));
      localStorage.removeItem("aura_pending_form_fill");
    } catch {}
  }, []);
  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  function getCallTopic() {
    return [
      form.contactName ? `Call ${form.contactName}` : "",
      form.purpose && form.purpose !== "general" ? `for ${form.purpose.replace(/_/g, " ")}` : "",
      form.message,
    ].filter(Boolean).join(" ").trim();
  }

  async function handlePhoneModeChange(e) {
    const nextMode = e.target.value;
    if (nextMode === activeMode) return;
    try {
      await dispatch(setActiveMode(nextMode)).unwrap();
    } catch {}
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!activeConfigured) return;

    setSubmitting(true);
    const result = await dispatch(scheduleCall({ ...form, phoneMode: activeMode }));
    setSubmitting(false);

    if (scheduleCall.fulfilled.match(result)) {
      setShowForm(false);
      setForm({ phoneNumber: "", contactName: "", purpose: "general", message: "", scheduledAt: "", language: "en" });
    }
  }

  const minDateTime = new Date(Date.now() + 2 * 60000).toISOString().slice(0, 16);
  const activeSlot = activeMode === "business" ? businessNumber : personalNumber;
  const activeConfigured = Boolean(activeSlot?.configured);
  const visibleError = error || phoneConfigError;

  return (
    <>
      <style>{`
        .calls-card { background: var(--bg-card); border: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .calls-input { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); border-radius: 12px; padding: 10px 16px; font-size: 14px; width: 100%; outline: none; transition: border-color 0.15s; }
        .calls-input::placeholder { color: var(--text-muted); }
        .calls-input:focus { border-color: var(--accent); }
        .calls-row:hover { background: var(--bg-elevated); }
        .calls-divider { border-top: 1px solid var(--border); }
        .calls-avatar { background: var(--bg-elevated); }
      `}</style>

      <div className="p-4 md:p-6 space-y-5" style={{ background: "var(--bg-base)", minHeight: "100%" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-semibold" style={{ color: "var(--text-primary)" }}>AI Call System</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Auto-dial calls with AI voice (Twilio + Hindi TTS)</p>
          </div>
          <button
            onClick={() => setShowForm(p => !p)}
            disabled={!activeConfigured}
            className="text-white text-sm px-4 py-2.5 rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {activeConfigured ? "+ Schedule Call" : "Configure Number First"}
          </button>
        </div>

        {!hasAnyConfiguredNumber ? (
          <div className="calls-card rounded-2xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Configure your number first - Settings - Phone Config</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Calls need a saved Twilio number before Aura can schedule outbound dialing.</div>
            </div>
            <Link to="/settings/phone-config" className="text-white text-sm px-4 py-2 rounded-xl text-center" style={{ background: "var(--accent)" }}>
              Open Phone Config
            </Link>
          </div>
        ) : (
          <div className="calls-card rounded-2xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Active Twilio number</div>
              <div className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
                {activeMode === "personal" ? "Personal" : "Business"} <span style={{ color: "var(--text-muted)" }}>{activeSlot?.twilioPhoneMasked || "not configured"}</span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Showing as: {activeCallerIdMasked || activeSlot?.twilioPhoneMasked || "Twilio number"}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Use number
              <select className="calls-input min-w-[220px]" value={activeMode} onChange={handlePhoneModeChange}>
                <option value="personal" disabled={!personalNumber.configured}>Personal {personalNumber.twilioPhoneMasked || "(not set)"}</option>
                <option value="business" disabled={!businessNumber.configured}>Business {businessNumber.twilioPhoneMasked || "(not set)"}</option>
              </select>
            </label>
          </div>
        )}

        {showForm && (
          <div className="calls-card rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>New Scheduled Call</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Phone Number *</label><input className="calls-input" type="tel" name="phoneNumber" value={form.phoneNumber} onChange={handleChange} placeholder="+91XXXXXXXXXX" required /></div>
              <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Contact Name</label><input className="calls-input" type="text" name="contactName" value={form.contactName} onChange={handleChange} placeholder="Rahul Sharma" /></div>
              <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Purpose *</label>
                <select className="calls-input" name="purpose" value={form.purpose} onChange={handleChange}>
                  <option value="general">General</option><option value="sales">Sales</option><option value="support">Customer Support</option><option value="reminder">Reminder</option><option value="follow_up">Follow-up</option>
                </select>
              </div>
              <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Schedule At *</label><input className="calls-input" type="datetime-local" name="scheduledAt" value={form.scheduledAt} onChange={handleChange} min={minDateTime} required /></div>
              <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Language</label>
                <select className="calls-input" name="language" value={form.language} onChange={handleChange}>
                  <option value="en">English</option><option value="hi">Hindi</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="block text-xs" style={{ color: "var(--text-muted)" }}>Message (AI will read this)</label>
                  <AIMessageWriter
                    context="call"
                    initialTopic={getCallTopic()}
                    onUse={(generatedText) => setForm((current) => ({ ...current, message: generatedText }))}
                  />
                </div>
                <textarea className="calls-input" name="message" value={form.message} onChange={handleChange} rows={5} placeholder="Hello! This is a reminder from AURA..." style={{ resize: "none" }} />
              </div>
              <div className="md:col-span-2 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: "var(--text-muted)" }}>Cancel</button>
                <button type="submit" disabled={submitting || !activeConfigured} className="text-white text-sm px-5 py-2 rounded-xl transition-colors disabled:cursor-not-allowed" style={{ background: "var(--accent)", opacity: submitting || !activeConfigured ? 0.6 : 1 }}>
                  {submitting ? "Scheduling..." : "Schedule Call"}
                </button>
              </div>
            </form>
          </div>
        )}

        {visibleError && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>{visibleError}</div>}

        <div className="calls-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 calls-divider" style={{ borderTop: "none", borderBottom: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Calls ({list.length})</h2>
          </div>
          {isLoading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
            : list.length === 0 ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No calls scheduled yet.</div>
            : <div>{list.map((call) => (
              <div key={call.id} className="calls-row flex items-center gap-4 px-5 py-4 transition-colors" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="calls-avatar w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0">👤</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{call.contact_name || call.phone_number}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{call.phone_number} · {call.purpose} · {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "No time set"}</div>
                  {call.message && <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>"{call.message}"</div>}
                </div>
                <Badge status={call.status} />
                {call.status === "scheduled" && (
                  <button onClick={() => dispatch(cancelCall(call.id))} className="text-xs ml-2 transition-colors" style={{ color: "var(--text-muted)" }}
                    onMouseEnter={e => e.target.style.color = "#f87171"} onMouseLeave={e => e.target.style.color = "var(--text-muted)"}>✕</button>
                )}
              </div>
            ))}</div>}
        </div>
      </div>
    </>
  );
}
