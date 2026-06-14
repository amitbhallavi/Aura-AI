import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { login, clearError } from "../features/auth/authSlice";

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

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [oauthError, setOauthError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("aura_theme") || "dark");

  useEffect(() => { dispatch(clearError()); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const user = params.get("user");
    const authError = params.get("auth_error");

    if (token && user) {
      try {
        localStorage.setItem("aura_token", token);
        localStorage.setItem("aura_user", JSON.stringify(JSON.parse(user)));
        window.history.replaceState(null, "", "/login");
        window.location.replace(localStorage.getItem("aura_selected_plan") ? "/pricing" : "/dashboard");
      } catch (err) {
        window.history.replaceState(null, "", "/login");
        setOauthError("Social login failed. Try again.");
      }
    } else if (authError) {
      setOauthError(authError);
      window.history.replaceState(null, "", "/login");
    }
  }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("aura_theme", theme); }, [theme]);

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await dispatch(login(form));
    if (login.fulfilled.match(result)) navigate(localStorage.getItem("aura_selected_plan") ? "/pricing" : "/dashboard");
  }

  function handleSocialAuth(provider) {
    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  }

  const isDark = theme === "dark";
  const authError = error || oauthError;
  const socialButtonStyle = {
    flex: 1,
    minWidth: 0,
    background: isDark ? "#1a1d27" : "#ffffff",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(99,102,145,0.18)"}`,
    borderRadius: 12,
    padding: "11px 12px",
    color: isDark ? "rgba(255,255,255,0.85)" : "#374151",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };

  return (
    <div style={{ minHeight: "100vh", background: isDark ? "#0d0f14" : "#f4f6fb", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Theme toggle */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={() => setTheme(isDark ? "light" : "dark")}
            style={{ background: isDark ? "#1a1d27" : "#ffffff", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(99,102,145,0.2)"}`, color: isDark ? "rgba(255,255,255,0.5)" : "#4a4e6b", borderRadius: 10, padding: "5px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {isDark ? "☀️" : "🌙"} {isDark ? "Light" : "Dark"}
          </button>
        </div>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="font-display gradient-text" style={{ fontSize: 36, fontWeight: 700, marginBottom: 6 }}>AURA</div>
          <p style={{ color: isDark ? "rgba(255,255,255,0.35)" : "#9196b5", fontSize: 14 }}>AI Assistant Platform</p>
        </div>

        {/* Card */}
        <div style={{ background: isDark ? "#13151c" : "#ffffff", border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(99,102,145,0.12)"}`, borderRadius: 20, padding: 24 }}>
          <h1 className="font-display" style={{ fontSize: 18, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.92)" : "#1c1e2e", marginBottom: 20 }}>Welcome back</h1>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <button type="button" onClick={() => handleSocialAuth("google")} style={socialButtonStyle}>
              <GoogleIcon /> Google
            </button>
            <button type="button" onClick={() => handleSocialAuth("github")} style={socialButtonStyle}>
              <GitHubIcon color={isDark ? "rgba(255,255,255,0.85)" : "#374151"} /> GitHub
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,145,0.14)" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.35)" : "#9196b5", whiteSpace: "nowrap" }}>or continue with email</span>
            <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,145,0.14)" }} />
          </div>

          {authError && <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, color: "#f87171", fontSize: 14 }}>{authError}</div>}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[{ label: "Email", name: "email", type: "email", placeholder: "you@example.com" },
              { label: "Password", name: "password", type: "password", placeholder: "••••••••" }].map((f) => (
              <div key={f.name}>
                <label style={{ display: "block", fontSize: 12, color: isDark ? "rgba(255,255,255,0.4)" : "#9196b5", marginBottom: 6 }}>{f.label}</label>
                <input type={f.type} name={f.name} value={form[f.name]} onChange={handleChange} placeholder={f.placeholder} required
                  style={{ width: "100%", background: isDark ? "#1a1d27" : "#f0f2f8", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,145,0.15)"}`, borderRadius: 12, padding: "11px 16px", fontSize: 14, color: isDark ? "rgba(255,255,255,0.85)" : "#1c1e2e", outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <button type="submit" disabled={isLoading}
              style={{ width: "100%", background: "#6c63ff", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 500, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.6 : 1 }}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: 12, color: isDark ? "rgba(255,255,255,0.3)" : "#9196b5", marginTop: 20 }}>
            Don't have an account?{" "}
            <Link to="/register" style={{ color: "#a78bfa" }}>Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
