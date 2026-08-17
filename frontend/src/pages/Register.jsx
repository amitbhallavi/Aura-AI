import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { register, clearError } from "../features/auth/authSlice";
import api from "../services/api";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.94a9 9 0 0 0 0 8.08l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.96l3.01 2.33C4.66 5.16 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function GitHubIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.82-.26.82-.58v-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.24 1.84 1.24 1.08 1.84 2.82 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.49c1.02.01 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.21.69.83.57A12 12 0 0 0 12 .5z" />
    </svg>
  );
}

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useSelector((s) => s.auth);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "individual", phone: "", channel: "sms" });
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("aura_theme") || "dark");

  useEffect(() => { dispatch(clearError()); }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("aura_theme", theme); }, [theme]);

  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#0d0f14" : "#f4f6fb",
    card: isDark ? "#13151c" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(99,102,145,0.12)",
    input: isDark ? "#1a1d27" : "#f0f2f8",
    inputBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,145,0.15)",
    textPrimary: isDark ? "rgba(255,255,255,0.92)" : "#1c1e2e",
    textMuted: isDark ? "rgba(255,255,255,0.35)" : "#9196b5",
    stepInactive: isDark ? "rgba(255,255,255,0.1)" : "rgba(99,102,145,0.15)",
  };

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  async function handleSendOTP() {
    const target = form.channel === "email" ? form.email : form.phone;
    if (!target) return setOtpError(form.channel === "email" ? "Email required." : "Phone number required.");
    if (!form.name || !form.password) return setOtpError("Please fill all fields first.");
    setOtpLoading(true); setOtpError("");
    try { await api.post("/auth/send-otp", { phone: target, channel: form.channel }); setStep(2); }
    catch (err) { setOtpError(err.response?.data?.error || "Failed to send OTP."); }
    finally { setOtpLoading(false); }
  }

  async function handleVerifyAndRegister(e) {
    e.preventDefault(); setOtpLoading(true); setOtpError("");
    try {
      const target = form.channel === "email" ? form.email : form.phone;
      const verifyRes = await api.post("/auth/verify-otp", { phone: target, code: otp });
      if (!verifyRes.data.verified) return setOtpError("OTP verification failed.");
      const result = await dispatch(register(form));
      if (register.fulfilled.match(result)) {
        navigate(localStorage.getItem("aura_selected_plan") ? "/pricing" : "/dashboard");
      }
    } catch (err) { setOtpError(err.response?.data?.error || "Verification failed."); }
    finally { setOtpLoading(false); }
  }

  function handleSocialAuth(provider) {
    const base = API_BASE_URL.endsWith("/api") ? API_BASE_URL : `${API_BASE_URL}/api`;
    window.location.href = `${base}/auth/${provider}`;
  }

  const inputStyle = { width: "100%", background: colors.input, border: `1px solid ${colors.inputBorder}`, borderRadius: 12, padding: "11px 16px", fontSize: 14, color: colors.textPrimary, outline: "none", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 12, color: colors.textMuted, marginBottom: 6 };
  const socialButtonStyle = {
    flex: 1,
    minWidth: 0,
    background: isDark ? "#1a1d27" : "#ffffff",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(99,102,145,0.18)"}`,
    borderRadius: 12,
    padding: "11px 12px",
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Theme toggle */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={() => setTheme(isDark ? "light" : "dark")}
            style={{ background: colors.card, border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 10, padding: "5px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {isDark ? "☀️" : "🌙"} {isDark ? "Light" : "Dark"}
          </button>
        </div>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="font-display gradient-text" style={{ fontSize: 36, fontWeight: 700, marginBottom: 6 }}>AURA</div>
          <p style={{ color: colors.textMuted, fontSize: 14 }}>Create your account</p>
        </div>

        {/* Card */}
        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 20, padding: 24 }}>
          <h1 className="font-display" style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, marginBottom: 16 }}>
            {step === 1 ? "Get started" : "Verify your identity"}
          </h1>

          {/* Step bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[1, 2].map((s) => (
              <div key={s} style={{ height: 4, flex: 1, borderRadius: 4, background: step >= s ? "#6c63ff" : colors.stepInactive, transition: "background 0.3s" }} />
            ))}
          </div>

          {step === 1 && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <button type="button" onClick={() => handleSocialAuth("google")} style={socialButtonStyle}>
                  <GoogleIcon /> Google
                </button>
                <button type="button" onClick={() => handleSocialAuth("github")} style={socialButtonStyle}>
                  <GitHubIcon color={colors.textPrimary} /> GitHub
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,145,0.14)" }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.textMuted, whiteSpace: "nowrap" }}>or continue with email</span>
                <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,145,0.14)" }} />
              </div>
            </>
          )}

          {(error || otpError) && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, color: "#f87171", fontSize: 14 }}>
              {error || otpError}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={labelStyle}>Full Name</label><input style={inputStyle} type="text" name="name" value={form.name} onChange={handleChange} placeholder="Amit Sharma" required /></div>
              <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required /></div>
              <div><label style={labelStyle}>Password</label><input style={inputStyle} type="password" name="password" value={form.password} onChange={handleChange} placeholder="Min. 6 characters" required minLength={6} /></div>

              {/* Channel */}
              <div>
                <label style={labelStyle}>Verify via</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ id: "sms", label: "📱 Phone SMS" }, { id: "email", label: "📧 Gmail OTP" }].map((c) => (
                    <button key={c.id} type="button" onClick={() => setForm({ ...form, channel: c.id })}
                      style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: "pointer", border: `1px solid ${form.channel === c.id ? "rgba(108,99,255,0.5)" : colors.inputBorder}`, background: form.channel === c.id ? "rgba(108,99,255,0.15)" : colors.input, color: form.channel === c.id ? "#a78bfa" : colors.textMuted, transition: "all 0.15s" }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.channel === "sms" && (
                <div><label style={labelStyle}>Phone Number (with country code)</label><input style={inputStyle} type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="+91XXXXXXXXXX" required /></div>
              )}
              {form.channel === "email" && (
                <div style={{ padding: "10px 14px", background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 10, fontSize: 12, color: colors.textMuted }}>
                  📧 OTP will be sent to <span style={{ color: colors.textPrimary }}>{form.email || "your email"}</span>
                </div>
              )}

              <div>
                <label style={labelStyle}>I am a...</label>
                <select name="role" value={form.role} onChange={handleChange} style={{ ...inputStyle }}>
                  <option value="individual">Individual (Personal use)</option>
                  <option value="business">Business (Sales / Support)</option>
                </select>
              </div>

              <button onClick={handleSendOTP} disabled={otpLoading || !form.name || !form.email || !form.password || (form.channel === "sms" && !form.phone)}
                style={{ width: "100%", background: "#6c63ff", color: "white", border: "none", borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: (otpLoading || !form.name || !form.email || !form.password) ? 0.5 : 1 }}>
                {otpLoading ? "Sending OTP..." : "Send OTP & Continue →"}
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <form onSubmit={handleVerifyAndRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "10px 14px", background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 10, fontSize: 13, color: colors.textMuted }}>
                {form.channel === "email" ? "📧" : "📱"} OTP sent to <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{form.channel === "email" ? form.email : form.phone}</span>
              </div>
              <div>
                <label style={labelStyle}>Enter 6-digit OTP</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="• • • • • •" maxLength={6} required
                  style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.5em", fontSize: 18 }} />
              </div>
              <button type="submit" disabled={otpLoading || otp.length !== 6}
                style={{ width: "100%", background: "#6c63ff", color: "white", border: "none", borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: (otpLoading || otp.length !== 6) ? 0.5 : 1 }}>
                {otpLoading ? "Verifying..." : "Verify & Create Account ✓"}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setStep(1); setOtp(""); setOtpError(""); }}
                  style={{ flex: 1, background: "none", border: "none", fontSize: 12, color: colors.textMuted, cursor: "pointer", padding: "6px" }}>← Change details</button>
                <button type="button" onClick={handleSendOTP} disabled={otpLoading}
                  style={{ flex: 1, background: "none", border: "none", fontSize: 12, color: "#a78bfa", cursor: "pointer", padding: "6px" }}>Resend OTP</button>
              </div>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: 12, color: colors.textMuted, marginTop: 20 }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "#a78bfa" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
