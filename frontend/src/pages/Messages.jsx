import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { messagesAPI } from "../services/api";
import { fetchConfig, setActiveMode } from "../features/phoneConfig/phoneConfigSlice";
import AIMessageWriter from "../components/AIMessageWriter";

export default function Messages() {
  const dispatch = useDispatch();
  const {
    personalNumber,
    businessNumber,
    activeMode,
    hasAnyConfiguredNumber,
    error: phoneConfigError,
  } = useSelector((s) => s.phoneConfig);
  const [tab, setTab] = useState("sms");
  const [form, setForm] = useState({ toNumber: "", contactName: "", content: "" });
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    dispatch(fetchConfig());
  }, [dispatch]);

  useEffect(() => {
    const raw = localStorage.getItem("aura_pending_form_fill");
    if (!raw) return;
    try {
      const fill = JSON.parse(raw);
      if (fill.page !== "/messages") return;
      if (fill.fields.platform === "whatsapp" || fill.fields.type === "whatsapp") setTab("whatsapp");
      if (fill.fields.platform === "sms" || fill.fields.type === "sms") setTab("sms");
      setForm((current) => ({
        ...current,
        toNumber: fill.fields.toNumber || fill.fields.phoneNumber || current.toNumber,
        contactName: fill.fields.contactName || current.contactName,
        content: fill.fields.content || fill.fields.message || current.content,
      }));
      localStorage.removeItem("aura_pending_form_fill");
    } catch {}
  }, []);

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  function handleTabChange(nextTab) {
    setTab(nextTab);
    setSuccess("");
    setError("");
  }

  async function handlePhoneModeChange(e) {
    try {
      await dispatch(setActiveMode(e.target.value)).unwrap();
    } catch (err) {
      setError(err || "Failed to switch phone number.");
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!activeConfigured) {
      setError("Configure a Twilio number before sending messages.");
      return;
    }

    setSending(true); setSuccess(""); setError("");
    try {
      const payload = { ...form, phoneMode: activeMode };
      tab === "sms" ? await messagesAPI.sendSMS(payload) : await messagesAPI.sendWhatsApp(payload);
      setSuccess(`${tab === "sms" ? "SMS" : "WhatsApp"} sent to ${form.contactName || form.toNumber}!`);
      setForm({ toNumber: "", contactName: "", content: "" });
    } catch (err) { setError(err.response?.data?.error || "Failed to send message."); }
    finally { setSending(false); }
  }

  const activeSlot = activeMode === "business" ? businessNumber : personalNumber;
  const activeConfigured = Boolean(activeSlot?.configured);
  const visibleError = error || phoneConfigError;

  return (
    <>
      <style>{`
        .msg-card { background: var(--bg-card); border: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .msg-input { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); border-radius: 12px; padding: 10px 16px; font-size: 14px; width: 100%; outline: none; transition: border-color 0.15s; }
        .msg-input::placeholder { color: var(--text-muted); }
        .msg-input:focus { border-color: var(--accent); }
        .msg-tab-active { background: var(--accent); color: white; }
        .msg-tab-inactive { color: var(--text-muted); }
        .msg-tab-inactive:hover { color: var(--text-secondary); }
        .msg-tab-wrap { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 4px; display: inline-flex; }
        .msg-label { font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px; }
      `}</style>

      <div className="p-4 md:p-6 space-y-5" style={{ background: "var(--bg-base)", minHeight: "100%" }}>
        <div>
          <h1 className="font-display text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Messaging</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Send SMS and WhatsApp via Twilio automation</p>
        </div>

        {!hasAnyConfiguredNumber ? (
          <div className="msg-card rounded-2xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Configure your number first - Settings - Phone Config</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>SMS and WhatsApp need a saved Twilio sender before Aura can send.</div>
            </div>
            <Link to="/settings/phone-config" className="text-white text-sm px-4 py-2 rounded-xl text-center" style={{ background: "var(--accent)" }}>
              Open Phone Config
            </Link>
          </div>
        ) : (
          <div className="msg-card rounded-2xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between" style={{ maxWidth: 720 }}>
            <div>
              <div className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Active Twilio number</div>
              <div className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
                {activeMode === "personal" ? "Personal" : "Business"} <span style={{ color: "var(--text-muted)" }}>{activeSlot?.twilioPhoneMasked || "not configured"}</span>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Use number
              <select className="msg-input min-w-[220px]" value={activeMode} onChange={handlePhoneModeChange}>
                <option value="personal" disabled={!personalNumber.configured}>Personal {personalNumber.twilioPhoneMasked || "(not set)"}</option>
                <option value="business" disabled={!businessNumber.configured}>Business {businessNumber.twilioPhoneMasked || "(not set)"}</option>
              </select>
            </label>
          </div>
        )}

        <div className="msg-tab-wrap">
          {[{ id: "sms", label: "📱 SMS" }, { id: "whatsapp", label: "💬 WhatsApp" }].map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? "msg-tab-active" : "msg-tab-inactive"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="msg-card rounded-2xl p-5" style={{ maxWidth: 520 }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Compose {tab === "sms" ? "SMS" : "WhatsApp"} Message
          </h2>
          {success && <div className="mb-4 px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(16,217,160,0.1)", border: "1px solid rgba(16,217,160,0.25)", color: "#10d9a0" }}>✅ {success}</div>}
          {visibleError && <div className="mb-4 px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>{visibleError}</div>}
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="msg-label">Phone Number * <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(with country code, e.g. +91...)</span></label>
              <input className="msg-input" type="tel" name="toNumber" value={form.toNumber} onChange={handleChange} placeholder="+91XXXXXXXXXX" required />
            </div>
            <div>
              <label className="msg-label">Contact Name (optional)</label>
              <input className="msg-input" type="text" name="contactName" value={form.contactName} onChange={handleChange} placeholder="Rahul Sharma" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <label className="msg-label !mb-0">Message * <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({form.content.length} chars)</span></label>
                <AIMessageWriter
                  context="message"
                  activeTab={tab}
                  onUse={(generatedText) => setForm((current) => ({ ...current, content: generatedText }))}
                />
              </div>
              <textarea className="msg-input" name="content" value={form.content} onChange={handleChange} rows={4}
                placeholder={tab === "sms" ? "Your SMS message here..." : "Hello! This is an automated message from AURA AI assistant. 🤖"}
                required style={{ resize: "none" }} />
            </div>
            <button type="submit" disabled={sending || !activeConfigured}
              className="w-full text-white text-sm py-3 rounded-xl font-medium transition-colors"
              style={{ background: sending ? "var(--accent)" : "var(--accent)", opacity: sending || !activeConfigured ? 0.6 : 1 }}>
              {sending ? "Sending..." : `Send ${tab === "sms" ? "SMS" : "WhatsApp"} →`}
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ maxWidth: 520 }}>
          {[{ icon: "📱", title: "SMS", desc: "Delivered via Twilio. Works on any phone number without internet." },
            { icon: "💬", title: "WhatsApp", desc: "Sent via Twilio WhatsApp Business API. Recipient needs WhatsApp." }
          ].map((c) => (
            <div key={c.title} className="msg-card rounded-xl p-4">
              <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
              <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{c.title}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
